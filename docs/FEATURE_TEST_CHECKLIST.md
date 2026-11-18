# Postly: Complete Feature Test Checklist

Use this to test **every feature** before a client demo. Work top to bottom. Tick ✅ or write what went wrong.

- **Local:** http://localhost:3002 (start the stack as in [LOCAL_TEST_PLAN.md](LOCAL_TEST_PLAN.md))
- **Live:** https://techsquad-postly.vercel.app
- **Automated first:** run `npm run test:e2e` (169 checks). It must say *all checks passed* before you start manual testing.

Legend: **[A]** covered by the automated test · **[M]** manual only (needs a real account, a browser, or your eyes)

---

## 1. Sign up, login and security

| # | Feature | Steps | Expected | ✅ |
|---|---|---|---|---|
| 1.1 | Sign up [A] | /signup → name, email, password `Test12345`, company | Lands on Dashboard with "Get started" checklist | |
| 1.2 | Weak password blocked [A] | Sign up with `short` | Clear error under the field | |
| 1.3 | Duplicate email blocked [A] | Sign up again with the same email | "Email already in use" | |
| 1.4 | Login / wrong password [A] | /login with right, then wrong password | Right → Dashboard; wrong → error, no crash | |
| 1.5 | Sign in with Google [M] | /login → Continue with Google | Logged in (Google OAuth client must list `/api/auth/google/callback`) | |
| 1.6 | Forgot / reset password [A+M] | /forgot-password → email → open link (locally printed in the API terminal) → new password | Can log in with the new password | |
| 1.7 | Two-step login (2FA) [A+M] | Settings → Profile → Two-factor → scan QR with Google Authenticator → enter code → save recovery codes → log out → log in | Asks for the 6-digit code; recovery code also works | |
| 1.8 | Change password [A] | Settings → Profile → Change password | Old password stops working | |
| 1.9 | Log out everywhere [M] | Settings → Profile → Sign out other sessions | Other browser is logged out | |
| 1.10 | Delete account [M] | Settings → Profile → Delete account (use a throwaway user) | Account and its own workspace are removed | |

## 2. Connect accounts (/connect)

| # | Platform | Steps | Expected | ✅ |
|---|---|---|---|---|
| 2.1 | Facebook [M] | Connect → pick Pages | Each Page appears with followers | |
| 2.2 | Instagram [M] | Connect (Business/Creator linked to a Page) | IG account appears | |
| 2.3 | X [M] | Connect → Authorize | X account appears | |
| 2.4 | LinkedIn [M] | Connect | Profile (+ company pages if enabled) | |
| 2.5 | YouTube [M] | Connect → pick channel | Channel appears | |
| 2.6 | Threads [M] | Connect (needs `THREADS_APP_ID/SECRET`) | Threads profile appears | |
| 2.7 | TikTok [M] | Connect (needs `TIKTOK_CLIENT_KEY/SECRET`, you are a sandbox target user) | TikTok account appears | |
| 2.8 | Pinterest [M] | Connect (needs `PINTEREST_APP_ID/SECRET`) | One entry **per board** | |
| 2.9 | Not configured [A] | A platform without keys | Shows "Not configured", button disabled | |
| 2.10 | Cancel login [M] | Start Connect, press Cancel on the provider page | Back in Postly with a friendly message | |
| 2.11 | Disconnect / reconnect [M] | Account menu → Disconnect, then connect again | Works; old posts stay | |
| 2.12 | Manual sync [M] | Account menu → Sync now | Followers / inbox refresh | |

## 3. Composer: create and publish (/composer)

| # | Feature | Steps | Expected | ✅ |
|---|---|---|---|---|
| 3.1 | Multi-platform select | Click account chips | Selected chips coloured; preview tabs appear | |
| 3.2 | Live preview [M] | Write text, switch preview tabs | Looks like each platform | |
| 3.3 | Character limit [A] | 300 chars with X selected | Counter red; "over 280 characters"; publish blocked | |
| 3.4 | Media rules [A] | Instagram without image / TikTok or YouTube without video | Error shown, publish blocked | |
| 3.5 | Upload image/video [A+M] | Media → Upload; also "Choose from library" | Thumbnail appears; progress % while uploading | |
| 3.6 | Wrong file type blocked [A] | Upload a .exe | Rejected | |
| 3.7 | Emoji / hashtag / mention / link buttons | Click each | Inserted at the cursor; link field appears | |
| 3.8 | YouTube title & tags | Select YouTube → type title, add tags (Enter) | Tags show as chips, duplicates ignored | |
| 3.9 | Save draft [A] | Save Draft | "Draft saved!"; appears in Planner list | |
| 3.10 | Schedule [A] | Schedule → date/time in future | "Post scheduled!" | |
| 3.11 | Past time blocked [A] | Schedule in the past | "Pick a time in the future" | |
| 3.12 | Best time suggestion [M] | After some published posts, click "Best time suggestion" | Date/time filled in | |
| 3.13 | Publish now [M] | Publish Now with a real test account | Live on the platform; post page shows ✅ and link | |
| 3.14 | Edit post [A] | Open a draft/scheduled post → edit → save | Changes saved | |
| 3.15 | Published post locked [M] | Open a published post in composer | Banner: can't edit, duplicate instead | |

## 4. Growth Assistant (composer right column)

| # | Feature | Steps | Expected | ✅ |
|---|---|---|---|---|
| 4.1 | Growth Score [A] | Type a post with 2+ platforms selected | 0–100 ring + score per platform within ~1 s | |
| 4.2 | Checks per platform [A] | Click each platform chip | Green/amber/red checks with exact fixes | |
| 4.3 | Score improves [A] | Add a hook ("3 ways…"), a question, a CTA ("Comment below") | Score goes up | |
| 4.4 | Hashtag limits [A] | Add 5 hashtags with X selected | X warns "too many" | |
| 4.5 | Video format check [M] | Attach a vertical 9:16 video, select LinkedIn + Instagram | Instagram ✅ format fits; LinkedIn ⚠ recommends 4:5 | |
| 4.6 | YouTube Shorts detection [M] | Vertical video < 3 min with YouTube selected | "will publish as a Short" | |
| 4.7 | Platform tips [M] | Expand "… growth tips" | Tips for that platform | |
| 4.8 | Hashtag suggestions [A] | Hashtags tab, write about e.g. fitness | Blue niche tags appear; click one → added to the post's last line | |
| 4.9 | Your top hashtags [M] | After posts with engagement exist | Green "top performer" tags appear first | |
| 4.10 | AI Writer off [A] | Without `ANTHROPIC_API_KEY` | Amber note "not switched on" (no error) | |
| 4.11 | AI captions [M] | With key: AI Writer → Write captions | One caption per platform → "Use this" replaces text | |
| 4.12 | Make it viral [M] | Write a draft → Make it viral | Rewrites with hook, CTA, hashtags + why | |
| 4.13 | Hook ideas [M] | Hook ideas → Use | First line replaced | |
| 4.14 | AI hashtags [M] | AI hashtags → Add all | Added without duplicates | |
| 4.15 | YouTube SEO [M] | Select YouTube → YouTube SEO | 3 titles, description, tags, thumbnail text; "Use" fills fields | |
| 4.16 | Content ideas [M] | Content ideas → Use | Hook + outline inserted | |

## 5. Planner (/planner)

| # | Feature | Steps | Expected | ✅ |
|---|---|---|---|---|
| 5.1 | Week view [A] | Open Planner | Scheduled posts on their days | |
| 5.2 | Drag to reschedule [A+M] | Drag a post to another day | Time updates, toast confirms | |
| 5.3 | List view & search [A] | Switch to list, search a word | Matching posts | |
| 5.4 | Create from calendar [M] | Click an empty slot / + | Composer opens with that date | |
| 5.5 | Auto publishing [M] | Schedule 3 min ahead (local: `ENABLE_INTERNAL_SCHEDULER=true`; live: GitHub Actions cron) | Publishes on time | |

## 6. Post details (/posts/:id)

| # | Feature | Steps | Expected | ✅ |
|---|---|---|---|---|
| 6.1 | Delivery per platform [A] | Open a published/failed post | Status per account, error reason, link to live post | |
| 6.2 | Retry failed [A] | Retry | Retries only failed targets | |
| 6.3 | Duplicate [A] | Duplicate | New draft copy | |
| 6.4 | Delete (also on platform) [A+M] | Delete → "also delete from network" | Removed in Postly and on the platform | |
| 6.5 | Performance [M] | After sync | Likes, comments, shares, impressions | |

## 7. Inbox (/inbox)

| # | Feature | Steps | Expected | ✅ |
|---|---|---|---|---|
| 7.1 | Unified list [A] | Open Inbox | DMs + comments from all platforms | |
| 7.2 | Filters & search [A] | All / Unread / Comments / DMs / Mentions; search a name | Filters correctly | |
| 7.3 | Reply DM [M] | Message your FB Page from another account → reply in Postly | Reply arrives in Messenger (within 24 h rule) | |
| 7.4 | Reply comment [M] | Reply to a real comment | Appears on the platform | |
| 7.5 | Hide / delete comment [A+M] | Hide, then delete | Done on the platform | |
| 7.6 | Sentiment [A] | Negative comment | Labelled negative | |
| 7.7 | Assign / flag / resolve [A] | Assign to teammate, flag, resolve | Status changes, teammate notified | |
| 7.8 | Internal notes [A] | Add / delete note | Visible only to the team | |
| 7.9 | Mute contact [A] | Mute → "Muted" filter → unmute | Hidden from inbox while muted | |
| 7.10 | Quote on X [M] | X mention → Quote | Composer opens with the tweet link | |

## 8. Analytics (/analytics) and Growth Hub (/growth)

| # | Feature | Steps | Expected | ✅ |
|---|---|---|---|---|
| 8.1 | KPIs & ranges [A] | 7 / 30 / 90 days | Numbers change, no errors | |
| 8.2 | Platform filter [A] | Choose one platform | Charts filter | |
| 8.3 | Best-time heatmap [M] | With some posts | Darker cells = better times | |
| 8.4 | Export CSV/PDF/PNG [M] | Export each | Files download and open | |
| 8.5 | Weekly report [A+M] | Send weekly report now | Email (or logged locally without SMTP) | |
| 8.6 | Growth plan [A] | Open Growth Hub | Personal recommendations | |
| 8.7 | Consistency table [A] | Growth Hub | Posts last 30 days vs recommended, amber when low | |
| 8.8 | Best format / length [M] | After posts | Bars show what performs best | |
| 8.9 | Idea generator [M] | With AI key: enter niche → Generate → "Create post from this idea" | Composer opens prefilled | |
| 8.10 | Format guide [A] | Scroll down | 8 platform cards: sizes, video length, hashtags, cadence, tips | |

## 9. Dashboard (/dashboard) and Guide (/guide)

| # | Feature | Steps | Expected | ✅ |
|---|---|---|---|---|
| 9.1 | Overview [A] | Open Dashboard | Stats, recent posts, accounts, performance | |
| 9.2 | Issues [M] | Disconnect/expire an account or fail a post | Shown in "needs attention" with action button | |
| 9.3 | Getting started checklist | New workspace | 5 steps tick themselves off as you complete them; ✕ hides it | |
| 9.4 | Guide page [A] | Sidebar → Guide | How-to for each area, daily/weekly growth routine | |
| 9.5 | Notifications bell [A] | After a failed post / team change | Bell count; mark all read | |

## 10. Team, workspaces, billing, API

| # | Feature | Steps | Expected | ✅ |
|---|---|---|---|---|
| 10.1 | Free plan limit [A] | Invite on Free plan | "Upgrade to invite more" | |
| 10.2 | Invite by email [A] | (Pro) Settings → Team → Invite | Pending invite listed; cancel works | |
| 10.3 | Invite link [A] | Create link (Viewer) → open in incognito → sign up | Joins as Viewer | |
| 10.4 | Roles [A] | As Viewer try to create a post / invite | Blocked (403) | |
| 10.5 | Change role / remove [A] | Promote to Editor, then remove | Access changes immediately | |
| 10.6 | Workspaces [A] | Sidebar → New workspace → switch | Separate data, nothing mixes | |
| 10.7 | Data isolation [A] | Other user tries your post URL | Not found | |
| 10.8 | Billing [A+M] | Settings → Billing → Upgrade | Stripe checkout (or "Billing is not configured") | |
| 10.9 | API keys [A] | Settings → API & Integrations → create key → use → revoke | Key works, then rejected | |
| 10.10 | Notification settings [A] | Settings → Notifications toggles | Saved | |

## 11. Reliability and security (automated)

- Scheduled publishing cannot double-post; cron rejects calls without the secret [A]
- Webhooks with bad signatures are rejected (Meta, Stripe) [A]
- Unknown fields in requests are rejected; rate limits on login/sign-up [A]
- Social tokens are encrypted; logging out blocks access immediately [A]

## 12. Visual checks [M]

- [ ] Every page on Chrome, Edge and a phone (DevTools 390 px): nothing overflows
- [ ] DevTools → Console: no red errors on any page
- [ ] Hindi / emoji text 🙏 नमस्ते displays correctly everywhere
- [ ] Login and sign-up show the techSquad testimonials (Rohit Gautam, Homesh)
