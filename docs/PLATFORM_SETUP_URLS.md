# What to paste into each platform's developer console

**Live site (web):** `https://techsquad-postly.vercel.app`
**API (do not paste this anywhere below):** `https://techsquad-postly-api.vercel.app`

Every redirect/callback URL uses the **web** address. Keep the `http://localhost:3002/...` versions too, so local testing keeps working.

---

## Facebook + Instagram (one Meta app)
developers.facebook.com → your app

| Where | Paste |
|---|---|
| App settings → Basic → **App domains** | `techsquad-postly.vercel.app` |
| App settings → Basic → **Website / Site URL** | `https://techsquad-postly.vercel.app` |
| App settings → Basic → **Privacy policy URL** / **Terms URL** | your published pages (required for Live mode) |
| Facebook Login for Business → Settings → **Valid OAuth Redirect URIs** | `https://techsquad-postly.vercel.app/api/integrations/facebook/callback`<br>`https://techsquad-postly.vercel.app/api/integrations/instagram/callback` |
| Webhooks → Page **and** Instagram → **Callback URL** | `https://techsquad-postly.vercel.app/api/webhooks/meta` |
| Webhooks → **Verify token** | the value of `META_WEBHOOK_VERIFY_TOKEN` in `apps/api/.env` |

## Threads (same Meta app, separate use case)
Use cases → **Access the Threads API** → Settings

| Field | Paste |
|---|---|
| **Redirect Callback URLs** | `https://techsquad-postly.vercel.app/api/integrations/threads/callback` |
| Uninstall callback URL | `https://techsquad-postly.vercel.app/api/webhooks/meta` |
| Delete callback URL | `https://techsquad-postly.vercel.app/api/webhooks/meta` |

Then copy the **Threads app ID** and **Threads app secret** (they differ from the Facebook ones) and send them to the dev team. They become `THREADS_APP_ID` and `THREADS_APP_SECRET`. While the app is in development, add each tester under App roles → Roles → **Threads Tester**, and have them accept the invite in Threads → Settings → Account → Website permissions.

## LinkedIn
linkedin.com/developers → your app → **Auth**

| Field | Paste |
|---|---|
| **Authorized redirect URLs** | `https://techsquad-postly.vercel.app/api/integrations/linkedin/callback` |

## X (Twitter)
developer.x.com → Project → App → **User authentication settings**

| Field | Value |
|---|---|
| App permissions | Read and write (and Direct Messages) |
| Type of app | Web App, Automated App or Bot (confidential client) |
| **Callback URI** | `https://techsquad-postly.vercel.app/api/integrations/x/callback` |
| Website URL | `https://techsquad-postly.vercel.app` |

Copy the **OAuth 2.0 Client ID and Client Secret** from Keys and tokens. Use these, not the API Key / Consumer Key.

## YouTube + "Sign in with Google" (one Google OAuth client)
console.cloud.google.com → APIs & Services → Credentials → your OAuth client

| Field | Paste |
|---|---|
| **Authorized JavaScript origins** | `https://techsquad-postly.vercel.app` |
| **Authorized redirect URIs** | `https://techsquad-postly.vercel.app/api/integrations/youtube/callback`<br>`https://techsquad-postly.vercel.app/api/auth/google/callback` |
| OAuth consent screen → Authorized domains | `techsquad-postly.vercel.app` (Google may ask you to verify it; `vercel.app` subdomains can't be verified, so use a custom domain for production verification) |
| OAuth consent screen → **Test users** | every friend/client who will test |

## TikTok
developers.tiktok.com → Manage apps → your app

| Field | Paste |
|---|---|
| Products | add **Login Kit** and **Content Posting API** (enable *Direct Post*) |
| Login Kit → **Redirect URI** (Web) | `https://techsquad-postly.vercel.app/api/integrations/tiktok/callback` |
| Web/Desktop URL | `https://techsquad-postly.vercel.app` |
| Terms of Service / Privacy Policy URL | your published pages |
| Scopes | `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.publish`, `video.list` |
| Sandbox → **Target users** | add your TikTok accounts for testing |

Copy the **Client key** and **Client secret** to the dev team. They become `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`. Until TikTok audits the app, videos post as private ("Only me").

## Pinterest
developers.pinterest.com → My apps → your app

| Field | Paste |
|---|---|
| **Redirect URIs** | `https://techsquad-postly.vercel.app/api/integrations/pinterest/callback` |

Copy the **App ID** and **App secret key** to the dev team. They become `PINTEREST_APP_ID` and `PINTEREST_APP_SECRET`. While the app has *Trial* access, set `PINTEREST_SANDBOX=true`.

## Stripe (payments)
dashboard.stripe.com → Developers → Webhooks → Add endpoint

| Field | Paste |
|---|---|
| **Endpoint URL** | `https://techsquad-postly.vercel.app/api/billing/webhook` |
| Events | `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` |

---

### After you add new keys
Send them to the dev team (never in a public chat). They are added to the **postly-api** Vercel project and the API is redeployed. The platform then switches from *Not configured* to *Connect* on the Connect Account page.
