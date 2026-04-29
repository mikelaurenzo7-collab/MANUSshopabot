# SHOPaBOT Platform Credentials Guide

This guide documents all API credentials needed for the 14 platform integrations. Each platform has specific setup requirements and credential types.

---

## E-Commerce Platforms (7 total)

### 1. Shopify
**Status**: ✅ Already Configured  
**Credentials Already Set**:
- `SHOPIFY_PARTNER_CLIENT_ID`
- `SHOPIFY_PARTNER_CLIENT_SECRET`

**What They Do**:
- Enable OAuth flow for users to connect their Shopify stores
- Allow the Architect agent to create and manage stores via Shopify Admin API

**No Action Needed** — Shopify Partner credentials are pre-configured.

---

### 2. WooCommerce
**Status**: ⚠️ Per-User Credentials (No Platform-Level Keys)

**Credentials Needed Per Store**:
- `woocommerce_store_url` — e.g., `https://mystore.com`
- `woocommerce_consumer_key` — Generated in WooCommerce admin
- `woocommerce_consumer_secret` — Generated in WooCommerce admin

**How to Get Them**:
1. User logs into their WooCommerce store admin
2. Go to **Settings → Advanced → REST API**
3. Click **Create an API key**
4. Set Permissions to **Read/Write**
5. Copy **Consumer Key** and **Consumer Secret**

**Store-Level Setup** — Each user provides their own WooCommerce credentials when connecting their store.

---

### 3. Amazon SP-API
**Status**: ⛔ Blocked by Browser Policy (Requires Your Setup)

**Credentials Needed**:
- `amazon_sp_api_client_id` — OAuth Client ID
- `amazon_sp_api_client_secret` — OAuth Client Secret
- `amazon_sp_api_refresh_token` — Refresh token for the seller account
- `amazon_selling_partner_id` — Your seller ID

**How to Get Them**:
1. Go to **Amazon Seller Central** → **Apps & Services → Develop Apps**
2. Register as a developer (requires Amazon seller account)
3. Create an **LWA (Login with Amazon)** application
4. Get **Client ID** and **Client Secret**
5. Complete OAuth flow to get **Refresh Token**

**Action Required**: You'll need to set up the Amazon developer account and provide the credentials.

---

### 4. Etsy
**Status**: ✅ Accessible (I can create the app)

**Credentials Needed**:
- `etsy_api_key` — Your Etsy App API Key
- `etsy_api_keystring` — Your Etsy App Keystring (shared secret)

**How to Get Them**:
1. Go to **https://developers.etsy.com**
2. Click **Your Apps** (requires Etsy account login)
3. Click **Create an app**
4. Fill in app details and accept terms
5. Copy **API Key** and **Keystring**

**Action**: I can navigate and create the app if you provide Etsy account access, or you can do it and provide the keys.

---

### 5. eBay
**Status**: ✅ Accessible (I can create the app)

**Credentials Needed**:
- `ebay_client_id` — OAuth Client ID
- `ebay_client_secret` — OAuth Client Secret
- `ebay_cert_id` — Certificate ID (for legacy auth)
- `ebay_refresh_token` — Refresh token for seller account

**How to Get Them**:
1. Go to **https://developer.ebay.com** → **Register now**
2. Create developer account (requires eBay seller account)
3. Go to **My Account → Application Keys**
4. Create an application
5. Copy **Client ID**, **Client Secret**, and complete OAuth flow for **Refresh Token**

**Action**: I can navigate the portal if you provide eBay account access, or you can set it up and provide the keys.

---

### 6. TikTok Shop
**Status**: ✅ Accessible (I can create the app)

**Credentials Needed**:
- `tiktok_shop_client_id` — OAuth Client ID
- `tiktok_shop_client_secret` — OAuth Client Secret
- `tiktok_shop_access_token` — Access token for seller account

**How to Get Them**:
1. Go to **https://partner.tiktokshop.com** → **Developers**
2. Click **Join now** and select **App developer**
3. Register as a developer
4. Create an application
5. Get **Client ID** and **Client Secret**
6. Complete OAuth flow for **Access Token**

**Action**: I can navigate the portal if you provide TikTok account access, or you can set it up and provide the keys.

---

### 7. Walmart
**Status**: ✅ Accessible (I can create the app)

**Credentials Needed**:
- `walmart_client_id` — OAuth Client ID
- `walmart_client_secret` — OAuth Client Secret
- `walmart_access_token` — Access token for seller account

**How to Get Them**:
1. Go to **https://developer.walmart.com** → **Marketplace Partners**
2. Click **Get started** and register as a seller
3. Go to **My Account → API Keys**
4. Create an application
5. Copy **Client ID** and **Client Secret**
6. Complete OAuth flow for **Access Token**

**Action**: I can navigate the portal if you provide Walmart account access, or you can set it up and provide the keys.

---

## Social Media Platforms (7 total)

### 8. Meta (Facebook)
**Status**: ✅ Accessible (I can create the app)

**Credentials Needed**:
- `meta_app_id` — Your Meta App ID
- `meta_app_secret` — Your Meta App Secret
- `meta_access_token` — Long-lived access token for Pages/Ads

**How to Get Them**:
1. Go to **https://developers.facebook.com** → **My Apps → Create App**
2. Select **Business** type
3. Fill in app details
4. Go to **Settings → Basic** to get **App ID** and **App Secret**
5. Add **Facebook Login** product
6. Generate **Access Token** with `pages_manage_metadata`, `pages_read_engagement`, `ads_management` permissions

**Action**: I can navigate and create the app. You'll need to provide your Meta/Facebook account or take over the browser for login.

---

### 9. Instagram (via Meta Graph API)
**Status**: ✅ Accessible (Uses same Meta app)

**Credentials Needed**:
- Uses the same `meta_app_id` and `meta_app_secret` from Meta setup
- `instagram_access_token` — Access token with Instagram permissions
- `instagram_business_account_id` — Your Instagram Business Account ID

**How to Get Them**:
1. Use the same Meta App created above
2. Add **Instagram Graph API** product
3. Request permissions: `instagram_basic`, `instagram_content_publishing`, `ads_management`
4. Generate **Access Token** with these permissions
5. Get your **Instagram Business Account ID** from your Instagram settings

**Action**: Reuses Meta app setup. I can help configure once Meta app is ready.

---

### 10. TikTok for Business
**Status**: ✅ Accessible (I can create the app)

**Credentials Needed**:
- `tiktok_business_client_id` — OAuth Client ID
- `tiktok_business_client_secret` — OAuth Client Secret
- `tiktok_business_access_token` — Access token for business account
- `tiktok_advertiser_id` — Your TikTok Advertiser ID

**How to Get Them**:
1. Go to **https://developers.tiktok.com** → **Get started**
2. Select **Advertise or market for businesses**
3. Create developer account
4. Create an application
5. Copy **Client ID** and **Client Secret**
6. Complete OAuth flow for **Access Token**
7. Get **Advertiser ID** from TikTok Ads Manager

**Action**: I can navigate and create the app. You'll need TikTok Business account access.

---

### 11. Twitter/X
**Status**: ✅ Accessible (I can create the app)

**Credentials Needed**:
- `twitter_api_key` — API Key (Consumer Key)
- `twitter_api_secret` — API Secret (Consumer Secret)
- `twitter_bearer_token` — Bearer Token for API v2
- `twitter_access_token` — Access Token for user context
- `twitter_access_token_secret` — Access Token Secret

**How to Get Them**:
1. Go to **https://developer.x.com** → **Sign in** (requires X/Twitter account)
2. Go to **Developer Console → Create App**
3. Fill in app details
4. Go to **Keys and tokens** tab
5. Copy **API Key**, **API Secret**, **Bearer Token**
6. Generate **Access Token** and **Access Token Secret**

**Action**: I can navigate and create the app. You'll need X/Twitter account access.

---

### 12. Pinterest
**Status**: ✅ Accessible (I can create the app)

**Credentials Needed**:
- `pinterest_app_id` — OAuth App ID
- `pinterest_app_secret` — OAuth App Secret
- `pinterest_access_token` — Access token for Pinterest account

**How to Get Them**:
1. Go to **https://developers.pinterest.com** → **My apps**
2. Click **Create app**
3. Select **Business** type
4. Fill in app details
5. Copy **App ID** and **App Secret**
6. Request permissions: `pins:read`, `pins:write`, `user_accounts:read`, `ads:read`, `ads:write`
7. Generate **Access Token**

**Action**: I can navigate and create the app. You'll need Pinterest account access.

---

### 13. Google Ads
**Status**: ✅ Accessible (I can create the OAuth client)

**Credentials Needed**:
- `google_client_id` — OAuth 2.0 Client ID
- `google_client_secret` — OAuth 2.0 Client Secret
- `google_refresh_token` — Refresh token for Google Ads account
- `google_ads_developer_token` — Developer token (requires approval)

**How to Get Them**:
1. Go to **Google Cloud Console** → **Create Project**
2. Enable **Google Ads API**
3. Go to **Credentials → Create OAuth 2.0 Client ID**
4. Select **Web application**
5. Add redirect URI: `https://beastbots-r65at2l4.manus.space/api/oauth/callback`
6. Copy **Client ID** and **Client Secret**
7. Complete OAuth flow to get **Refresh Token**
8. Request **Developer Token** from Google Ads (requires approval, 1-3 days)

**Action**: I can navigate and create the OAuth client. You'll need Google Cloud account access. Developer token requires manual approval from Google.

---

### 14. LinkedIn
**Status**: ✅ Accessible (I can create the app)

**Credentials Needed**:
- `linkedin_client_id` — OAuth Client ID
- `linkedin_client_secret` — OAuth Client Secret
- `linkedin_access_token` — Access token for LinkedIn account
- `linkedin_organization_id` — Your LinkedIn organization/company ID

**How to Get Them**:
1. Go to **https://www.linkedin.com/developers** → **My apps**
2. Click **Create app**
3. Fill in app details (requires LinkedIn account)
4. Go to **Auth** tab
5. Copy **Client ID** and **Client Secret**
6. Add redirect URI: `https://beastbots-r65at2l4.manus.space/api/oauth/callback`
7. Generate **Access Token** with `w_member_social`, `r_ads_reporting`, `r_ads`, `w_ads` permissions
8. Get **Organization ID** from your LinkedIn company page

**Action**: I can navigate and create the app. You'll need LinkedIn account access.

---

## Outbound Delivery (Email + SMS)

Shop_a_Bot routes all outbound email and SMS through a unified delivery layer at `server/delivery/*`. Three providers fan in; the layer auto-selects based on intent + which env vars are set.

### Email — SendGrid (preferred for transactional / marketing)

When configured, SendGrid is the default for `social.sendEmailCampaign`, recovery flows, and any programmatic send. It runs from a single verified sender so the platform doesn't need to round-trip through each user's Gmail token.

**Required env vars:**
- `SENDGRID_API_KEY` — full API key from https://app.sendgrid.com/settings/api_keys (start with `SG.`)
- `SENDGRID_FROM_EMAIL` — verified sender address (must match a Sender Identity in SendGrid)

**Optional:**
- `SENDGRID_FROM_NAME` — display name (default: `Shop_a_Bot`)

**Setup:**
1. Create a SendGrid account → free tier ships with 100 emails/day, paid starts at $19.95/mo for 50k.
2. Verify a single sender (Settings → Sender Authentication → Single Sender) OR set up domain authentication for the merchant's domain.
3. Generate a Full Access API key.
4. Drop both vars into `.env` / production secret store.

**Verify it's working:** call `delivery.getDeliveryStatus()` from the diagnostics router — should report `email.sendgrid: true`.

### Email — Gmail (per-user, personal-mode merchants)

Already wired via the existing social-OAuth flow (`/api/social/oauth/callback` for `gmail`). When a merchant connects Gmail at `/integrations`, the layer can route their sends through their own inbox. Best for solo operators who want emails to come from their personal address.

**Limits:** Gmail caps non-Workspace accounts at 500 sends/day. For higher volume, use SendGrid.

**Required env vars:** uses the existing `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — no new config.

### SMS — Twilio (only SMS provider today)

Powers `social.sendSms` and any future recovery-flow / order-shipped notifications.

**Required env vars (one of two profiles):**

*Profile A — single from-number (simple, sandbox-friendly):*
- `TWILIO_ACCOUNT_SID` — starts with `AC`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER` — E.164 format (e.g. `+14155551234`); must be a number you've provisioned in Twilio Console

*Profile B — Messaging Service (recommended for production):*
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID` — starts with `MG`; handles A2P registration, geographic routing, and opt-out compliance for you

**Setup:**
1. Create a Twilio account (or use the trial — $15 credit).
2. Provision a phone number, OR create a Messaging Service and attach a number.
3. For US/Canada production traffic, complete A2P 10DLC registration.
4. Find SID + auth token at the top of the Twilio Console dashboard.

**Cost:** US SMS is ~$0.0079 per segment; international varies by destination.

### Provider selection (how the layer picks)

For email, when `provider` is not explicitly set:
1. SendGrid if `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` are set.
2. Gmail if the user has a connected Gmail account.
3. `NoDeliveryProviderError` — the caller surfaces a friendly message.

For SMS, only Twilio is currently supported. If `TWILIO_*` env is unset, callers get `NoDeliveryProviderError` with a setup hint.

### Smoke test (after configuring)

```bash
# from a node REPL or script with the same env loaded as the server:
const { sendEmail, sendSms, getDeliveryStatus } = require('./server/delivery');

await getDeliveryStatus();
// → { email: { sendgrid: true, gmail: false }, sms: { twilio: true } }

await sendEmail({
  to: { email: 'you@example.com' },
  subject: 'Shop_a_Bot delivery test',
  html: '<p>Working!</p>',
});

await sendSms({ to: '+14155551234', body: 'Twilio works.' });
```

---

## Summary: What I Can Do vs. What You Need to Do

### ✅ I Can Do (Browser Access Available)
- Create apps on: Etsy, eBay, TikTok Shop, Walmart, Meta, TikTok Business, Twitter/X, Pinterest, Google Cloud (OAuth), LinkedIn
- Navigate all developer portals
- Extract credentials once apps are created
- Configure secrets in SHOPaBOT

### ⛔ You Need to Do (Browser Blocked or Account Required)
- **Amazon SP-API**: Seller Central is blocked. You'll need to set up and provide credentials.
- **All Platforms**: Provide account access or take over browser for login when needed
- **Google Ads Developer Token**: Requires manual approval from Google (1-3 days)

---

## Next Steps

1. **Decision**: Do you want me to create all the apps directly (with your account access), or would you prefer to set them up yourself and provide the credentials?

2. **If I create them**: I'll need you to take over the browser for login on each platform, then I'll extract the credentials.

3. **If you create them**: Provide the credentials for each platform, and I'll configure them in SHOPaBOT.

4. **Amazon SP-API**: This one requires your direct setup since Seller Central is blocked.

Which approach works best for you?
