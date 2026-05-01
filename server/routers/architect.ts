import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { llmRateLimit, orgProcedure, protectedProcedure, router } from "../_core/trpc";
import { requireStoreInOrg } from "../utils/authz";
import { invokeLLM, parseLLMJson } from "../_core/llm";
import { notifyOwner } from "../_core/notification";
import * as db from "../db";
import { pushProductToStore, syncProductsFromStore } from "../engine/platformBridge";
import { getRenderedStoreContext } from "../utils/userContext";
import axios from "axios";
import { optimizeProductImage } from "../utils/imageOptimizer";
import { safeImageFetch } from "../utils/safeFetch";
import { sanitizeText } from "../utils/sanitize";
import {
  uploadFile,
  visionQuery,
  deleteFile,
  isFilesApiAvailable,
} from "../_core/claudeFiles";

export const architectRouter = router({
  nicheResearch: orgProcedure
    .use(llmRateLimit)
    .input(z.object({
      keyword: z.string().min(1).max(255),
      storeId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.storeId) await requireStoreInOrg(input.storeId, ctx.org.id);
      input = { ...input, keyword: sanitizeText(input.keyword, 255) };
      // Create the report record
      const report = await db.createNicheReport({
        keyword: input.keyword,
        storeId: input.storeId,
        status: "generating",
      });

      // Log agent task
      const task = await db.createAgentTask({
        agentType: "architect",
        taskType: "niche_research",
        title: `Niche research: "${input.keyword}"`,
        description: `Generating comprehensive niche analysis for "${input.keyword}"`,
        status: "running",
        storeId: input.storeId,
      });

      try {
        // Fetch personalised store context for smarter recommendations
        const storeContext = input.storeId ? await getRenderedStoreContext(input.storeId) : "";

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an expert e-commerce niche analyst. Analyze the given niche keyword and provide a comprehensive report. ${storeContext ? "Use the store context below to tailor recommendations to this specific merchant's product mix, price range, and past niche exploration." : ""} Return a JSON object with these fields:
- marketSize: string (estimated market size)
- competition: string (low/medium/high)
- trendDirection: string (growing/stable/declining)
- targetAudience: string (description of ideal customer)
- topProducts: array of {name, estimatedPrice, margin} (top 5 product ideas)
- strengths: array of strings (3-5 strengths)
- risks: array of strings (3-5 risks)
- recommendations: array of strings (3-5 actionable recommendations)
- viabilityScore: number (0-100)
- summary: string (2-3 sentence executive summary)`
            },
            { role: "user", content: `${storeContext ? storeContext + "\n\n" : ""}Analyze this e-commerce niche: "${input.keyword}"` }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "niche_report",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  marketSize: { type: "string" },
                  competition: { type: "string" },
                  trendDirection: { type: "string" },
                  targetAudience: { type: "string" },
                  topProducts: { type: "array", items: { type: "object", properties: { name: { type: "string" }, estimatedPrice: { type: "string" }, margin: { type: "string" } }, required: ["name", "estimatedPrice", "margin"], additionalProperties: false } },
                  strengths: { type: "array", items: { type: "string" } },
                  risks: { type: "array", items: { type: "string" } },
                  recommendations: { type: "array", items: { type: "string" } },
                  viabilityScore: { type: "number" },
                  summary: { type: "string" },
                },
                required: ["marketSize", "competition", "trendDirection", "targetAudience", "topProducts", "strengths", "risks", "recommendations", "viabilityScore", "summary"],
                additionalProperties: false,
              },
            },
          },
        });

        const reportData = parseLLMJson<any>(llmResult.choices[0].message.content, "architect.nicheResearch");
        await db.updateNicheReport(report.id, {
          report: reportData,
          score: reportData.viabilityScore,
          status: "completed",
        });
        await db.updateAgentTask(task.id, { status: "completed", result: reportData });

        await notifyOwner({
          title: "Niche Research Complete",
          content: `The Architect Bot completed niche research for "${input.keyword}" with a viability score of ${reportData.viabilityScore}/100.`,
        });

        return { id: report.id, report: reportData };
      } catch (error) {
        await db.updateNicheReport(report.id, { status: "failed" });
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  nicheReports: orgProcedure
    .input(z.object({ storeId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      if (input?.storeId) await requireStoreInOrg(input.storeId, ctx.org.id);
      return db.getNicheReports(input?.storeId);
    }),

  generateProductCatalog: orgProcedure
    .use(llmRateLimit)
    .input(z.object({
      keyword: z.string().min(1).max(255),
      storeId: z.number(),
      count: z.number().min(1).max(20).default(5),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "architect",
        taskType: "product_catalog",
        title: `Generate ${input.count} products for "${input.keyword}"`,
        description: `AI-generating product catalog for niche: ${input.keyword}`,
        status: "running",
        storeId: input.storeId,
      });

      try {
        // Fetch personalised store context so catalog matches the user's price tier & categories
        const storeContext = await getRenderedStoreContext(input.storeId);

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an expert e-commerce product curator. Generate a product catalog for the given niche. ${storeContext ? "Use the store context below to match the merchant's existing price range, margin targets, and product mix. Suggest complementary products that fill gaps in their current catalog." : ""} Return a JSON object with a "products" array. Each product should have:
- title: string (compelling product name)
- description: string (persuasive 2-3 sentence description)
- price: number (retail price in cents, e.g., 2999 for $29.99)
- costPrice: number (cost price in cents)
- category: string
- sku: string (generated SKU code)
- supplier: string (suggested supplier name)`
            },
            { role: "user", content: `${storeContext ? storeContext + "\n\n" : ""}Generate ${input.count} products for the "${input.keyword}" niche.` }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "product_catalog",
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
                        category: { type: "string" },
                        sku: { type: "string" },
                        supplier: { type: "string" },
                      },
                      required: ["title", "description", "price", "costPrice", "category", "sku", "supplier"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["products"],
                additionalProperties: false,
              },
            },
          },
        });

        const catalogData = parseLLMJson<any>(llmResult.choices[0].message.content, "architect.generateCatalog");
        const createdProducts = [];

        for (const p of catalogData.products) {
          const result = await db.createProduct({
            storeId: input.storeId,
            title: p.title,
            description: p.description,
            price: p.price,
            costPrice: p.costPrice,
            category: p.category,
            sku: p.sku,
            supplier: p.supplier,
            stockLevel: 50,
            status: "draft",
          });
          createdProducts.push({ ...p, id: result.id });
        }

        await db.updateAgentTask(task.id, { status: "completed", result: { productsCreated: createdProducts.length } });

        await notifyOwner({
          title: "Product Catalog Generated",
          content: `The Architect Bot generated ${createdProducts.length} products for the "${input.keyword}" niche.`,
        });

        return { products: createdProducts };
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  // ─── Platform Bridge: Push Products to Store ──────────────────────────
  pushProductToStore: orgProcedure
    .input(z.object({
      storeId: z.number(),
      productId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "architect",
        taskType: "product_push",
        title: `Pushing product #${input.productId} to store #${input.storeId}`,
        description: "Pushing product to connected platform via adapter",
        status: "running",
        storeId: input.storeId,
      });

      try {
        const result = await pushProductToStore(input.storeId, input.productId);
        await db.updateAgentTask(task.id, { status: "completed", result });
        return result;
      } catch (error: any) {
        await db.updateAgentTask(task.id, { status: "failed", result: { error: error.message } });
        throw error;
      }
    }),

  bulkPushProducts: orgProcedure
    .input(z.object({
      storeId: z.number(),
      productIds: z.array(z.number()).max(100),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "architect",
        taskType: "bulk_product_push",
        title: `Bulk pushing ${input.productIds.length} products to store #${input.storeId}`,
        description: `Pushing ${input.productIds.length} AI-generated products to connected platform`,
        status: "running",
        storeId: input.storeId,
      });
      const results: { id: number; success: boolean; error?: string }[] = [];
      for (const productId of input.productIds) {
        try {
          await pushProductToStore(input.storeId, productId);
          results.push({ id: productId, success: true });
        } catch (err: any) {
          results.push({ id: productId, success: false, error: err.message });
        }
      }
      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      await db.updateAgentTask(task.id, {
        status: failed === input.productIds.length ? "failed" : "completed",
        result: { succeeded, failed },
      });
      await notifyOwner({
        title: "Bulk Product Push Complete",
        content: `Pushed ${succeeded}/${input.productIds.length} products to store #${input.storeId}.${
          failed > 0 ? ` ${failed} failed.` : " All succeeded!"
        }`,
      });
      return { succeeded, failed, results };
    }),

  syncFromStore: orgProcedure
    .input(z.object({ storeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "architect",
        taskType: "product_sync",
        title: `Syncing products from store #${input.storeId}`,
        description: "Importing products from connected platform",
        status: "running",
        storeId: input.storeId,
      });

      try {
        const result = await syncProductsFromStore(input.storeId, ctx.user.id);
        await db.updateAgentTask(task.id, { status: "completed", result });
        return result;
      } catch (error: any) {
        await db.updateAgentTask(task.id, { status: "failed", result: { error: error.message } });
        throw error;
      }
    }),

  // ─── Store Health Check ─────────────────────────────────────────────────
  storeHealthCheck: orgProcedure
    .use(llmRateLimit)
    .input(z.object({ storeId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "architect",
        taskType: "store_health_check",
        title: `Health check for store #${input.storeId}`,
        description: "Running comprehensive store health diagnostics",
        status: "running",
        storeId: input.storeId,
      });

      try {
        const store = await db.getStoreById(input.storeId);
        const products = await db.getProductsByStore(input.storeId);
        const storeContext = await getRenderedStoreContext(input.storeId);

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an e-commerce store diagnostics expert. Analyze the store data and provide a health report. ${storeContext ? "Use the store context to give specific, actionable advice based on the merchant's actual product mix, revenue, and order patterns." : ""} Return JSON with:
- overallScore: number (0-100)
- productHealth: object { activeCount, draftCount, outOfStockCount, avgMargin, issues: string[] }
- seoHealth: object { score: number, issues: string[], recommendations: string[] }
- conversionHealth: object { score: number, issues: string[], recommendations: string[] }
- operationalHealth: object { score: number, issues: string[], recommendations: string[] }
- criticalActions: string[] (top 5 things to fix immediately)
- summary: string`
            },
            {
              role: "user",
              content: `${storeContext ? storeContext + "\n\n" : ""}Store: ${store?.name || "Unknown"} (${store?.platform || "unknown"} platform)\nTotal products: ${products.length}\nProducts data sample: ${JSON.stringify(products.slice(0, 5).map((p: any) => ({ title: p.title, price: p.price, status: p.status, stockLevel: p.stockLevel })))}`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "store_health",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  overallScore: { type: "number" },
                  productHealth: { type: "object", properties: { activeCount: { type: "number" }, draftCount: { type: "number" }, outOfStockCount: { type: "number" }, avgMargin: { type: "string" }, issues: { type: "array", items: { type: "string" } } }, required: ["activeCount", "draftCount", "outOfStockCount", "avgMargin", "issues"], additionalProperties: false },
                  seoHealth: { type: "object", properties: { score: { type: "number" }, issues: { type: "array", items: { type: "string" } }, recommendations: { type: "array", items: { type: "string" } } }, required: ["score", "issues", "recommendations"], additionalProperties: false },
                  conversionHealth: { type: "object", properties: { score: { type: "number" }, issues: { type: "array", items: { type: "string" } }, recommendations: { type: "array", items: { type: "string" } } }, required: ["score", "issues", "recommendations"], additionalProperties: false },
                  operationalHealth: { type: "object", properties: { score: { type: "number" }, issues: { type: "array", items: { type: "string" } }, recommendations: { type: "array", items: { type: "string" } } }, required: ["score", "issues", "recommendations"], additionalProperties: false },
                  criticalActions: { type: "array", items: { type: "string" } },
                  summary: { type: "string" },
                },
                required: ["overallScore", "productHealth", "seoHealth", "conversionHealth", "operationalHealth", "criticalActions", "summary"],
                additionalProperties: false,
              },
            },
          },
        });

        const healthReport = parseLLMJson<any>(llmResult.choices[0].message.content, "architect.storeHealthCheck");
        await db.updateAgentTask(task.id, { status: "completed", result: healthReport });
        return healthReport;
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  // ─── Product Description Rewriter ───────────────────────────────────────
  rewriteProductDescriptions: orgProcedure
    .use(llmRateLimit)
    .input(z.object({
      storeId: z.number(),
      productIds: z.array(z.number()).min(1).max(20),
      tone: z.string().max(120).default("persuasive and benefit-focused"),
      seoOptimize: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "architect",
        taskType: "description_rewrite",
        title: `Rewriting ${input.productIds.length} product descriptions`,
        description: `AI-optimizing product copy for store #${input.storeId}`,
        status: "running",
        storeId: input.storeId,
      });

      try {
        const products = await db.getProductsByStore(input.storeId);
        const targetProducts = products.filter((p: any) => input.productIds.includes(p.id));
        const storeContext = await getRenderedStoreContext(input.storeId);

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a world-class e-commerce copywriter. Rewrite product descriptions to maximize conversions. Tone: ${input.tone}. ${input.seoOptimize ? "Optimize for SEO with natural keyword integration." : ""} ${storeContext ? "Use the store context to match the brand's voice, price positioning, and target audience." : ""} Return JSON with a "products" array, each having: id (number), originalTitle (string), optimizedTitle (string), optimizedDescription (string), bulletPoints (array of strings), seoKeywords (array of strings).`
            },
            {
              role: "user",
              content: `Rewrite these product descriptions:\n${targetProducts.map((p: any) => `ID: ${p.id}, Title: "${p.title}", Description: "${p.description || 'No description'}", Price: $${((p.price || 0) / 100).toFixed(2)}`).join("\n")}`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "rewritten_products",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  products: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "number" },
                        originalTitle: { type: "string" },
                        optimizedTitle: { type: "string" },
                        optimizedDescription: { type: "string" },
                        bulletPoints: { type: "array", items: { type: "string" } },
                        seoKeywords: { type: "array", items: { type: "string" } },
                      },
                      required: ["id", "originalTitle", "optimizedTitle", "optimizedDescription", "bulletPoints", "seoKeywords"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["products"],
                additionalProperties: false,
              },
            },
          },
        });

        const result = parseLLMJson<any>(llmResult.choices[0].message.content, "architect.rewriteDescriptions");
        await db.updateAgentTask(task.id, { status: "completed", result });

        await notifyOwner({
          title: "Product Descriptions Optimized",
          content: `The Architect Bot has rewritten ${result.products.length} product descriptions with SEO optimization.`,
        });

        return result;
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  /**
   * Optimize product images for a store — fetches image URLs from DB products,
   * runs Sharp multi-size optimization, and updates each product's imageUrl with the
   * CDN-hosted WebP thumbnail URL. Returns per-product results.
   */
  optimizeProductImages: orgProcedure
    .input(z.object({
      storeId: z.number(),
      productIds: z.array(z.number()).min(1).max(50),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "architect",
        taskType: "image_optimization",
        title: `Optimizing images for ${input.productIds.length} products`,
        description: `Running Sharp multi-size optimization for store #${input.storeId}`,
        status: "running",
        storeId: input.storeId,
      });

      const results: { id: number; success: boolean; thumbnailUrl?: string; error?: string }[] = [];

      try {
        const products = await db.getProductsByStore(input.storeId);
        const targets = products.filter((p: any) => input.productIds.includes(p.id));

        for (const product of targets) {
          const imageUrl = (product as any).imageUrl;
          if (!imageUrl) {
            results.push({ id: product.id, success: false, error: "No image URL" });
            continue;
          }
          try {
            // SSRF-guarded fetch: blocks file://, private IPs, oversized payloads.
            const buffer = await safeImageFetch(imageUrl);
            const optimized = await optimizeProductImage(buffer, `${input.storeId}/${product.id}`);
            const thumb = optimized.find((o: any) => o.size === "thumbnail" && o.format === "webp");
            const primaryUrl = thumb?.url || optimized[0]?.url;
            if (primaryUrl) {
              await db.updateProduct(product.id, { imageUrl: primaryUrl });
            }
            results.push({ id: product.id, success: true, thumbnailUrl: primaryUrl });
          } catch (err: any) {
            results.push({ id: product.id, success: false, error: err.message });
          }
        }

        const succeeded = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;
        await db.updateAgentTask(task.id, { status: failed === targets.length ? "failed" : "completed", result: { succeeded, failed } });
        return { succeeded, failed, results };
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  /**
   * Vision-driven listing generator.
   *
   * Given a product photo, return SEO-optimized listing copy:
   * title, long description, bullet points, keywords, alt text,
   * tags, suggested price range, and category breadcrumb.
   *
   * Activation: requires ANTHROPIC_API_KEY (Files API + vision). When
   * unset, throws PRECONDITION_FAILED — there's no graceful fallback
   * because Forge's OpenAI-shaped proxy doesn't accept arbitrary file
   * uploads. The UI should hide the button when isFilesApiAvailable()
   * is false.
   *
   * The uploaded image is deleted after extraction. Product photos
   * are typically already stored in the merchant's CDN, so there's no
   * benefit to retaining a copy in Anthropic-land.
   */
  generateListingFromImage: orgProcedure
    .use(llmRateLimit)
    .input(z.object({
      filename: z.string().min(1).max(255),
      bytesBase64: z.string().min(1).max(15_000_000),
      mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
      storeId: z.number().optional(),
      // Optional hints — when absent, the model infers from the image.
      niche: z.string().max(120).optional(),
      targetAudience: z.string().max(160).optional(),
      priceTier: z.enum(["budget", "mid", "premium", "luxury"]).optional(),
      tone: z.string().max(80).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.storeId) await requireStoreInOrg(input.storeId, ctx.org.id);
      if (!isFilesApiAvailable()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Listing generation requires Claude vision via the Files API. Set ANTHROPIC_API_KEY in Manus secrets to enable.",
        });
      }

      const bytes = Buffer.from(input.bytesBase64, "base64");
      // Bound the upload — product photos should be ≤10MB. Anthropic
      // accepts up to 500MB but we want to bail fast on accidental
      // 4K-RAW uploads that would just timeout the model.
      if (bytes.length > 10 * 1024 * 1024) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: "Image exceeds 10MB limit. Compress or resize before re-uploading.",
        });
      }

      const storeContext = input.storeId
        ? await getRenderedStoreContext(input.storeId)
        : "";

      const task = await db.createAgentTask({
        agentType: "architect",
        taskType: "listing_from_image",
        title: `Generating listing from image: ${input.filename}`,
        description: input.niche
          ? `Niche: ${input.niche}${input.priceTier ? " · " + input.priceTier : ""}`
          : "Vision-driven SEO copy",
        status: "running",
        storeId: input.storeId,
      });

      const uploaded = await uploadFile({
        filename: input.filename,
        bytes,
        mimeType: input.mimeType,
      });

      try {
        const hints: string[] = [];
        if (input.niche) hints.push(`Niche/category hint: ${input.niche}`);
        if (input.targetAudience) hints.push(`Target audience: ${input.targetAudience}`);
        if (input.priceTier) hints.push(`Price tier: ${input.priceTier}`);
        if (input.tone) hints.push(`Brand tone: ${input.tone}`);
        const hintBlock = hints.length ? hints.join("\n") + "\n\n" : "";

        const result = await visionQuery({
          fileId: uploaded.id,
          mimeType: input.mimeType,
          prompt: `${storeContext ? storeContext + "\n\n" : ""}${hintBlock}You are a senior e-commerce copywriter. Examine this product photo and produce a complete, conversion-optimized listing.

Return strict JSON with these fields:
- title (string, 60-80 characters, includes the primary keyword early, no all-caps gimmicks)
- description (string, 3-5 short paragraphs separated by \\n\\n, benefit-led, scannable)
- bulletPoints (array of 5-7 strings, each starting with a verb or benefit)
- seoKeywords (array of 10-15 long-tail keyword strings — natural search phrases buyers actually type)
- suggestedPriceRange (object: { minCents (integer), maxCents (integer), currency (string ISO-4217, e.g. "USD") })
- imageAltText (string, 100-125 characters, descriptive for accessibility & image SEO)
- tags (array of 5-10 lowercase single-word tags for cataloging)
- categoryBreadcrumb (string, "Home > Category > Subcategory" format)
- materialOrComposition (string or null — only if clearly visible)
- estimatedConversionAngle (string, 1-2 sentences explaining the strongest selling angle for this product)

If the image is blurry, contains no product, or appears to be a screenshot/UI rather than a product photo, return all string fields as empty strings, arrays as empty, and set estimatedConversionAngle to "Image quality insufficient — please upload a clearer product photo."`,
          maxTokens: 4000,
          jsonSchema: {
            name: "vision_listing",
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                bulletPoints: { type: "array", items: { type: "string" } },
                seoKeywords: { type: "array", items: { type: "string" } },
                suggestedPriceRange: {
                  type: "object",
                  properties: {
                    minCents: { type: "integer" },
                    maxCents: { type: "integer" },
                    currency: { type: "string" },
                  },
                  required: ["minCents", "maxCents", "currency"],
                  additionalProperties: false,
                },
                imageAltText: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                categoryBreadcrumb: { type: "string" },
                materialOrComposition: { type: ["string", "null"] },
                estimatedConversionAngle: { type: "string" },
              },
              required: [
                "title",
                "description",
                "bulletPoints",
                "seoKeywords",
                "suggestedPriceRange",
                "imageAltText",
                "tags",
                "categoryBreadcrumb",
                "estimatedConversionAngle",
              ],
              additionalProperties: false,
            },
          },
        });

        await db.updateAgentTask(task.id, { status: "completed", result: result.json });

        return {
          listing: result.json ?? null,
          rawText: result.text,
          cacheReadInputTokens: result.cacheReadInputTokens,
          taskId: task.id,
        };
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      } finally {
        try {
          await deleteFile(uploaded.id);
        } catch {
          // Cleanup-failure is non-fatal; the file ages out.
        }
      }
    }),

  /**
   * Convert a vision-generated listing into a real draft product row.
   *
   * The vision endpoint returns SEO copy + a suggested price range;
   * this endpoint persists it as a `draft`-status product so the user
   * can review it on the store's product list and push to the
   * connected platform when ready. SKU is auto-generated from the
   * timestamp + a random suffix so there are no collisions across
   * concurrent saves.
   *
   * Price defaults to the midpoint of the suggested range (ceiling
   * to the nearest dollar) — buyers respond better to round numbers
   * than to fractional cents from a midpoint calculation.
   */
  saveListingAsDraftProduct: orgProcedure
    .input(z.object({
      storeId: z.number(),
      listing: z.object({
        title: z.string().min(1).max(500),
        description: z.string(),
        bulletPoints: z.array(z.string()),
        seoKeywords: z.array(z.string()),
        suggestedPriceRange: z.object({
          minCents: z.number().min(0),
          maxCents: z.number().min(0),
          currency: z.string().min(1).max(8),
        }),
        imageAltText: z.string(),
        tags: z.array(z.string()),
        categoryBreadcrumb: z.string(),
        materialOrComposition: z.string().nullable().optional(),
        estimatedConversionAngle: z.string(),
      }),
      // Optional override — when caller already has the CDN-hosted
      // image URL (e.g. from a prior optimizer run), pass it so the
      // draft product carries the image straight into the listing.
      imageUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Scope check: the storeId must belong to the active org. Without
      // this, a user in two orgs could craft a request that creates a
      // draft product on the *other* org's store.
      const store = await db.getStoreById(input.storeId);
      if (!store || store.orgId !== ctx.org.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Store not found in this org" });
      }
      const { listing } = input;

      // Compose the on-page description: bullet points + the prose
      // body + the conversion angle as a closing pitch. This is the
      // string the merchant will see in their store editor — it
      // should look reviewable, not raw model output.
      const descriptionParts: string[] = [];
      if (listing.description) descriptionParts.push(listing.description);
      if (listing.bulletPoints.length > 0) {
        descriptionParts.push(
          listing.bulletPoints.map((b) => `• ${b}`).join("\n"),
        );
      }
      if (listing.estimatedConversionAngle) {
        descriptionParts.push(`Why this resonates:\n${listing.estimatedConversionAngle}`);
      }
      const composedDescription = descriptionParts.join("\n\n");

      // Midpoint price → round to nearest whole dollar for psychology.
      const midCents = Math.round(
        (listing.suggestedPriceRange.minCents + listing.suggestedPriceRange.maxCents) / 2,
      );
      const roundedDollars = Math.max(1, Math.round(midCents / 100));
      const priceCents = roundedDollars * 100;

      const sku = `DRAFT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      const result = await db.createProduct({
        storeId: input.storeId,
        title: listing.title.slice(0, 500),
        description: composedDescription,
        price: priceCents,
        sku,
        category: listing.categoryBreadcrumb || null,
        imageUrl: input.imageUrl ?? null,
        status: "draft",
        stockLevel: 0,
      });

      await db.createAgentTask({
        agentType: "architect",
        taskType: "draft_product_created",
        title: `Draft product created: ${listing.title.slice(0, 80)}`,
        description: `Vision-generated draft saved to store #${input.storeId} at $${(priceCents / 100).toFixed(2)} ${listing.suggestedPriceRange.currency}`,
        status: "completed",
        storeId: input.storeId,
        result: { productId: result.id, sku, priceCents },
      });

      return {
        productId: result.id,
        sku,
        priceCents,
        currency: listing.suggestedPriceRange.currency,
      };
    }),

  // ─── Competitor Price Scanner ────────────────────────────────────────────
  competitorPriceScan: orgProcedure
    .use(llmRateLimit)
    .input(z.object({
      storeId: z.number(),
      niche: z.string().max(255),
      productNames: z.array(z.string().max(160)).min(1).max(10),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "architect",
        taskType: "competitor_price_scan",
        title: `Scanning competitor prices for ${input.productNames.length} products`,
        description: `Competitive pricing intelligence for "${input.niche}"`,
        status: "running",
        storeId: input.storeId,
      });

      try {
        const storeContext = await getRenderedStoreContext(input.storeId);

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a competitive pricing intelligence analyst. Analyze competitor pricing for the given products in the specified niche. ${storeContext ? "Use the store context to factor in the merchant's current price range, margins, and positioning." : ""} Return JSON with:
- products: array of { productName, ourSuggestedPrice (string), competitorPrices: array of { competitor, price, url }, averageMarketPrice (string), pricePosition (string: "below_market" | "at_market" | "above_market"), recommendation (string) }
- overallStrategy: string
- pricingOpportunities: array of strings`
            },
            {
              role: "user",
              content: `Niche: "${input.niche}"\nProducts to scan: ${input.productNames.join(", ")}`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "competitor_prices",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  products: { type: "array", items: { type: "object", properties: { productName: { type: "string" }, ourSuggestedPrice: { type: "string" }, competitorPrices: { type: "array", items: { type: "object", properties: { competitor: { type: "string" }, price: { type: "string" }, url: { type: "string" } }, required: ["competitor", "price", "url"], additionalProperties: false } }, averageMarketPrice: { type: "string" }, pricePosition: { type: "string" }, recommendation: { type: "string" } }, required: ["productName", "ourSuggestedPrice", "competitorPrices", "averageMarketPrice", "pricePosition", "recommendation"], additionalProperties: false } },
                  overallStrategy: { type: "string" },
                  pricingOpportunities: { type: "array", items: { type: "string" } },
                },
                required: ["products", "overallStrategy", "pricingOpportunities"],
                additionalProperties: false,
              },
            },
          },
        });

        const result = parseLLMJson<any>(llmResult.choices[0].message.content, "architect.pricingStrategy");
        await db.updateAgentTask(task.id, { status: "completed", result });
        return result;
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),
});
