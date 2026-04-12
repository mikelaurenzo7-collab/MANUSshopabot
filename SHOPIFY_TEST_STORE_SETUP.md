# Beast Bots — Shopify Test Store Setup Guide

## Overview

This guide walks you through connecting your personal Shopify store to Beast Bots for pre-launch testing. You'll run the three agents (Architect, Merchant, Hype-Man) in **supervised mode** — they'll suggest actions, you'll approve them before execution.

---

## Prerequisites

- ✅ Shopify Partner App credentials configured (SHOPIFY_PARTNER_CLIENT_ID, SHOPIFY_PARTNER_CLIENT_SECRET)
- ✅ Active Shopify store (or create a test store)
- ✅ Beast Bots platform running and accessible
- ✅ Admin access to your Shopify store

---

## Step 1: Connect Your Shopify Store

### In Beast Bots:

1. Go to **Integrations** → **E-Commerce Platforms** → **Shopify**
2. Click **"Connect Your Store"**
3. You'll be redirected to Shopify's OAuth login
4. Log in with your Shopify account
5. Click **"Install App"** to authorize Beast Bots
6. You'll be redirected back to Beast Bots with your store connected ✅

### What Just Happened:

- Beast Bots received a **permanent access token** from Shopify
- Your store is now linked to your Beast Bots account
- The three agents can now read/write to your store

---

## Step 2: Configure Autonomy Levels (Supervised Mode)

### In Beast Bots:

1. Go to **Settings** → **Bot Config**
2. Set autonomy levels for each agent:

| Agent | Autonomy Level | Behavior |
|-------|----------------|----------|
| **The Architect** | `supervised` | Suggests store setup, product sourcing, theme changes — you approve |
| **The Merchant** | `supervised` | Suggests inventory adjustments, pricing changes, fulfillment — you approve |
| **The Hype-Man** | `supervised` | Suggests ad campaigns, social posts, email flows — you approve |

3. Click **"Save Configuration"**

### Why Supervised Mode?

- **Safety:** All high-impact decisions go through your approval queue
- **Learning:** You see exactly what the bots are doing
- **Control:** You can reject suggestions and provide feedback
- **Testing:** Perfect for validating bot behavior before going fully autonomous

---

## Step 3: Test The Architect Agent

### Niche Research:

1. Go to **The Architect** → **Niche Research**
2. Enter a keyword (e.g., "Eco-friendly Kitchen Gadgets")
3. Click **"Research Niche"**
4. The bot will:
   - Analyze market size and competition
   - Identify profit margins
   - Suggest product categories
5. Review the report and click **"Approve"** or **"Reject"**

### Product Sourcing:

1. Go to **The Architect** → **Product Catalog**
2. Click **"Generate Catalog"** for your chosen niche
3. The bot will:
   - Find 20-50 products from suppliers
   - Suggest pricing and margins
   - Recommend store placement
4. Review and approve products to add to your store

### Store Setup:

1. Go to **The Architect** → **Store Setup**
2. The bot will suggest:
   - Theme selection
   - Legal pages (Terms, Privacy, Returns)
   - Payment gateway configuration
3. Review suggestions and approve to apply

---

## Step 4: Test The Merchant Agent

### Inventory Monitoring:

1. Go to **The Merchant** → **Inventory**
2. The bot runs every 6 hours and:
   - Checks stock levels across all products
   - Flags items below your threshold
   - Suggests restock quantities
3. You'll see pending suggestions in the **Approval Queue**
4. Approve to auto-order from suppliers, or reject to handle manually

### Dynamic Pricing:

1. Go to **The Merchant** → **Pricing Rules**
2. Set pricing parameters:
   - Min/max price range per product
   - Profit margin target (e.g., 40%)
   - Competitor price tracking
3. The bot will:
   - Monitor competitor prices daily
   - Suggest price adjustments
   - Wait for your approval before applying
4. Review suggestions in the **Approval Queue**

### Fulfillment Automation:

1. Go to **The Merchant** → **Fulfillment**
2. Configure fulfillment settings:
   - Preferred suppliers (Zendrop, AliExpress, etc.)
   - Shipping method (standard, express, etc.)
   - Auto-fulfillment threshold (e.g., approve orders >$50)
3. When an order arrives:
   - Bot detects it in your Shopify store
   - Finds the cheapest supplier
   - Suggests fulfillment (you approve in supervised mode)
   - Auto-submits once approved

---

## Step 5: Test The Hype-Man Agent

### Social Media Posting:

1. Go to **The Hype-Man** → **Social Media**
2. Connect your social accounts:
   - **TikTok:** Paste your API credentials
   - **Meta/Facebook:** OAuth login
   - **X/Twitter:** Paste your API key
   - **Pinterest:** Paste your access token
3. The bot will:
   - Generate post copy for your products
   - Create AI images for ads
   - Schedule posts across platforms
4. Review suggestions in the **Approval Queue** before posting

### Ad Campaign Management:

1. Go to **The Hype-Man** → **Ad Campaigns**
2. The bot will:
   - Analyze your top products
   - Generate ad copy variations
   - Create targeting recommendations
   - Suggest budget allocation
3. Approve to launch campaigns on Meta Ads, TikTok Ads, etc.

### Email Marketing:

1. Go to **The Hype-Man** → **Email Campaigns**
2. The bot will:
   - Generate email sequences for abandoned carts
   - Create product recommendation flows
   - Suggest send times based on customer behavior
3. Approve to activate email automation

---

## Step 6: Monitor Activity & Approvals

### Approval Queue:

1. Go to **Activity Log** → **Approval Queue**
2. You'll see all pending bot suggestions
3. For each suggestion:
   - **Approve:** Bot executes the action
   - **Reject:** Bot logs the rejection and learns from it
   - **Modify:** Edit the suggestion before approving

### Activity Log:

1. Go to **Activity Log** → **Full History**
2. See timestamped record of all bot actions
3. Filter by agent, action type, or date range
4. Export logs for compliance/auditing

---

## Step 7: Transition to Autonomous Mode (Optional)

Once you're confident the bots are working correctly:

1. Go to **Settings** → **Bot Config**
2. Change autonomy levels:
   - **The Architect:** `fully_autonomous`
   - **The Merchant:** `fully_autonomous`
   - **The Hype-Man:** `fully_autonomous`
3. Click **"Save Configuration"**
4. Bots will now execute actions without waiting for approval

**⚠️ Warning:** Only enable fully autonomous mode after 7+ days of supervised testing.

---

## Troubleshooting

### "Connection Failed" When Connecting Shopify

- **Cause:** Shopify Partner App credentials not configured
- **Fix:** Verify SHOPIFY_PARTNER_CLIENT_ID and SHOPIFY_PARTNER_CLIENT_SECRET are set in your secrets

### Bot Suggestions Not Appearing

- **Cause:** Scheduler hasn't run yet (runs every 6 hours)
- **Fix:** Wait 6 hours or manually trigger via **Activity Log** → **Run Now**

### Social Media Posts Not Posting

- **Cause:** API credentials expired or incorrect
- **Fix:** Go to **Integrations** → Reconnect the platform and re-enter credentials

### Inventory Not Syncing

- **Cause:** Shopify store not fully connected or products not imported
- **Fix:** Go to **The Architect** → **Store Setup** and complete the setup wizard

---

## Success Criteria

Your test is successful when:

- ✅ Architect suggests 5+ products for your niche
- ✅ Merchant detects inventory and suggests restocks
- ✅ Merchant adjusts pricing based on competitors
- ✅ Hype-Man generates ad copy and schedules social posts
- ✅ All actions flow through approval queue correctly
- ✅ No errors in Activity Log

---

## Next Steps

1. **Run for 7-14 days** in supervised mode
2. **Collect feedback** on bot suggestions
3. **Iterate on rules** (pricing thresholds, autonomy levels, etc.)
4. **Enable fully autonomous mode** once confident
5. **Launch to production** with real users

---

## Support

Questions or issues? Check:
- **Activity Log** for error messages
- **Bot Config** for autonomy level settings
- **Integrations** for credential status

For technical support, contact the Beast Bots team.
