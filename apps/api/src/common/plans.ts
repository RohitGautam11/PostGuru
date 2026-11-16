import { Plan } from '@prisma/client';

export interface PlanLimits {
  name: string;
  priceMonthly: number;
  accounts: number;
  scheduledPostsPerMonth: number; // -1 = unlimited
  members: number;
  analyticsDays: number;
  features: string[];
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    name: 'Free',
    priceMonthly: 0,
    accounts: 3,
    scheduledPostsPerMonth: 30,
    members: 1,
    analyticsDays: 30,
    features: ['3 social accounts', '30 scheduled posts / month', 'Unified inbox', '30-day analytics'],
  },
  PRO: {
    name: 'Pro',
    priceMonthly: 29,
    accounts: 15,
    scheduledPostsPerMonth: -1,
    members: 3,
    analyticsDays: 365,
    features: ['15 social accounts', 'Unlimited scheduling', '3 team members', '1-year analytics', 'Priority support'],
  },
  BUSINESS: {
    name: 'Business',
    priceMonthly: 99,
    accounts: 50,
    scheduledPostsPerMonth: -1,
    members: 15,
    analyticsDays: 730,
    features: ['50 social accounts', 'Unlimited scheduling', '15 team members', '2-year analytics', 'Advanced roles & permissions'],
  },
};
