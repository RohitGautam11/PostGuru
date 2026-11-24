import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z.string().min(1, 'ENCRYPTION_KEY is required (32 bytes, base64)'),
  CRON_SECRET: z.string().min(8).optional(),
  ENABLE_INTERNAL_SCHEDULER: bool,

  /** local = disk (dev only); s3 = S3/R2/Supabase Storage; blob = Vercel Blob (BLOB_READ_WRITE_TOKEN). */
  STORAGE_DRIVER: z.enum(['local', 's3', 'blob']).default('local'),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().default(200),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_CREATOR: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_BUSINESS: z.string().optional(),

  /** Razorpay (domestic INR subscriptions: UPI AutoPay, e-mandates, Indian cards). */
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_PLAN_CREATOR: z.string().optional(),
  RAZORPAY_PLAN_PRO: z.string().optional(),
  RAZORPAY_PLAN_BUSINESS: z.string().optional(),

  /** Staging: give every workspace the top plan so beta testers are never blocked by limits. */
  BETA_ALL_ACCESS: bool,
  /** Comma-separated emails that can open the admin console (feedback, beta testers, deletion requests). */
  ADMIN_EMAILS: z.string().default(''),

  /** Supplier details printed on GST invoices and the legal pages. Keep identical to your GST REG-06. */
  COMPANY_LEGAL_NAME: z.string().default('PostGuru'),
  COMPANY_ADDRESS: z.string().default(''),
  COMPANY_STATE: z.string().default(''),
  COMPANY_GSTIN: z.string().optional(),
  COMPANY_SAC_CODE: z.string().default('998315'),
  SUPPORT_EMAIL: z.string().optional(),

  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  META_GRAPH_VERSION: z.string().default('v21.0'),
  /** Instagram API with Instagram Login (creators, no Facebook Page). Meta app → Instagram → API setup with Instagram login. */
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),

  X_CLIENT_ID: z.string().optional(),
  X_CLIENT_SECRET: z.string().optional(),

  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_API_VERSION: z.string().default('202605'),
  LINKEDIN_ORGANIZATIONS: bool,

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  THREADS_APP_ID: z.string().optional(),
  THREADS_APP_SECRET: z.string().optional(),

  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),

  PINTEREST_APP_ID: z.string().optional(),
  PINTEREST_APP_SECRET: z.string().optional(),
  PINTEREST_SANDBOX: bool,

  /** Optional: enables the AI Growth Assistant (captions, hashtags, hooks, YouTube SEO). */
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-opus-5-5'),

  APP_NAME: z.string().default('PostGuru'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated, typed environment. Throws at boot with a readable message if misconfigured. */
export function env(): Env {
  if (cached) return cached;
  // Treat empty strings as "not set" so optional values in .env files behave as expected.
  const raw = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ''),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => env().NODE_ENV === 'production';
