import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { notifyOwner } from "../_core/notification";
import * as db from "../db";

export const architectRouter = router({
  nicheResearch: protectedProcedure
    .input(z.object({
      keyword: z.string().min(1).max(255),
      storeId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
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
        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an expert e-commerce niche analyst. Analyze the given niche keyword and provide a comprehensive report. Return a JSON object with these fields:
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
            { role: "user", content: `Analyze this e-commerce niche: "${input.keyword}"` }
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

        const reportData = JSON.parse(llmResult.choices[0].message.content as string);
        await db.updateNicheReport(report.id, {
          report: reportData,
          score: reportData.viabilityScore,
          status: "completed",
        });
        await db.updateAgentTask(task.id, { status: "completed", result: reportData });

        await notifyOwner({
          title: "Niche Research Complete",
          content: `The Architect Agent completed niche research for "${input.keyword}" with a viability score of ${reportData.viabilityScore}/100.`,
        });

        return { id: report.id, report: reportData };
      } catch (error) {
        await db.updateNicheReport(report.id, { status: "failed" });
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  nicheReports: protectedProcedure
    .input(z.object({ storeId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return db.getNicheReports(input?.storeId);
    }),

  generateProductCatalog: protectedProcedure
    .input(z.object({
      keyword: z.string().min(1),
      storeId: z.number(),
      count: z.number().min(1).max(20).default(5),
    }))
    .mutation(async ({ input }) => {
      const task = await db.createAgentTask({
        agentType: "architect",
        taskType: "product_catalog",
        title: `Generate ${input.count} products for "${input.keyword}"`,
        description: `AI-generating product catalog for niche: ${input.keyword}`,
        status: "running",
        storeId: input.storeId,
      });

      try {
        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an expert e-commerce product curator. Generate a product catalog for the given niche. Return a JSON object with a "products" array. Each product should have:
- title: string (compelling product name)
- description: string (persuasive 2-3 sentence description)
- price: number (retail price in cents, e.g., 2999 for $29.99)
- costPrice: number (cost price in cents)
- category: string
- sku: string (generated SKU code)
- supplier: string (suggested supplier name)`
            },
            { role: "user", content: `Generate ${input.count} products for the "${input.keyword}" niche.` }
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

        const catalogData = JSON.parse(llmResult.choices[0].message.content as string);
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
          content: `The Architect Agent generated ${createdProducts.length} products for the "${input.keyword}" niche.`,
        });

        return { products: createdProducts };
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),
});
