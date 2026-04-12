/**
 * The Hype-Man Agent — Workflow Definitions
 * 
 * Workflows:
 * 1. ad_campaign — Full ad campaign creation (copy + creatives + targeting)
 * 2. social_content — Social media content calendar generation and scheduling
 * 3. seo_audit — Full SEO audit with keyword research and content recommendations
 * 4. email_flow — Automated email campaign flow (welcome, abandoned cart, win-back)
 * 5. product_creative — AI-generated product images and ad creatives
 * 6. brand_content — Brand storytelling content generation
 */

import { registerWorkflow, type WorkflowStepDefinition } from "./workflowEngine";

// ─── Ad Campaign Workflow ──────────────────────────────────────────────────

registerWorkflow("ad_campaign", (input): WorkflowStepDefinition[] => {
  const platform = input.platform ?? "meta"; // meta, tiktok, google
  const product = input.product ?? "featured product";
  const budget = input.budget ?? "$50/day";
  return [
    {
      stepType: "llm_call",
      title: "Audience Research",
      description: `Researching target audience for ${product} on ${platform}`,
      input: {
        systemPrompt: "You are a performance marketing expert who has managed $100M+ in ad spend across Meta, TikTok, and Google Ads.",
        userPrompt: `Create a detailed target audience profile for advertising "${product}" on ${platform}:

1. Primary Audience Segments (3-5 segments with demographics, interests, behaviors)
2. Lookalike Audience Strategy
3. Retargeting Segments (website visitors, cart abandoners, past buyers)
4. Exclusion Lists (who NOT to target)
5. Geographic Targeting Recommendations
6. Device & Placement Optimization
7. Estimated CPM and CPA for each segment

Budget: ${budget}

Return as JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "audience_research",
            strict: true,
            schema: {
              type: "object",
              properties: {
                primarySegments: { type: "array", items: { type: "object", properties: { name: { type: "string" }, demographics: { type: "string" }, interests: { type: "array", items: { type: "string" } }, estimatedSize: { type: "string" }, estimatedCPM: { type: "string" } }, required: ["name", "demographics", "interests", "estimatedSize", "estimatedCPM"], additionalProperties: false } },
                retargetingStrategy: { type: "string" },
                exclusions: { type: "array", items: { type: "string" } },
                geoTargeting: { type: "array", items: { type: "string" } },
                placementStrategy: { type: "string" },
                budgetAllocation: { type: "string" },
              },
              required: ["primarySegments", "retargetingStrategy", "exclusions", "geoTargeting", "placementStrategy", "budgetAllocation"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "llm_call",
      title: "Ad Copy Generation",
      description: "Writing high-converting ad copy variations",
      input: {
        systemPrompt: "You are an elite direct-response copywriter. Your ads have generated millions in revenue. Write scroll-stopping copy.",
        userPrompt: `Generate 5 ad copy variations for "${product}" on ${platform}. For each variation include:
- Hook (first line that stops the scroll)
- Body copy (2-3 lines)
- Call-to-action
- Headline
- Description
- Ad format (single image, carousel, video script)

Variations should test different angles:
1. Problem-Solution
2. Social Proof / FOMO
3. Benefit-Led
4. Story-Based
5. Urgency / Scarcity

Return as JSON array.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "ad_copy",
            strict: true,
            schema: {
              type: "object",
              properties: {
                variations: { type: "array", items: { type: "object", properties: { angle: { type: "string" }, hook: { type: "string" }, body: { type: "string" }, cta: { type: "string" }, headline: { type: "string" }, description: { type: "string" }, format: { type: "string" } }, required: ["angle", "hook", "body", "cta", "headline", "description", "format"], additionalProperties: false } },
              },
              required: ["variations"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "image_generation",
      title: "Generate Ad Creative",
      description: "Creating a professional ad creative image",
      input: {
        prompt: `Professional e-commerce advertisement creative for ${product}, eye-catching design, vibrant colors, clean layout, suitable for ${platform} ads, product-focused, lifestyle setting, high-quality commercial photography style`,
      },
    },
    {
      stepType: "approval_gate",
      title: "Review Ad Campaign",
      description: "Review audience targeting, ad copy, and creative before launching",
      requiresApproval: true,
    },
    {
      stepType: "notification",
      title: "Campaign Ready",
      description: "Ad campaign is ready for launch",
      input: {
        title: `Ad Campaign Ready: ${product}`,
        message: `The Hype-Man has created a complete ${platform} ad campaign for "${product}" with 5 copy variations and AI-generated creative. Ready for launch!`,
        agentType: "hypeman",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// ─── Social Content Calendar Workflow ──────────────────────────────────────

registerWorkflow("social_content", (input): WorkflowStepDefinition[] => {
  const platforms = input.platforms ?? ["instagram", "tiktok", "twitter"];
  const duration = input.duration ?? "7 days";
  const brand = input.brand ?? "our brand";
  return [
    {
      stepType: "llm_call",
      title: "Content Strategy",
      description: `Creating ${duration} content strategy for ${platforms.join(", ")}`,
      input: {
        systemPrompt: "You are a social media strategist who has grown brands from 0 to 1M+ followers. You understand virality, engagement, and platform-specific best practices.",
        userPrompt: `Create a ${duration} social media content calendar for "${brand}" across ${platforms.join(", ")}:

For each day, provide:
1. Platform
2. Content type (reel, carousel, story, tweet, etc.)
3. Topic/theme
4. Caption (platform-optimized)
5. Hashtags (10-15 relevant hashtags)
6. Best posting time
7. Engagement strategy (CTA, question, poll, etc.)

Content pillars to rotate:
- Product showcases
- Behind-the-scenes
- User-generated content prompts
- Educational/value content
- Trending/timely content
- Community engagement

Return as JSON with a "posts" array.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "content_calendar",
            strict: true,
            schema: {
              type: "object",
              properties: {
                posts: { type: "array", items: { type: "object", properties: { day: { type: "string" }, platform: { type: "string" }, contentType: { type: "string" }, topic: { type: "string" }, caption: { type: "string" }, hashtags: { type: "array", items: { type: "string" } }, postingTime: { type: "string" }, engagementStrategy: { type: "string" } }, required: ["day", "platform", "contentType", "topic", "caption", "hashtags", "postingTime", "engagementStrategy"], additionalProperties: false } },
                strategy: { type: "string" },
              },
              required: ["posts", "strategy"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "image_generation",
      title: "Generate Social Media Visual",
      description: "Creating a branded social media post image",
      input: {
        prompt: `Professional social media post image for ${brand}, modern aesthetic, Instagram-worthy, vibrant and engaging, lifestyle product photography, clean composition`,
      },
    },
    {
      stepType: "notification",
      title: "Content Calendar Ready",
      description: "Social media content plan is ready for review",
      input: {
        title: `Content Calendar Ready: ${duration}`,
        message: `The Hype-Man has created a ${duration} content calendar for ${platforms.join(", ")}. Review and approve the posts.`,
        agentType: "hypeman",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// ─── SEO Audit Workflow ────────────────────────────────────────────────────

registerWorkflow("seo_audit", (input): WorkflowStepDefinition[] => {
  const domain = input.domain ?? "the store";
  const niche = input.niche ?? "e-commerce";
  return [
    {
      stepType: "llm_call",
      title: "Keyword Research",
      description: `Researching high-value keywords for ${niche}`,
      input: {
        systemPrompt: "You are an SEO expert who has ranked hundreds of e-commerce stores on page 1 of Google. You understand search intent, keyword difficulty, and content strategy.",
        userPrompt: `Conduct comprehensive keyword research for a ${niche} e-commerce store (${domain}):

1. Primary Keywords (10): High-volume, high-intent commercial keywords
2. Long-tail Keywords (20): Lower competition, high conversion intent
3. Question Keywords (10): "How to", "Best", "Where to buy" queries
4. Competitor Keywords (10): Keywords competitors rank for that we should target
5. Content Gap Keywords (10): Keywords with no good content available

For each keyword provide:
- Keyword phrase
- Estimated monthly search volume
- Difficulty score (1-100)
- Search intent (transactional, informational, navigational)
- Recommended content type (product page, blog post, category page, guide)

Return as JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "keyword_research",
            strict: true,
            schema: {
              type: "object",
              properties: {
                primaryKeywords: { type: "array", items: { type: "object", properties: { keyword: { type: "string" }, volume: { type: "string" }, difficulty: { type: "number" }, intent: { type: "string" }, contentType: { type: "string" } }, required: ["keyword", "volume", "difficulty", "intent", "contentType"], additionalProperties: false } },
                longTailKeywords: { type: "array", items: { type: "object", properties: { keyword: { type: "string" }, volume: { type: "string" }, difficulty: { type: "number" }, intent: { type: "string" }, contentType: { type: "string" } }, required: ["keyword", "volume", "difficulty", "intent", "contentType"], additionalProperties: false } },
                questionKeywords: { type: "array", items: { type: "object", properties: { keyword: { type: "string" }, volume: { type: "string" }, difficulty: { type: "number" } }, required: ["keyword", "volume", "difficulty"], additionalProperties: false } },
                contentGaps: { type: "array", items: { type: "string" } },
                strategy: { type: "string" },
              },
              required: ["primaryKeywords", "longTailKeywords", "questionKeywords", "contentGaps", "strategy"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "llm_call",
      title: "On-Page SEO Recommendations",
      description: "Generating page-level optimization recommendations",
      input: {
        systemPrompt: "You are a technical SEO specialist. Provide specific, actionable on-page optimization recommendations.",
        userPrompt: `Based on the keyword research, generate on-page SEO recommendations:

1. Homepage: Title tag, meta description, H1, key content sections
2. Category Pages: Template for optimized category pages
3. Product Pages: Template for optimized product descriptions
4. Blog Content Plan: 10 blog post ideas targeting the researched keywords
5. Internal Linking Strategy
6. Schema Markup Recommendations (Product, Organization, FAQ)
7. Technical SEO Checklist (page speed, mobile, Core Web Vitals)

Provide specific copy examples, not just generic advice.`,
      },
    },
    {
      stepType: "notification",
      title: "SEO Audit Complete",
      description: "Full SEO audit with actionable recommendations",
      input: {
        title: `SEO Audit Complete: ${domain}`,
        message: `The Hype-Man has completed a comprehensive SEO audit with keyword research and on-page optimization recommendations.`,
        agentType: "hypeman",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// ─── Email Flow Workflow ───────────────────────────────────────────────────

registerWorkflow("email_flow", (input): WorkflowStepDefinition[] => {
  const flowType = input.flowType ?? "welcome"; // welcome, abandoned_cart, win_back, post_purchase
  const brand = input.brand ?? "our store";
  return [
    {
      stepType: "llm_call",
      title: `Generate ${flowType} Email Flow`,
      description: `Creating a complete ${flowType} email automation sequence`,
      input: {
        systemPrompt: "You are an email marketing expert specializing in e-commerce. You write emails that drive revenue with 40%+ open rates and 5%+ click rates.",
        userPrompt: `Create a complete ${flowType} email automation flow for "${brand}":

Generate 5 emails in the sequence. For each email provide:
1. Email number and timing (e.g., "Email 1 - Immediately", "Email 2 - 24 hours later")
2. Subject line (A/B test: 2 variations)
3. Preview text
4. Email body (full HTML-ready copy with sections)
5. CTA button text and link placeholder
6. Personalization tokens used
7. Trigger conditions

Also provide:
- Overall flow strategy
- Expected conversion rate
- Recommended segmentation
- A/B testing plan

Return as JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "email_flow",
            strict: true,
            schema: {
              type: "object",
              properties: {
                flowType: { type: "string" },
                strategy: { type: "string" },
                expectedConversionRate: { type: "string" },
                segmentation: { type: "string" },
                emails: { type: "array", items: { type: "object", properties: { emailNumber: { type: "number" }, timing: { type: "string" }, subjectLineA: { type: "string" }, subjectLineB: { type: "string" }, previewText: { type: "string" }, body: { type: "string" }, ctaText: { type: "string" }, personalization: { type: "array", items: { type: "string" } } }, required: ["emailNumber", "timing", "subjectLineA", "subjectLineB", "previewText", "body", "ctaText", "personalization"], additionalProperties: false } },
                abTestPlan: { type: "string" },
              },
              required: ["flowType", "strategy", "expectedConversionRate", "segmentation", "emails", "abTestPlan"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "approval_gate",
      title: "Review Email Flow",
      description: `Review the ${flowType} email sequence before activation`,
      requiresApproval: true,
    },
    {
      stepType: "notification",
      title: "Email Flow Ready",
      description: "Email automation sequence is ready for activation",
      input: {
        title: `Email Flow Ready: ${flowType}`,
        message: `The Hype-Man has created a complete ${flowType} email flow with 5 emails. Review and approve to activate.`,
        agentType: "hypeman",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// ─── Product Creative Workflow ─────────────────────────────────────────────

registerWorkflow("product_creative", (input): WorkflowStepDefinition[] => {
  const product = input.product ?? "product";
  const style = input.style ?? "professional product photography";
  return [
    {
      stepType: "llm_call",
      title: "Creative Brief",
      description: `Generating creative brief for ${product}`,
      input: {
        systemPrompt: "You are a creative director for e-commerce brands. Generate detailed image prompts that result in scroll-stopping visuals.",
        userPrompt: `Create a creative brief for "${product}" product images. Generate 3 image concepts:

1. Hero Product Shot: Clean, professional, white/lifestyle background
2. Lifestyle Shot: Product in use, aspirational setting
3. Ad Creative: Eye-catching, designed for social media ads

For each concept provide:
- Detailed image generation prompt (50+ words, specific about lighting, composition, mood)
- Recommended dimensions
- Use case (product page, social media, ad)

Return as JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "creative_brief",
            strict: true,
            schema: {
              type: "object",
              properties: {
                concepts: { type: "array", items: { type: "object", properties: { name: { type: "string" }, imagePrompt: { type: "string" }, dimensions: { type: "string" }, useCase: { type: "string" } }, required: ["name", "imagePrompt", "dimensions", "useCase"], additionalProperties: false } },
              },
              required: ["concepts"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "image_generation",
      title: "Generate Hero Product Image",
      description: "Creating the hero product shot",
      input: {
        prompt: `Professional e-commerce product photography of ${product}, ${style}, studio lighting, clean white background, high resolution, commercial quality, sharp focus`,
      },
    },
    {
      stepType: "image_generation",
      title: "Generate Lifestyle Image",
      description: "Creating a lifestyle product image",
      input: {
        prompt: `Lifestyle product photography of ${product}, in a modern aspirational setting, natural lighting, warm tones, Instagram-worthy composition, editorial quality`,
      },
    },
    {
      stepType: "image_generation",
      title: "Generate Ad Creative",
      description: "Creating an eye-catching ad creative",
      input: {
        prompt: `Eye-catching social media advertisement for ${product}, vibrant colors, bold composition, designed for mobile viewing, scroll-stopping visual, modern e-commerce aesthetic`,
      },
    },
    {
      stepType: "notification",
      title: "Creatives Ready",
      description: "Product images and ad creatives generated",
      input: {
        title: `Product Creatives Ready: ${product}`,
        message: `The Hype-Man has generated 3 professional images for "${product}" — hero shot, lifestyle, and ad creative.`,
        agentType: "hypeman",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});

// ─── Brand Content Workflow ────────────────────────────────────────────────

registerWorkflow("brand_content", (input): WorkflowStepDefinition[] => {
  const brand = input.brand ?? "our brand";
  const topic = input.topic ?? "brand story";
  return [
    {
      stepType: "llm_call",
      title: "Content Generation",
      description: `Creating ${topic} content for ${brand}`,
      input: {
        systemPrompt: "You are a brand storyteller and content strategist. You write content that builds emotional connections with customers and drives brand loyalty.",
        userPrompt: `Generate comprehensive brand content for "${brand}" on the topic "${topic}":

1. Long-form Blog Post (800-1200 words): SEO-optimized, engaging, with clear structure
2. Social Media Snippets: 5 short-form posts extracted from the blog content
3. Email Newsletter Version: Condensed version suitable for email
4. Product Description Enhancement: How to weave this story into product pages

Ensure all content:
- Has a consistent brand voice
- Includes relevant keywords naturally
- Has clear CTAs
- Tells a compelling story

Return as JSON.`,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "brand_content",
            strict: true,
            schema: {
              type: "object",
              properties: {
                blogPost: { type: "object", properties: { title: { type: "string" }, metaDescription: { type: "string" }, content: { type: "string" }, keywords: { type: "array", items: { type: "string" } } }, required: ["title", "metaDescription", "content", "keywords"], additionalProperties: false },
                socialSnippets: { type: "array", items: { type: "object", properties: { platform: { type: "string" }, text: { type: "string" }, hashtags: { type: "array", items: { type: "string" } } }, required: ["platform", "text", "hashtags"], additionalProperties: false } },
                emailVersion: { type: "object", properties: { subject: { type: "string" }, body: { type: "string" } }, required: ["subject", "body"], additionalProperties: false },
                productDescriptionTips: { type: "string" },
              },
              required: ["blogPost", "socialSnippets", "emailVersion", "productDescriptionTips"],
              additionalProperties: false,
            },
          },
        },
      },
    },
    {
      stepType: "notification",
      title: "Brand Content Ready",
      description: "Brand content package generated",
      input: {
        title: `Brand Content Ready: ${topic}`,
        message: `The Hype-Man has created a complete content package for "${topic}" — blog post, social snippets, email version, and product description tips.`,
        agentType: "hypeman",
        notificationType: "success",
        notifyOwner: true,
      },
    },
  ];
});
