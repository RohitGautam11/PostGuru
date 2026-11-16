# Postly (SocialHub) — Social Media Management Platform

> The UI implements the **Postly** Figma design (High-Fidelity Dashboard Design). The repository/folder is still called `SocialHub`; the product name shown in the UI comes from `NEXT_PUBLIC_APP_NAME` (default `Postly`).

Manage every social account from one place. Users connect their **Facebook Pages, Instagram Business, X (Twitter), LinkedIn and YouTube** accounts once. From SocialHub they can then:

- **Create, edit and publish** posts to many accounts at once, with per-platform text, a YouTube title, images, carousels and video
- **Schedule** posts on a drag-and-drop **calendar**, with automatic publishing, retries and failure alerts
- Read and **reply to direct messages** in a unified **Inbox** (Messenger, Instagram Direct, X DMs)
- **Review, reply to, hide and delete comments**, triaged by sentiment
- Track **analytics**: audience growth, engagement, top posts and a best-time-to-post heatmap
- Run a **SaaS business**: workspaces, team roles, invitations and **Stripe subscriptions** with plan limits

```
SocialHub/
├── apps/
│   ├── api/   NestJS 10 + Prisma + PostgreSQL   → Vercel project #1 (serverless) or Docker
│   └── web/   Next.js 14 (App Router) + Tailwind  → Vercel project #2
├── docs/SOCIAL_PLATFORMS.md   ← step-by-step: connecting every social platform
├── docker-compose.yml         ← local PostgreSQL
└── .github/workflows/scheduler.yml  ← free cron alternative
```

---

## 1. Architecture

```
 Browser ──► web (Next.js, your-domain.com)
               │  /api/*  is proxied (Next.js rewrite) to ──► api (NestJS)
               │                                              │
               │                                              ├── PostgreSQL (Neon / Supabase / RDS)
               │                                              ├── S3 / Cloudflare R2 (media)
               │                                              ├── Stripe (billing)
               │                                              └── Facebook / Instagram / X / LinkedIn / YouTube APIs
               │
 Vercel Cron / GitHub Actions ──► /api/cron/publish  (publishes due posts)
                                  /api/cron/sync     (pulls DMs, comments, metrics)
 Meta webhooks ─────────────────► /api/webhooks/meta (real-time comments & messages)
 Stripe webhooks ───────────────► /api/billing/webhook
```

**Why the proxy?** The browser only ever talks to the web domain. Auth cookies are first-party (`httpOnly`, `SameSite=Lax`), there is no CORS to configure, and every OAuth redirect URI and webhook URL lives on **your web domain**.

### Key design decisions

| Concern | Implementation |
|---|---|
| Auth | Email + password (bcrypt, cost 12). 15-minute JWT access cookie plus a 30-day rotating refresh token, stored hashed. Reusing a refresh token revokes the whole session family. |
| Multi-tenancy | Every query is scoped by `workspaceId`; membership is re-checked on every request. Roles: `OWNER > ADMIN > EDITOR > VIEWER`. |
| Social tokens | Encrypted at rest with AES-256-GCM (`ENCRYPTION_KEY`), auto-refreshed before expiry. Accounts are flagged *Reconnect needed* when a token is revoked. |
| OAuth | Single-use `state` stored server-side (10-minute TTL), PKCE for X and Google. |
| Scheduling | Each due post is claimed with an atomic conditional `UPDATE`, so it is safe with many workers or overlapping cron runs. Transient errors (429/5xx) retry with exponential backoff (3 attempts). Stale locks fail safely instead of double-posting. |
| Media | The browser uploads directly to S3/R2 with presigned URLs, which avoids the serverless 4.5 MB body limit. Platforms fetch the media from the public URL. |
| Security | Helmet, rate limiting (stricter on auth), DTO whitelisting (unknown fields rejected), signature-verified webhooks, timing-safe secret comparison, security headers on the web app. |
| Plans | `FREE` / `PRO` / `BUSINESS` limits for accounts, members, monthly posts and analytics history, enforced server-side (`apps/api/src/common/plans.ts`). |

---

## 2. Run locally

**Prerequisites:** Node.js 20+ and a PostgreSQL 14+ database created with **UTF-8** encoding. No Docker? Run `npm --prefix apps/api run db:start` — it starts a project-local PostgreSQL (data in `apps/api/.local-db`) on port 5432; keep that terminal open.

```bash
cd SocialHub
docker compose up -d                 # PostgreSQL on localhost:5432 (or: npm --prefix apps/api run db:start)
npm run install:all

# API config
cp apps/api/.env.example apps/api/.env
# then set ENCRYPTION_KEY and the two JWT secrets:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # JWT_ACCESS_SECRET / JWT_REFRESH_SECRET

# Web config
cp apps/web/.env.example apps/web/.env.local

npm --prefix apps/api run prisma:deploy   # create the tables
npm run dev:api                           # http://localhost:4000/api
npm run dev:web                           # http://localhost:3000
```

Open http://localhost:3000 (or the port in `apps/web/package.json`), create an account, then go to **Connect Account** to connect platforms. `apps/api/.env` is loaded automatically by `npm run dev:api` / `npm start`. Set `ENABLE_INTERNAL_SCHEDULER=true` in `apps/api/.env` so scheduled posts publish locally without a cron.

> Most platforms require **HTTPS** redirect URIs and **publicly reachable media URLs** (Instagram, Facebook and LinkedIn fetch your images from the URL). For local OAuth testing, expose the web app with a tunnel such as `ngrok http 3000` or `cloudflared tunnel`, set `WEB_URL` to the tunnel URL, and use S3/R2 storage.

---

## 3. Deploy to Vercel

You create **two Vercel projects from the same Git repository**.

### 3.1 Prepare services

1. **PostgreSQL**: create a database on [Neon](https://neon.tech), [Supabase](https://supabase.com) or Vercel Postgres. Copy the **pooled** connection string. For Neon, append `?sslmode=require&pgbouncer=true&connect_timeout=15`.
2. **Media storage** (S3-compatible, public read). Cloudflare R2 is the recommended option.
   - Create a bucket and enable its public `r2.dev` URL (or a custom domain). That URL is `S3_PUBLIC_URL`.
   - Create an API token with *Object Read & Write*. That gives you `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`.
   - `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com` and `S3_REGION=auto`.
   - Add a **CORS policy** to the bucket so browsers can upload:
     ```json
     [{ "AllowedOrigins": ["https://your-domain.com"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600 }]
     ```
   - For AWS S3, leave `S3_ENDPOINT` empty, set `S3_REGION`, use the same CORS policy and allow public `GetObject` on the bucket.

### 3.2 API project (`apps/api`)

1. In Vercel, choose **Add New → Project**, import the repository, and set the **Root Directory** to `apps/api`.
2. Leave Framework Preset as **Other**. `apps/api/vercel.json` already sets the build command (`prisma generate && prisma migrate deploy && nest build`) and routes every request to the Nest app.
3. Add the environment variables below, then deploy. Check that `https://<api-project>.vercel.app/api/health` returns `{"status":"ok"}`.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `WEB_URL` | `https://your-domain.com` (the **web** project URL, no trailing slash) |
| `DATABASE_URL` | pooled Postgres URL |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | two different random strings, 32+ characters |
| `ENCRYPTION_KEY` | 32 random bytes, base64. **Never change it after launch**, or stored social tokens become unreadable. |
| `CRON_SECRET` | random string |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` | from step 3.1 |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` | see §5 |
| `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | see docs/SOCIAL_PLATFORMS.md |
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | 〃 |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_ORGANIZATIONS` | 〃 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | 〃 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | any SMTP provider (Resend, SendGrid, Postmark, SES…). Used for password-reset links, email notifications and the weekly report. |
| `APP_NAME` | `Postly` — product name used in emails and in the authenticator-app label |

A platform whose credentials are missing shows as **Not configured** in the UI. Everything else keeps working.

Without `SMTP_HOST`, emails are not sent. The API logs each message instead (including password-reset links), which is handy locally. In production, configure SMTP or users cannot reset their password.

### 3.3 Web project (`apps/web`)

1. Import the same repository again and set the **Root Directory** to `apps/web`. The framework is detected as Next.js.
2. Add these environment variables:

| Variable | Value |
|---|---|
| `API_URL` | `https://<api-project>.vercel.app` (it is read at **build time** for the proxy, so redeploy after changing it) |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain.com` |
| `NEXT_PUBLIC_APP_NAME` | `Postly` (or your brand) |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | optional — shown in Help & Support |
| `NEXT_PUBLIC_TERMS_URL`, `NEXT_PUBLIC_PRIVACY_URL` | optional — linked from the sign-up form |

3. Deploy, then attach your custom domain to the **web** project. Make sure the API's `WEB_URL` equals this domain.

### 3.4 Scheduled publishing (cron)

Scheduled posts are published by calling `/api/cron/publish`, and inboxes and comments are refreshed by `/api/cron/sync`. Pick **one** option:

- **Vercel Pro**: add this to `apps/api/vercel.json` and redeploy. Vercel automatically sends `Authorization: Bearer $CRON_SECRET`.
  ```json
  "crons": [
    { "path": "/api/cron/publish", "schedule": "* * * * *" },
    { "path": "/api/cron/sync",    "schedule": "*/10 * * * *" },
    { "path": "/api/cron/cleanup", "schedule": "0 3 * * *" },
    { "path": "/api/cron/token-expiry", "schedule": "0 9 * * *" },
    { "path": "/api/cron/weekly-report", "schedule": "0 9 * * 1" }
  ]
  ```
  (Vercel **Hobby** rejects crons that run more than once a day, so the file ships without them.)
- **Free**: the included GitHub Actions workflow (`.github/workflows/scheduler.yml`) publishes and syncs every 5 minutes, sends token-expiry warnings daily, and sends the weekly report on Mondays at 09:00 UTC. Add the repository secrets `API_URL` and `CRON_SECRET`.
- **Any external cron** (cron-job.org, EasyCron, Upstash QStash): `POST https://<api>/api/cron/publish` every minute with the header `Authorization: Bearer <CRON_SECRET>`.
- **Self-hosted API** (Docker, Render, Railway, Fly): set `ENABLE_INTERNAL_SCHEDULER=true`. A Dockerfile is provided in `apps/api`.

The function's `maxDuration` is 300 s, because video uploads to YouTube, X and LinkedIn and Instagram Reels processing can take minutes. Vercel Hobby caps function duration lower, so use Pro if you publish large videos.

---

## 4. Connect the social platforms

Full walkthroughs are in **[docs/SOCIAL_PLATFORMS.md](docs/SOCIAL_PLATFORMS.md)**: developer app creation, exact redirect URIs, scopes, webhooks and app review for each platform.

Quick reference. Every redirect URI uses your **web** domain:

| Platform | Redirect URI | Env vars |
|---|---|---|
| Facebook + Instagram (Meta) | `https://your-domain.com/api/integrations/facebook/callback` **and** `.../instagram/callback` | `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` |
| X (Twitter) | `https://your-domain.com/api/integrations/x/callback` | `X_CLIENT_ID`, `X_CLIENT_SECRET` |
| LinkedIn | `https://your-domain.com/api/integrations/linkedin/callback` | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` |
| YouTube (Google) | `https://your-domain.com/api/integrations/youtube/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Meta webhooks | `https://your-domain.com/api/webhooks/meta` | (verify token = `META_WEBHOOK_VERIFY_TOKEN`) |
| **Sign in with Google** (login/signup buttons) | `https://your-domain.com/api/auth/google/callback` — add it to the same Google OAuth client | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

Admins can copy every callback URL from **Settings → API & Integrations**.

---

## 5. Subscriptions (Stripe)

1. In the Stripe Dashboard, create two **recurring Prices** (for example Pro at $29/month and Business at $99/month) and copy their IDs into `STRIPE_PRICE_PRO` and `STRIPE_PRICE_BUSINESS`.
2. Under **Developers → Webhooks**, add the endpoint `https://your-domain.com/api/billing/webhook` with these events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Enable the **Customer Portal** (Settings → Billing → Customer portal) so customers can switch plans, update cards and cancel.
4. Plan limits and marketing copy live in `apps/api/src/common/plans.ts`. Keep the prices there in sync with Stripe.

Workspace owners upgrade from **Settings → Billing** (plan card, payment method and invoice history come from Stripe). Webhooks keep `plan`, `subscriptionStatus` and `currentPeriodEnd` in sync, and a cancelled subscription falls back to `FREE`.

---

## 6. Feature map

| Screen | Route | Backend |
|---|---|---|
| Login / Sign up (email + Google, two-step verification) | `/login`, `/signup`, `/invite/:token` | `/api/auth/*`, `POST /api/auth/login/2fa`, `GET /api/auth/invite/:token`, `GET /api/auth/google` |
| Forgot / reset password | `/forgot-password`, `/reset-password?token=…` | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` |
| Dashboard (overview, issues, stats, recent posts, performance, accounts) | `/dashboard` | `GET /api/dashboard`, `GET /api/analytics/overview` |
| Composer (create / edit / schedule / publish, media, previews) | `/composer`, `/composer?id=…`, `/composer?date=…` | `POST/PUT /api/posts`, `/api/media/*` |
| Planner (week + list, drag to reschedule, search) | `/planner`, `/planner?view=list&q=…` | `GET /api/posts?from&to`, `PATCH /api/posts/:id/schedule` |
| Post details (preview, delivery, performance, retry) | `/posts/:id` | `GET /api/posts/:id`, `POST …/publish`, `…/duplicate`, `DELETE /api/posts/:id?remote=true` |
| Unified inbox (DMs, comments, mentions; resolve / assign / flag / hide / delete; internal notes; mute contact; quote tweet) | `/inbox` | `GET /api/inbox/threads[/:id]`, `POST …/reply`, `PATCH …/:id`, `POST/DELETE …/:id/notes`, `POST …/:id/mute`, `/api/comments/:id/hide`, `DELETE /api/comments/:id` |
| Analytics (KPIs, engagement by platform, reach, top posts, CSV/PDF/PNG export, scheduled weekly report) | `/analytics` | `GET /api/analytics/overview?days&providers`, `POST /api/analytics/weekly-report/send` |
| Connect accounts | `/connect` | `GET /api/integrations`, `…/:p/connect`, `…/callback`, `GET/DELETE /api/accounts`, `POST /api/accounts/:id/sync` |
| Settings (profile + 2FA, team + invite by link, email/push notifications, billing, API keys & integrations) | `/settings?tab=…` | `/api/users/me*` (incl. `/me/2fa*`, `/me/notifications`), `/api/workspace*` (incl. `/invite-link`, `/api-keys`), `/api/billing*` |

### Public API (API keys)

Admins create keys in **Settings → API & Integrations → API Access**. A key is shown once and stored only as a hash. Call any endpoint above with `Authorization: Bearer pk_live_…` on `https://your-domain.com/api/…`. A key acts with the **current role of the member who created it** and stops working if that member leaves or the key is revoked. Sign-in, billing, API-key, invite-link and account-security endpoints only accept browser sessions.
| Notifications bell | top bar | `GET /api/notifications`, `POST …/read-all`, `POST …/:id/read` |

### What each platform supports (enforced in the composer and the API)

| | Facebook | Instagram | X | LinkedIn | YouTube |
|---|---|---|---|---|---|
| Text-only post | ✅ | ❌ (needs media) | ✅ | ✅ | ❌ (needs video) |
| Images | up to 10 | up to 10 (carousel) | up to 4 | up to 9 | — |
| Video | ✅ | ✅ Reels | ✅ | ✅ | ✅ |
| Max characters | 63,206 | 2,200 | 280 (URLs count as 23) | 3,000 | 5,000 (description) |
| Read/reply comments | ✅ | ✅ | ✅ (mentions & replies) | ✅* | ✅ |
| Hide / delete comments | ✅ / ✅ | ✅ / ✅ | hide only | delete only | ✅ / ✅ |
| Direct messages | ✅ Messenger | ✅ Instagram Direct | ✅ (paid API tier) | ❌ no public API | ❌ |
| Analytics | ✅ | ✅ | ✅ | org pages* | ✅ |

\* LinkedIn comment and organization APIs require LinkedIn's **Community Management API** approval.

---

## 7. Scaling & operations

- **Stateless API.** Run as many serverless instances or containers as you need. Publishing uses DB row claims, so concurrent cron runs never double-post.
- **Database.** Use a pooled connection string on serverless. Indexes cover the hot paths: due-post lookup, calendar ranges, inbox ordering and comment status.
- **Heavy traffic.** Move `/api/cron/sync` to a dedicated worker (`ENABLE_INTERNAL_SCHEDULER=true` on a container), or fan out with a queue such as Upstash QStash or SQS that calls `syncAccount` per account. The `SyncService` and `PublisherService` are already isolated.
- **Health check.** `GET /api/health` checks the database.
- **Logs.** Provider errors are logged with account and post IDs. The user sees a sanitised message on the post and in a notification.
- **Backups.** Enable point-in-time recovery on your Postgres provider. Back up `ENCRYPTION_KEY` separately: without it, stored tokens cannot be decrypted.

## 8. Security checklist before going live

- [ ] All secrets are long random values, and `ENCRYPTION_KEY` is backed up.
- [ ] `WEB_URL` is your exact HTTPS domain. CORS and redirects depend on it.
- [ ] Your Postgres user has rights only to its own database, with SSL enabled.
- [ ] The storage bucket allows public **read** only. Writes go through presigned URLs.
- [ ] Stripe and Meta webhooks use signing secrets. Requests with invalid signatures are rejected.
- [ ] Meta, LinkedIn and Google apps are switched to **Live/Production** after app review.
- [ ] A privacy policy and terms page are published. All platforms require these for review.

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| "X is not configured on the server" | Add that platform's env vars to the **API** project and redeploy. |
| OAuth error `redirect_uri mismatch` | The redirect URI in the developer console must equal `WEB_URL` + `/api/integrations/<platform>/callback` exactly. |
| Instagram: "No Instagram Business/Creator account found" | Convert the IG account to Business/Creator and link it to a Facebook Page you manage. |
| Instagram/Facebook publishing fails on images | Media must be a **public HTTPS URL**. Use S3/R2 storage, not `local`. |
| Upload fails with a CORS error | Add the bucket CORS policy from §3.1 with your web origin. |
| Scheduled posts never go out | Configure a cron (§3.4) and check that `CRON_SECRET` matches. |
| Emoji cause a database error | The database must use UTF-8 encoding (default on all hosted providers). |
| Messenger reply fails "outside of allowed window" | Meta only allows page replies within 24 h of the user's last message. |
| Everyone was logged out after a deploy | `JWT_*` secrets changed. Keep them stable across deploys. |
