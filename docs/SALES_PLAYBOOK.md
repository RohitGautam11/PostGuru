# Postly — Sales Playbook

How to present Postly to a prospect: what each feature does, how to show it in the demo, and what to say.

---

## 1. The pitch in one breath

> **Postly lets a business or agency run all of its social media from one screen.** Connect Facebook, Instagram, X, LinkedIn and YouTube once. Then write and schedule posts for every channel, answer every message and comment, and see what works, without logging in and out of five apps.

**Who buys it**

| Buyer | Their pain | What to stress |
|---|---|---|
| Small business owner | "I post when I remember, and I miss customer messages." | Scheduling, one inbox, best time to post |
| Social media manager | "I copy-paste the same post into 5 apps every day." | Composer with per-platform versions, calendar |
| Agency | "I manage 10 clients and their logins are a mess." | Separate workspaces per client, team roles, reports |

**Three benefits to repeat throughout the demo**
1. **Save time:** write once, publish everywhere.
2. **Never miss a customer:** every DM and comment lands in one inbox.
3. **Know what works:** analytics and the best time to post.

---

## 2. The 15-minute demo script

Use a prepared demo workspace with real connected accounts and some past posts (see §6). Do not sign up live.

| Min | Screen | What you do | What you say |
|---|---|---|---|
| 0–2 | **Dashboard** | Open `/dashboard` | "This is your morning view: followers, engagement, what's scheduled today and anything that needs attention." |
| 2–5 | **Composer** | Write one post, tick Facebook + Instagram + X + LinkedIn, add an image, open the X tab and shorten the text | "One post, four networks. Postly checks each network's rules for you: X allows 280 characters, Instagram needs an image. You can tailor the text for each network." |
| 5–7 | **Schedule → Planner** | Click *Schedule*, pick tomorrow 10:00, open the Planner, drag the post to another day | "Plan your whole month in a calendar. Change your mind? Drag and drop." |
| 7–10 | **Inbox** | Show the unified list, filter by Comments, reply to one, add an internal note, assign it to a teammate, resolve it | "Every Messenger, Instagram and X message and every comment, in one place. Your team can split the work and nothing slips through." |
| 10–12 | **Analytics** | Switch 7 / 30 / 90 days, point to the top posts and the best-time heatmap, export a PDF | "This shows what actually works and when your audience is online. One click gives you a client-ready report." |
| 12–14 | **Settings → Team** | Show roles; for agencies, switch workspace | "Give your designer *Editor* access and your client *Viewer* access. Agencies get one workspace per client, all fully separate." |
| 14–15 | **Billing / close** | Show the plans | "Start free with 3 accounts. Most teams are on Pro at $29 a month." |

---

## 3. Feature guide

For each feature below: what it is, where it is, how to demo it, and the customer benefit.

### 3.1 Connect accounts
- **Where:** sidebar → *Connect Account* (`/connect`)
- **What:** one-click secure login to Facebook Pages, Instagram Business, X, LinkedIn (profile + company pages) and YouTube. Postly never sees the customer's passwords.
- **Demo:** show the connected cards with follower counts. Don't connect live, because a slow login screen kills momentum.
- **Say:** "Connect once. Postly keeps you logged in and warns you before anything expires."
- **Know:** Instagram must be a **Business or Creator** account linked to a Facebook Page. If a platform shows *Reconnect needed*, the customer changed their password or removed access, and one click fixes it.

### 3.2 Composer (create and publish)
- **Where:** *Create Post* button (`/composer`)
- **What:**
  - Write one post for many accounts.
  - Per-platform text and a YouTube title.
  - Images (carousel), video, links.
  - Live previews.
  - Publish now, schedule, or save as draft.
- **Demo:** type a long post, select X, and show the limit warning. Then open the X tab and shorten the text.
- **Say:** "It stops mistakes before they happen, like an Instagram post without an image or a tweet that's too long."

| | Facebook | Instagram | X | LinkedIn | YouTube |
|---|---|---|---|---|---|
| Text only | ✅ | needs image/video | ✅ | ✅ | needs video |
| Images | 10 | 10 (carousel) | 4 | 9 | – |
| Video | ✅ | ✅ Reels | ✅ | ✅ | ✅ |
| Max characters | 63,206 | 2,200 | 280 | 3,000 | 5,000 |

### 3.3 Planner (content calendar)
- **Where:** *Planner* (`/planner`), with week view and list view
- **What:** every scheduled, published and failed post on a calendar. Drag to reschedule; search everything.
- **Demo:** drag a post to a new day, then switch to list view and search.
- **Say:** "Plan a month of content in one afternoon. Postly publishes it automatically, even when your laptop is closed."
- **Know:** if a post fails (for example, a revoked token), Postly retries automatically, marks the post *Failed* with the reason, and sends a notification. Nothing fails silently.

### 3.4 Post details
- **Where:** click any post (`/posts/:id`)
- **What:** a preview, the delivery status for each network, and performance. Actions: retry, duplicate, delete (optionally from the network too).
- **Say:** "You always know exactly what went out, where, and how it performed."

### 3.5 Unified inbox
- **Where:** *Inbox* (`/inbox`)
- **What:**
  - Facebook Messenger, Instagram Direct and X DMs, plus comments, mentions and replies, all in one list.
  - Filters: Unread, Comments, DMs, Mentions. Search.
  - Team tools: **assign** to a teammate, **flag**, **resolve**, **internal notes** (customers never see them), **mute** a spammer.
  - Comments are labelled positive, neutral or negative (sentiment).
  - Hide or delete abusive comments.
- **Demo:** filter to negative comments → hide one → open a DM → add a note "VIP lead" → assign → reply.
- **Say:** "Your fastest reply wins the customer. Here, no message is ever buried in another app."

### 3.6 Analytics
- **Where:** *Analytics* (`/analytics`)
- **What:**
  - Audience growth, engagement, reach and top posts.
  - Engagement split by network.
  - A **best-time-to-post heatmap**.
  - Date ranges and network filters.
  - Export to CSV, PDF or PNG.
  - An automatic weekly email report.
- **Say:** "Stop guessing. Post when your audience is online and do more of what works. Agencies send the PDF to clients."
- **Know:** history is 30 days on Free, 1 year on Pro and 2 years on Business. Numbers fill in over time after an account connects.

### 3.7 Dashboard
- **Where:** `/dashboard`
- **What:** today's overview: stats, items needing attention (failed posts, accounts to reconnect), recent posts, performance and accounts.

### 3.8 Team and workspaces
- **Where:** *Settings → Team*
- **What:**
  - Invite by email or by shareable link.
  - Roles: **Owner**, **Admin**, **Editor** (creates and publishes), **Viewer** (read-only, good for clients).
  - Create more **workspaces** and switch between them. Each one is fully separate (accounts, posts, inbox), which suits an agency with one workspace per client.
- **Say:** "Your client can log in as a Viewer and see everything without breaking anything."
- **Know:** the Free plan has **1 member**, so team invites need Pro (3 members) or Business (15).

### 3.9 Security
- Two-step login with an authenticator app (Google Authenticator, Authy), plus recovery codes.
- Sign in with Google.
- Social tokens are encrypted, and one customer can never see another customer's data.
- **Say:** "Bank-grade encryption. Your social logins are never stored in plain text."

### 3.10 Notifications
- Bell icon, plus optional email alerts: post failed, account needs reconnecting, team changes, weekly report.

### 3.11 API access (Business and technical buyers)
- *Settings → API & Integrations*: create API keys so the customer's own tools can create and schedule posts.

---

## 4. Plans and pricing

| | **Free** | **Pro** $29/mo | **Business** $99/mo |
|---|---|---|---|
| Social accounts | 3 | 15 | 50 |
| Scheduled posts | 30 / month | Unlimited | Unlimited |
| Team members | 1 | 3 | 15 |
| Analytics history | 30 days | 1 year | 2 years |
| Unified inbox | ✅ | ✅ | ✅ |
| Support | Standard | Priority | Priority |

**Upgrade triggers to listen for:**
- "I have more than 3 accounts" → Pro.
- "My assistant needs access" → Pro.
- "We're an agency with many clients" → Business.

Upgrades are self-serve in *Settings → Billing*. Customers can change plans or cancel anytime from the billing portal.

---

## 5. Objections and FAQ

| They say | You say |
|---|---|
| "We already use Meta Business Suite." | "That covers only Facebook and Instagram. Postly adds X, LinkedIn and YouTube in the same calendar and inbox." |
| "Is it safe to connect our accounts?" | "We use each network's official login. We never see your password, tokens are encrypted, and you can disconnect anytime." |
| "What if a post fails?" | "Postly retries automatically, tells you why, and lets you retry in one click." |
| "Can my client see results without editing?" | "Yes. Invite them as a Viewer, or send the PDF report." |
| "Do you support TikTok / Pinterest / Threads?" | "Not today: we support Facebook, Instagram, X, LinkedIn and YouTube. Tell me which one you need and I'll pass it to the product team." |
| "Can I reply to LinkedIn messages?" | "LinkedIn doesn't offer messaging to third-party tools, so no tool can do this. LinkedIn comments are supported." |

---

## 6. Do NOT promise

These are platform limits, not Postly bugs, but promising them will lose trust.

- ❌ **Post-approval workflow** (an "approve before publishing" step). It doesn't exist yet. Roles control who can publish.
- ❌ **TikTok, Pinterest, Threads, Google Business.** Not supported.
- ❌ **LinkedIn or YouTube direct messages.** These platforms have no public messaging API.
- ❌ **X direct messages on every account.** This needs X's paid API tier on our side; check before promising.
- ❌ **Replying to a Facebook message older than 24 hours.** Meta blocks page replies after 24 h.
- ❌ **Personal Instagram accounts.** Must be Business or Creator.
- ❌ **Instant analytics on a brand-new connection.** Data builds up over the first days.

---

## 7. Demo preparation checklist (before every demo)

- [ ] The tech team has run `npm run test:e2e` on the demo server and seen **all checks pass**.
- [ ] You are logged into the **demo workspace** (never a real customer's).
- [ ] All 5 networks show **Connected** (no *Reconnect needed*).
- [ ] The Planner has posts this week, with at least one scheduled for tomorrow.
- [ ] The Inbox has a few DMs and comments, including one negative comment.
- [ ] Analytics shows at least 2 weeks of data.
- [ ] A test image and a short video (under 30 s) are saved on your desktop for the composer.
- [ ] You have a backup screen recording of the full demo in case of network issues.
- [ ] Notifications are cleared, so the bell doesn't distract.
