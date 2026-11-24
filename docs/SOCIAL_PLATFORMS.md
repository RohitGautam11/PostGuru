# Connecting social platforms to PostGuru

This guide walks through creating the developer apps that let PostGuru publish, read comments and manage messages on behalf of your customers. You do this **once per platform for your SaaS**. After that, every customer just clicks **Social Accounts → Connect** and approves access.

Throughout this guide, replace `https://your-domain.com` with your **web** app's URL. It must equal the API's `WEB_URL` environment variable. All credentials go into the **API** project's environment variables. Redeploy the API after adding them.

| Platform | Typical setup time | Review needed for public launch |
|---|---|---|
| Facebook + Instagram | 30 min plus Meta App Review (days) | Yes (Advanced Access + Business Verification) |
| X (Twitter) | 15 min | No review, but DMs and mentions need a **paid** API tier |
| LinkedIn | 15 min (personal posting) | Community Management API for Company Pages and comments |
| YouTube | 20 min plus Google verification (days–weeks) | Yes (OAuth consent screen verification) |

Before submitting any app for review, publish a **Privacy Policy**, **Terms of Service** and a **data-deletion page** on your domain. Every platform asks for them.

---

## 1. Facebook Pages and Instagram (Meta)

One Meta app powers both platforms. Instagram must be a **Business or Creator** account **linked to a Facebook Page**. This is a Meta requirement for API publishing.

### 1.1 Create the app

1. Go to https://developers.facebook.com/apps, choose **Create App**, and pick the use case **Other**, then app type **Business**.
2. In **App settings → Basic**:
   - Copy the **App ID** into `META_APP_ID` and the **App Secret** into `META_APP_SECRET`.
   - Set **App Domains** to `your-domain.com`, and fill in Privacy Policy URL, Terms URL, Data deletion URL, category and icon.
3. Add the product **Facebook Login for Business** (or **Facebook Login**). Under its **Settings**:
   - **Valid OAuth Redirect URIs**:
     ```
     https://your-domain.com/api/integrations/facebook/callback
     https://your-domain.com/api/integrations/instagram/callback
     ```
   - Turn on *Client OAuth login* and *Web OAuth login*, and *Enforce HTTPS*.
4. Add the products **Instagram** (choose *API setup with Facebook login*), **Messenger** and **Webhooks**.

### 1.2 Permissions PostGuru requests

| Permission | Used for |
|---|---|
| `pages_show_list`, `business_management` | List the Pages the user manages |
| `pages_manage_posts`, `pages_read_engagement`, `pages_read_user_content` | Publish to Pages and read posts and comments |
| `pages_manage_engagement` | Reply to, hide and delete comments |
| `pages_manage_metadata` | Subscribe Pages to webhooks |
| `pages_messaging` | Read and reply to Messenger conversations |
| `read_insights` | Page analytics |
| `instagram_basic`, `instagram_content_publish` | Publish IG posts, carousels and Reels |
| `instagram_manage_comments` | Read, reply to, hide and delete IG comments |
| `instagram_manage_messages` | Instagram Direct inbox |
| `instagram_manage_insights` | IG analytics |

In development mode, these work for people who have a **role on the app** (Admin, Developer or Tester). Add your team under **App roles → Roles** and test end to end first.

### 1.3 Webhooks (real-time comments and messages)

1. Choose a random string and set it as `META_WEBHOOK_VERIFY_TOKEN` on the API. Redeploy.
2. Go to **Webhooks**, select the **Page** object, then **Subscribe to this object**:
   - Callback URL: `https://your-domain.com/api/webhooks/meta`
   - Verify token: the same string.
   - Subscribe to the fields **feed** and **messages**.
3. Select the **Instagram** object, use the same callback and token, and subscribe to **comments**, **mentions** and **messages**.
4. Under **Messenger → Settings** and **Instagram → Settings**, enable the webhooks for your app.

PostGuru automatically subscribes each connected Page to your app (`/{page-id}/subscribed_apps`). Incoming events are verified with `X-Hub-Signature-256` (HMAC using your App Secret) and trigger an immediate sync of that account. Even without webhooks, the `/api/cron/sync` job picks up new items every few minutes.

### 1.4 Go live

1. Complete **Business Verification** (App settings → Basic → Verification).
2. Under **App Review → Permissions and Features**, request **Advanced Access** for every permission above. For each one, provide a screencast showing the matching PostGuru screen (connecting, composing and publishing, the inbox reply, the comment reply/hide, analytics).
3. Switch the app to **Live** mode.

**Notes**
- Page tokens obtained through a long-lived user token don't expire. If a user changes their password or removes the app, the account shows **Reconnect needed**.
- Messenger and Instagram replies are only allowed within **24 hours** of the customer's last message (Meta policy).
- Instagram can't publish text-only posts and can't delete posts through the API.
- Instagram fetches images and videos from your public media URL. Use S3/R2 storage (`STORAGE_DRIVER=s3`).

---

## 2. X (Twitter)

### 2.1 Create the app

1. Go to https://developer.x.com/en/portal/dashboard and create a **Project** and an **App**.
2. In **App settings → User authentication settings → Set up**:
   - **App permissions**: *Read and write and Direct message*.
   - **Type of App**: *Web App, Automated App or Bot* (a confidential client).
   - **Callback URI**: `https://your-domain.com/api/integrations/x/callback`
   - **Website URL**: `https://your-domain.com`
3. Under **Keys and tokens → OAuth 2.0 Client ID and Client Secret**, copy the values into `X_CLIENT_ID` and `X_CLIENT_SECRET`.

### 2.2 Scopes and access tier

PostGuru uses OAuth 2.0 with PKCE and these scopes: `tweet.read tweet.write users.read offline.access dm.read dm.write media.write tweet.moderate.write`.

| Feature | Endpoint | Tier needed |
|---|---|---|
| Publish posts with media | `POST /2/tweets`, `/2/media/upload` | Free (limited monthly posts) |
| Mentions and replies as "comments" | `GET /2/users/:id/mentions` | **Basic or higher** |
| Direct messages | `GET /2/dm_events`, `POST /2/dm_conversations/:id/messages` | **Basic or higher** |
| Hide replies | `PUT /2/tweets/:id/hidden` | Basic or higher |

Access tokens last about 2 hours. PostGuru refreshes them automatically using the refresh token (`offline.access`).

---

## 3. LinkedIn

### 3.1 Create the app

1. Go to https://www.linkedin.com/developers/apps and choose **Create app**. You must associate it with a LinkedIn **Company Page**, which you can create for free.
2. On the **Auth** tab:
   - Copy the **Client ID** into `LINKEDIN_CLIENT_ID` and the **Client Secret** into `LINKEDIN_CLIENT_SECRET`.
   - Under **Authorized redirect URLs**, add `https://your-domain.com/api/integrations/linkedin/callback`.
3. On the **Products** tab, request:
   - **Sign In with LinkedIn using OpenID Connect** (instant): gives `openid profile email`.
   - **Share on LinkedIn** (instant): gives `w_member_social`, for posting to the member's own profile.
   - **Community Management API** (requires an application and review): gives `r_organization_social w_organization_social rw_organization_admin`, for **Company Pages**, comments and organization analytics.

### 3.2 Configure PostGuru

- Personal profiles work right away with the instant products.
- Once the Community Management API is approved, set `LINKEDIN_ORGANIZATIONS=true`. Users then see each Company Page they administer as a separate account.
- `LINKEDIN_API_VERSION` (default `202605`) is sent as the `LinkedIn-Version` header. LinkedIn retires versions after about a year, so bump it to a recent `YYYYMM` when you update the app.

**Notes**
- Tokens last 60 days. LinkedIn issues refresh tokens only to approved partners, so users without one see **Reconnect needed** when the token expires.
- LinkedIn has no public messaging API, so LinkedIn accounts don't appear in the Inbox.
- Members can't list their own posts through the API. PostGuru syncs comments for posts **published through PostGuru**.

---

## 4. YouTube (Google)

### 4.1 Create the Google Cloud project

1. Go to https://console.cloud.google.com, create a project, then open **APIs & Services → Library** and enable **YouTube Data API v3**.
2. Configure the **OAuth consent screen**:
   - User type **External**. Fill in the app name, support email, logo, **App domain** (`your-domain.com`), and the privacy policy and terms URLs. Add `your-domain.com` as an authorized domain.
   - Scopes: `.../auth/youtube.upload`, `.../auth/youtube.force-ssl`, `.../auth/youtube.readonly`.
   - While in *Testing*, add your test users (up to 100).
3. Under **Credentials → Create credentials → OAuth client ID**, choose *Web application*:
   - **Authorized redirect URIs**: `https://your-domain.com/api/integrations/youtube/callback`
   - Copy the **Client ID** into `GOOGLE_CLIENT_ID` and the **Client secret** into `GOOGLE_CLIENT_SECRET`.

### 4.2 Go live

- Choose **Publish app**, then submit for **verification**. These are sensitive scopes, so Google requires a demo video and a justification. Until you're verified, uploads from unverified apps may be locked to *private* by YouTube.
- The default quota is **10,000 units per day**. A video upload costs about 1,600 units, so request a quota increase in the console before launch.

**Notes**
- YouTube posts require a video. The YouTube tab in the composer lets users set a **title**; otherwise the first line of the text is used.
- Refresh tokens are long-lived. PostGuru always requests offline access with `prompt=consent` so a refresh token is returned.

---

## 5. Verify everything works

1. Go to **Social Accounts**. Every configured platform should show **Connect**. Unconfigured ones show **Not configured**.
2. Connect each platform. You're returned to `/accounts?connected=…` with a success toast, and an initial sync runs.
3. **Create Post**: select the accounts, add an image, then **Publish now**. Each target shows *Published* with a link to the live post.
4. Comment on that post from another personal account, then press **Sync now** on **Comments** (or wait for the webhook or cron). Reply from PostGuru and confirm the reply appears on the platform.
5. Send a DM to the Page, IG account or X account, then reply from the **Inbox**.
6. Schedule a post 2 minutes ahead and confirm that the cron publishes it.

If something fails, the exact platform error appears on the post (on **Posts**), in the notification bell, and in the API logs (Vercel → Project → Logs).
