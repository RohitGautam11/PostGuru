# PostGuru: How It Works (step-by-step guide for the sales team)

This guide explains **what happens behind every button**, so you can answer any client question with confidence. Read it once end to end. Use [SALES_PLAYBOOK.md](SALES_PLAYBOOK.md) for the demo script and objection handling.

---

## Part 1: The big picture in plain words

```
 Your client ──► PostGuru website (postguru.vercel.app)
                    │
                    ├─ PostGuru server (API) ─── PostGuru database (secure, encrypted)
                    │        │
                    │        ├─ Facebook / Instagram / Threads  (Meta's official API)
                    │        ├─ X (Twitter)                      (X's official API)
                    │        ├─ LinkedIn                         (LinkedIn's official API)
                    │        ├─ YouTube                          (Google's official API)
                    │        ├─ TikTok                           (TikTok's official API)
                    │        ├─ Pinterest                        (Pinterest's official API)
                    │        └─ AI Writer                        (Anthropic Claude, optional)
                    │
                    └─ Scheduler (runs every few minutes) ─► publishes posts that are due
```

**Five things to remember:**
1. **Official connections only.** The client logs in on Facebook's, Google's, LinkedIn's (etc.) own login page and clicks "Allow". PostGuru receives a *permission key* (token), **never the password**.
2. **Keys are locked.** Every token is encrypted (AES-256, the same standard banks use) before it is stored.
3. **PostGuru posts on the client's behalf.** When a post is due, the server takes the encrypted key, unlocks it, and sends the post to the platform exactly like the platform's own app would.
4. **PostGuru reads back.** Every few minutes it collects new comments, messages and statistics, so the Inbox and Analytics stay up to date.
5. **Every client is separate.** Each company works in its own *workspace*. Data from one workspace can never be seen from another (this is tested automatically before every release).

---

## Part 2: Every feature, step by step

Each feature below covers: **Where** it is in the app, **What happens** behind the scenes, **Why it matters** to the client, and **Limits** to know.

### 2.1 Account & sign-in
- **Where:** `/signup`, `/login`, Settings → Profile
- **What happens:** the password is scrambled (bcrypt) and never stored in readable form. A session lasts 15 minutes and renews automatically for 30 days. Optional **two-step login** with Google Authenticator/Authy, plus one-time recovery codes. "Sign in with Google" is available.
- **Why it matters:** "Your team's access is as secure as online banking."
- **Limits:** password-reset emails need the email service configured (done by the tech team).

### 2.2 Connect Account
- **Where:** sidebar → *Connect Account* (`/connect`)
- **What happens:**
  1. Client clicks **Connect** next to a platform.
  2. They are sent to that platform's official login page.
  3. They choose what to share (for example which Facebook Pages) and click Allow.
  4. The platform sends PostGuru a token; PostGuru encrypts and stores it.
  5. PostGuru refreshes tokens automatically before they expire and warns the client if one is revoked ("Reconnect needed").
- **Supported:** Facebook Pages, Instagram Business/Creator, X, LinkedIn (profile + company pages), YouTube, Threads, TikTok, Pinterest (each board shows as its own account).
- **Why it matters:** connect once, never log in to eight apps again.
- **Limits:** Instagram must be a Business/Creator account linked to a Facebook Page. While our platform apps are in review, only invited testers can connect (the tech team adds them).

### 2.3 Composer (write once, publish everywhere)
- **Where:** *Create Post* / *Composer* (`/composer`)
- **What happens:**
  1. Client ticks the accounts to post to.
  2. They write the text and add images/video. Files go straight from the browser to secure cloud storage.
  3. A **live preview** shows how the post looks on each platform.
  4. PostGuru checks every platform's rules *before* publishing: character limits (X 280, Instagram 2,200, Threads 500…), "Instagram needs an image", "TikTok/YouTube need a video", max images, etc.
  5. YouTube gets its own title and SEO tags; Pinterest uses the first line as the Pin title.
  6. Client chooses **Publish now**, **Schedule** or **Save draft**.
- **Why it matters:** no copy-paste between apps and no rejected posts.
- **Limits:** see the platform table in Part 3.

### 2.4 Growth Assistant (our main selling point)
- **Where:** right side of the Composer, three tabs: **Score**, **Hashtags**, **AI Writer**.

**a) Growth Score (0–100, per platform)**
- **What happens:** every time the client pauses typing, PostGuru checks the post against that platform's best practices and gives a score with exact fixes:
  - Hook: is the first line strong, and is it short enough to show before "…more"?
  - Length: is the caption in the platform's sweet spot?
  - Call to action: does it ask people to comment, save, share or follow? Does it ask a question?
  - Hashtags: the right number for that platform (e.g. Instagram 3–5, X 0–2, Threads 1)?
  - Links: are they clickable there? Do they reduce reach (X, LinkedIn, Facebook)?
  - Media & video format: is the video vertical 9:16 for Reels/TikTok/Shorts? Is it the right length? (The browser reads the video size and duration automatically.)
  - YouTube SEO: title length, tags, description length; vertical videos under 3 minutes are detected as Shorts.
  - Timing: is it scheduled at one of the client's own best times?
- **Why it matters:** "PostGuru coaches every post before it goes out. Most tools just publish whatever you type."

**b) Hashtag suggestions**
- **What happens:** three colour-coded sources, one click to add:
  - 🟢 **Your top performers**: hashtags from the client's *own* past posts, ranked by real engagement.
  - 🔵 **Popular in your niche**: a curated library (marketing, business, tech, fitness, food, travel, fashion & beauty, real estate, education, finance, lifestyle) matched to the post's words, labelled broad/medium/niche reach.
  - 🟣 **Long-tail keywords**: from the post itself (less competition, better for search on TikTok, YouTube and Pinterest).
- **Limits:** platforms do not publish live "trending hashtag" data to tools, so we don't claim real-time trends. Our suggestions come from the client's own results and expert-curated lists.

**c) AI Writer** (needs the AI key switched on by the tech team)
- **What happens:** PostGuru sends the draft (or a short topic) to Claude, Anthropic's AI, together with each platform's rules, and gets back structured suggestions:
  - **Write captions:** a ready caption for each selected platform.
  - **Make it viral:** rewrites the draft with a stronger hook, structure, CTA and hashtags, keeping the client's facts.
  - **Hook ideas:** 8 opening lines in different styles (question, list, bold claim, story…).
  - **AI hashtags:** 15 tags, broad to niche.
  - **YouTube SEO:** 3 titles, a keyword-rich description with chapters, 10–15 tags and thumbnail text.
  - **Content ideas:** 8 post ideas with format, hook and outline.
- The AI is instructed never to invent facts, prices or statistics. The client always reviews before posting.
- **Why it matters:** "Writer's block is gone, and every post is written for the platform it goes to."

### 2.5 Planner (content calendar)
- **Where:** `/planner`, with week view and list view
- **What happens:** every post appears on its day. Drag to reschedule. A scheduler runs every few minutes, finds due posts, and publishes them. Each post is "locked" while publishing, so it can never be posted twice. Temporary platform errors are retried 3 times automatically. Permanent errors mark the post **Failed** with the reason and send a notification.
- **Why it matters:** plan a month in an afternoon; posts go out even when the laptop is closed.

### 2.6 Post details
- **Where:** click any post (`/posts/:id`)
- **What happens:** shows delivery per account (✅ published with a link, ❌ failed with the reason), performance (likes, comments, shares, impressions), and actions: retry, duplicate, delete (optionally from the platform too).

### 2.7 Unified Inbox
- **Where:** `/inbox`
- **What happens:** PostGuru collects messages and comments every few minutes (Facebook and Instagram can also push them instantly through webhooks). Everything lands in one list. The team can **reply**, **hide/delete** comments, **assign** a conversation to a teammate, **flag**, **resolve**, add **internal notes** (customers never see them) and **mute** spammers. Comments are automatically labelled positive, neutral or negative.
- **Why it matters:** fast replies win customers and boost reach. Nothing gets lost in eight different apps.
- **Limits:** Facebook allows page replies to a DM only within 24 hours of the customer's last message. LinkedIn, YouTube, TikTok, Pinterest and Threads have no DM API. TikTok and Pinterest have no comment API. X DMs need X's paid API tier.

### 2.8 Analytics
- **Where:** `/analytics`
- **What happens:** PostGuru pulls follower counts and post statistics from each platform and shows audience growth, engagement, reach, top posts, engagement per platform and a **best-time-to-post heatmap**. Export CSV, PDF or PNG, or send the weekly email report automatically.
- **Limits:** history starts when the account is connected (30 days on Free, 1 year Pro, 2 years Business).

### 2.9 Growth Hub
- **Where:** sidebar → *Growth Hub* (`/growth`)
- **What happens:** analyses the last 90 days of the client's own posts and shows:
  - **Your growth plan:** plain-English recommendations ("Video posts get your best engagement", "Instagram: only 2 posts in 30 days; recommended 3–5 per week").
  - **Posting consistency per platform** versus the recommended cadence.
  - **Best content format** (video, carousel, image, text) and **best caption length**.
  - **Best times** and **top hashtags** from real results.
  - **Content idea generator** (AI) with "Create post from this idea".
  - **Formats & best practices** for all 8 platforms: image sizes, video lengths, hashtag counts, how often to post.
- **Why it matters:** "PostGuru tells you exactly what to do next week to grow."

### 2.10 Dashboard & Guide
- **Dashboard** (`/dashboard`): today's overview, items needing attention (failed posts, accounts to reconnect), and a **Getting started checklist** that ticks itself off as the client connects accounts, creates posts and invites the team.
- **Guide** (`/guide`): in-app manual for every area, plus a **daily (15 min) / weekly (45 min) / monthly growth routine**.

### 2.11 Team & workspaces
- **Where:** Settings → Team; workspace switcher in the sidebar
- **Roles:**
  - **Owner:** everything, including billing.
  - **Admin:** manages the team and settings.
  - **Editor:** creates and publishes.
  - **Viewer:** read-only, ideal for the agency's client.
- **Invites:** by email, or with a shareable link.
- **Workspaces:** one per brand/client, fully separate.

### 2.12 Billing
- **Where:** Settings → Billing
- **What happens:** Stripe handles payment (cards are never stored by PostGuru). Upgrades unlock limits instantly. The customer portal handles card changes, plan changes and cancellation.

### 2.13 Notifications & API
- Bell + email alerts: post failed, account needs reconnecting, team changes, weekly report.
- API keys (Settings → API & Integrations) let technical clients create and schedule posts from their own systems.

---

## Part 3: Platform capability table (say only what's true)

| | Post text | Images | Video | Comments | DMs | Analytics |
|---|---|---|---|---|---|---|
| Facebook | ✅ | ✅ up to 10 | ✅ | ✅ reply/hide/delete | ✅ (24 h rule) | ✅ |
| Instagram | needs media | ✅ carousel 10 | ✅ Reels | ✅ reply/hide/delete | ✅ | ✅ |
| X | ✅ 280 chars | ✅ 4 | ✅ | ✅ replies/mentions | paid X tier | ✅ |
| LinkedIn | ✅ | ✅ 9 | ✅ | ✅* | ❌ | ✅* |
| YouTube | needs video | – | ✅ (+ Shorts, tags) | ✅ | ❌ | ✅ |
| Threads | ✅ 500 chars | ✅ carousel 20 | ✅ | ✅ reply/hide | ❌ | ✅ |
| TikTok | needs video | – | ✅ | ❌ | ❌ | ✅ |
| Pinterest | needs media | ✅ up to 5 | ✅ | ❌ | ❌ | ✅ |

\* LinkedIn company-page comments/analytics need LinkedIn's Community Management approval.

**Status while we are in app review:** TikTok posts are private ("Only me") until TikTok audits our app. Pinterest writes to a sandbox until Standard access. Meta and Google only allow invited testers. The tech team tracks these approvals.

---

## Part 4: Questions clients ask, with the true answer

| Question | Answer |
|---|---|
| "Will PostGuru make my post go viral?" | "No tool can promise viral. PostGuru raises your odds on every post: it checks hook, format, hashtags, timing and call to action against each platform's best practices, and learns from your own results." |
| "Where do the hashtag suggestions come from?" | "From your own best-performing posts, plus expert-curated lists per niche. Platforms don't give tools live trending data." |
| "Is the AI writing my posts without me?" | "No. The AI only suggests. Nothing is posted until you review and click publish." |
| "Is my data used to train AI?" | "Your drafts are sent to the AI only when you click an AI button, and only to generate that suggestion." (The tech team confirms the AI provider's data terms for enterprise deals.) |
| "What if a platform changes its rules?" | "PostGuru uses each platform's official API; when platforms update, we update PostGuru. Your posts and history stay." |
| "Can my client see results without editing?" | "Invite them as a Viewer, or send the PDF report." |
| "What happens if a post fails?" | "Automatic retries, then a clear reason and one-click retry. You get a notification." |

---

## Part 5: Before every demo (sales checklist)

- [ ] The tech team ran `npm run test:e2e`: **all checks passed**.
- [ ] Demo workspace on the live site, all accounts **Connected**.
- [ ] AI Writer switched on (ask the tech team) and tested with "Hook ideas".
- [ ] One draft that scores **50–60** ready, so you can raise it to **85+** live with the Growth Assistant. This is the "wow" moment.
- [ ] A vertical video under 60 s on your desktop.
- [ ] Growth Hub shows a growth plan (needs a few weeks of posts in the demo workspace).
- [ ] Backup screen recording in case the internet fails.
