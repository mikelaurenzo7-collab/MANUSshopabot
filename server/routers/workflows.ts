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
import "../engine/hypemanWorkflows";

export const workflowRouter = router({
  // ─── Launch a workflow ─────────────────────────────────────────────────
  launch: protectedProcedure
    .input(z.object({
      agentType: z.enum(["architect", "merchant", "hypeman"]),
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
      agentType: z.enum(["architect", "merchant", "hypeman"]).optional(),
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
      ],
      hypeman: [
        { type: "ad_campaign", title: "Ad Campaign", description: "Full campaign creation — audience research, copy variations, and AI-generated creatives", icon: "Megaphone", scope: "specific_store" },
        { type: "social_content", title: "Social Content Calendar", description: "Multi-platform content calendar with captions, hashtags, and posting schedule", icon: "Calendar", scope: "all_stores" },
        { type: "seo_audit", title: "SEO Audit", description: "Comprehensive keyword research and on-page optimization recommendations", icon: "Globe", scope: "specific_store" },
        { type: "email_flow", title: "Email Flow", description: "Automated email sequences — welcome, abandoned cart, win-back, post-purchase", icon: "Mail", scope: "specific_store" },
        { type: "product_creative", title: "Product Creatives", description: "AI-generated product images — hero shots, lifestyle, and ad creatives", icon: "Image", scope: "specific_store" },
        { type: "brand_content", title: "Brand Content", description: "Blog posts, social snippets, email newsletters, and product description copy", icon: "FileText", scope: "global" },
        { type: "viral_trend_detector", title: "Viral Trend Detector", description: "Real-time trend scanning — viral content, emerging signals, hashtag strategy, and ready-to-film templates", icon: "Zap", scope: "global" },
        { type: "influencer_outreach", title: "Influencer Outreach", description: "Full influencer strategy — discovery, vetting, outreach templates, campaign structure, and contracts", icon: "Star", scope: "specific_store" },
        { type: "conversion_funnel", title: "Conversion Funnel CRO", description: "Funnel leak analysis, checkout optimization, A/B test roadmap, and psychological triggers", icon: "Filter", scope: "specific_store" },
      ],
    };
  }),
});
