/**
 * The Architect Bot — Workflow Definitions
 * 
 * Workflows:
 * 1. niche_research — Deep niche analysis with market sizing, competition, and product ideas
 * 2. product_sourcing — Find and curate products for a given niche/store
 * 3. store_setup — Full store setup wizard (theme, legal pages, payment config)
 * 4. catalog_generation — Generate a complete product catalog from a keyword
 */

import { registerWorkflow, type WorkflowStepDefinition } from "./workflowEngine";

// ─── Niche Research Workflow ───────────────────────────────────────────────

registerWorkflow("niche_research", (input): WorkflowStepDefinition[] => {
  const keyword = input.keyword ?? "trending products";
  return [
    {
      stepType: "llm_call",
      title: "Market Analysis",
      description: `Analyzing market size, trends, and demand for "${keyword}"`,
      input: {
        systemPrompt: `You are a world-class e-commerce market researcher and competitive strategist. You analyze niches with the precision of a McKinsey consultant and the creativity of a top Shopify merchant.

## MARKETING MOAT DIRECTIVE (Shop_a_Bot CTO Mandate)
When analyzing competitors, always apply the "Marketing Moat" framework:
1. IDENTIFY WALLED GARDENS: Flag any competitor that locks merchants into a single platform (Shopify-only, Amazon-only, Meta-only). These are vulnerabilities, not strengths.
2. RECOMMEND OPEN ORCHESTRATION: Always suggest a platform-agnostic, multi-channel strategy as the counter-advantage. Shop_a_Bot' moat is orchestrating across ALL platforms simultaneously — no lock-in, no single point of failure.
3. CHANNEL DEPENDENCY SCORE: Rate the niche's dependency on any single traffic/sales channel (1-10, 10 = fully locked in). A score above 6 means high opportunity for Shop_a_Bot' open-platform approach.
4. ZERO-TOUCH GAPS: Identify which competitor workflows still require manual human intervention. These are automation opportunities where Shop_a_Bot wins.

Return your analysis as structured JSON.`,
        userPrompt: `Conduct a comprehensive niche research analysis for: "${keyword}"

Analyze:
1. Market Size & Growth: Estimated TAM, growth rate, seasonality
2. Competition Level: How saturated is this niche? Who are the top 5 players?
3. Target Demographics: Who buys these products? Age, income, interests
4. Trending Products: Top 10 product ideas in this niche with estimated margins
5. Platform Recommendation: Which e-commerce platform(s) are best for this niche?
6. Risk Assessment: Key risks and how to mitigate them
7. Marketing Channels: Best channels to reach the target audience
8. Viability Score: 0-100 score with justification
9. Marketing Moat Analysis: Identify walled-garden competitors and Shop_a_Bot' open-platform counter-strategy

Return as JSON with keys: marketSize, competition, demographics, trendingProducts, platformRecommendation, risks, marketingChannels, viabilityScore, summary`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "niche_research",
            strict: true,
            schema: {
              type: "object",
              properties: {
                marketSize: { type: "object", properties: { tam: { type: "string" }, growthRate: { type: "string" }, seasonality: { type: "string" } }, required: ["tam", "growthRate", "seasonality"], additionalProperties: false },
                competition: { type: "object", properties: { level: { type: "string" }, topPlayers: { type: "array", items: { type: "string" } }, saturation: { type: "string" } }, required: ["level", "topPlayers", "saturation"], additionalProperties: false },
                demographics: { type: "object", properties: { ageRange: { type: "string" }, income: { type: "string" }, interests: { type: "array", items: { type: "string" } } }, required: ["ageRange", "income", "interests"], additionalProperties: false },
                trendingProducts: { type: "array", items: { type: "object", properties: { name: { type: "string" }, estimatedMargin: { type: "string" }, demandLevel: { type: "string" } }, required: ["name", "estimatedMargin", "demandLevel"], additionalProperties: false } },
                platformRecommendation: { type: "array", items: { type: "string" } },
                risks: { type: "array", items: { type: "object", properties: { risk: { type: "string" }, mitigation: { type: "string" } }, required: ["risk", "mitigation"], additionalProperties: false } },
                marketingChannels: { type: "array", items: { type: "string" } },
                viabilityScore: { type: "number" },
                summary: { type: "string" },
              },
              required: ["marketSize", "competition", "demographics", "trendingProducts", "platformRecommendation", "risks", "marketingChannels", "viabilityScore", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "analysis",
      title: "Competitive Intelligence",
      description: "Analyzing competitor strategies and identifying market gaps",
      input: {
        analysisPrompt: `Based on the niche research above, identify:
1. The top 3 underserved sub-niches with the highest profit potential
2. Specific product gaps that competitors are missing
3. A recommended differentiation strategy using Shop_a_Bot' open-platform advantage
4. Estimated time-to-market for a new store in this niche
5. MARKETING MOAT OPPORTUNITY: Which competitors are most locked into a single platform? How does Shop_a_Bot' multi-channel orchestration create an unfair advantage here?
6. ZERO-TOUCH GAPS: Which manual steps in this niche can Shop_a_Bot fully automate that competitors cannot?
Format as actionable recommendations with specific ShopBot counter-strategies.`,
      },
    },
    {
      stepType: "llm_call",
      title: "Product Recommendations",
      description: "Generating specific product recommendations with pricing strategy",
      input: {
        systemPrompt: "You are an expert product sourcer for e-commerce. Generate specific, actionable product recommendations with realistic pricing.",
        userPrompt: `Based on the niche research and competitive analysis, recommend 10 specific products to sell. For each product include:
- Product name and description
- Suggested retail price (USD)
- Estimated cost/sourcing price
- Expected profit margin
- Recommended supplier type (AliExpress, domestic wholesale, print-on-demand, etc.)
- Why this product will sell well in this niche

Format as a detailed product catalog.`,
      },
    },
    {
      stepType: "notification",
      title: "Report Complete",
      description: "Notifying user that niche research is complete",
      input: {
        title: `Niche Research Complete: ${keyword}`,
        message: `The Architect has completed a comprehensive niche analysis for "${keyword}". Review the full report in your dashboard.`,
        agentType: "architect",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// ─── Product Sourcing Workflow ─────────────────────────────────────────────

registerWorkflow("product_sourcing", (input): WorkflowStepDefinition[] => {
  const niche = input.niche ?? "general";
  const targetProducts = input.targetProducts ?? 10;
  return [
    {
      stepType: "llm_call",
      title: "Product Discovery",
      description: `Finding ${targetProducts} winning products for ${niche}`,
      input: {
        systemPrompt: "You are a top-tier product sourcing specialist. You find winning products that generate 40%+ margins.",
        userPrompt: `Find ${targetProducts} winning products for the "${niche}" niche. For each product provide:
- Product name
- Detailed description (50-100 words, optimized for e-commerce)
- Suggested retail price in cents (USD)
- Estimated cost price in cents
- SKU suggestion
- Category
- Recommended supplier (AliExpress, Zendrop, Printful, etc.)
- Supplier URL placeholder
- Why this product is a winner

Return as JSON array with keys: title, description, price, costPrice, sku, category, supplier, supplierUrl, rationale`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "product_sourcing",
            strict: true,
            schema: {
              type: "object",
              properties: {
                products: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      price: { type: "number" },
                      costPrice: { type: "number" },
                      sku: { type: "string" },
                      category: { type: "string" },
                      supplier: { type: "string" },
                      supplierUrl: { type: "string" },
                      rationale: { type: "string" },
                    },
                    required: ["title", "description", "price", "costPrice", "sku", "category", "supplier", "supplierUrl", "rationale"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["products"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "approval_gate",
      title: "Review Product Selections",
      description: `Review the ${targetProducts} sourced products before adding them to your store`,
      requiresApproval: true,
    },
    {
      stepType: "image_generation",
      title: "Generate Product Hero Image",
      description: "Creating a professional hero image for the product collection",
      input: {
        prompt: `Professional e-commerce product collection photo for ${niche} products, clean white background, studio lighting, high-end product photography, minimalist aesthetic`,
      },
    },
    {
      stepType: "notification",
      title: "Products Sourced",
      description: "Notifying that product sourcing is complete",
      input: {
        title: `Product Sourcing Complete: ${niche}`,
        message: `The Architect has sourced ${targetProducts} products for your "${niche}" store. Products are ready for review.`,
        agentType: "architect",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// ─── Catalog Generation Workflow ───────────────────────────────────────────

registerWorkflow("catalog_generation", (input): WorkflowStepDefinition[] => {
  const keyword = input.keyword ?? "trending";
  const productCount = input.productCount ?? 15;
  return [
    {
      stepType: "llm_call",
      title: "Generate Product Catalog",
      description: `Creating ${productCount} products for "${keyword}"`,
      input: {
        systemPrompt: "You are an expert e-commerce catalog builder. Generate complete, market-ready product listings.",
        userPrompt: `Generate a complete product catalog of ${productCount} products for the keyword "${keyword}". Each product must include:
- title: Compelling product name
- description: SEO-optimized description (100-200 words)
- price: Retail price in cents (USD)
- costPrice: Wholesale cost in cents
- compareAtPrice: Original/compare price in cents (for showing discounts)
- sku: Unique SKU code
- category: Product category
- supplier: Recommended supplier
- stockLevel: Initial stock quantity (50-500)
- lowStockThreshold: Restock alert threshold

Return as JSON with a "products" array.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "catalog",
            strict: true,
            schema: {
              type: "object",
              properties: {
                products: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      price: { type: "number" },
                      costPrice: { type: "number" },
                      compareAtPrice: { type: "number" },
                      sku: { type: "string" },
                      category: { type: "string" },
                      supplier: { type: "string" },
                      stockLevel: { type: "number" },
                      lowStockThreshold: { type: "number" },
                    },
                    required: ["title", "description", "price", "costPrice", "compareAtPrice", "sku", "category", "supplier", "stockLevel", "lowStockThreshold"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["products"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "approval_gate",
      title: "Approve Product Catalog",
      description: `Review ${productCount} generated products before they are added to your store`,
      requiresApproval: true,
    },
    {
      stepType: "notification",
      title: "Catalog Ready",
      description: "Products generated and ready for store import",
      input: {
        title: `Catalog Generated: ${keyword}`,
        message: `The Architect has generated ${productCount} products for "${keyword}". Review and approve to add them to your store.`,
        agentType: "architect",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// ─── Store Setup Workflow ──────────────────────────────────────────────────

registerWorkflow("store_setup", (input): WorkflowStepDefinition[] => {
  const storeName = input.storeName ?? "My Store";
  const niche = input.niche ?? "general";
  const platform = input.platform ?? "shopify";
  return [
    {
      stepType: "llm_call",
      title: "Brand Identity Generation",
      description: `Creating brand identity for "${storeName}"`,
      input: {
        systemPrompt: "You are a world-class brand strategist and e-commerce consultant.",
        userPrompt: `Create a complete brand identity for an e-commerce store called "${storeName}" in the "${niche}" niche on ${platform}. Include:
1. Brand Story (2-3 paragraphs)
2. Tagline (5-8 words)
3. Color Palette (primary, secondary, accent — hex codes)
4. Typography recommendations
5. Brand Voice & Tone guidelines
6. Target Customer Persona
7. Unique Value Proposition

Return as structured JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "brand_identity",
            strict: true,
            schema: {
              type: "object",
              properties: {
                brandStory: { type: "string" },
                tagline: { type: "string" },
                colorPalette: { type: "object", properties: { primary: { type: "string" }, secondary: { type: "string" }, accent: { type: "string" } }, required: ["primary", "secondary", "accent"], additionalProperties: false },
                typography: { type: "object", properties: { heading: { type: "string" }, body: { type: "string" } }, required: ["heading", "body"], additionalProperties: false },
                brandVoice: { type: "string" },
                targetPersona: { type: "string" },
                valueProposition: { type: "string" },
              },
              required: ["brandStory", "tagline", "colorPalette", "typography", "brandVoice", "targetPersona", "valueProposition"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "image_generation",
      title: "Generate Store Logo",
      description: "Creating a professional logo for the store",
      input: {
        prompt: `Professional minimalist logo for an e-commerce brand called "${storeName}" in the ${niche} niche, clean modern design, suitable for web and print, white background`,
      },
    },
    {
      stepType: "llm_call",
      title: "Generate Legal Pages",
      description: "Creating privacy policy, terms of service, and refund policy",
      input: {
        systemPrompt: "You are a legal copywriter specializing in e-commerce. Generate professional, compliant legal pages.",
        userPrompt: `Generate the following legal pages for "${storeName}" (an online ${niche} store):
1. Privacy Policy
2. Terms of Service
3. Refund & Return Policy
4. Shipping Policy

Each should be professional, comprehensive, and compliant with GDPR and US consumer protection laws. Use [COMPANY NAME], [WEBSITE URL], and [EMAIL] as placeholders.

Return as JSON with keys: privacyPolicy, termsOfService, refundPolicy, shippingPolicy (each as full text).`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "legal_pages",
            strict: true,
            schema: {
              type: "object",
              properties: {
                privacyPolicy: { type: "string" },
                termsOfService: { type: "string" },
                refundPolicy: { type: "string" },
                shippingPolicy: { type: "string" },
              },
              required: ["privacyPolicy", "termsOfService", "refundPolicy", "shippingPolicy"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "approval_gate",
      title: "Review Store Setup",
      description: "Review brand identity, logo, and legal pages before applying to store",
      requiresApproval: true,
    },
    {
      stepType: "notification",
      title: "Store Setup Complete",
      description: "Store is configured and ready for products",
      input: {
        title: `Store Setup Complete: ${storeName}`,
        message: `The Architect has set up "${storeName}" with brand identity, logo, and legal pages. Your store is ready for products!`,
        agentType: "architect",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// ─── Multi-Store Expansion Workflow ──────────────────────────────────────────

registerWorkflow("multi_store_expansion", (input): WorkflowStepDefinition[] => {
  const currentNiche = input.currentNiche ?? "general";
  const targetPlatforms = input.targetPlatforms ?? ["shopify", "etsy", "amazon"];
  return [
    {
      stepType: "llm_call",
      title: "Cross-Platform Opportunity Analysis",
      description: `Analyzing expansion opportunities for "${currentNiche}" across ${targetPlatforms.join(", ")}`,
      input: {
        systemPrompt: "You are a multi-channel e-commerce strategist who has scaled brands from single-platform to omnichannel empires generating $10M+ annually.",
        userPrompt: `Analyze multi-store expansion opportunities for the "${currentNiche}" niche across these platforms: ${targetPlatforms.join(", ")}

For each platform, provide:
1. Platform Fit Score (0-100): How well does this niche perform on this platform?
2. Audience Overlap: How much audience overlap exists with current stores?
3. Revenue Potential: Estimated monthly revenue within 6 months
4. Setup Complexity: Time and cost to launch
5. Unique Advantages: Platform-specific features that benefit this niche
6. Listing Strategy: How to adapt products for each platform's algorithm
7. Pricing Strategy: Platform-specific pricing adjustments (fees, competition)
8. Risk Assessment: Key risks and mitigations per platform

Also provide:
- Recommended launch order (which platform first, second, etc.)
- Cross-platform synergy opportunities
- Unified inventory management strategy
- Total estimated investment needed

Return as JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "multi_store_expansion",
            strict: true,
            schema: {
              type: "object",
              properties: {
                platformAnalysis: { type: "array", items: { type: "object", properties: { platform: { type: "string" }, fitScore: { type: "number" }, audienceOverlap: { type: "string" }, revenuePotential: { type: "string" }, setupComplexity: { type: "string" }, advantages: { type: "array", items: { type: "string" } }, listingStrategy: { type: "string" }, pricingStrategy: { type: "string" }, risks: { type: "array", items: { type: "string" } } }, required: ["platform", "fitScore", "audienceOverlap", "revenuePotential", "setupComplexity", "advantages", "listingStrategy", "pricingStrategy", "risks"], additionalProperties: false } },
                launchOrder: { type: "array", items: { type: "string" } },
                synergyOpportunities: { type: "array", items: { type: "string" } },
                inventoryStrategy: { type: "string" },
                totalInvestment: { type: "string" },
                summary: { type: "string" },
              },
              required: ["platformAnalysis", "launchOrder", "synergyOpportunities", "inventoryStrategy", "totalInvestment", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "llm_call",
      title: "Platform-Specific Product Adaptations",
      description: "Generating optimized product listings for each target platform",
      input: {
        systemPrompt: "You are a product listing optimization expert across all major e-commerce platforms. You understand each platform's algorithm, search behavior, and buyer psychology.",
        userPrompt: `For the "${currentNiche}" niche, generate platform-specific product listing templates for ${targetPlatforms.join(", ")}:

For each platform provide:
- Title format (with character limits and keyword placement)
- Description template (platform-specific formatting)
- Bullet points / key features format
- Pricing strategy (accounting for platform fees)
- Category/tag recommendations
- Image requirements and recommendations
- SEO/search optimization tips specific to that platform

Return as JSON with a "platformTemplates" array.`,
      },
    },
    {
      stepType: "approval_gate",
      title: "Review Expansion Plan",
      description: "Review the multi-platform expansion strategy before execution",
      requiresApproval: true,
    },
    {
      stepType: "notification",
      title: "Expansion Plan Ready",
      description: "Multi-store expansion analysis complete",
      input: {
        title: `Multi-Store Expansion Plan: ${currentNiche}`,
        message: `The Architect has analyzed expansion opportunities across ${targetPlatforms.join(", ")} for your "${currentNiche}" niche. Review the strategy and launch order.`,
        agentType: "architect",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// ─── Brand Audit Workflow ────────────────────────────────────────────────────

registerWorkflow("brand_audit", (input): WorkflowStepDefinition[] => {
  const storeName = input.storeName ?? "the store";
  const storeUrl = input.storeUrl ?? "";
  return [
    {
      stepType: "llm_call",
      title: "Brand Health Assessment",
      description: `Conducting comprehensive brand audit for "${storeName}"`,
      input: {
        systemPrompt: "You are a brand strategist and UX expert who has audited Fortune 500 e-commerce brands. You identify gaps between brand promise and customer experience.",
        userPrompt: `Conduct a comprehensive brand audit for "${storeName}" (${storeUrl}):

1. Brand Consistency Score (0-100):
   - Visual consistency (logo, colors, typography across touchpoints)
   - Messaging consistency (tone, value props, taglines)
   - Experience consistency (navigation, checkout, packaging)

2. Trust Signals Audit:
   - Reviews/testimonials presence and quality
   - Security badges and certifications
   - Return policy clarity
   - Contact information accessibility
   - Social proof elements

3. Conversion Optimization:
   - Homepage effectiveness (above-the-fold, CTA clarity)
   - Product page optimization (images, descriptions, urgency)
   - Cart/checkout friction points
   - Mobile experience quality

4. Competitive Positioning:
   - How does the brand differentiate?
   - Price-value perception
   - Market positioning (premium, mid-range, value)

5. Customer Journey Gaps:
   - Pre-purchase experience
   - Purchase experience
   - Post-purchase experience
   - Retention/loyalty mechanisms

Return as JSON with detailed scores and specific, actionable recommendations.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "brand_audit",
            strict: true,
            schema: {
              type: "object",
              properties: {
                overallScore: { type: "number" },
                brandConsistency: { type: "object", properties: { score: { type: "number" }, visual: { type: "string" }, messaging: { type: "string" }, experience: { type: "string" } }, required: ["score", "visual", "messaging", "experience"], additionalProperties: false },
                trustSignals: { type: "object", properties: { score: { type: "number" }, findings: { type: "array", items: { type: "string" } }, recommendations: { type: "array", items: { type: "string" } } }, required: ["score", "findings", "recommendations"], additionalProperties: false },
                conversionOptimization: { type: "object", properties: { score: { type: "number" }, findings: { type: "array", items: { type: "string" } }, recommendations: { type: "array", items: { type: "string" } } }, required: ["score", "findings", "recommendations"], additionalProperties: false },
                competitivePositioning: { type: "string" },
                customerJourneyGaps: { type: "array", items: { type: "object", properties: { stage: { type: "string" }, gap: { type: "string" }, fix: { type: "string" } }, required: ["stage", "gap", "fix"], additionalProperties: false } },
                prioritizedActions: { type: "array", items: { type: "object", properties: { action: { type: "string" }, impact: { type: "string" }, effort: { type: "string" }, priority: { type: "number" } }, required: ["action", "impact", "effort", "priority"], additionalProperties: false } },
                summary: { type: "string" },
              },
              required: ["overallScore", "brandConsistency", "trustSignals", "conversionOptimization", "competitivePositioning", "customerJourneyGaps", "prioritizedActions", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "notification",
      title: "Brand Audit Complete",
      description: "Comprehensive brand health report ready",
      input: {
        title: `Brand Audit Complete: ${storeName}`,
        message: `The Architect has completed a comprehensive brand audit for "${storeName}" with actionable recommendations prioritized by impact.`,
        agentType: "architect",
        notificationType: "info",
        notifyOwner: true,
      },
    },
  ];
});

// ─── Product Optimization Workflow ───────────────────────────────────────────

registerWorkflow("product_optimization", (input): WorkflowStepDefinition[] => {
  const storeId = input.storeId ?? 0;
  const optimizationType = input.optimizationType ?? "full";
  return [
    {
      stepType: "llm_call",
      title: "Product Listing Analysis",
      description: "Analyzing all product listings for optimization opportunities",
      input: {
        systemPrompt: "You are an e-commerce conversion rate optimization expert. You've optimized thousands of product listings to increase conversion rates by 30-200%.",
        userPrompt: `Analyze the product catalog and generate optimization recommendations:

1. Title Optimization:
   - Keyword-rich titles following platform best practices
   - A/B test variations for top products
   
2. Description Enhancement:
   - Benefit-focused copy that sells
   - Scannable formatting (bullets, bold, sections)
   - SEO keyword integration
   
3. Pricing Psychology:
   - Charm pricing recommendations
   - Bundle/upsell opportunities
   - Compare-at price strategy
   
4. Image Recommendations:
   - Missing image types per product
   - Image quality issues
   - Lifestyle vs. studio shot balance
   
5. Cross-sell & Upsell Mapping:
   - Product pairing recommendations
   - "Frequently bought together" suggestions
   - Upsell ladder (good → better → best)

6. Dead Product Identification:
   - Products with zero views/sales
   - Seasonal products to archive
   - Products cannibalizing each other

Return as JSON with specific product-level recommendations.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "product_optimization",
            strict: true,
            schema: {
              type: "object",
              properties: {
                titleOptimizations: { type: "array", items: { type: "object", properties: { product: { type: "string" }, currentTitle: { type: "string" }, optimizedTitle: { type: "string" }, reason: { type: "string" } }, required: ["product", "currentTitle", "optimizedTitle", "reason"], additionalProperties: false } },
                descriptionEnhancements: { type: "array", items: { type: "object", properties: { product: { type: "string" }, improvement: { type: "string" }, sampleCopy: { type: "string" } }, required: ["product", "improvement", "sampleCopy"], additionalProperties: false } },
                pricingPsychology: { type: "array", items: { type: "object", properties: { product: { type: "string" }, currentPrice: { type: "string" }, suggestedPrice: { type: "string" }, tactic: { type: "string" } }, required: ["product", "currentPrice", "suggestedPrice", "tactic"], additionalProperties: false } },
                crossSellMap: { type: "array", items: { type: "object", properties: { product: { type: "string" }, pairWith: { type: "array", items: { type: "string" } }, bundleDiscount: { type: "string" } }, required: ["product", "pairWith", "bundleDiscount"], additionalProperties: false } },
                deadProducts: { type: "array", items: { type: "object", properties: { product: { type: "string" }, reason: { type: "string" }, recommendation: { type: "string" } }, required: ["product", "reason", "recommendation"], additionalProperties: false } },
                estimatedRevenueImpact: { type: "string" },
                summary: { type: "string" },
              },
              required: ["titleOptimizations", "descriptionEnhancements", "pricingPsychology", "crossSellMap", "deadProducts", "estimatedRevenueImpact", "summary"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "approval_gate",
      title: "Review Optimizations",
      description: "Review product optimization recommendations before applying changes",
      requiresApproval: true,
    },
    {
      stepType: "notification",
      title: "Product Optimization Complete",
      description: "Product catalog optimization analysis ready",
      input: {
        title: "Product Optimization Complete",
        message: `The Architect has analyzed your entire product catalog and generated optimization recommendations for titles, descriptions, pricing, cross-sells, and dead product cleanup.`,
        agentType: "architect",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});
