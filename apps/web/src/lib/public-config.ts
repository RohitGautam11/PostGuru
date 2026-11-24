import 'server-only';

export interface PublicPlan {
  key: 'FREE' | 'CREATOR' | 'PRO' | 'BUSINESS';
  name: string;
  tagline: string;
  priceMonthly: number;
  priceMonthlyInr: number;
  features: string[];
}

export interface PublicConfig {
  appName: string;
  company: { legalName: string; address: string; state: string; gstin: string | null; supportEmail: string | null };
  beta: boolean;
  trialDays: number;
  plans: PublicPlan[];
}

const APP = process.env.NEXT_PUBLIC_APP_NAME || 'PostGuru';

const FALLBACK: PublicConfig = {
  appName: APP,
  company: { legalName: APP, address: '', state: '', gstin: null, supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? null },
  beta: true,
  trialDays: 14,
  plans: [],
};

/** Company details and plans from the API (single source of truth for footer, legal pages and invoices). */
export async function getPublicConfig(): Promise<PublicConfig> {
  const base = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/api/public/config`, { next: { revalidate: 300 } });
    if (!res.ok) return FALLBACK;
    const data = (await res.json()) as PublicConfig;
    return { ...data, company: { ...data.company, supportEmail: data.company.supportEmail ?? FALLBACK.company.supportEmail } };
  } catch {
    return FALLBACK;
  }
}
