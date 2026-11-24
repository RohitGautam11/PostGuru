# Local Test Plan (before any client demo)

Two layers:
1. **Automated:** `npm run test:e2e` runs 153 checks against the running local stack in about 2–3 minutes. It covers sign-up, login, 2FA, posts, scheduling, the inbox, roles, data isolation, API keys, cron and webhook security, and every page.
2. **Manual (this document):** the parts a script cannot do: real social logins, real publishing, and the visual UI.

## 0. Start the stack (3 terminals, from the repo root)

```powershell
# 1 – database (port 5433; a separate PostgreSQL 18 Windows service already uses 5432)
$env:LOCAL_DB_PORT=5433; npm --prefix apps/api run db:start
# 2 – API  → http://localhost:4000/api/health
npm run dev:api
# 3 – web  → http://localhost:3002
npm run dev:web
```
Then, in a 4th terminal: `npm run test:e2e`. All checks must pass.

## 1. Real account connections

Log in at http://localhost:3002 → *Connect Account*. Each developer console must list the callback `http://localhost:3002/api/integrations/<platform>/callback`.

| # | Test | Expected | ✅ |
|---|---|---|---|
| 1.1 | Connect Facebook (choose a Page) | Page card appears with follower count | |
| 1.2 | Connect Instagram (Business/Creator linked to that Page) | IG card appears | |
| 1.3 | Connect X | X card appears | |
| 1.4 | Connect LinkedIn (profile + company page) | LinkedIn card(s) appear | |
| 1.5 | Connect YouTube | Channel card appears | |
| 1.6 | Cancel half-way on a provider login screen | Back in PostGuru with a friendly error, nothing broken | |
| 1.7 | Disconnect an account, then reconnect it | Works both ways; old posts are kept | |

## 2. Real publishing (use test pages, not client pages)

| # | Test | Expected | ✅ |
|---|---|---|---|
| 2.1 | Text post → Facebook + X + LinkedIn, *Publish now* | Live on all 3; post detail shows ✅ per network with links | |
| 2.2 | Image post → Instagram ⚠ | Needs **public** media storage (R2/S3). With `STORAGE_DRIVER=local` this is **expected to fail**; set up R2 first | |
| 2.3 | 3-image carousel → Facebook + Instagram | Carousel on both | |
| 2.4 | Short video → YouTube (with title) + X | Uploaded on both | |
| 2.5 | Schedule a post 3 minutes ahead | Publishes on time (`ENABLE_INTERNAL_SCHEDULER=true` locally) | |
| 2.6 | Drag a scheduled post to another day in the Planner | Time updates; publishes at the new time | |
| 2.7 | Delete a published post with "also delete from network" | Removed on the network too | |
| 2.8 | Emoji and Hindi/Unicode text 🙏 नमस्ते | Shows correctly everywhere | |

## 3. Inbox and comments (with real accounts)

| # | Test | Expected | ✅ |
|---|---|---|---|
| 3.1 | From another FB account, message the Page | Appears in Inbox after sync / within ~10 min | |
| 3.2 | Reply from PostGuru | Reply arrives in Messenger | |
| 3.3 | Comment on your FB/IG post from another account | Appears under Comments with sentiment | |
| 3.4 | Reply / hide / delete that comment | Happens on the real network | |

## 4. UI walkthrough (Chrome + phone)

| # | Test | ✅ |
|---|---|---|
| 4.1 | Every sidebar page loads without errors (open DevTools → Console: no red errors) | |
| 4.2 | Composer previews look right for each network | |
| 4.3 | Analytics exports: CSV, PDF and PNG download and open correctly | |
| 4.4 | Dark mode / small screen (DevTools mobile view, 390 px): nothing overflows | |
| 4.5 | Forgot password → the reset link is printed in the **API terminal** (no SMTP locally) → reset works | |
| 4.6 | 2FA: enable with Google Authenticator, log out, log back in with the code | |
| 4.7 | Invite a teammate by link (needs Pro: Free allows 1 member), log in as them in an incognito window, check the role limits | |

## 5. Known gaps to close before the client demo on Vercel

| Gap | Impact | Fix |
|---|---|---|
| Media storage is `local` | Instagram/Facebook/LinkedIn **image posts fail**; uploads vanish on Vercel | Create a Cloudflare R2 bucket, set the `S3_*` vars, `STORAGE_DRIVER=s3` |
| Stripe not configured | *Upgrade* shows "Billing is not configured" | Create the Pro/Business prices + webhook (README §5) |
| SMTP not configured | Password-reset and notification emails are not sent | Resend/SendGrid credentials in the `SMTP_*` vars |
| Meta / Google apps in test mode | Only people added as testers can connect | Add the demo client as a tester, or finish App Review |
