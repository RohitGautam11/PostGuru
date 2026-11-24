import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { PLAN_LIMITS, TRIAL_DAYS } from '../../common/plans';
import { env } from '../../config/env';

/**
 * Public, non-secret configuration for the marketing site, pricing and legal pages. Company
 * details come from one place so the footer, privacy policy, terms and invoices always match
 * (a Meta / LinkedIn / Google verification requirement).
 */
@Public()
@Controller('public')
export class PublicController {
  @Get('config')
  config() {
    const e = env();
    return {
      appName: e.APP_NAME,
      company: {
        legalName: e.COMPANY_LEGAL_NAME,
        address: e.COMPANY_ADDRESS,
        state: e.COMPANY_STATE,
        gstin: e.COMPANY_GSTIN ?? null,
        supportEmail: e.SUPPORT_EMAIL ?? null,
      },
      beta: e.BETA_ALL_ACCESS,
      trialDays: TRIAL_DAYS,
      plans: Object.entries(PLAN_LIMITS).map(([key, p]) => ({ key, ...p })),
    };
  }
}
