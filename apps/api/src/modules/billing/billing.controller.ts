import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Plan } from '@prisma/client';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { createHmac } from 'crypto';
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { env } from '../../config/env';
import { safeEqual } from '../../common/crypto';
import { request } from '../../common/http';
import { AuthUser, CurrentUser, MinRole, Public } from '../../common/decorators';
import { limitsFor, PAID_PLANS, PaidPlan, PLAN_LIMITS, trialEndsAt } from '../../common/plans';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createGstInvoice, GSTIN_RE, renderInvoiceHtml } from './gst';

class CheckoutDto {
  @IsIn(PAID_PLANS) plan: PaidPlan;
  /** INR → Razorpay (UPI AutoPay, e-mandates, Indian cards). USD → Stripe. Defaults from the billing country. */
  @IsOptional() @IsIn(['INR', 'USD']) currency?: 'INR' | 'USD';
}

class BillingDetailsDto {
  @IsOptional() @IsString() @MaxLength(200) legalName?: string;
  @IsOptional() @IsString() @Matches(/^$|^[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]$/, { message: 'Enter a valid 15-character GSTIN' })
  gstin?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(80) state?: string;
  @IsOptional() @IsString() @MaxLength(2) country?: string;
}

const RZP = 'https://api.razorpay.com/v1';

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);
  private stripeClient: Stripe | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Provider helpers ──────────────────────────────────────────────────────
  private stripe() {
    if (!env().STRIPE_SECRET_KEY) throw new ServiceUnavailableException('Card billing (USD) is not configured yet');
    this.stripeClient ??= new Stripe(env().STRIPE_SECRET_KEY!);
    return this.stripeClient;
  }

  private stripeEnabled() {
    return Boolean(env().STRIPE_SECRET_KEY);
  }

  private razorpayEnabled() {
    return Boolean(env().RAZORPAY_KEY_ID && env().RAZORPAY_KEY_SECRET);
  }

  private razorpayAuth() {
    return 'Basic ' + Buffer.from(`${env().RAZORPAY_KEY_ID}:${env().RAZORPAY_KEY_SECRET}`).toString('base64');
  }

  private stripePrice(plan: PaidPlan) {
    const price = { CREATOR: env().STRIPE_PRICE_CREATOR, PRO: env().STRIPE_PRICE_PRO, BUSINESS: env().STRIPE_PRICE_BUSINESS }[plan];
    if (!price) throw new ServiceUnavailableException(`Stripe price for ${PLAN_LIMITS[plan].name} is not configured`);
    return price;
  }

  private razorpayPlan(plan: PaidPlan) {
    const id = { CREATOR: env().RAZORPAY_PLAN_CREATOR, PRO: env().RAZORPAY_PLAN_PRO, BUSINESS: env().RAZORPAY_PLAN_BUSINESS }[plan];
    if (!id) throw new ServiceUnavailableException(`Razorpay plan for ${PLAN_LIMITS[plan].name} is not configured`);
    return id;
  }

  private planForStripePrice(priceId?: string | null): Plan {
    if (!priceId) return 'FREE';
    if (priceId === env().STRIPE_PRICE_BUSINESS) return 'BUSINESS';
    if (priceId === env().STRIPE_PRICE_PRO) return 'PRO';
    if (priceId === env().STRIPE_PRICE_CREATOR) return 'CREATOR';
    return 'FREE';
  }

  /** Idempotency: returns false when this webhook event was already applied. */
  private async claimEvent(provider: string, id: string | undefined, type: string) {
    if (!id) return true;
    try {
      await this.prisma.billingEvent.create({ data: { id: `${provider}:${id}`, provider, type } });
      return true;
    } catch {
      return false; // unique violation → already processed
    }
  }

  // ── Read ──────────────────────────────────────────────────────────────────
  @Get()
  async summary(@CurrentUser() user: AuthUser) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } });
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const [accounts, members, posts, postsTotal] = await Promise.all([
      this.prisma.socialAccount.count({ where: { workspaceId: ws.id } }),
      this.prisma.membership.count({ where: { workspaceId: ws.id } }),
      this.prisma.post.count({ where: { workspaceId: ws.id, status: { not: 'DRAFT' }, createdAt: { gte: monthStart } } }),
      this.prisma.post.count({ where: { workspaceId: ws.id, status: { not: 'DRAFT' } } }),
    ]);
    const limits = limitsFor(ws);
    const month = new Date().toISOString().slice(0, 7);
    return {
      plan: ws.plan,
      effectivePlan: limits.key,
      trial: limits.trial,
      beta: limits.beta,
      trialEndsAt: trialEndsAt(ws),
      status: ws.subscriptionStatus,
      currentPeriodEnd: ws.currentPeriodEnd,
      billingProvider: ws.billingProvider,
      hasCustomer: Boolean(ws.stripeCustomerId),
      billingEnabled: this.stripeEnabled() || this.razorpayEnabled(),
      providers: { stripe: this.stripeEnabled(), razorpay: this.razorpayEnabled() },
      details: {
        legalName: ws.billingLegalName,
        gstin: ws.billingGstin,
        address: ws.billingAddress,
        state: ws.billingState,
        country: ws.billingCountry,
      },
      limits,
      usage: {
        accounts,
        members,
        postsThisMonth: posts,
        postsTotal,
        aiCredits: ws.aiCreditsMonth === month ? ws.aiCreditsUsed : 0,
      },
      plans: Object.entries(PLAN_LIMITS).map(([key, v]) => ({ key, ...v })),
    };
  }

  /** Payment method on file and invoices: GST invoices (Razorpay) plus Stripe invoices. */
  @Get('details')
  async details(@CurrentUser() user: AuthUser) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } });
    const gst = await this.prisma.invoice.findMany({ where: { workspaceId: ws.id }, orderBy: { issuedAt: 'desc' }, take: 24 });
    const gstInvoices = gst.map((i) => ({
      id: i.id,
      number: i.number,
      date: i.issuedAt,
      amount: i.total,
      currency: 'inr',
      status: 'paid',
      description: `${PLAN_LIMITS[i.plan].name} plan`,
      pdf: null,
      url: `/api/billing/invoices/${i.id}/html`,
    }));
    if (!this.stripeEnabled() || !ws.stripeCustomerId) return { paymentMethod: null, invoices: gstInvoices };

    const stripe = this.stripe();
    const [customer, invoices] = await Promise.all([
      stripe.customers.retrieve(ws.stripeCustomerId, { expand: ['invoice_settings.default_payment_method'] }),
      stripe.invoices.list({ customer: ws.stripeCustomerId, limit: 12 }),
    ]);
    let pm = !customer.deleted ? (customer.invoice_settings?.default_payment_method as Stripe.PaymentMethod | null) : null;
    if (!pm && ws.stripeSubscriptionId) {
      const sub = await stripe.subscriptions.retrieve(ws.stripeSubscriptionId, { expand: ['default_payment_method'] });
      pm = sub.default_payment_method as Stripe.PaymentMethod | null;
    }
    return {
      paymentMethod: pm?.card ? { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year } : null,
      invoices: [
        ...gstInvoices,
        ...invoices.data.map((i) => ({
          id: i.id,
          number: i.number,
          date: new Date(i.created * 1000),
          amount: i.amount_paid || i.amount_due,
          currency: i.currency,
          status: i.status,
          description: i.lines.data[0]?.description ?? null,
          pdf: i.invoice_pdf,
          url: i.hosted_invoice_url,
        })),
      ],
    };
  }

  /** Printable GST tax invoice. */
  @Get('invoices/:id/html')
  async invoiceHtml(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const inv = await this.prisma.invoice.findFirst({ where: { id, workspaceId: user.workspaceId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
    res.send(renderInvoiceHtml(inv, PLAN_LIMITS[inv.plan].name));
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  /** Legal name, GSTIN (for B2B input tax credit), address and state (decides CGST+SGST vs IGST). */
  @MinRole('OWNER')
  @Put('details')
  async saveDetails(@CurrentUser() user: AuthUser, @Body() dto: BillingDetailsDto) {
    const gstin = dto.gstin?.trim().toUpperCase() || null;
    if (gstin && !GSTIN_RE.test(gstin)) throw new BadRequestException('Enter a valid 15-character GSTIN');
    await this.prisma.workspace.update({
      where: { id: user.workspaceId },
      data: {
        billingLegalName: dto.legalName?.trim() || null,
        billingGstin: gstin,
        billingAddress: dto.address?.trim() || null,
        billingState: dto.state?.trim() || null,
        billingCountry: dto.country?.trim().toUpperCase() || 'IN',
      },
    });
    return { ok: true };
  }

  /**
   * Checkout router: domestic INR payments go to Razorpay (UPI AutoPay, e-mandates, GST invoices),
   * international USD payments go to Stripe.
   */
  @MinRole('OWNER')
  @HttpCode(200)
  @Post('checkout')
  async checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } });
    const currency = dto.currency ?? ((ws.billingCountry ?? 'IN') === 'IN' ? 'INR' : 'USD');

    if (currency === 'INR' && this.razorpayEnabled()) return this.razorpayCheckout(user, ws.id, dto.plan);
    if (currency === 'INR' && !this.stripeEnabled()) throw new ServiceUnavailableException('INR payments (Razorpay) are not configured yet');

    const stripe = this.stripe();
    if (ws.stripeSubscriptionId && ws.plan !== 'FREE') return this.portal(user);

    let customerId = ws.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: ws.billingLegalName ?? ws.name, metadata: { workspaceId: ws.id } });
      customerId = customer.id;
      await this.prisma.workspace.update({ where: { id: ws.id }, data: { stripeCustomerId: customerId } });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: this.stripePrice(dto.plan), quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: ws.id,
      subscription_data: { metadata: { workspaceId: ws.id } },
      metadata: { workspaceId: ws.id },
      success_url: `${env().WEB_URL}/settings?tab=billing&checkout=success`,
      cancel_url: `${env().WEB_URL}/settings?tab=billing&checkout=cancelled`,
    });
    return { url: session.url };
  }

  private async razorpayCheckout(user: AuthUser, workspaceId: string, plan: PaidPlan) {
    const sub = await request<{ id: string; short_url: string }>(`${RZP}/subscriptions`, {
      method: 'POST',
      headers: { Authorization: this.razorpayAuth() },
      json: {
        plan_id: this.razorpayPlan(plan),
        total_count: 120, // up to 10 years of monthly renewals; cancel any time
        customer_notify: 1,
        notes: { workspaceId, plan, email: user.email },
      },
    });
    await this.prisma.workspace.update({ where: { id: workspaceId }, data: { razorpaySubscriptionId: sub.id } });
    return { url: sub.short_url };
  }

  @MinRole('OWNER')
  @HttpCode(200)
  @Post('portal')
  async portal(@CurrentUser() user: AuthUser) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } });
    if (ws.billingProvider === 'razorpay') {
      throw new BadRequestException('Your plan is billed through Razorpay. Use "Cancel subscription" to stop renewals, or contact support to change plans.');
    }
    if (!ws.stripeCustomerId) throw new BadRequestException('No billing account yet. Choose a plan first.');
    const session = await this.stripe().billingPortal.sessions.create({ customer: ws.stripeCustomerId, return_url: `${env().WEB_URL}/settings?tab=billing` });
    return { url: session.url };
  }

  /** Cancels a Razorpay subscription at the end of the current billing cycle. */
  @MinRole('OWNER')
  @HttpCode(200)
  @Post('cancel')
  async cancel(@CurrentUser() user: AuthUser) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } });
    if (ws.billingProvider !== 'razorpay' || !ws.razorpaySubscriptionId) return this.portal(user);
    await request(`${RZP}/subscriptions/${ws.razorpaySubscriptionId}/cancel`, {
      method: 'POST',
      headers: { Authorization: this.razorpayAuth() },
      json: { cancel_at_cycle_end: 1 },
    });
    await this.prisma.workspace.update({ where: { id: ws.id }, data: { subscriptionStatus: 'cancelling' } });
    return { ok: true };
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────
  @Public()
  @HttpCode(200)
  @Post('webhook')
  async webhook(@Req() req: Request & { rawBody?: Buffer }, @Headers('stripe-signature') signature: string) {
    const secret = env().STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Stripe webhook secret not configured');
    if (!req.rawBody || !signature) throw new BadRequestException('Missing signature');

    let event: Stripe.Event;
    try {
      event = this.stripe().webhooks.constructEvent(req.rawBody, signature, secret);
    } catch (err) {
      throw new BadRequestException(`Webhook signature verification failed: ${(err as Error).message}`);
    }
    if (!(await this.claimEvent('stripe', event.id, event.type))) return { received: true, duplicate: true };

    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.subscription) {
          const sub = await this.stripe().subscriptions.retrieve(String(s.subscription));
          await this.applyStripeSubscription(sub, s.client_reference_id ?? s.metadata?.workspaceId);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.applyStripeSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
    return { received: true };
  }

  private async applyStripeSubscription(sub: Stripe.Subscription, workspaceIdHint?: string | null) {
    const workspaceId = workspaceIdHint ?? sub.metadata?.workspaceId;
    const ws = workspaceId
      ? await this.prisma.workspace.findUnique({ where: { id: workspaceId } })
      : await this.prisma.workspace.findUnique({ where: { stripeCustomerId: String(sub.customer) } });
    if (!ws) {
      this.logger.warn(`Stripe subscription ${sub.id} has no matching workspace`);
      return;
    }
    const active = ['active', 'trialing', 'past_due'].includes(sub.status);
    const priceId = sub.items.data[0]?.price?.id;
    const periodEnd = (sub as any).current_period_end ?? (sub.items.data[0] as any)?.current_period_end;
    await this.prisma.workspace.update({
      where: { id: ws.id },
      data: {
        plan: active ? this.planForStripePrice(priceId) : 'FREE',
        billingProvider: 'stripe',
        billingCurrency: 'USD',
        stripeCustomerId: String(sub.customer),
        stripeSubscriptionId: sub.status === 'canceled' ? null : sub.id,
        subscriptionStatus: sub.status,
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      },
    });
  }

  /**
   * Razorpay subscription webhooks (Dashboard → Webhooks → {WEB_URL}/api/billing/razorpay/webhook).
   * Events: subscription.activated, subscription.charged, subscription.pending, subscription.halted,
   * subscription.cancelled, subscription.completed, payment.failed.
   */
  @Public()
  @HttpCode(200)
  @Post('razorpay/webhook')
  async razorpayWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature?: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ) {
    const secret = env().RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Razorpay webhook secret not configured');
    if (!req.rawBody || !signature) throw new BadRequestException('Missing signature');
    const expected = createHmac('sha256', secret).update(req.rawBody).digest('hex');
    if (!safeEqual(signature, expected)) throw new BadRequestException('signature_verification_failed');

    const body = req.body as { event: string; payload: any };
    if (!(await this.claimEvent('razorpay', eventId, body.event))) return { status: 'already_processed' };

    const sub = body.payload?.subscription?.entity;
    const payment = body.payload?.payment?.entity;
    const workspaceId: string | undefined = sub?.notes?.workspaceId ?? payment?.notes?.workspaceId;
    const ws = workspaceId
      ? await this.prisma.workspace.findUnique({ where: { id: workspaceId } })
      : sub?.id
        ? await this.prisma.workspace.findUnique({ where: { razorpaySubscriptionId: sub.id } })
        : null;
    if (!ws) {
      this.logger.warn(`Razorpay ${body.event} has no matching workspace`);
      return { status: 'ignored' };
    }
    const plan = (PAID_PLANS as readonly string[]).includes(sub?.notes?.plan) ? (sub.notes.plan as PaidPlan) : null;
    const periodEnd = sub?.current_end ? new Date(sub.current_end * 1000) : null;

    switch (body.event) {
      case 'subscription.activated':
      case 'subscription.charged': {
        await this.prisma.workspace.update({
          where: { id: ws.id },
          data: {
            ...(plan ? { plan } : {}),
            billingProvider: 'razorpay',
            billingCurrency: 'INR',
            razorpaySubscriptionId: sub.id,
            subscriptionStatus: 'active',
            currentPeriodEnd: periodEnd,
          },
        });
        if (body.event === 'subscription.charged' && payment?.id && payment.amount) {
          await createGstInvoice(this.prisma, {
            workspaceId: ws.id,
            provider: 'razorpay',
            externalId: payment.id,
            plan: plan ?? ws.plan,
            totalPaise: payment.amount,
            periodStart: sub.current_start ? new Date(sub.current_start * 1000) : null,
            periodEnd,
          });
        }
        break;
      }
      case 'payment.failed':
      case 'subscription.pending':
        // Grace period: keep the plan while Razorpay retries the mandate; tell the owners.
        await this.prisma.workspace.update({ where: { id: ws.id }, data: { subscriptionStatus: 'past_due' } });
        await this.notifications.notifyWorkspace(ws.id, 'accountIssues', {
          title: 'Payment failed: action required',
          body: 'We could not charge your subscription. Razorpay will retry automatically; please check your UPI mandate or card.',
          link: '/settings?tab=billing',
        });
        break;
      case 'subscription.halted':
      case 'subscription.cancelled':
      case 'subscription.completed':
        await this.prisma.workspace.update({
          where: { id: ws.id },
          data: { plan: 'FREE', subscriptionStatus: body.event.split('.')[1], razorpaySubscriptionId: null },
        });
        break;
      default:
        break;
    }
    return { status: 'success' };
  }
}
