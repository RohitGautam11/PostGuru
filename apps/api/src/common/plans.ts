import { Plan } from '@prisma/client';
import { env } from '../config/env';

/** -1 means unlimited for every numeric quota below. */
export interface PlanLimits {
  name: string;
  tagline: string;
  /** Monthly price in USD (international checkout). */
  priceMonthly: number;
  /** Monthly price in INR, before 18% GST (domestic checkout). */
  priceMonthlyInr: number;
  accounts: number;
  /** Lifetime cap on scheduled/published posts (Free Starter only). */
  scheduledPostsTotal: number;
  /** Monthly cap on scheduled/published posts. */
  scheduledPostsPerMonth: number;
  members: number;
  analyticsDays: number;
  /** AI Growth Assistant generations per calendar month. */
  aiCreditsPerMonth: number;
  /** Facebook Pages, LinkedIn Company Pages and Instagram via Facebook Business Login. */
  businessAccounts: boolean;
  /** 'view' = read-only inbox; 'reply' = comments & replies; 'full' = comments, DMs and webhooks. */
  inbox: 'view' | 'reply' | 'full';
  features: string[];
}

export const TRIAL_DAYS = 14;

/**
 * Tiering matrix from the production go-live guide:
 * Free Starter → Creator / Influencer → Business / Pro → Enterprise / Agency.
 * Enum keys are kept stable for existing data and Stripe/Razorpay price mapping:
 * FREE = Starter, CREATOR = Creator, PRO = Business, BUSINESS = Agency.
 */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    name: 'Free Starter',
    tagline: `Full Business features for ${TRIAL_DAYS} days, then the Starter limits`,
    priceMonthly: 0,
    priceMonthlyInr: 0,
    accounts: 2,
    scheduledPostsTotal: 15,
    scheduledPostsPerMonth: -1,
    members: 1,
    analyticsDays: 7,
    aiCreditsPerMonth: 5,
    businessAccounts: false,
    inbox: 'view',
    features: ['2 personal / creator profiles', '15 scheduled posts in total', 'Basic AI assistant (5 credits / mo)', 'Inbox (view only)', '7-day analytics'],
  },
  CREATOR: {
    name: 'Creator',
    tagline: 'For influencers and solo creators',
    priceMonthly: 9,
    priceMonthlyInr: 599,
    accounts: 5,
    scheduledPostsTotal: -1,
    scheduledPostsPerMonth: -1,
    members: 1,
    analyticsDays: 30,
    aiCreditsPerMonth: 100,
    businessAccounts: false,
    inbox: 'reply',
    features: ['5 personal + creator profiles', 'Unlimited scheduling', 'AI assistant (100 credits / mo)', 'Comments & replies', '30-day analytics'],
  },
  PRO: {
    name: 'Business',
    tagline: 'For brands and small teams',
    priceMonthly: 29,
    priceMonthlyInr: 1999,
    accounts: 15,
    scheduledPostsTotal: -1,
    scheduledPostsPerMonth: -1,
    members: 3,
    analyticsDays: 365,
    aiCreditsPerMonth: 500,
    businessAccounts: true,
    inbox: 'full',
    features: ['15 profiles incl. Business Pages', 'Unlimited scheduling', 'AI assistant (500 credits / mo)', 'Comments, DMs & webhooks', '1-year analytics', 'Up to 3 team members'],
  },
  BUSINESS: {
    name: 'Agency',
    tagline: 'For agencies and enterprises',
    priceMonthly: 79,
    priceMonthlyInr: 4999,
    accounts: 50,
    scheduledPostsTotal: -1,
    scheduledPostsPerMonth: -1,
    members: -1,
    analyticsDays: 730,
    aiCreditsPerMonth: -1,
    businessAccounts: true,
    inbox: 'full',
    features: ['50+ profiles, every account type', 'Unlimited scheduling', 'Unlimited AI assistant', 'Priority routing + team inbox', 'White-label reports', 'Unlimited team seats'],
  },
};

export const PAID_PLANS = ['CREATOR', 'PRO', 'BUSINESS'] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

interface WorkspaceLike {
  plan: Plan;
  createdAt: Date;
}

export function trialEndsAt(ws: WorkspaceLike): Date {
  return new Date(ws.createdAt.getTime() + TRIAL_DAYS * 86400_000);
}

/** A workspace on the Free plan gets the Business tier for its first 14 days. */
export function onTrial(ws: WorkspaceLike): boolean {
  return ws.plan === 'FREE' && trialEndsAt(ws).getTime() > Date.now();
}

/**
 * The limits that actually apply to a workspace right now.
 * BETA_ALL_ACCESS=true (staging) gives every workspace the top tier so testers are never blocked.
 */
export function effectivePlan(ws: WorkspaceLike): Plan {
  if (env().BETA_ALL_ACCESS) return 'BUSINESS';
  if (onTrial(ws)) return 'PRO';
  return ws.plan;
}

export function limitsFor(ws: WorkspaceLike): PlanLimits & { key: Plan; trial: boolean; beta: boolean } {
  const key = effectivePlan(ws);
  return { ...PLAN_LIMITS[key], key, trial: !env().BETA_ALL_ACCESS && onTrial(ws), beta: env().BETA_ALL_ACCESS };
}

/** True when `used` has reached a quota (-1 = unlimited). */
export const atLimit = (used: number, limit: number) => limit >= 0 && used >= limit;
