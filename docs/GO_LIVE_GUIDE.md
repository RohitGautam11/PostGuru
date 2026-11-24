# PostGuru: staging launch & go-live guide

**Staging app:** https://postguru.vercel.app · **API:** https://postguru-api.vercel.app (never paste the API URL into developer consoles; every callback uses the app URL)

This page tracks the two planning documents against the product:

- *Production Go-Live, Subscriptions & Personal + Business Account Guide*
- *Social Media App Setup & Business Verification Guide (India, GST)*

---

## 1. What is built (code)

| Requirement | Status | Where |
|---|---|---|
| Rename to PostGuru | Done | everywhere; `APP_NAME` / `NEXT_PUBLIC_APP_NAME` |
| Instagram **creator** login (no Facebook Page) + **brand** login via Facebook | Done | Connect → Instagram → choose account type |
| Personal vs Business connection wizard (Instagram, Facebook, LinkedIn) | Done | Connect page |
| “Switch to a Creator account in 30 seconds” help for personal Instagram profiles | Done | wizard + connection errors |
| Facebook: Pages only, guided “create a free Page” path | Done | wizard |
| LinkedIn personal profiles + Company Pages (separate tokens) | Done | Company Pages need `LINKEDIN_ORGANIZATIONS=true` after Community Management approval |
| X OAuth 2.0 PKCE (tweet.read/write, users.read, offline.access) | Done | |
| YouTube upload + readonly, explicit channel picker | Done | |
| Threads API | Done | |
| HTTPS callbacks on the production domain | Done | `WEB_URL` |
| OAuth tokens encrypted at rest (AES-256-GCM) | Done | |
| Token lifecycle: 60-day Meta/Instagram/Threads tokens refreshed from day 50; others refreshed before expiry or on 401 | Done | `/api/cron/token-expiry`, `/api/cron/refresh-tokens` |
| Meta deauthorize + data-deletion callbacks (signed_request, returns `url` + `confirmation_code`) | Done | `/api/compliance/meta/*` |
| Privacy Policy, Terms, Data Deletion instructions + request form + status page | Done | `/privacy`, `/terms`, `/data-deletion` |
| Same legal name / address / support email on footer, legal pages, invoices | Done | `COMPANY_*`, `SUPPORT_EMAIL` env vars |
| Plans: Free Starter (14-day trial), Creator ₹599/$9, Business ₹1,999/$29, Agency ₹4,999/$79 | Done | Settings → Billing, landing page |
| Quotas: profiles, scheduled posts, AI credits, inbox level, analytics history, team seats, business-page gating | Done | enforced in the API |
| Razorpay (INR, UPI AutoPay/e-mandates) + Stripe (USD), checkout router | Done | needs keys (section 4) |
| Idempotent billing webhooks with signature checks | Done | |
| GST invoices: CGST+SGST or IGST, SAC code, `INV/26-27/0001` numbering, customer GSTIN, reverse charge “No” | Done | Settings → Billing → Invoices |
| Composer: X auto-threads, Instagram/Facebook hashtags in first comment, Instagram aspect-ratio checks | Done | Composer |
| Unified inbox: AI reply suggestions in brand voice, assignment, notes, “who is replying” collision warning | Done | Inbox |
| Token health: red sidebar banner, email + in-app alert with reconnect link | Done | |
| In-app feedback widget, public roadmap with upvotes, changelog | Done | Feedback button, `/roadmap`, What’s new |
| Beta tester sign-up (collects Facebook / Gmail / TikTok … IDs to add as app testers) | Done | `/beta`, admin console `/admin` |
| Staging mode: every feature free, no limits | On | `BETA_ALL_ACCESS=true` |

**Not built yet (later):** LinkedIn PDF carousels, automatic image cropping (we warn instead), WhatsApp alerts, white-label reports.

---

## 2. Share the staging app (today)

1. Send testers **https://postguru.vercel.app**. They click *Join the beta*, sign up, and land in their own workspace.
2. Ask each tester to open **Beta Program** in the sidebar and fill in the accounts they want to connect.
3. You get an email per tester (to `ADMIN_EMAILS`) and see everyone in **Admin → Beta testers**, with “Copy” buttons for each platform’s list.
4. Add them as testers (section 3, Phase 4). LinkedIn and X work without this step.
5. Feedback arrives in **Admin → Feedback** and by email; ideas show on `/roadmap` for votes. Set status to *Planned / In progress / Shipped* as you go.

> Until apps pass review, only people you add as testers can connect Facebook, Instagram, Threads, YouTube, TikTok and Pinterest. Everyone can sign up, write posts and use the AI assistant.

---

## 3. Business pages and developer apps (your checklist)

### Phase 1: Legal foundation
- [ ] Buy a domain (e.g. `postguru.in`) and create `admin@` and `support@` mailboxes. Gmail/Outlook addresses get rejected by Meta and LinkedIn.
- [ ] Point the domain at Vercel (Project *postly-web* → Settings → Domains), then update `WEB_URL` on *postly-api* and every callback URL in `docs/PLATFORM_SETUP_URLS.md`.
- [ ] Set `COMPANY_LEGAL_NAME`, `COMPANY_ADDRESS`, `COMPANY_STATE`, `COMPANY_GSTIN`, `SUPPORT_EMAIL` on *postly-api* exactly as on your GST REG-06; the footer, legal pages and invoices update automatically.
- [ ] Prepare one PDF with GST REG-06 pages 1 and 2 (plus annexure). Backups: Udyam, CoI/partnership deed, 3-month bank statement, a utility bill in the business name.

### Phase 2: Brand pages
- [ ] **Facebook Page:** facebook.com/pages/create → name *PostGuru*, category *Software Company*, add website, bio, contact.
- [ ] **Meta Business Portfolio:** business.facebook.com → Create account (legal name, `admin@` email) → Settings → Accounts → Pages → Add the Page → Instagram accounts → Add.
- [ ] **Instagram:** create @postguru, switch to Professional → Business, link it in the portfolio.
- [ ] **LinkedIn Company Page:** linkedin.com/company/setup/new → industry *Software Development*, logo, tagline, website.
- [ ] **X:** create @PostGuru with the `admin@` email and a phone number.
- [ ] **YouTube Brand Account:** youtube.com/channel_switcher → Create a channel → Brand Account named PostGuru.

### Phase 3: Developer apps (callback URLs are in `docs/PLATFORM_SETUP_URLS.md`)
- [ ] Meta app (type *Business*, linked to the portfolio): Facebook Login for Business, Instagram (both *Facebook login* and *Instagram login*), Threads, Webhooks. Add privacy, terms and data-deletion URLs, plus a 1024×1024 icon.
- [ ] LinkedIn app linked to the Company Page → *Verify* → open the verification URL as Page Super Admin → request *Share on LinkedIn* + *Sign In with LinkedIn (OpenID Connect)*.
- [ ] X project + app: Read and write (+ DMs), Web App, callback URL, website/terms/privacy URLs. Copy the OAuth 2.0 Client ID/Secret.
- [ ] Google Cloud project *PostGuru-Social-Engine*: enable YouTube Data API v3; OAuth consent screen *External*, scopes `youtube.upload`, `youtube.readonly`, `userinfo.email`, `userinfo.profile`.
- [ ] TikTok (Login Kit + Content Posting API) and Pinterest apps.
- [ ] Send all keys to the dev team; they are added to *postly-api* and the API is redeployed.

### Phase 4: Beta testers
- [ ] Meta → App roles → Roles → **Testers** (Facebook profile URLs from Admin → Beta testers). Threads: **Threads Tester**. Instagram login: **Instagram Tester**.
- [ ] Google OAuth consent screen → status **Testing** → **Test users**: paste the Gmail list (max 100).
- [ ] TikTok sandbox target users (max 5); Pinterest trial users (max 10).
- [ ] Mark each tester **ADDED** in the admin console (they see it on their Beta page).
- [ ] Test end to end in Development mode: connect, schedule, publish, reply, token refresh.

### Phase 5: Public launch (after feedback)
- [ ] **Meta:** Security Center → Business Verification (GST REG-06 + DNS TXT on your domain, 1–3 days). Then App Review for Advanced Access: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments` (+ Instagram-login permissions). Each needs an unedited 1080p screencast under 5 minutes: login with visible branding → consent screen → create, schedule and publish → reply to a comment in the inbox. Give reviewers a test login without 2FA (the beta flag removes the paywall). Then switch the app to **Live**.
- [ ] **LinkedIn:** request the Community Management API (GSTIN, privacy link, architecture overview, demo video). When approved set `LINKEDIN_ORGANIZATIONS=true`.
- [ ] **Google:** verify the domain in Search Console, publish the consent screen to **In production**, complete scope verification / CASA (1–4 weeks).
- [ ] **TikTok:** upload the GST certificate + demo video for production access.
- [ ] Turn on payments (section 4), then set `BETA_ALL_ACCESS=false` so plans apply.

---

## 4. Payments (when you start charging)
- **Razorpay (India):** create Creator/Business/Agency monthly plans (₹707 / ₹2,359 / ₹5,899 incl. GST), the webhook and API keys as in `docs/PLATFORM_SETUP_URLS.md`; set `RAZORPAY_*` on *postly-api*.
- **Stripe (international):** create $9 / $29 / $79 monthly prices; set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_CREATOR`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`.
- Set the `COMPANY_*` details first; they are printed on every GST invoice.

## 5. Infrastructure (already set up)
| Piece | Service |
|---|---|
| Web app | Vercel project *postly-web* → postguru.vercel.app (Mumbai) |
| API | Vercel project *postly-api* → postguru-api.vercel.app (Mumbai); migrations run on every deploy |
| Database | Prisma Postgres (free), connected to *postly-api* |
| Media files | Vercel Blob store *postguru-media* (public, Mumbai) |
| Scheduler | GitHub Actions `.github/workflows/scheduler.yml` (needs repo secrets `API_URL` and `CRON_SECRET`) |
| Email | SMTP settings on *postly-api*; without them, emails are only logged |
| AI | `ANTHROPIC_API_KEY` on *postly-api* enables captions, hooks and reply suggestions |
