import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Plan } from '@prisma/client';
import { IsIn } from 'class-validator';
import type { Request } from 'express';
import Stripe from 'stripe';
import { env } from '../../config/env';
import { AuthUser, CurrentUser, MinRole, Public } from '../../common/decorators';
import { PLAN_LIMITS } from '../../common/plans';
import { PrismaService } from '../../prisma/prisma.service';

class CheckoutDto {
  @IsIn(['PRO', 'BUSINESS']) plan: 'PRO' | 'BUSINESS';
}

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);
  private stripeClient: Stripe | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private stripe() {
    if (!env().STRIPE_SECRET_KEY) throw new ServiceUnavailableException('Billing is not configured');
    this.stripeClient ??= new Stripe(env().STRIPE_SECRET_KEY!);
    return this.stripeClient;
  }

  private priceFor(plan: 'PRO' | 'BUSINESS') {
    const price = plan === 'PRO' ? env().STRIPE_PRICE_PRO : env().STRIPE_PRICE_BUSINESS;
    if (!price) throw new ServiceUnavailableException(`Stripe price for ${plan} is not configured`);
    return price;
  }

  private planForPrice(priceId?: string | null): Plan {
    if (priceId && priceId === env().STRIPE_PRICE_BUSINESS) return 'BUSINESS';
    if (priceId && priceId === env().STRIPE_PRICE_PRO) return 'PRO';
    return 'FREE';
  }

  @Get()
  async summary(@CurrentUser() user: AuthUser) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } });
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const [accounts, members, posts] = await Promise.all([
      this.prisma.socialAccount.count({ where: { workspaceId: ws.id } }),
      this.prisma.membership.count({ where: { workspaceId: ws.id } }),
      this.prisma.post.count({ where: { workspaceId: ws.id, status: { not: 'DRAFT' }, createdAt: { gte: monthStart } } }),
    ]);
    return {
      plan: ws.plan,
      status: ws.subscriptionStatus,
      currentPeriodEnd: ws.currentPeriodEnd,
      hasCustomer: Boolean(ws.stripeCustomerId),
      billingEnabled: Boolean(env().STRIPE_SECRET_KEY),
      limits: PLAN_LIMITS[ws.plan],
      usage: { accounts, members, postsThisMonth: posts },
      plans: Object.entries(PLAN_LIMITS).map(([key, v]) => ({ key, ...v })),
    };
  }

  /** Payment method on file and recent invoices (for the billing history list). */
  @Get('details')
  async details(@CurrentUser() user: AuthUser) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } });
    if (!env().STRIPE_SECRET_KEY || !ws.stripeCustomerId) return { paymentMethod: null, invoices: [] };
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
      paymentMethod: pm?.card
        ? { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year }
        : null,
      invoices: invoices.data.map((i) => ({
        id: i.id,
        date: new Date(i.created * 1000),
        amount: i.amount_paid || i.amount_due,
        currency: i.currency,
        status: i.status,
        description: i.lines.data[0]?.description ?? null,
        pdf: i.invoice_pdf,
        url: i.hosted_invoice_url,
      })),
    };
  }

  @MinRole('OWNER')
  @HttpCode(200)
  @Post('checkout')
  async checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    const stripe = this.stripe();
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } });

    // Existing subscribers change plan through the portal to get proration right.
    if (ws.stripeSubscriptionId && ws.plan !== 'FREE') return this.portal(user);

    let customerId = ws.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: ws.name,
        metadata: { workspaceId: ws.id },
      });
      customerId = customer.id;
      await this.prisma.workspace.update({ where: { id: ws.id }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: this.priceFor(dto.plan), quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: ws.id,
      subscription_data: { metadata: { workspaceId: ws.id } },
      metadata: { workspaceId: ws.id },
      success_url: `${env().WEB_URL}/settings?tab=billing&checkout=success`,
      cancel_url: `${env().WEB_URL}/settings?tab=billing&checkout=cancelled`,
    });
    return { url: session.url };
  }

  @MinRole('OWNER')
  @HttpCode(200)
  @Post('portal')
  async portal(@CurrentUser() user: AuthUser) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } });
    if (!ws.stripeCustomerId) throw new BadRequestException('No billing account yet. Choose a plan first.');
    const session = await this.stripe().billingPortal.sessions.create({
      customer: ws.stripeCustomerId,
      return_url: `${env().WEB_URL}/settings?tab=billing`,
    });
    return { url: session.url };
  }

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

    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.subscription) {
          const sub = await this.stripe().subscriptions.retrieve(String(s.subscription));
          await this.applySubscription(sub, s.client_reference_id ?? s.metadata?.workspaceId);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.applySubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
    return { received: true };
  }

  private async applySubscription(sub: Stripe.Subscription, workspaceIdHint?: string | null) {
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
        plan: active ? this.planForPrice(priceId) : 'FREE',
        stripeCustomerId: String(sub.customer),
        stripeSubscriptionId: sub.status === 'canceled' ? null : sub.id,
        subscriptionStatus: sub.status,
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      },
    });
  }
}
