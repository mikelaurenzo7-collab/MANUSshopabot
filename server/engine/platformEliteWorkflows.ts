/**
 * SHOPaBOT — Platform-Specific Elite Workflows
 *
 * Advanced platform-specific automation workflows implementing the
 * strategies from the 13-platform research playbook.
 *
 * Merchant Elite:
 *  1. shopify_metafields_sync — Store supplier cost, margin, reorder point per product
 *  2. shopify_bulk_operations — Batch product updates via Bulk Operations API
 *  3. fba_replenishment_monitor — Track Amazon IPI score, trigger inbound shipment alerts
 *  4. etsy_listing_refresh — Weekly title/tag updates to maintain search visibility
 *  5. woocommerce_oos_hide — Hide (not delete) OOS products to preserve SEO
 *  6. walmart_performance_alarm — Seller Performance webhook handler
 *
 * Social Bot Elite:
 *  7. meta_conversions_api — Server-side event sending with hashed PII
 *  8. tiktok_engagement_monitor — 3-second view rate and hold rate tracking
 *  9. pinterest_trends — Trend-driven pin scheduling
 * 10. tiktok_spark_ads — Auto-boost high-performing organic TikTok posts
 * 11. instagram_reels_boost — Auto-boost high watch-time reels
 * 12. google_pmax_optimization — Performance Max asset group management
 * 13. twitter_stream_monitor — Brand mention tracking and sentiment analysis
 */

import { registerWorkflow, type WorkflowStepDefinition, type StepContext } from "./workflowEngine";

// ─── 1. Shopify Metafields Sync ──────────────────────────────────────────────

registerWorkflow("shopify_metafields_sync", (input): WorkflowStepDefinition[] => {
  const storeId = input.storeId ?? "all";
  return [
    {
      stepType: "analysis",
      title: "Audit Product Cost Data",
      description: "Scanning all products for missing supplier cost, margin, and reorder point metafields",
      input: {
        analysisPrompt: `Audit all products in store ${storeId} for Shopify metafield completeness:
1. Check each product for namespace "beast_bots" metafields:
   - beast_bots.supplier_cost (decimal, cost price from supplier)
   - beast_bots.profit_margin (decimal, target margin percentage)
   - beast_bots.reorder_point (integer, minimum stock before reorder trigger)
   - beast_bots.supplier_name (string, primary supplier)
   - beast_bots.lead_time_days (integer, supplier lead time)
2. Flag products missing any of these metafields
3. Calculate estimated margins where cost data exists
4. Identify products with margins below 15% (danger zone)`,
        data: { storeId, metafieldNamespace: "beast_bots" },
      },
    },
    {
      stepType: "llm_call",
      title: "Generate Metafield Recommendations",
      description: "Estimating missing cost data and optimal reorder points based on sales velocity",
      input: {
        systemPrompt: "You are a Shopify operations expert. You use metafields to store critical business data that drives automated pricing and inventory decisions.",
        userPrompt: `Based on the product audit, generate metafield recommendations:

1. For products missing supplier_cost: estimate based on retail price and typical margins for the product category (assume 40-60% markup)
2. For products missing reorder_point: calculate based on average daily sales × lead time × 1.5 safety factor
3. For products missing profit_margin: set target based on category benchmarks
4. Flag any products where current price is below estimated cost (negative margin)
5. Recommend bulk metafield update payload for Shopify Admin API

Return as JSON with keys: missingMetafields, recommendations, bulkUpdatePayload, warningProducts`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "metafield_recommendations",
            strict: true,
            schema: {
              type: "object",
              properties: {
                missingMetafields: { type: "array", items: { type: "object", properties: { productTitle: { type: "string" }, missingFields: { type: "array", items: { type: "string" } } }, required: ["productTitle", "missingFields"], additionalProperties: false } },
                recommendations: { type: "array", items: { type: "object", properties: { productTitle: { type: "string" }, estimatedCost: { type: "string" }, targetMargin: { type: "string" }, reorderPoint: { type: "number" }, leadTimeDays: { type: "number" } }, required: ["productTitle", "estimatedCost", "targetMargin", "reorderPoint", "leadTimeDays"], additionalProperties: false } },
                warningProducts: { type: "array", items: { type: "string" } },
                summary: { type: "string" },
              },
              required: ["missingMetafields", "recommendations", "warningProducts", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "approval_gate",
      title: "Approve Metafield Updates",
      description: "Review estimated costs and reorder points before writing to Shopify",
      requiresApproval: true,
    },
    {
      stepType: "store_action",
      title: "Write Metafields to Shopify",
      description: "Applying metafield updates via Shopify Admin API",
      input: {
        action: "update_metafields",
        storeId,
        namespace: "beast_bots",
        fields: ["supplier_cost", "profit_margin", "reorder_point", "supplier_name", "lead_time_days"],
      },
      rollback: async (_ctx: StepContext, _output: unknown) => {
        console.log(`[Rollback] Metafield updates can be reverted by clearing the beast_bots namespace`);
      },
    },
    {
      stepType: "notification",
      title: "Metafields Synced",
      description: "Shopify metafields updated with cost and inventory data",
      input: {
        title: "Shopify Metafields Synced",
        message: "Product cost data, margins, and reorder points have been synced to Shopify metafields. Dynamic pricing and auto-reorder are now data-driven.",
        agentType: "merchant",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// ─── 2. Shopify Bulk Operations ──────────────────────────────────────────────

registerWorkflow("shopify_bulk_operations", (input): WorkflowStepDefinition[] => {
  const operationType = input.operationType ?? "price_update";
  const storeId = input.storeId ?? "all";
  return [
    {
      stepType: "analysis",
      title: "Prepare Bulk Operation Payload",
      description: `Preparing ${operationType} bulk operation for Shopify store ${storeId}`,
      input: {
        analysisPrompt: `Prepare a Shopify Bulk Operations API payload for ${operationType}:

1. Identify all products/variants that need updating
2. For price_update: apply pending pricing rule changes from the dynamic pricing engine
3. For inventory_update: sync stock levels from supplier feeds
4. For tag_update: apply SEO-optimized tags based on keyword research
5. Generate the JSONL mutation payload for bulkOperationRunMutation
6. Estimate API cost (Shopify charges per operation)

Shopify Bulk Operations use GraphQL mutations wrapped in JSONL format.
Each line is a separate mutation. Max 10MB per file.`,
        data: { operationType, storeId },
      },
    },
    {
      stepType: "approval_gate",
      title: "Approve Bulk Operation",
      description: `Review ${operationType} changes before executing bulk operation`,
      requiresApproval: true,
    },
    {
      stepType: "store_action",
      title: "Execute Bulk Operation",
      description: "Submitting bulk operation to Shopify and polling for completion",
      input: {
        action: "bulk_operation",
        operationType,
        storeId,
        steps: ["upload_jsonl", "submit_mutation", "poll_status", "download_results"],
      },
      rollback: async (_ctx: StepContext, _output: unknown) => {
        console.log(`[Rollback] Bulk operation ${operationType} — check Shopify admin for partial application`);
      },
    },
    {
      stepType: "notification",
      title: "Bulk Operation Complete",
      description: "Shopify bulk operation finished",
      input: {
        title: `Bulk ${operationType} Complete`,
        message: `Shopify bulk operation (${operationType}) has been executed. Check the results in your Shopify admin.`,
        agentType: "merchant",
        notificationType: "success",
      },
    },
  ];
});

// ─── 3. FBA Replenishment Monitor ────────────────────────────────────────────

registerWorkflow("fba_replenishment_monitor", (input): WorkflowStepDefinition[] => {
  return [
    {
      stepType: "analysis",
      title: "FBA Inventory Health Check",
      description: "Analyzing Amazon FBA inventory levels, IPI score, and replenishment needs",
      input: {
        analysisPrompt: `Perform a comprehensive FBA inventory health check:

1. IPI Score Analysis:
   - Current IPI score (target: >500 for unlimited storage)
   - Excess inventory percentage (target: <10%)
   - Stranded inventory count
   - Sell-through rate (target: >3 units/week per ASIN)
   - In-stock rate (target: >95%)

2. Replenishment Needs:
   - Products approaching stockout (< 14 days supply)
   - Products with pending inbound shipments
   - Products needing FBA label prep
   - Recommended shipment quantities (based on 60-day forecast)

3. Storage Fee Optimization:
   - Products incurring long-term storage fees (>365 days)
   - Products approaching aged inventory surcharge
   - Removal/disposal recommendations for dead stock

4. Inbound Shipment Planning:
   - Optimal shipment size (balance shipping cost vs. storage fees)
   - Recommended FC destinations (based on customer demand geography)
   - Prep requirements per product`,
        data: { platform: "amazon", type: "fba_health" },
      },
    },
    {
      stepType: "llm_call",
      title: "Replenishment Strategy",
      description: "Generating optimal FBA replenishment plan",
      input: {
        systemPrompt: "You are an Amazon FBA logistics expert who has managed 7-figure FBA operations. You optimize IPI scores, minimize storage fees, and prevent stockouts.",
        userPrompt: `Based on the FBA health check, create a replenishment strategy:

1. Immediate Actions (this week):
   - Products to ship to FBA immediately (stockout risk)
   - Removal orders to submit (aged inventory)
   - Price adjustments for slow movers

2. 30-Day Plan:
   - Shipment schedule with quantities
   - Expected IPI score improvement
   - Storage fee savings estimate

3. 90-Day Forecast:
   - Seasonal demand adjustments
   - New product launch FBA prep
   - Storage limit planning

Return as JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "fba_replenishment",
            strict: true,
            schema: {
              type: "object",
              properties: {
                ipiScore: { type: "object", properties: { current: { type: "number" }, target: { type: "number" }, improvementPlan: { type: "string" } }, required: ["current", "target", "improvementPlan"], additionalProperties: false },
                immediateActions: { type: "array", items: { type: "object", properties: { action: { type: "string" }, product: { type: "string" }, quantity: { type: "number" }, urgency: { type: "string" } }, required: ["action", "product", "quantity", "urgency"], additionalProperties: false } },
                thirtyDayPlan: { type: "object", properties: { shipments: { type: "array", items: { type: "string" } }, expectedIPIGain: { type: "number" }, storageSavings: { type: "string" } }, required: ["shipments", "expectedIPIGain", "storageSavings"], additionalProperties: false },
                ninetyDayForecast: { type: "string" },
                summary: { type: "string" },
              },
              required: ["ipiScore", "immediateActions", "thirtyDayPlan", "ninetyDayForecast", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "notification",
      title: "FBA Replenishment Plan Ready",
      description: "Amazon FBA replenishment strategy generated",
      input: {
        title: "FBA Replenishment Plan Ready",
        message: "The Merchant has analyzed your FBA inventory health and created a replenishment plan. Review IPI score recommendations and shipment schedule.",
        agentType: "merchant",
        notificationType: "info",
        notifyOwner: true,
      },
    },
  ];
});

// ─── 4. Etsy Listing Refresh ─────────────────────────────────────────────────

registerWorkflow("etsy_listing_refresh", (input): WorkflowStepDefinition[] => {
  const storeId = input.storeId ?? "all";
  return [
    {
      stepType: "llm_call",
      title: "SEO-Optimized Tag Research",
      description: "Researching trending Etsy search terms and optimal tags for each listing",
      input: {
        systemPrompt: "You are an Etsy SEO expert who has helped shops reach Star Seller status. You understand Etsy's search algorithm, tag optimization, and listing quality scoring.",
        userPrompt: `Generate optimized titles and tags for Etsy listing refresh:

1. For each active listing, analyze:
   - Current title effectiveness (front-load keywords, 140 char max)
   - Tag relevance (all 13 tags used? Long-tail keywords?)
   - Category accuracy
   - Attribute completeness

2. Etsy SEO Best Practices:
   - Use all 13 tag slots (each tag up to 20 characters)
   - Front-load primary keyword in title
   - Include seasonal/trending terms
   - Mix broad and specific tags
   - Avoid repeating words already in the title (Etsy indexes title separately)
   - Use multi-word tags (Etsy treats each tag as a phrase)

3. Trending Terms:
   - Current trending searches in the product category
   - Seasonal keywords for the next 30 days
   - Rising search terms from Etsy Trend Reports

4. Star Seller Optimization:
   - Response time targets (<24h)
   - Shipping time optimization
   - Review solicitation strategy

Return as JSON with keys: listingUpdates, trendingTerms, starSellerTips`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "etsy_listing_refresh",
            strict: true,
            schema: {
              type: "object",
              properties: {
                listingUpdates: { type: "array", items: { type: "object", properties: { listingTitle: { type: "string" }, newTitle: { type: "string" }, newTags: { type: "array", items: { type: "string" } }, reason: { type: "string" } }, required: ["listingTitle", "newTitle", "newTags", "reason"], additionalProperties: false } },
                trendingTerms: { type: "array", items: { type: "string" } },
                starSellerTips: { type: "array", items: { type: "string" } },
                summary: { type: "string" },
              },
              required: ["listingUpdates", "trendingTerms", "starSellerTips", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "approval_gate",
      title: "Approve Listing Updates",
      description: "Review new titles and tags before applying to Etsy listings",
      requiresApproval: true,
    },
    {
      stepType: "store_action",
      title: "Apply Listing Updates",
      description: "Updating Etsy listings with optimized titles and tags via Open API v3",
      input: {
        action: "update_listings",
        storeId,
        platform: "etsy",
        fields: ["title", "tags"],
      },
    },
    {
      stepType: "notification",
      title: "Etsy Listings Refreshed",
      description: "Etsy listing titles and tags have been updated",
      input: {
        title: "Etsy Listings Refreshed",
        message: "All active Etsy listings have been refreshed with SEO-optimized titles and trending tags. Monitor search impressions over the next 7 days.",
        agentType: "merchant",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// ─── 5. WooCommerce OOS Hide ─────────────────────────────────────────────────

registerWorkflow("woocommerce_oos_hide", (input): WorkflowStepDefinition[] => {
  const storeId = input.storeId ?? "all";
  return [
    {
      stepType: "analysis",
      title: "Scan OOS Products",
      description: "Identifying out-of-stock WooCommerce products to hide (not delete) for SEO preservation",
      input: {
        analysisPrompt: `Scan WooCommerce store ${storeId} for out-of-stock products:

1. Identify all products with stock_status = "outofstock"
2. Check if product has existing SEO value:
   - Has backlinks? (check referral data)
   - Has Google indexed pages? (check sitemap)
   - Has reviews? (preserve social proof)
3. For each OOS product, determine action:
   - HIDE: Set catalog_visibility to "hidden" (removes from shop/category pages but keeps URL live)
   - REDIRECT: If permanently discontinued, set up 301 redirect to similar product
   - KEEP: If temporarily OOS with restock date, show "Back in Stock" notification signup
4. Never DELETE products with SEO value — this destroys backlinks and rankings

WooCommerce REST API:
- PUT /wp-json/wc/v3/products/{id} with { catalog_visibility: "hidden" }
- This preserves the product URL, reviews, and SEO while hiding from browse`,
        data: { storeId, platform: "woocommerce" },
      },
    },
    {
      stepType: "store_action",
      title: "Hide OOS Products",
      description: "Setting out-of-stock products to hidden visibility via WooCommerce REST API",
      input: {
        action: "hide_oos_products",
        storeId,
        platform: "woocommerce",
        method: "catalog_visibility_hidden",
      },
      rollback: async (_ctx: StepContext, _output: unknown) => {
        console.log(`[Rollback] Restore hidden products to visible — set catalog_visibility back to "visible"`);
      },
    },
    {
      stepType: "notification",
      title: "OOS Products Hidden",
      description: "Out-of-stock products hidden from catalog while preserving SEO",
      input: {
        title: "WooCommerce OOS Products Hidden",
        message: "Out-of-stock products have been hidden from your catalog. Their URLs, reviews, and SEO rankings are preserved. They will automatically reappear when restocked.",
        agentType: "merchant",
        notificationType: "info",
      },
    },
  ];
});

// ─── 6. Walmart Seller Performance Alarm ─────────────────────────────────────

registerWorkflow("walmart_performance_alarm", (input): WorkflowStepDefinition[] => {
  const alertType = input.alertType ?? "performance_warning";
  return [
    {
      stepType: "analysis",
      title: "Performance Metrics Analysis",
      description: "Analyzing Walmart Seller Performance standards compliance",
      input: {
        analysisPrompt: `Analyze Walmart Seller Performance metrics for compliance:

Alert Type: ${alertType}

Walmart Seller Performance Standards:
1. On-Time Delivery Rate: >95% (suspension risk below 90%)
2. Valid Tracking Rate: >99%
3. Cancellation Rate: <2%
4. Return Rate: <6%
5. Customer Escalation Rate: <0.5%

For each metric:
- Current value vs. threshold
- Trend direction (improving/declining)
- Days until potential suspension if trend continues
- Root cause analysis for underperforming metrics
- Specific corrective actions

Walmart suspends sellers who fail 2+ metrics for 90 consecutive days.`,
        data: { alertType, platform: "walmart" },
      },
    },
    {
      stepType: "llm_call",
      title: "Corrective Action Plan",
      description: "Generating urgent corrective action plan for Walmart performance",
      input: {
        systemPrompt: "You are a Walmart Marketplace compliance expert. You've helped sellers recover from performance warnings and avoid suspension.",
        userPrompt: `Generate an urgent corrective action plan for the Walmart performance alert:

1. Immediate Actions (24-48 hours):
   - Orders to prioritize for shipping
   - Tracking numbers to upload
   - Customer issues to resolve

2. Process Improvements (1-2 weeks):
   - Shipping workflow optimization
   - Inventory accuracy improvements
   - Customer service response templates

3. Monitoring Plan:
   - Daily metric tracking dashboard
   - Alert thresholds for early warning
   - Weekly performance review cadence

4. Escalation Protocol:
   - When to contact Walmart Seller Support
   - Appeal process for false positives
   - Account health recovery timeline

Return as JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "walmart_corrective_action",
            strict: true,
            schema: {
              type: "object",
              properties: {
                immediateActions: { type: "array", items: { type: "object", properties: { action: { type: "string" }, priority: { type: "string" }, deadline: { type: "string" } }, required: ["action", "priority", "deadline"], additionalProperties: false } },
                processImprovements: { type: "array", items: { type: "object", properties: { improvement: { type: "string" }, timeline: { type: "string" }, expectedImpact: { type: "string" } }, required: ["improvement", "timeline", "expectedImpact"], additionalProperties: false } },
                monitoringPlan: { type: "string" },
                riskLevel: { type: "string" },
                summary: { type: "string" },
              },
              required: ["immediateActions", "processImprovements", "monitoringPlan", "riskLevel", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "notification",
      title: "Performance Alert",
      description: "Walmart performance alarm triggered — corrective action required",
      input: {
        title: "⚠️ Walmart Performance Alert",
        message: "Walmart seller performance metrics are below threshold. A corrective action plan has been generated. Immediate action required to avoid suspension.",
        agentType: "merchant",
        notificationType: "warning",
        notifyOwner: true,
      },
    },
  ];
});

// ─── 7. Meta Conversions API ─────────────────────────────────────────────────

registerWorkflow("meta_conversions_api", (input): WorkflowStepDefinition[] => {
  const eventType = input.eventType ?? "Purchase";
  const pixelId = input.pixelId ?? "auto";
  return [
    {
      stepType: "analysis",
      title: "Event Configuration Audit",
      description: "Auditing Meta Conversions API setup and event quality",
      input: {
        analysisPrompt: `Audit Meta Conversions API (CAPI) configuration:

1. Event Setup:
   - Pixel ID: ${pixelId}
   - Events being sent: ${eventType}
   - Deduplication key strategy (event_id matching between browser + server)
   - Event match quality score (target: >6.0)

2. PII Hashing Compliance:
   - Email: SHA-256 hashed, lowercase, trimmed
   - Phone: SHA-256 hashed, E.164 format
   - First/Last Name: SHA-256 hashed, lowercase
   - City/State/Zip: SHA-256 hashed, lowercase
   - External ID: SHA-256 hashed
   - IP Address: raw (not hashed)
   - User Agent: raw (not hashed)
   - FBC/FBP cookies: raw (click ID and browser ID)

3. Event Quality Metrics:
   - Event Match Quality (EMQ) per event type
   - Deduplication rate (should be 10-30%)
   - Server vs. browser event ratio
   - Attribution window coverage

4. Required Server Events:
   - Purchase (with value, currency, content_ids)
   - AddToCart
   - InitiateCheckout
   - ViewContent
   - Lead (if applicable)`,
        data: { eventType, pixelId, platform: "meta" },
      },
    },
    {
      stepType: "llm_call",
      title: "CAPI Optimization Plan",
      description: "Generating Conversions API optimization recommendations",
      input: {
        systemPrompt: "You are a Meta Conversions API specialist who has implemented CAPI for 100+ e-commerce brands. You maximize Event Match Quality and attribution accuracy.",
        userPrompt: `Generate a Meta CAPI optimization plan:

1. Event Match Quality Improvements:
   - Which PII parameters to add for better matching
   - Cookie strategy (fbc/fbp capture)
   - Customer info enrichment from order data

2. Server-Side Event Implementation:
   - Node.js code template for sending events
   - Deduplication strategy (event_id generation)
   - Retry logic for failed event deliveries
   - Batch sending optimization (max 1000 events per request)

3. Testing & Validation:
   - Test Events tool in Events Manager
   - Event deduplication verification
   - Attribution comparison (browser-only vs. browser+server)

Return as JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "meta_capi_plan",
            strict: true,
            schema: {
              type: "object",
              properties: {
                emqImprovements: { type: "array", items: { type: "object", properties: { parameter: { type: "string" }, currentStatus: { type: "string" }, recommendation: { type: "string" }, expectedEMQGain: { type: "string" } }, required: ["parameter", "currentStatus", "recommendation", "expectedEMQGain"], additionalProperties: false } },
                implementationSteps: { type: "array", items: { type: "string" } },
                testingChecklist: { type: "array", items: { type: "string" } },
                summary: { type: "string" },
              },
              required: ["emqImprovements", "implementationSteps", "testingChecklist", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "notification",
      title: "CAPI Setup Complete",
      description: "Meta Conversions API audit and optimization plan ready",
      input: {
        title: "Meta Conversions API Optimized",
        message: "Conversions API audit complete. Event Match Quality improvements identified. Review the optimization plan to boost attribution accuracy.",
        agentType: "social",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// ─── 8. TikTok Engagement Monitor ────────────────────────────────────────────

registerWorkflow("tiktok_engagement_monitor", (input): WorkflowStepDefinition[] => {
  return [
    {
      stepType: "analysis",
      title: "TikTok Video Performance Analysis",
      description: "Analyzing 3-second view rate, hold rate, and engagement metrics for all TikTok content",
      input: {
        analysisPrompt: `Analyze TikTok video performance metrics:

1. Key Metrics per Video:
   - 3-Second View Rate (% of viewers who watch past 3s — target: >50%)
   - Average Watch Time / Hold Rate (% of video watched — target: >40%)
   - Completion Rate (% who watch to end — target: >15%)
   - Engagement Rate (likes + comments + shares / views — target: >5%)
   - Share Rate (shares / views — strongest signal for virality)
   - Save Rate (saves / views — signals high-value content)

2. Content Pattern Analysis:
   - Which hook styles get highest 3s view rate
   - Optimal video length for the niche
   - Best posting times based on audience activity
   - Sound/music correlation with performance

3. Algorithm Signals:
   - Videos the algorithm is pushing (high impression rate)
   - Videos stuck in review or suppressed
   - Content that triggers "Not Interested" signals

4. Competitor Benchmarking:
   - Top-performing competitor content patterns
   - Trending sounds in the niche
   - Hashtag performance analysis`,
        data: { platform: "tiktok", type: "engagement_analysis" },
      },
    },
    {
      stepType: "llm_call",
      title: "Content Optimization Strategy",
      description: "Generating TikTok content optimization recommendations based on engagement data",
      input: {
        systemPrompt: "You are a TikTok growth strategist who has helped brands go viral. You understand the For You Page algorithm, hook psychology, and engagement optimization.",
        userPrompt: `Based on the engagement analysis, generate a TikTok optimization strategy:

1. Hook Optimization:
   - Top 5 hook formulas that work for this niche
   - First-frame optimization (text overlay, face, movement)
   - Pattern interrupt techniques

2. Content Structure:
   - Optimal video length recommendations
   - Pacing and edit rhythm
   - CTA placement (when to ask for follow/like/comment)

3. Posting Strategy:
   - Optimal posting frequency (3-5x/day for growth)
   - Best time slots based on audience data
   - Content mix ratio (educational:entertaining:promotional)

4. Spark Ads Candidates:
   - Videos with >50% 3s view rate → recommend for Spark Ads
   - Videos with high save rate → recommend for conversion campaigns
   - Videos with high share rate → recommend for awareness campaigns

Return as JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "tiktok_optimization",
            strict: true,
            schema: {
              type: "object",
              properties: {
                hookFormulas: { type: "array", items: { type: "string" } },
                contentStructure: { type: "object", properties: { optimalLength: { type: "string" }, pacingTips: { type: "array", items: { type: "string" } }, ctaPlacement: { type: "string" } }, required: ["optimalLength", "pacingTips", "ctaPlacement"], additionalProperties: false },
                postingStrategy: { type: "object", properties: { frequency: { type: "string" }, bestTimes: { type: "array", items: { type: "string" } }, contentMix: { type: "string" } }, required: ["frequency", "bestTimes", "contentMix"], additionalProperties: false },
                sparkAdsCandidates: { type: "array", items: { type: "object", properties: { videoDescription: { type: "string" }, metric: { type: "string" }, recommendedCampaignType: { type: "string" } }, required: ["videoDescription", "metric", "recommendedCampaignType"], additionalProperties: false } },
                summary: { type: "string" },
              },
              required: ["hookFormulas", "contentStructure", "postingStrategy", "sparkAdsCandidates", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "notification",
      title: "TikTok Engagement Report",
      description: "TikTok engagement analysis and optimization strategy ready",
      input: {
        title: "TikTok Engagement Report Ready",
        message: "The Social Bot has analyzed your TikTok engagement metrics. Spark Ads candidates identified. Review the optimization strategy.",
        agentType: "social",
        notificationType: "info",
        notifyOwner: true,
      },
    },
  ];
});

// ─── 9. Pinterest Trends ─────────────────────────────────────────────────────

registerWorkflow("pinterest_trends", (input): WorkflowStepDefinition[] => {
  const niche = input.niche ?? "home decor";
  return [
    {
      stepType: "llm_call",
      title: "Pinterest Trend Analysis",
      description: `Analyzing Pinterest trending topics and keywords for ${niche}`,
      input: {
        systemPrompt: "You are a Pinterest marketing expert who understands the Pinterest Trends API, visual search algorithm, and seasonal content planning. Pinterest users plan 2-3 months ahead.",
        userPrompt: `Generate a Pinterest trend-driven content strategy for "${niche}":

1. Current Trending Topics (from Pinterest Trends API):
   - Top 20 trending search terms in the niche
   - Rising trends (early stage, high growth potential)
   - Seasonal trends for the next 60-90 days
   - Year-over-year trend comparisons

2. Pin Optimization:
   - Optimal pin dimensions (2:3 ratio, 1000x1500px)
   - Title optimization (100 char max, keyword-rich)
   - Description optimization (500 char, natural keywords)
   - Alt text for visual search
   - Rich Pin setup (Product, Article, Recipe)

3. Board Strategy:
   - Recommended board names (keyword-optimized)
   - Board description templates
   - Pin-to-board ratio
   - Group board opportunities

4. Scheduling Strategy:
   - Pinterest users plan 2-3 months ahead
   - Holiday/seasonal content calendar
   - Optimal pinning frequency (15-25 pins/day)
   - Best times to pin (8-11pm, weekends)

5. Idea Pins vs. Standard Pins:
   - When to use each format
   - Idea Pin best practices (multi-page, video)
   - Shopping Pins integration

Return as JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "pinterest_trends",
            strict: true,
            schema: {
              type: "object",
              properties: {
                trendingTopics: { type: "array", items: { type: "object", properties: { term: { type: "string" }, trendDirection: { type: "string" }, volume: { type: "string" } }, required: ["term", "trendDirection", "volume"], additionalProperties: false } },
                pinOptimization: { type: "object", properties: { titleTemplate: { type: "string" }, descriptionTemplate: { type: "string" }, altTextStrategy: { type: "string" } }, required: ["titleTemplate", "descriptionTemplate", "altTextStrategy"], additionalProperties: false },
                boardStrategy: { type: "array", items: { type: "object", properties: { boardName: { type: "string" }, description: { type: "string" }, pinCount: { type: "number" } }, required: ["boardName", "description", "pinCount"], additionalProperties: false } },
                schedulingPlan: { type: "object", properties: { frequency: { type: "string" }, bestTimes: { type: "array", items: { type: "string" } }, seasonalCalendar: { type: "array", items: { type: "string" } } }, required: ["frequency", "bestTimes", "seasonalCalendar"], additionalProperties: false },
                summary: { type: "string" },
              },
              required: ["trendingTopics", "pinOptimization", "boardStrategy", "schedulingPlan", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "image_generation",
      title: "Generate Trend-Driven Pin",
      description: "Creating a Pinterest-optimized pin image based on trending topics",
      input: {
        prompt: `Professional Pinterest pin for ${niche}, 2:3 aspect ratio, clean modern design, text overlay with trending keyword, lifestyle photography, warm color palette, high-quality product showcase`,
      },
    },
    {
      stepType: "notification",
      title: "Pinterest Trends Report",
      description: "Pinterest trend analysis and content strategy ready",
      input: {
        title: "Pinterest Trends Report Ready",
        message: `The Social Bot has analyzed Pinterest trends for "${niche}". Trending keywords, board strategy, and scheduling plan are ready for review.`,
        agentType: "social",
        notificationType: "info",
        notifyOwner: true,
      },
    },
  ];
});

// ─── 10. TikTok Spark Ads ────────────────────────────────────────────────────

registerWorkflow("tiktok_spark_ads", (input): WorkflowStepDefinition[] => {
  return [
    {
      stepType: "analysis",
      title: "Identify Spark Ads Candidates",
      description: "Scanning organic TikTok posts for high-performing content to boost as Spark Ads",
      input: {
        analysisPrompt: `Identify organic TikTok posts eligible for Spark Ads promotion:

Spark Ads Criteria (auto-boost threshold):
1. 3-Second View Rate > 50%
2. Engagement Rate > 5% (likes + comments + shares / views)
3. Minimum 1,000 organic views (proves content resonates)
4. Posted within last 30 days (freshness)
5. No policy violations

For each candidate:
- Post ID and description
- Current organic metrics
- Recommended campaign objective (Traffic, Conversions, App Install)
- Recommended daily budget
- Suggested audience targeting
- Expected ROAS based on organic engagement signals

Spark Ads preserve the original post's engagement (likes, comments, shares)
which provides social proof that standard ads lack.`,
        data: { platform: "tiktok", type: "spark_ads_scan" },
      },
    },
    {
      stepType: "approval_gate",
      title: "Approve Spark Ads",
      description: "Review organic posts selected for Spark Ads promotion",
      requiresApproval: true,
    },
    {
      stepType: "store_action",
      title: "Launch Spark Ads",
      description: "Creating Spark Ads campaigns from approved organic posts",
      input: {
        action: "create_spark_ads",
        platform: "tiktok",
        steps: ["generate_auth_code", "create_campaign", "set_targeting", "set_budget", "launch"],
      },
    },
    {
      stepType: "notification",
      title: "Spark Ads Launched",
      description: "TikTok Spark Ads campaigns created from top organic content",
      input: {
        title: "TikTok Spark Ads Launched",
        message: "High-performing organic TikTok posts have been promoted as Spark Ads. These preserve all existing engagement as social proof.",
        agentType: "social",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// ─── 11. Instagram Reels Boost ───────────────────────────────────────────────

registerWorkflow("instagram_reels_boost", (input): WorkflowStepDefinition[] => {
  return [
    {
      stepType: "analysis",
      title: "Reels Performance Analysis",
      description: "Analyzing Instagram Reels watch time, reach, and engagement for boost candidates",
      input: {
        analysisPrompt: `Analyze Instagram Reels performance for boost candidates:

Key Metrics per Reel:
1. Average Watch Time (target: >50% of video length)
2. Reach Rate (reach / followers — target: >20% for boost-worthy)
3. Engagement Rate (likes + comments + saves + shares / reach)
4. Save Rate (saves / reach — strongest signal for Reels algorithm)
5. Share Rate (shares / reach — indicates viral potential)
6. Plays vs. Reach ratio (>1.5 means people are rewatching)

Boost Criteria:
- Average Watch Time > 50% of video length
- Engagement Rate > 3%
- Save Rate > 2%
- Minimum 500 organic plays
- Posted within last 14 days

For each candidate:
- Reel ID and description
- Current organic metrics
- Recommended boost budget ($5-50/day)
- Suggested audience (auto, custom, or lookalike)
- Expected reach multiplier`,
        data: { platform: "instagram", type: "reels_analysis" },
      },
    },
    {
      stepType: "approval_gate",
      title: "Approve Reels Boost",
      description: "Review Reels selected for paid promotion",
      requiresApproval: true,
    },
    {
      stepType: "notification",
      title: "Reels Boost Ready",
      description: "Instagram Reels boost candidates identified and ready for promotion",
      input: {
        title: "Instagram Reels Boost Ready",
        message: "High watch-time Reels have been identified for boosting. Review and approve to amplify your best-performing content.",
        agentType: "social",
        notificationType: "info",
        notifyOwner: true,
      },
    },
  ];
});

// ─── 12. Google Performance Max Optimization ─────────────────────────────────

registerWorkflow("google_pmax_optimization", (input): WorkflowStepDefinition[] => {
  return [
    {
      stepType: "llm_call",
      title: "Performance Max Audit",
      description: "Auditing Google Ads Performance Max campaign structure and asset groups",
      input: {
        systemPrompt: "You are a Google Ads Performance Max specialist who has managed 8-figure PMax budgets. You understand asset group optimization, audience signals, and bid strategy selection.",
        userPrompt: `Conduct a Performance Max campaign audit and optimization:

1. Campaign Structure:
   - Number of asset groups (recommend 3-7 per campaign)
   - Asset group themes (should be product-category aligned)
   - URL expansion settings (on/off recommendation)
   - Final URL strategy

2. Asset Quality:
   - Text assets: headlines (15 max), descriptions (5 max), long headlines
   - Image assets: landscape, square, portrait (minimum 3 each)
   - Video assets (recommended: at least 1 per asset group)
   - Asset strength score per group (target: "Excellent")

3. Audience Signals:
   - Custom segments (search terms, URLs, apps)
   - Customer lists (first-party data)
   - Demographics and interests
   - In-market audiences

4. Bid Strategy:
   - Current strategy (Maximize Conversions, Target CPA, Target ROAS)
   - Recommended strategy based on conversion volume
   - CPA/ROAS target recommendations
   - Budget allocation across asset groups

5. Insights & Recommendations:
   - Top-performing search categories
   - Placement insights (Search, Display, YouTube, Discover, Maps, Gmail)
   - Negative keyword recommendations (brand exclusions)
   - Competitor auction insights

Return as JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "pmax_audit",
            strict: true,
            schema: {
              type: "object",
              properties: {
                campaignStructure: { type: "object", properties: { assetGroupCount: { type: "number" }, recommendation: { type: "string" }, urlExpansion: { type: "string" } }, required: ["assetGroupCount", "recommendation", "urlExpansion"], additionalProperties: false },
                assetQuality: { type: "array", items: { type: "object", properties: { assetGroup: { type: "string" }, strengthScore: { type: "string" }, missingAssets: { type: "array", items: { type: "string" } }, recommendation: { type: "string" } }, required: ["assetGroup", "strengthScore", "missingAssets", "recommendation"], additionalProperties: false } },
                audienceSignals: { type: "object", properties: { customSegments: { type: "array", items: { type: "string" } }, customerLists: { type: "string" }, recommendation: { type: "string" } }, required: ["customSegments", "customerLists", "recommendation"], additionalProperties: false },
                bidStrategy: { type: "object", properties: { current: { type: "string" }, recommended: { type: "string" }, targetCPA: { type: "string" }, targetROAS: { type: "string" } }, required: ["current", "recommended", "targetCPA", "targetROAS"], additionalProperties: false },
                summary: { type: "string" },
              },
              required: ["campaignStructure", "assetQuality", "audienceSignals", "bidStrategy", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "notification",
      title: "PMax Audit Complete",
      description: "Google Ads Performance Max optimization report ready",
      input: {
        title: "Google Ads PMax Audit Complete",
        message: "Performance Max campaign audit complete. Asset quality scores, audience signal recommendations, and bid strategy optimizations are ready for review.",
        agentType: "social",
        notificationType: "info",
        notifyOwner: true,
      },
    },
  ];
});

// ─── 13. Twitter/X Stream Monitor ────────────────────────────────────────────

registerWorkflow("twitter_stream_monitor", (input): WorkflowStepDefinition[] => {
  const brandName = input.brandName ?? "our brand";
  const keywords = input.keywords ?? [brandName];
  return [
    {
      stepType: "analysis",
      title: "Brand Mention Analysis",
      description: `Analyzing Twitter/X mentions and sentiment for "${brandName}"`,
      input: {
        analysisPrompt: `Analyze Twitter/X brand mentions and sentiment:

Keywords monitored: ${keywords.join(", ")}

1. Mention Volume:
   - Total mentions in last 24h / 7d / 30d
   - Mention velocity (mentions per hour)
   - Peak mention times

2. Sentiment Analysis:
   - Positive mentions (% and examples)
   - Negative mentions (% and examples — prioritize for response)
   - Neutral mentions (% and examples)
   - Sentiment trend over time

3. Influencer Mentions:
   - Accounts with >10K followers mentioning the brand
   - Potential partnership opportunities
   - UGC (user-generated content) worth amplifying

4. Competitive Mentions:
   - Competitor brand mentions in same conversations
   - Comparison tweets (brand vs. competitor)
   - Share of voice analysis

5. Crisis Detection:
   - Sudden spike in negative sentiment
   - Viral complaint threads
   - Media/press mentions
   - Trending hashtags related to brand

6. Response Queue:
   - Unanswered customer questions
   - Complaints requiring immediate response
   - Positive mentions to engage with (like/retweet/reply)`,
        data: { brandName, keywords, platform: "twitter" },
      },
    },
    {
      stepType: "llm_call",
      title: "Engagement Strategy",
      description: "Generating response templates and engagement strategy",
      input: {
        systemPrompt: "You are a social media community manager who excels at brand voice, crisis management, and turning negative sentiment into positive outcomes.",
        userPrompt: `Based on the brand mention analysis, generate an engagement strategy:

1. Response Templates:
   - Positive mention reply (thank + engage)
   - Negative mention reply (acknowledge + resolve)
   - Question reply (helpful + link to resources)
   - Influencer mention reply (personalized + partnership hint)

2. Crisis Response Protocol:
   - Severity levels (1-5)
   - Response time targets per severity
   - Escalation chain
   - Holding statement templates

3. Proactive Engagement:
   - Trending conversations to join
   - Community questions to answer
   - Content ideas from audience feedback

Return as JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "twitter_engagement",
            strict: true,
            schema: {
              type: "object",
              properties: {
                responseTemplates: { type: "array", items: { type: "object", properties: { scenario: { type: "string" }, template: { type: "string" }, tone: { type: "string" } }, required: ["scenario", "template", "tone"], additionalProperties: false } },
                crisisProtocol: { type: "object", properties: { severityLevels: { type: "array", items: { type: "string" } }, responseTimeTargets: { type: "string" }, holdingStatement: { type: "string" } }, required: ["severityLevels", "responseTimeTargets", "holdingStatement"], additionalProperties: false },
                proactiveEngagement: { type: "array", items: { type: "string" } },
                summary: { type: "string" },
              },
              required: ["responseTemplates", "crisisProtocol", "proactiveEngagement", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "notification",
      title: "Brand Monitor Report",
      description: "Twitter/X brand monitoring report ready",
      input: {
        title: "Twitter/X Brand Monitor Report",
        message: `Brand mention analysis for "${brandName}" is complete. Sentiment analysis, response queue, and engagement strategy are ready for review.`,
        agentType: "social",
        notificationType: "info",
        notifyOwner: true,
      },
    },
  ];
});
