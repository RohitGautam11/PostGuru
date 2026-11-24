import { Plan, Prisma, PrismaClient } from '@prisma/client';
import { env } from '../../config/env';

export const GST_RATE = 0.18;

/** GSTIN format: 2-digit state code, 10-char PAN, entity code, 'Z', checksum. */
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Indian financial year label for a date, e.g. 2026-11-24 → "26-27", 2027-02-01 → "26-27". */
export function financialYear(d = new Date()): string {
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
}

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

/**
 * Splits a GST-inclusive amount (in paise) into taxable value and tax.
 * Same state as the supplier → 9% CGST + 9% SGST; different state → 18% IGST.
 */
export function gstBreakdown(totalPaise: number, customerState?: string | null) {
  const subtotal = Math.round(totalPaise / (1 + GST_RATE));
  const tax = totalPaise - subtotal;
  const intra = Boolean(env().COMPANY_STATE) && norm(customerState) === norm(env().COMPANY_STATE);
  if (intra) {
    const cgst = Math.floor(tax / 2);
    return { subtotal, cgst, sgst: tax - cgst, igst: 0, total: totalPaise, intra };
  }
  return { subtotal, cgst: 0, sgst: 0, igst: tax, total: totalPaise, intra };
}

/** Creates the next sequentially numbered invoice (INV/26-27/0001) for a payment. Idempotent per externalId. */
export async function createGstInvoice(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    workspaceId: string;
    provider: string;
    externalId: string;
    plan: Plan;
    totalPaise: number;
    periodStart?: Date | null;
    periodEnd?: Date | null;
  },
) {
  const existing = await prisma.invoice.findUnique({ where: { externalId: input.externalId } });
  if (existing) return existing;
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: input.workspaceId } });
  const fy = financialYear();
  const counter = await prisma.invoiceCounter.upsert({
    where: { financialYear: fy },
    create: { financialYear: fy, seq: 1 },
    update: { seq: { increment: 1 } },
  });
  const tax = gstBreakdown(input.totalPaise, ws.billingState);
  return prisma.invoice.create({
    data: {
      workspaceId: ws.id,
      number: `INV/${fy}/${String(counter.seq).padStart(4, '0')}`,
      financialYear: fy,
      provider: input.provider,
      externalId: input.externalId,
      plan: input.plan,
      currency: 'INR',
      subtotal: tax.subtotal,
      cgst: tax.cgst,
      sgst: tax.sgst,
      igst: tax.igst,
      total: tax.total,
      customerName: ws.billingLegalName || ws.name,
      customerGstin: ws.billingGstin,
      customerAddress: ws.billingAddress,
      placeOfSupply: ws.billingState,
      sacCode: env().COMPANY_SAC_CODE,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
    },
  });
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Printable tax invoice (opened in a new tab; the browser's Print → Save as PDF produces the PDF). */
export function renderInvoiceHtml(inv: Prisma.InvoiceGetPayload<object>, planName: string) {
  const e = env();
  const row = (label: string, value: string) => `<tr><td>${esc(label)}</td><td class="r">${esc(value)}</td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tax Invoice ${esc(inv.number)}</title>
<style>
body{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;background:#f4f6f9;margin:0;padding:24px}
.sheet{max-width:780px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:40px}
h1{font-size:22px;margin:0 0 4px}.muted{color:#64748b;font-size:13px;line-height:1.6}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:28px 0}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:10px 8px;border-bottom:1px solid #eef2f6;text-align:left}
.r{text-align:right}.total td{font-weight:700;font-size:15px;border-bottom:none}
.btn{display:inline-block;margin-top:24px;padding:10px 18px;border-radius:10px;background:#0f172a;color:#fff;text-decoration:none;font-size:13px;border:0;cursor:pointer}
@media print{body{background:#fff;padding:0}.sheet{border:0}.btn{display:none}}
@media(max-width:600px){.grid{grid-template-columns:1fr}.sheet{padding:20px}}
</style></head><body><div class="sheet">
<h1>Tax Invoice</h1>
<div class="muted">Invoice no. <b>${esc(inv.number)}</b> · Date ${esc(inv.issuedAt.toISOString().slice(0, 10))}</div>
<div class="grid">
<div><div class="muted"><b>Supplier</b></div><div><b>${esc(e.COMPANY_LEGAL_NAME)}</b></div>
<div class="muted">${esc(e.COMPANY_ADDRESS)}<br>${esc(e.COMPANY_STATE)}<br>GSTIN: ${esc(e.COMPANY_GSTIN ?? '—')}</div></div>
<div><div class="muted"><b>Bill to</b></div><div><b>${esc(inv.customerName)}</b></div>
<div class="muted">${esc(inv.customerAddress ?? '')}<br>Place of supply: ${esc(inv.placeOfSupply ?? '—')}<br>GSTIN: ${esc(inv.customerGstin ?? 'Unregistered')}</div></div>
</div>
<table><thead><tr><th>Description</th><th>SAC</th><th class="r">Taxable value</th></tr></thead><tbody>
<tr><td>${esc(e.APP_NAME)} ${esc(planName)} subscription${inv.periodStart && inv.periodEnd ? ` (${esc(inv.periodStart.toISOString().slice(0, 10))} – ${esc(inv.periodEnd.toISOString().slice(0, 10))})` : ''}</td><td>${esc(inv.sacCode)}</td><td class="r">${inr(inv.subtotal)}</td></tr>
</tbody></table>
<table style="margin-top:12px">
${inv.igst ? row('IGST @ 18%', inr(inv.igst)) : row('CGST @ 9%', inr(inv.cgst)) + row('SGST @ 9%', inr(inv.sgst))}
<tr class="total"><td>Total (incl. GST)</td><td class="r">${inr(inv.total)}</td></tr>
</table>
<p class="muted" style="margin-top:20px">Tax payable on reverse charge: No</p>
<button class="btn" onclick="window.print()">Print / Save as PDF</button>
</div></body></html>`;
}
