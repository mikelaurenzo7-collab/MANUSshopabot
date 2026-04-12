/**
 * Workflow Router — tRPC procedures for the bot workflow engine
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getWorkflowsByUser, getWorkflowById, getWorkflowSteps,
  getActiveWorkflows, getWorkflowCounts, getPendingApprovalSteps,
} from "../db";
import { launchWorkflow, resumeWorkflow, cancelWorkflow } from "../engine/workflowEngine";

// Import workflow registrations (side-effect: registers all workflows)
import "../engine/architectWorkflows";
import "../engine/merchantWorkflows";
import "../engine/socialWorkflows";
import "../engine/platformEliteWorkflows";

export const workflowRouter = router({
  // ─── Launch a workflow ─────────────────────────────────────────────────
  launch: protectedProcedure
    .input(z.object({
      agentType: z.enum(["architect", "merchant", "social"]),
      workflowType: z.string(),
      title: z.string(),
      description: z.string().optional(),
      scope: z.enum(["specific_store", "all_stores", "global"]),
      storeId: z.number().optional(),
      input: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const workflowId = await launchWorkflow(ctx.user.id, {
        agentType: input.agentType,
        workflowType: input.workflowType,
        title: input.title,
        description: input.description,
        scope: input.scope,
        storeId: input.storeId,
        input: input.input ?? {},
        steps: [], // Will be resolved from registry
      });
      return { workflowId };
    }),

  // ─── List workflows ────────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      agentType: z.enum(["architect", "merchant", "social"]).optional(),
      status: z.string().optional(),
      storeId: z.number().optional(),
      limit: z.number().default(20),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      return getWorkflowsByUser(ctx.user.id, input ?? {});
    }),

  // ─── Get active workflows ──────────────────────────────────────────────
  active: protectedProcedure.query(async ({ ctx }) => {
    return getActiveWorkflows(ctx.user.id);
  }),

  // ─── Get workflow counts ───────────────────────────────────────────────
  counts: protectedProcedure.query(async ({ ctx }) => {
    return getWorkflowCounts(ctx.user.id);
  }),

  // ─── Get workflow detail with steps ────────────────────────────────────
  detail: protectedProcedure
    .input(z.object({ workflowId: z.number() }))
    .query(async ({ ctx, input }) => {
      const workflow = await getWorkflowById(input.workflowId);
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
      if (workflow.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      const steps = await getWorkflowSteps(input.workflowId);
      return { workflow, steps };
    }),

  // ─── Get pending approval steps ────────────────────────────────────────
  pendingApprovals: protectedProcedure.query(async ({ ctx }) => {
    return getPendingApprovalSteps(ctx.user.id);
  }),

  // ─── Approve or reject a step ──────────────────────────────────────────
  reviewStep: protectedProcedure
    .input(z.object({
      workflowId: z.number(),
      stepId: z.number(),
      approved: z.boolean(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const workflow = await getWorkflowById(input.workflowId);
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND" });
      if (workflow.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await resumeWorkflow(input.workflowId, input.stepId, input.approved, input.note);
      return { success: true };
    }),

  // ─── Cancel a workflow ─────────────────────────────────────────────────
  cancel: protectedProcedure
    .input(z.object({ workflowId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const workflow = await getWorkflowById(input.workflowId);
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND" });
      if (workflow.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await cancelWorkflow(input.workflowId);
      return { success: true };
    }),

  // ─── Retry a failed or cancelled workflow ─────────────────────────────
  retry: protectedProcedure
    .input(z.object({ workflowId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const workflow = await getWorkflowById(input.workflowId);
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
      if (workflow.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (workflow.status !== "failed" && workflow.status !== "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only failed or cancelled workflows can be retried" });
      }

      // Re-launch the workflow with the same parameters
      const newWorkflowId = await launchWorkflow(ctx.user.id, {
        agentType: workflow.agentType,
        workflowType: workflow.workflowType,
        title: `[Retry] ${workflow.title.replace(/^\[Retry\] /, "")}`,
        description: workflow.description ?? undefined,
        scope: workflow.scope,
        storeId: workflow.storeId ?? undefined,
        input: (workflow.input as Record<string, any>) ?? {},
        steps: [],
      });

      return { newWorkflowId };
    }),

  // ─── Available workflow types ──────────────────────────────────────────
  availableTypes: protectedProcedure.query(() => {
    return {
      architect: [
        { type: "niche_research", title: "Niche Research", description: "Deep market analysis with viability scoring, competitor mapping, and product recommendations", icon: "Search", scope: "global" },
        { type: "product_sourcing", title: "Product Sourcing", description: "Find and curate winning products with margin analysis and supplier recommendations", icon: "Package", scope: "specific_store" },
        { type: "catalog_generation", title: "Catalog Generation", description: "Generate a complete product catalog from a keyword with pricing and descriptions", icon: "LayoutGrid", scope: "specific_store" },
        { type: "store_setup", title: "Store Setup", description: "Full store setup — brand identity, logo, legal pages, and configuration", icon: "Store", scope: "specific_store" },
        { type: "multi_store_expansion", title: "Multi-Store Expansion", description: "Cross-platform expansion strategy — analyze Shopify, Etsy, Amazon fit and launch order", icon: "Globe", scope: "global" },
        { type: "brand_audit", title: "Brand Audit", description: "Comprehensive brand health assessment — consistency, trust signals, conversion, and customer journey", icon: "ShieldCheck", scope: "specific_store" },
        { type: "product_optimization", title: "Product Optimization", description: "Optimize listings — titles, descriptions, pricing psychology, cross-sells, and dead product cleanup", icon: "Sparkles", scope: "specific_store" },
      ],
      merchant: [
        { type: "inventory_audit", title: "Inventory Audit", description: "Cross-store inventory analysis with restock recommendations and dead stock alerts", icon: "ClipboardCheck", scope: "all_stores" },
        { type: "pricing_optimization", title: "Pricing Optimization", description: "Dynamic pricing analysis with margin targets and competitor benchmarking", icon: "DollarSign", scope: "all_stores" },
        { type: "fulfillment_automation", title: "Fulfillment Automation", description: "Automated order validation, processing, and supplier notification", icon: "Truck", scope: "specific_store" },
        { type: "competitor_analysis", title: "Competitor Analysis", description: "Deep competitive intelligence with counter-strategies and pricing positions", icon: "Target", scope: "global" },
        { type: "supply_chain_intelligence", title: "Supply Chain Intelligence", description: "Supplier scorecards, lead time optimization, cost reduction, and risk assessment", icon: "Link", scope: "all_stores" },
        { type: "profit_loss_analysis", title: "Profit & Loss Analysis", description: "CFO-level P&L report with margins, cash flow projections, and strategic recommendations", icon: "TrendingUp", scope: "all_stores" },
        { type: "customer_segmentation", title: "Customer Segmentation", description: "RFM analysis, behavioral segments, churn prediction, and targeted campaign recommendations", icon: "Users", scope: "all_stores" },
        { type: "shopify_metafields_sync", title: "Shopify Metafields Sync", description: "Store supplier cost, margin, and reorder point data in Shopify metafields for data-driven automation", icon: "Database", scope: "specific_store" },
        { type: "shopify_bulk_operations", title: "Shopify Bulk Operations", description: "Batch product updates via Shopify Bulk Operations API — prices, inventory, tags", icon: "Layers", scope: "specific_store" },
        { type: "fba_replenishment_monitor", title: "FBA Replenishment Monitor", description: "Track Amazon IPI score, identify stockout risks, and generate inbound shipment plans", icon: "Warehouse", scope: "specific_store" },
        { type: "etsy_listing_refresh", title: "Etsy Listing Refresh", description: "Weekly SEO-optimized title and tag updates to maintain Etsy search visibility", icon: "RefreshCw", scope: "specific_store" },
        { type: "woocommerce_oos_hide", title: "WooCommerce OOS Hide", description: "Hide out-of-stock products from catalog while preserving SEO rankings and backlinks", icon: "EyeOff", scope: "specific_store" },
        { type: "walmart_performance_alarm", title: "Walmart Performance Alarm", description: "Monitor Walmart seller performance metrics and generate corrective action plans", icon: "AlertTriangle", scope: "specific_store" },
      ],
      social: [
        { type: "ad_campaign", title: "Ad Campaign", description: "Full campaign creation — audience research, copy variations, and AI-generated creatives", icon: "Megaphone", scope: "specific_store" },
        { type: "social_content", title: "Social Content Calendar", description: "Multi-platform content calendar with captions, hashtags, and posting schedule", icon: "Calendar", scope: "all_stores" },
        { type: "seo_audit", title: "SEO Audit", description: "Comprehensive keyword research and on-page optimization recommendations", icon: "Globe", scope: "specific_store" },
        { type: "email_flow", title: "Email Flow", description: "Automated email sequences — welcome, abandoned cart, win-back, post-purchase", icon: "Mail", scope: "specific_store" },
        { type: "product_creative", title: "Product Creatives", description: "AI-generated product images — hero shots, lifestyle, and ad creatives", icon: "Image", scope: "specific_store" },
        { type: "brand_content", title: "Brand Content", description: "Blog posts, social snippets, email newsletters, and product description copy", icon: "FileText", scope: "global" },
        { type: "viral_trend_detector", title: "Viral Trend Detector", description: "Real-time trend scanning — viral content, emerging signals, hashtag strategy, and ready-to-film templates", icon: "Zap", scope: "global" },
        { type: "influencer_outreach", title: "Influencer Outreach", description: "Full influencer strategy — discovery, vetting, outreach templates, campaign structure, and contracts", icon: "Star", scope: "specific_store" },
        { type: "conversion_funnel", title: "Conversion Funnel CRO", description: "Funnel leak analysis, checkout optimization, A/B test roadmap, and psychological triggers", icon: "Filter", scope: "specific_store" },
        { type: "meta_conversions_api", title: "Meta Conversions API", description: "Audit and optimize server-side event tracking with hashed PII for maximum Event Match Quality", icon: "Activity", scope: "specific_store" },
        { type: "tiktok_engagement_monitor", title: "TikTok Engagement Monitor", description: "Analyze 3-second view rate, hold rate, and engagement to identify Spark Ads candidates", icon: "BarChart3", scope: "global" },
        { type: "pinterest_trends", title: "Pinterest Trends", description: "Trend-driven pin scheduling with keyword research and seasonal content planning", icon: "TrendingUp", scope: "global" },
        { type: "tiktok_spark_ads", title: "TikTok Spark Ads", description: "Auto-boost high-performing organic TikTok posts as Spark Ads with social proof", icon: "Flame", scope: "global" },
        { type: "instagram_reels_boost", title: "Instagram Reels Boost", description: "Identify high watch-time Reels and boost them for maximum reach amplification", icon: "Film", scope: "global" },
        { type: "google_pmax_optimization", title: "Google PMax Optimization", description: "Performance Max campaign audit — asset groups, audience signals, and bid strategy", icon: "Cpu", scope: "global" },
        { type: "twitter_stream_monitor", title: "Twitter/X Brand Monitor", description: "Real-time brand mention tracking, sentiment analysis, and crisis detection", icon: "Radio", scope: "global" },
      ],
    };
  }),
});
