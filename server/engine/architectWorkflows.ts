/**
 * The Architect Agent — Workflow Definitions
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
        systemPrompt: `You are a world-class e-commerce market researcher. You analyze niches with the precision of a McKinsey consultant and the creativity of a top Shopify merchant. Return your analysis as structured JSON.`,
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
3. A recommended differentiation strategy
4. Estimated time-to-market for a new store in this niche
Format as actionable recommendations.`,
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
