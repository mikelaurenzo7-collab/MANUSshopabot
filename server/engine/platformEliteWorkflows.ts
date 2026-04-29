/**
 * Shop_a_Bot — Platform-Specific Elite Workflows
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

// ─── Sprint 27 Platform Elite Workflows ────────────────────────────────────
//
// One workflow per new surface, each exploiting the single highest-
// leverage capability of that platform. The Builder + Merchant bot
// dispatchers pick these up through the same workflow registry as the
// existing 13 elite recipes — `getEcommerceCapabilityMatrix()[platform]`
// drives the selection.

// 14. Depop Hashtag Refresh — refresh stale hashtags after trend shifts.
registerWorkflow("depop_hashtag_refresh", (input): WorkflowStepDefinition[] => {
  const storeId = input.storeId ?? "all";
  return [
    {
      stepType: "analysis",
      title: "Audit Listing Hashtags",
      description: "Pulling Depop listings + their current hashtag sets",
      input: {
        analysisPrompt: `Audit every active Depop listing on store ${storeId}:
1. Extract the existing hashtag block from each description.
2. Cross-reference against the current top Depop search terms in the listing's category (vintage, y2k, streetwear, etc.).
3. Flag listings with <5 hashtags or hashtags that haven't trended in 90 days.
4. Group findings by listing for the next step.`,
        data: { storeId, platform: "depop" },
      },
    },
    {
      stepType: "llm_call",
      title: "Generate Trend-Matched Hashtag Sets",
      description: "Picking ~10 hashtags per listing matched to current Depop discovery",
      input: {
        systemPrompt: "You are a Depop discovery expert. Hashtags drive 60% of discovery; the right 10 hashtags beat 30 generic ones.",
        userPrompt: `For each flagged listing produce a hashtag set of 8-12 entries that:
- Front-loads the strongest niche tag (e.g. #y2k, #grunge, #vintagedenim)
- Mixes 3 macro tags (>1M results) with 5 micro tags (<100K results) for balance
- Uses brand tags only when authentic to the item
- Skips tags already used elsewhere in the description
Return JSON: { updates: [{ listingId, hashtags: string[] }], rationale: string }`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "depop_hashtag_updates",
            strict: true,
            schema: {
              type: "object",
              properties: {
                updates: { type: "array", items: { type: "object", properties: { listingId: { type: "string" }, hashtags: { type: "array", items: { type: "string" } } }, required: ["listingId", "hashtags"], additionalProperties: false } },
                rationale: { type: "string" },
              },
              required: ["updates", "rationale"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    { stepType: "approval_gate", title: "Approve Hashtag Updates", description: "Review hashtag sets before they overwrite descriptions", requiresApproval: true },
    {
      stepType: "store_action",
      title: "Apply + Refresh Listings",
      description: "Updating descriptions with new hashtags and refreshing each listing for feed bump",
      input: { action: "depop_update_hashtags", storeId, platform: "depop" },
    },
    {
      stepType: "notification",
      title: "Depop Refresh Complete",
      description: "Hashtags applied and listings refreshed",
      input: {
        title: "Depop Hashtag Refresh Complete",
        message: "All flagged listings have refreshed hashtag sets. Watch for impressions to climb over 48 hours; Depop's feed bump fades within 5 days.",
        agentType: "merchant",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// 15. BigCommerce Webhook Bootstrap — sets up the webhook subscriptions a
//      brand-new connection needs so the rest of the engine doesn't poll.
registerWorkflow("bigcommerce_webhook_bootstrap", (input): WorkflowStepDefinition[] => {
  const storeId = input.storeId ?? "all";
  return [
    {
      stepType: "analysis",
      title: "List Existing Webhooks",
      description: "Checking which BigCommerce webhook scopes are already subscribed",
      input: { analysisPrompt: `Enumerate webhooks on BigCommerce store ${storeId} via /v3/hooks. Highlight missing core scopes.`, data: { storeId, platform: "bigcommerce" } },
    },
    {
      stepType: "store_action",
      title: "Subscribe Missing Webhooks",
      description: "Subscribing the platform to order, product, and inventory events",
      input: {
        action: "bigcommerce_subscribe_webhooks",
        storeId,
        platform: "bigcommerce",
        scopes: [
          "store/order/created",
          "store/order/updated",
          "store/order/statusUpdated",
          "store/product/updated",
          "store/inventory/order/updated",
        ],
      },
    },
    {
      stepType: "notification",
      title: "BigCommerce Webhooks Live",
      description: "Webhook subscriptions verified — bot reacts in real-time now",
      input: {
        title: "BigCommerce Webhooks Subscribed",
        message: "Order, product, and inventory events now stream into Shop_a_Bot in real-time. The Merchant bot will react within seconds instead of the previous 5-min poll cycle.",
        agentType: "architect",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// 16. Square Multi-Location Inventory Sync — distinct from Shopify because
//     Square's inventory is per-location, and most Square sellers ship from
//     one warehouse but stock retail outlets too.
registerWorkflow("square_multilocation_sync", (input): WorkflowStepDefinition[] => {
  const storeId = input.storeId ?? "all";
  return [
    {
      stepType: "analysis",
      title: "Pull Square Locations",
      description: "Listing every active Square location and its inventory snapshot",
      input: { analysisPrompt: `For Square store ${storeId} list every ACTIVE location, then pull inventory counts grouped by SKU × location.`, data: { storeId, platform: "square" } },
    },
    {
      stepType: "llm_call",
      title: "Plan Stock Rebalancing",
      description: "Recommending inventory transfers to even out stock across locations",
      input: {
        systemPrompt: "You are an operations expert for multi-location Square merchants. Your job is to balance inventory across retail + warehouse locations using sales velocity as the signal.",
        userPrompt: `Given the per-location inventory map, recommend transfers that:
- Move surplus stock from over-supplied retail locations to the warehouse hub
- Replenish low-stock retail locations from the warehouse
- Never trigger a transfer smaller than 5 units (handling cost > benefit)
- Respect a soft cap of 30 transfers per cycle (operator fatigue)
Return JSON { transfers: [{ sku, fromLocationId, toLocationId, quantity, reason }], summary }`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "square_transfers",
            strict: true,
            schema: {
              type: "object",
              properties: {
                transfers: { type: "array", items: { type: "object", properties: { sku: { type: "string" }, fromLocationId: { type: "string" }, toLocationId: { type: "string" }, quantity: { type: "number" }, reason: { type: "string" } }, required: ["sku", "fromLocationId", "toLocationId", "quantity", "reason"], additionalProperties: false } },
                summary: { type: "string" },
              },
              required: ["transfers", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    { stepType: "approval_gate", title: "Approve Transfers", description: "Operator confirms transfer plan before adjustments are written", requiresApproval: true },
    {
      stepType: "store_action",
      title: "Apply Inventory Adjustments",
      description: "Writing transfer adjustments to Square via the Inventory API",
      input: { action: "square_apply_transfers", storeId, platform: "square" },
    },
    {
      stepType: "notification",
      title: "Square Sync Complete",
      description: "Multi-location inventory rebalanced",
      input: {
        title: "Square Multi-Location Sync Complete",
        message: "Inventory adjustments applied across all active locations. Per-location stock levels now reflect the rebalance plan; the Merchant bot will monitor velocity and re-trigger if drift returns.",
        agentType: "merchant",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// 17. Faire 24h Acknowledgement Watcher — the highest-stakes Faire op:
//     missed acks auto-cancel the order. Runs hourly.
registerWorkflow("faire_ack_watcher", (input): WorkflowStepDefinition[] => {
  const storeId = input.storeId ?? "all";
  return [
    {
      stepType: "analysis",
      title: "Pull Pending Acknowledgements",
      description: "Finding Faire orders inside the 24h acknowledgement window",
      input: { analysisPrompt: `For Faire brand on store ${storeId} fetch every order in NEW state and compute hours-to-deadline. Sort by urgency.`, data: { storeId, platform: "faire" } },
    },
    {
      stepType: "llm_call",
      title: "Compute Realistic Ship Dates",
      description: "Picking expected ship dates that respect actual lead time without over-promising",
      input: {
        systemPrompt: "You are an indie brand fulfillment ops lead. Faire requires acknowledgement within 24h of an order being placed; over-promising on ship date burns retailer trust faster than missing the ack.",
        userPrompt: `For each pending Faire order pick an expected_ship_date that:
- Falls between today + lead_time_days (from supplier metafield) and today + lead_time_days + 3 days of buffer
- Respects weekends and US holidays
- Is conservative enough that >95% of orders ship on or before
Return JSON { acks: [{ orderId, expectedShipDate (ISO date), rationale }], anyAtRisk: boolean }`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "faire_ack_plan",
            strict: true,
            schema: {
              type: "object",
              properties: {
                acks: { type: "array", items: { type: "object", properties: { orderId: { type: "string" }, expectedShipDate: { type: "string" }, rationale: { type: "string" } }, required: ["orderId", "expectedShipDate", "rationale"], additionalProperties: false } },
                anyAtRisk: { type: "boolean" },
              },
              required: ["acks", "anyAtRisk"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "store_action",
      title: "Acknowledge Orders",
      description: "Acknowledging each order via Faire's processing endpoint",
      input: { action: "faire_acknowledge_orders", storeId, platform: "faire" },
    },
    {
      stepType: "notification",
      title: "Faire Acks Posted",
      description: "Acknowledgement window cleared",
      input: {
        title: "Faire Order Acknowledgements Sent",
        message: "All NEW Faire orders acknowledged with realistic ship dates. The Merchant bot will re-check the queue every hour; orders within 6h of the deadline trigger an immediate alert.",
        agentType: "merchant",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// 18. Bonanza Syndication Tier Optimizer — Bonanza monetizes via Google
//     Shopping syndication tiers; the right tier per item depends on
//     margin × velocity. This workflow tunes the tier per product.
registerWorkflow("bonanza_syndication_optimizer", (input): WorkflowStepDefinition[] => {
  const storeId = input.storeId ?? "all";
  return [
    {
      stepType: "analysis",
      title: "Score Listings by Margin × Velocity",
      description: "Pulling each Bonanza listing's recent velocity, margin, and current syndication tier",
      input: { analysisPrompt: `For Bonanza booth on store ${storeId} score each listing on margin% and 30-day sell-through rate. Recommend a tier for each.`, data: { storeId, platform: "bonanza" } },
    },
    {
      stepType: "llm_call",
      title: "Pick Tier Per Listing",
      description: "Cost-aware tier picker — TurboTraffic only when ROAS clears the higher fee",
      input: {
        systemPrompt: "You are a marketplace economics expert. Bonanza syndication tiers (Standard / Basic / Premium / TurboTraffic / PremiumPlus) trade Google Shopping reach for a higher final-value fee. Your job is to pick the tier that maximizes contribution margin.",
        userPrompt: `Given each listing's margin% and 30-day units sold, pick a tier:
- TurboTraffic: only when margin >50% AND velocity >5 units/30d
- Premium / PremiumPlus: margin 30-50% AND velocity >2/30d
- Basic / Standard: low-velocity items where the higher fee never pays for itself
Return JSON { decisions: [{ productId, tier, expectedROAS, reasoning }], summary }`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "bonanza_tier_decisions",
            strict: true,
            schema: {
              type: "object",
              properties: {
                decisions: { type: "array", items: { type: "object", properties: { productId: { type: "string" }, tier: { type: "string" }, expectedROAS: { type: "number" }, reasoning: { type: "string" } }, required: ["productId", "tier", "expectedROAS", "reasoning"], additionalProperties: false } },
                summary: { type: "string" },
              },
              required: ["decisions", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    { stepType: "approval_gate", title: "Approve Tier Changes", description: "Operator confirms tier moves before fees change", requiresApproval: true },
    {
      stepType: "store_action",
      title: "Apply Tier Changes",
      description: "Writing tier updates via Bonapitit revise_item",
      input: { action: "bonanza_set_tiers", storeId, platform: "bonanza" },
    },
    {
      stepType: "notification",
      title: "Bonanza Tiers Optimized",
      description: "Syndication tiers updated; ROAS visible in 7-14 days",
      input: {
        title: "Bonanza Syndication Tiers Updated",
        message: "Per-listing syndication tiers have been re-tuned to maximize contribution margin. Expect to see Google Shopping impression shifts inside 7 days; the optimizer will re-run weekly.",
        agentType: "merchant",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// 19. StockX Ask Repricer — read the order book, decide whether to undercut
//     the lowest ask or hold, never breach a margin floor.
registerWorkflow("stockx_ask_repricer", (input): WorkflowStepDefinition[] => {
  const storeId = input.storeId ?? "all";
  return [
    {
      stepType: "analysis",
      title: "Pull Live Order Books",
      description: "Reading the bid/ask order book for every active StockX listing",
      input: { analysisPrompt: `For every active StockX ask on store ${storeId} fetch the live order book — lowest 5 asks, highest 5 bids — for each productId × variantId.`, data: { storeId, platform: "stockx" } },
    },
    {
      stepType: "llm_call",
      title: "Decide Undercut / Hold / Raise",
      description: "Margin-aware repricer — never breaches the cost+12% floor",
      input: {
        systemPrompt: "You are a StockX seller doing real-time order-book repricing. The job: maximize the chance of selling within 7 days WITHOUT breaching the supplier_cost × 1.12 floor (StockX takes ~10% transaction + ~3% payment).",
        userPrompt: `For each ask compute the optimal action:
- If we already hold the lowest ask, hold.
- If lowest ask < ours by ≤$5, undercut by $1 (only if floor allows).
- If lowest ask < ours by >$5 AND highest bid > our floor, undercut to highest_bid+$1 (instant sale).
- If our cost floor is above the lowest ask, raise to floor and accept slower turnover.
Return JSON { decisions: [{ listingId, action: "undercut"|"hold"|"raise"|"cancel", newAskCents?, reasoning }], summary }`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "stockx_repricer",
            strict: true,
            schema: {
              type: "object",
              properties: {
                decisions: { type: "array", items: { type: "object", properties: { listingId: { type: "string" }, action: { type: "string" }, newAskCents: { type: "number" }, reasoning: { type: "string" } }, required: ["listingId", "action", "reasoning"], additionalProperties: false } },
                summary: { type: "string" },
              },
              required: ["decisions", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "store_action",
      title: "Apply Ask Updates",
      description: "Writing new asks via the StockX selling/listings PATCH",
      input: { action: "stockx_apply_repricing", storeId, platform: "stockx" },
    },
    {
      stepType: "notification",
      title: "StockX Asks Repriced",
      description: "Margin-aware repricing complete",
      input: {
        title: "StockX Repricing Complete",
        message: "Active asks have been repriced based on the live order book. The repricer respects the cost+12% margin floor; cancelled asks were below floor and moved to draft for re-review.",
        agentType: "merchant",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// 20. Reverb Offer Auto-Responder — auto-handle lowball offers within
//     guardrails, escalate the rest to the operator.
registerWorkflow("reverb_offer_responder", (input): WorkflowStepDefinition[] => {
  const storeId = input.storeId ?? "all";
  return [
    {
      stepType: "analysis",
      title: "Pull Open Offers",
      description: "Listing every open Reverb offer with its proposed amount and the listing's asking price",
      input: { analysisPrompt: `For Reverb shop on store ${storeId} list every offer in OPEN state. Compute (offer_amount / listing_price) and tag as lowball (<70%), reasonable (70-90%), or strong (>=90%).`, data: { storeId, platform: "reverb" } },
    },
    {
      stepType: "llm_call",
      title: "Decide Per-Offer Action",
      description: "Decline lowballs, accept strong offers above floor, counter the middle band",
      input: {
        systemPrompt: "You are a Reverb seller-side negotiator. You honor the gear's market value but never breach the operator's stated margin floor. Lowballs get a polite decline + counter-anchor.",
        userPrompt: `For each offer pick:
- ACCEPT when offer_amount ≥ floor AND ratio ≥ 0.92
- COUNTER when ratio is 0.70-0.92, countering at floor + 10% (or listing_price × 0.95, whichever is lower)
- DECLINE when ratio < 0.70 (lowball) — NEVER counter, just decline
Return JSON { responses: [{ offerId, action: "accept"|"decline"|"counter", counterCents?, message }], summary }`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "reverb_offer_responses",
            strict: true,
            schema: {
              type: "object",
              properties: {
                responses: { type: "array", items: { type: "object", properties: { offerId: { type: "string" }, action: { type: "string" }, counterCents: { type: "number" }, message: { type: "string" } }, required: ["offerId", "action", "message"], additionalProperties: false } },
                summary: { type: "string" },
              },
              required: ["responses", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "store_action",
      title: "Send Responses",
      description: "Posting accept/decline/counter via Reverb's offers API",
      input: { action: "reverb_respond_offers", storeId, platform: "reverb" },
    },
    {
      stepType: "notification",
      title: "Reverb Offers Handled",
      description: "Open offers cleared",
      input: {
        title: "Reverb Offer Auto-Responder Complete",
        message: "Open offers have been triaged. Strong offers were accepted automatically; mid-range offers received margin-aware counters; lowballs were declined politely. Watch the Inbox for human-escalation cases.",
        agentType: "merchant",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});
