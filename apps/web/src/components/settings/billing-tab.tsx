'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Check, FlaskConical, Receipt, Sparkles } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Btn, FieldLabel, PageLoader, TextInput } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C, CARD_SHADOW } from '@/lib/design';
import { useCan } from '@/lib/hooks';
import type { Plan } from '@/lib/types';

const BORDER = `1px solid ${C.border}`;
const h3: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: C.ink };

interface PlanInfo {
  key: Plan;
  name: string;
  tagline: string;
  priceMonthly: number;
  priceMonthlyInr: number;
  accounts: number;
  members: number;
  scheduledPostsTotal: number;
  scheduledPostsPerMonth: number;
  aiCreditsPerMonth: number;
  analyticsDays: number;
  features: string[];
}

interface BillingSummary {
  plan: Plan;
  effectivePlan: Plan;
  trial: boolean;
  beta: boolean;
  trialEndsAt: string;
  status: string | null;
  currentPeriodEnd: string | null;
  billingProvider: 'stripe' | 'razorpay' | null;
  hasCustomer: boolean;
  billingEnabled: boolean;
  providers: { stripe: boolean; razorpay: boolean };
  details: { legalName: string | null; gstin: string | null; address: string | null; state: string | null; country: string | null };
  limits: PlanInfo;
  usage: { accounts: number; members: number; postsThisMonth: number; postsTotal: number; aiCredits: number };
  plans: PlanInfo[];
}

interface BillingDetails {
  paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number } | null;
  invoices: { id: string; number?: string | null; date: string; amount: number; currency: string; status: string | null; description?: string | null; pdf: string | null; url: string | null }[];
}

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const quota = (used: number, limit: number) => (limit < 0 ? `${used} / Unlimited` : `${used} / ${limit}`);

export function BillingTab() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const isOwner = useCan('OWNER');
  const { data } = useQuery({ queryKey: ['billing'], queryFn: () => api<BillingSummary>('/billing') });
  const { data: details } = useQuery({ queryKey: ['billing', 'details'], queryFn: () => api<BillingDetails>('/billing/details') });
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');

  useEffect(() => {
    if (data?.details.country && data.details.country !== 'IN') setCurrency('USD');
  }, [data?.details.country]);

  useEffect(() => {
    const c = params.get('checkout');
    if (c === 'success') {
      toast.success('Subscription updated. Thank you!');
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['billing'] });
    }
    if (c === 'cancelled') toast.message('Checkout cancelled');
  }, [params, qc]);

  const go = useMutation({
    mutationFn: ({ path, plan }: { path: string; plan?: Plan }) =>
      api<{ url?: string; ok?: boolean }>(path, { method: 'POST', body: plan ? { plan, currency } : undefined }),
    onSuccess: (r) => {
      if (r.url) window.location.href = r.url;
      else {
        toast.success('Your subscription will end at the close of the current billing period.');
        qc.invalidateQueries({ queryKey: ['billing'] });
      }
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!data) return <PageLoader />;
  const current = data.plans.find((p) => p.key === data.plan)!;
  const active = !data.status || ['active', 'trialing'].includes(data.status);
  const money = (minor: number, cur: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur.toUpperCase() }).format(minor / 100);
  const providerReady = currency === 'INR' ? data.providers.razorpay || data.providers.stripe : data.providers.stripe;
  const price = (p: PlanInfo) => (currency === 'INR' ? `₹${p.priceMonthlyInr.toLocaleString('en-IN')}` : `$${p.priceMonthly}`);
  const daysLeft = Math.max(0, Math.ceil((new Date(data.trialEndsAt).getTime() - Date.now()) / 86400_000));

  return (
    <div className="flex flex-col gap-6">
      {(data.beta || data.trial) && (
        <div className="flex items-start gap-3 rounded-2xl p-4" style={{ background: data.beta ? C.purpleSoft : C.blueSoft, border: `1px solid ${data.beta ? '#E9D5FF' : C.blueBorder}` }}>
          {data.beta ? <FlaskConical size={18} color={C.purple} className="mt-0.5 flex-shrink-0" /> : <Sparkles size={18} color={C.blue} className="mt-0.5 flex-shrink-0" />}
          <div>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>
              {data.beta ? 'Beta access: every feature is unlocked' : `Free trial: ${daysLeft} day${daysLeft === 1 ? '' : 's'} of Business features left`}
            </p>
            <p style={{ fontSize: 12.5, color: C.muted, marginTop: 2, lineHeight: 1.55 }}>
              {data.beta
                ? 'While we are in beta you get the Agency tier for free. Nothing is charged. Please share feedback with the Feedback button.'
                : `After ${format(new Date(data.trialEndsAt), 'MMM d')}, the workspace moves to Free Starter limits unless you choose a plan.`}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl p-6 sm:p-7" style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', boxShadow: CARD_SHADOW }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#60A5FA', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Current plan</span>
            <h3 style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', marginTop: 8 }}>{current.name}</h3>
            <p style={{ fontSize: 13, color: C.faint, marginTop: 6 }}>
              {current.priceMonthly
                ? data.billingProvider === 'razorpay'
                  ? `₹${current.priceMonthlyInr.toLocaleString('en-IN')}/mo + GST · UPI AutoPay / card`
                  : `$${current.priceMonthly}/mo · Billed monthly`
                : 'Free'}
              {data.currentPeriodEnd && ` · ${['canceled', 'cancelled', 'cancelling'].includes(data.status ?? '') ? 'Ends' : 'Renews'} ${format(new Date(data.currentPeriodEnd), 'MMM d, yyyy')}`}
            </p>
            {data.effectivePlan !== data.plan && (
              <p style={{ fontSize: 12, color: '#A5B4FC', marginTop: 4 }}>Limits in effect now: {data.limits.name}</p>
            )}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ fontSize: 12, fontWeight: 700, color: active ? '#34D399' : '#FBBF24', background: active ? 'rgba(52,211,153,0.1)' : 'rgba(251,191,36,0.1)' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? '#34D399' : '#FBBF24' }} /> {data.status ? data.status.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'Active'}
          </span>
        </div>
        <div className="mt-7 grid grid-cols-2 gap-4 pt-6 lg:grid-cols-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {[
            [quota(data.usage.members, data.limits.members), 'Team members'],
            [quota(data.usage.accounts, data.limits.accounts), 'Connected profiles'],
            [
              data.limits.scheduledPostsTotal >= 0
                ? quota(data.usage.postsTotal, data.limits.scheduledPostsTotal)
                : data.limits.scheduledPostsPerMonth >= 0
                  ? quota(data.usage.postsThisMonth, data.limits.scheduledPostsPerMonth)
                  : 'Unlimited',
              data.limits.scheduledPostsTotal >= 0 ? 'Scheduled posts (total)' : 'Scheduled posts',
            ],
            [quota(data.usage.aiCredits, data.limits.aiCreditsPerMonth), 'AI credits this month'],
          ].map(([v, l]) => (
            <div key={l}>
              <p style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{v}</p>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{l}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 style={h3}>Plans</h3>
        <div className="inline-flex rounded-xl p-1" style={{ background: '#fff', border: BORDER }} role="group" aria-label="Currency">
          {(['INR', 'USD'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className="rounded-lg px-3 py-1.5 transition-colors"
              style={{ fontSize: 12, fontWeight: 600, color: currency === c ? '#fff' : C.muted, background: currency === c ? C.ink : 'transparent' }}
            >
              {c === 'INR' ? '₹ INR (India)' : '$ USD (International)'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.plans.map((p) => {
          const isCurrent = p.key === data.plan;
          const popular = p.key === 'PRO';
          return (
            <div key={p.key} className="relative flex flex-col rounded-2xl bg-white p-6" style={{ border: isCurrent || popular ? `1.5px solid ${C.blueBorder}` : BORDER, boxShadow: CARD_SHADOW }}>
              <div className="flex items-center justify-between gap-2">
                <p style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{p.name}</p>
                {isCurrent ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.blue, background: C.blueSoft, padding: '2px 8px', borderRadius: 999 }}>Current</span>
                ) : popular ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.violet, background: C.purpleSoft, padding: '2px 8px', borderRadius: 999 }}>Popular</span>
                ) : null}
              </div>
              <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{p.tagline}</p>
              <p className="mt-3">
                <span style={{ fontSize: 26, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em' }}>{price(p)}</span>
                <span style={{ fontSize: 13, color: C.faint }}> / month{currency === 'INR' && p.priceMonthlyInr ? ' + GST' : ''}</span>
              </p>
              <ul className="mt-4 flex flex-1 flex-col gap-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2" style={{ fontSize: 13, color: C.body }}>
                    <Check size={14} className="mt-0.5 flex-shrink-0" color={C.green} /> {f}
                  </li>
                ))}
              </ul>
              {!isCurrent && p.key !== 'FREE' && (
                <button
                  disabled={!isOwner || !providerReady || go.isPending}
                  onClick={() =>
                    go.mutate(data.plan !== 'FREE' && data.billingProvider === 'stripe' && data.hasCustomer ? { path: '/billing/portal' } : { path: '/billing/checkout', plan: p.key })
                  }
                  className="mt-5 w-full rounded-xl py-2.5 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: C.blue }}
                >
                  {data.plan === 'FREE' ? `Choose ${p.name}` : `Switch to ${p.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 12, color: C.faint, lineHeight: 1.6 }}>
        {!isOwner
          ? 'Only workspace owners can change the plan.'
          : !providerReady
            ? `Online payments in ${currency} are not switched on yet${data.beta ? ' (not needed during the beta).' : '.'}`
            : currency === 'INR'
              ? 'Indian payments use Razorpay: UPI AutoPay, e-mandates and Indian cards, with a GST tax invoice every month.'
              : 'International payments use Stripe; taxes are calculated at checkout.'}
      </p>

      <BillingDetailsCard data={data} canEdit={isOwner} />

      <div className="rounded-2xl bg-white p-6 sm:p-7" style={{ border: BORDER }}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h3 style={h3}>Payment method</h3>
          {isOwner && data.billingProvider === 'razorpay' && data.status !== 'cancelling' && (
            <button onClick={() => go.mutate({ path: '/billing/cancel' })} style={{ fontSize: 13, fontWeight: 600, color: C.red }} className="transition-opacity hover:opacity-70">
              Cancel subscription
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-xl p-5" style={{ border: BORDER, background: '#FAFBFD' }}>
          <div className="flex items-center justify-center rounded-lg" style={{ width: 44, height: 30, background: '#1a1f5e' }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#fff' }}>
              {data.billingProvider === 'razorpay' ? 'UPI' : details?.paymentMethod ? details.paymentMethod.brand.toUpperCase().slice(0, 4) : 'CARD'}
            </span>
          </div>
          <div className="flex-1">
            <p style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
              {data.billingProvider === 'razorpay'
                ? 'Razorpay mandate (UPI AutoPay / card)'
                : details?.paymentMethod
                  ? `${details.paymentMethod.brand.charAt(0).toUpperCase() + details.paymentMethod.brand.slice(1)} ending in ${details.paymentMethod.last4}`
                  : 'No payment method on file'}
            </p>
            <p style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>
              {details?.paymentMethod ? `Expires ${String(details.paymentMethod.expMonth).padStart(2, '0')}/${String(details.paymentMethod.expYear).slice(-2)}` : 'Added when you choose a plan'}
            </p>
          </div>
          {data.hasCustomer && isOwner && data.billingProvider !== 'razorpay' && (
            <button onClick={() => go.mutate({ path: '/billing/portal' })} style={{ fontSize: 13, fontWeight: 600, color: C.blue }} className="transition-opacity hover:opacity-70">
              Update
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 sm:p-7" style={{ border: BORDER }}>
        <h3 style={{ ...h3, marginBottom: 16 }}>Invoices</h3>
        {!details?.invoices.length ? (
          <p style={{ fontSize: 13, color: C.ghost }}>No invoices yet.</p>
        ) : (
          details.invoices.map((inv, i) => (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-4" style={{ borderBottom: i < details.invoices.length - 1 ? `1px solid ${C.line}` : 'none' }}>
              <div className="flex items-center gap-3">
                <Receipt size={16} color={C.faint} />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
                    {inv.number ?? inv.description ?? 'Invoice'} · {format(new Date(inv.date), 'MMM d, yyyy')}
                  </p>
                  <p style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>{money(inv.amount, inv.currency)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1"
                  style={{ fontSize: 11, fontWeight: 700, color: inv.status === 'paid' ? C.green : C.amber, background: inv.status === 'paid' ? C.greenSoft : C.amberSoft }}
                >
                  {inv.status === 'paid' && <Check size={9} strokeWidth={3} />} {inv.status ? inv.status.charAt(0).toUpperCase() + inv.status.slice(1) : '—'}
                </span>
                {(inv.pdf || inv.url) && (
                  <a href={(inv.pdf ?? inv.url)!} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: C.muted }} className="transition-opacity hover:opacity-70">
                    View
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function BillingDetailsCard({ data, canEdit }: { data: BillingSummary; canEdit: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ legalName: '', gstin: '', address: '', state: '', country: 'IN' });
  useEffect(() => {
    setForm({
      legalName: data.details.legalName ?? '',
      gstin: data.details.gstin ?? '',
      address: data.details.address ?? '',
      state: data.details.state ?? '',
      country: data.details.country ?? 'IN',
    });
  }, [data.details]);
  const save = useMutation({
    mutationFn: () => api('/billing/details', { method: 'PUT', body: form }),
    onSuccess: () => {
      toast.success('Billing details saved');
      qc.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="rounded-2xl bg-white p-6 sm:p-7" style={{ border: BORDER }}>
      <h3 style={h3}>Billing details</h3>
      <p style={{ fontSize: 12.5, color: C.faint, marginTop: 4 }}>Printed on your tax invoices. Add your GSTIN to claim input tax credit.</p>
      <form
        className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div>
          <FieldLabel>Legal / business name</FieldLabel>
          <TextInput value={form.legalName} onChange={set('legalName')} disabled={!canEdit} placeholder="As on your GST certificate" />
        </div>
        <div>
          <FieldLabel>GSTIN (optional)</FieldLabel>
          <TextInput value={form.gstin} onChange={set('gstin')} disabled={!canEdit} placeholder="22AAAAA0000A1Z5" maxLength={15} style={{ textTransform: 'uppercase' }} />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel>Billing address</FieldLabel>
          <TextInput value={form.address} onChange={set('address')} disabled={!canEdit} placeholder="Street, city, PIN code" />
        </div>
        <div>
          <FieldLabel>Country</FieldLabel>
          <select value={form.country} onChange={set('country')} disabled={!canEdit} className="w-full rounded-xl bg-white px-4 py-2.5" style={{ fontSize: 13, border: `1px solid ${C.border3}`, color: C.ink }}>
            <option value="IN">India</option>
            <option value="US">United States</option>
            <option value="GB">United Kingdom</option>
            <option value="AE">United Arab Emirates</option>
            <option value="SG">Singapore</option>
            <option value="AU">Australia</option>
            <option value="CA">Canada</option>
            <option value="DE">Germany</option>
            <option value="ZZ">Other</option>
          </select>
        </div>
        <div>
          <FieldLabel>State (place of supply)</FieldLabel>
          {form.country === 'IN' ? (
            <select value={form.state} onChange={set('state')} disabled={!canEdit} className="w-full rounded-xl bg-white px-4 py-2.5" style={{ fontSize: 13, border: `1px solid ${C.border3}`, color: C.ink }}>
              <option value="">Select state</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <TextInput value={form.state} onChange={set('state')} disabled={!canEdit} placeholder="State / region" />
          )}
        </div>
        {canEdit && (
          <div className="sm:col-span-2">
            <Btn type="submit" loading={save.isPending}>
              Save billing details
            </Btn>
          </div>
        )}
      </form>
    </div>
  );
}
