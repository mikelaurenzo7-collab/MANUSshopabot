/**
 * Workflow Router — tRPC procedures for the bot workflow engine
 */

import { z } from "zod";
import { orgProcedure, protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getWorkflowsByOrg, getWorkflowById, getWorkflowSteps,
  getActiveWorkflowsByOrg, getWorkflowCountsByOrg, getPendingApprovalStepsByOrg,
  getUserByOpenId,
  getStoresByOrg, getStoreCountForOrg, getProductCountForOrg,
} from "../db";
import { launchWorkflow, resumeWorkflow, cancelWorkflow } from "../engine/workflowEngine";

// Import workflow registrations (side-effect: registers all workflows)
import "../engine/architectWorkflows";
import "../engine/merchantWorkflows";
import "../engine/socialWorkflows";
import "../engine/platformEliteWorkflows";

export const workflowRouter = router({
  // ─── Launch a workflow ─────────────────────────────────────────────────
  launch: orgProcedure
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
      const dbUser = await getUserByOpenId(ctx.user.openId);

      // The Revenue Moat: hard enforcement when a real DB user exists.
      // `trialing` is honored — Phase 1.2 wired Stripe trials so new
      // signups get 7 days before this gate fires.
      // Founder bypass: mlaurenzo8@gmail.com always passes
      if (dbUser) {
        const isFounder = dbUser.email === "mlaurenzo8@gmail.com";
        const isSubscribed = isFounder || dbUser.stripeSubscriptionStatus === "active" || dbUser.stripeSubscriptionStatus === "trialing";
        if (!isSubscribed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Please upgrade to a paid plan to launch bot workflows.",
          });
        }
      }

      const workflowId = await launchWorkflow(
        ctx.user.id,
        {
          agentType: input.agentType,
          workflowType: input.workflowType,
          title: input.title,
          description: input.description,
          scope: input.scope,
          storeId: input.storeId,
          input: input.input ?? {},
          steps: [], // Will be resolved from registry
        },
        { orgId: ctx.org.id },
      );
      return { workflowId };
    }),

  // ─── List workflows ────────────────────────────────────────────────────
  list: orgProcedure
    .input(z.object({
      agentType: z.enum(["architect", "merchant", "social"]).optional(),
      status: z.string().optional(),
      storeId: z.number().optional(),
      limit: z.number().default(20),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      return getWorkflowsByOrg(ctx.org.id, input ?? {});
    }),

  // ─── Get active workflows ──────────────────────────────────────────────
  active: orgProcedure.query(async ({ ctx }) => {
    return getActiveWorkflowsByOrg(ctx.org.id);
  }),

  // ─── Get workflow counts ───────────────────────────────────────────────
  counts: orgProcedure.query(async ({ ctx }) => {
    return getWorkflowCountsByOrg(ctx.org.id);
  }),

  // ─── Get workflow detail with steps ────────────────────────────────────
  detail: orgProcedure
    .input(z.object({ workflowId: z.number() }))
    .query(async ({ ctx, input }) => {
      const workflow = await getWorkflowById(input.workflowId);
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
      if (workflow.orgId !== ctx.org.id) throw new TRPCError({ code: "FORBIDDEN" });
      const steps = await getWorkflowSteps(input.workflowId);
      return { workflow, steps };
    }),

  // ─── Get pending approval steps ────────────────────────────────────────
  pendingApprovals: orgProcedure.query(async ({ ctx }) => {
    return getPendingApprovalStepsByOrg(ctx.org.id);
  }),

  // ─── Approve or reject a step ──────────────────────────────────────────
  reviewStep: orgProcedure
    .input(z.object({
      workflowId: z.number(),
      stepId: z.number(),
      approved: z.boolean(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const workflow = await getWorkflowById(input.workflowId);
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND" });
      if (workflow.orgId !== ctx.org.id) throw new TRPCError({ code: "FORBIDDEN" });
      await resumeWorkflow(input.workflowId, input.stepId, input.approved, input.note);
      return { success: true };
    }),

  // ─── Cancel a workflow ─────────────────────────────────────────────────
  cancel: orgProcedure
    .input(z.object({ workflowId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const workflow = await getWorkflowById(input.workflowId);
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND" });
      if (workflow.orgId !== ctx.org.id) throw new TRPCError({ code: "FORBIDDEN" });
      await cancelWorkflow(input.workflowId);
      return { success: true };
    }),

  // ─── Retry a failed or cancelled workflow ─────────────────────────────
  retry: orgProcedure
    .input(z.object({ workflowId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const workflow = await getWorkflowById(input.workflowId);
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
      if (workflow.orgId !== ctx.org.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (workflow.status !== "failed" && workflow.status !== "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only failed or cancelled workflows can be retried" });
      }

      const newWorkflowId = await launchWorkflow(
        ctx.user.id,
        {
          agentType: workflow.agentType,
          workflowType: workflow.workflowType,
          title: `[Retry] ${workflow.title.replace(/^\[Retry\] /, "")}`,
          description: workflow.description ?? undefined,
          scope: workflow.scope,
          storeId: workflow.storeId ?? undefined,
          input: (workflow.input as Record<string, any>) ?? {},
          steps: [],
        },
        { orgId: ctx.org.id },
      );

      return { newWorkflowId };
    }),

  /**
   * Rerun a *completed* workflow with the same inputs. Distinct from
   * `retry`, which is the failure-recovery affordance — `rerun` is
   * "I liked the result, give me another fresh run" (e.g. weekly
   * niche scans, repeated competitor checks). Creates a brand-new
   * workflow row so the original's history is preserved.
   *
   * Title is prefixed with [Rerun] for visual distinction in the
   * workflow list. Strips any prior [Rerun] / [Retry] tags so the
   * title doesn't accumulate prefixes after multiple reruns.
   */
  rerun: orgProcedure
    .input(z.object({ workflowId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const workflow = await getWorkflowById(input.workflowId);
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
      if (workflow.orgId !== ctx.org.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (workflow.status !== "completed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only completed workflows can be rerun. Use Retry for failed/cancelled runs.",
        });
      }

      const cleanTitle = workflow.title.replace(/^\[(Rerun|Retry)\]\s+/g, "");

      const newWorkflowId = await launchWorkflow(
        ctx.user.id,
        {
          agentType: workflow.agentType,
          workflowType: workflow.workflowType,
          title: `[Rerun] ${cleanTitle}`,
          description: workflow.description ?? undefined,
          scope: workflow.scope,
          storeId: workflow.storeId ?? undefined,
          input: (workflow.input as Record<string, any>) ?? {},
          steps: [],
        },
        { orgId: ctx.org.id },
      );

      return { newWorkflowId };
    }),

  /**
   * Recommended workflows for the current org's lifecycle stage.
   *
   * Two real customer segments hit this app: operators starting fresh
   * and operators with an existing store. Both deserve a clear "next
   * three workflows" surface tuned to their actual data, not a flat
   * 30-item picker. This query reads the org's stores + product
   * counts, classifies the stage, and returns a curated sequence
   * with a `reason` string so the UI can explain *why* each one is
   * recommended.
   *
   * Stages:
   *   • fresh      — 0 stores. Builder leads with discovery.
   *   • launching  — 1+ stores, ≤4 products. Builder fills the catalog.
   *   • operating  — stores with 5+ products. Merchant audits + Architect optimization.
   *   • scaling    — multi-store or 50+ products. Cross-store + competitor.
   */
  recommendedForOrg: orgProcedure.query(async ({ ctx }) => {
    const [storeCount, productCount, orgStores] = await Promise.all([
      getStoreCountForOrg(ctx.org.id),
      getProductCountForOrg(ctx.org.id),
      getStoresByOrg(ctx.org.id),
    ]);

    type RecStage = "fresh" | "launching" | "operating" | "scaling";
    const stage: RecStage =
      storeCount === 0
        ? "fresh"
        : productCount < 5
          ? "launching"
          : storeCount > 1 || productCount >= 50
            ? "scaling"
            : "operating";

    interface Recommendation {
      type: string;
      title: string;
      agentType: "architect" | "merchant" | "social";
      icon: string;
      accent: "sky" | "cyan" | "violet" | "emerald" | "fuchsia" | "amber" | "rose";
      reason: string;
      scope: "global" | "specific_store" | "all_stores";
    }

    // Stage → ordered recommendation list. Each one includes a reason
    // tied to the *actual* org state so the UI can show "Recommended
    // because you have N products" instead of generic CTAs.
    const recs: Record<RecStage, Recommendation[]> = {
      fresh: [
        {
          type: "niche_research",
          title: "Niche research",
          agentType: "architect",
          icon: "Search",
          accent: "sky",
          reason: "You haven't connected a store yet. Start by validating a niche — Builder Bot scores market demand, competition, and viability.",
          scope: "global",
        },
        {
          type: "brand_identity_kit",
          title: "Brand identity kit",
          agentType: "architect",
          icon: "Palette",
          accent: "fuchsia",
          reason: "Voice, palette, name, and tagline — generated together so you have a coherent brand before the store goes live.",
          scope: "global",
        },
        {
          type: "competitor_pricing_scan",
          title: "Competitor pricing scan",
          agentType: "architect",
          icon: "DollarSign",
          accent: "amber",
          reason: "See what current operators in your target niche charge — Builder Bot reads Shopify, Amazon, Etsy, and TikTok Shop in one pass.",
          scope: "global",
        },
      ],
      launching: [
        {
          type: "complete_store_buildout",
          title: "Complete store buildout",
          agentType: "architect",
          icon: "Rocket",
          accent: "fuchsia",
          reason: `Your store has only ${productCount} ${productCount === 1 ? "product" : "products"}. One Builder Bot run takes you end-to-end: niche scoring, brand identity, a starter catalog drafted directly on your store, and legal pages.`,
          scope: "specific_store",
        },
        {
          type: "product_sourcing",
          title: "Product sourcing",
          agentType: "architect",
          icon: "Package",
          accent: "sky",
          reason: "Find margin-friendly winners with supplier shortlists — for adding products to a catalog you've already started.",
          scope: "specific_store",
        },
        {
          type: "brand_audit",
          title: "Brand audit",
          agentType: "architect",
          icon: "ShieldCheck",
          accent: "violet",
          reason: "Pre-launch trust check. Logo, copy consistency, missing legal pages — every conversion blocker before you spend a dollar on traffic.",
          scope: "specific_store",
        },
      ],
      operating: [
        {
          type: "store_optimization_sweep",
          title: "Store optimization sweep",
          agentType: "merchant",
          icon: "Sparkles",
          accent: "emerald",
          reason: `You have ${productCount} active products. One Merchant Bot run audits inventory, flags margin floor breaches, proposes a pricing change-set with dollar-impact estimate, and rewrites your top underperforming listings — all in one pipeline.`,
          scope: "specific_store",
        },
        {
          type: "margin_guard_audit",
          title: "Margin guard audit",
          agentType: "merchant",
          icon: "Shield",
          accent: "amber",
          reason: "Standalone margin scan — flags every SKU selling below your floor with proposed price-fix actions.",
          scope: "specific_store",
        },
        {
          type: "inventory_audit",
          title: "Inventory audit",
          agentType: "merchant",
          icon: "ClipboardCheck",
          accent: "cyan",
          reason: "Cross-store stock-level sweep with restock recommendations and dead-stock alerts.",
          scope: "all_stores",
        },
      ],
      scaling: [
        {
          type: "competitor_analysis",
          title: "Competitor analysis",
          agentType: "merchant",
          icon: "Target",
          accent: "amber",
          reason: `${storeCount > 1 ? `Operating ${storeCount} stores` : `Catalog at ${productCount} SKUs`}. Time to map the competitive landscape with counter-strategies.`,
          scope: "global",
        },
        {
          type: "profit_loss_analysis",
          title: "Profit & loss analysis",
          agentType: "merchant",
          icon: "TrendingUp",
          accent: "emerald",
          reason: "CFO-grade P&L across every store with cash-flow projections. Tells you which products carry the business and which drain it.",
          scope: "all_stores",
        },
        {
          type: "multi_store_expansion",
          title: "Multi-store expansion",
          agentType: "architect",
          icon: "Globe",
          accent: "sky",
          reason: "You're past the operating threshold. Builder Bot maps Etsy, Amazon, TikTok Shop fit and recommends the next channel to launch.",
          scope: "global",
        },
      ],
    };

    return {
      stage,
      storeCount,
      productCount,
      // First connected store id for `specific_store`-scoped recs that
      // need a concrete target. Null when stage === "fresh".
      defaultStoreId: orgStores[0]?.id ?? null,
      recommendations: recs[stage],
    };
  }),

  // ─── Available workflow types ──────────────────────────────────────────
  availableTypes: protectedProcedure.query(() => {
    return {
      architect: [
        { type: "complete_store_buildout", title: "Complete Store Buildout", description: "End-to-end store creation — niche research, brand identity, 10-product starter catalog drafted directly on your store, and legal pages, in one run", icon: "Rocket", scope: "specific_store" },
        { type: "niche_research", title: "Niche Research", description: "Deep market analysis with viability scoring, competitor mapping, and product recommendations", icon: "Search", scope: "global" },
        { type: "product_sourcing", title: "Product Sourcing", description: "Find and curate winning products with margin analysis and supplier recommendations", icon: "Package", scope: "specific_store" },
        { type: "catalog_generation", title: "Catalog Generation", description: "Generate a complete product catalog from a keyword with pricing and descriptions", icon: "LayoutGrid", scope: "specific_store" },
        { type: "store_setup", title: "Store Setup", description: "Full store setup — brand identity, logo, legal pages, and configuration", icon: "Store", scope: "specific_store" },
        { type: "multi_store_expansion", title: "Multi-Store Expansion", description: "Cross-platform expansion strategy — analyze Shopify, Etsy, Amazon fit and launch order", icon: "Globe", scope: "global" },
        { type: "brand_audit", title: "Brand Audit", description: "Comprehensive brand health assessment — consistency, trust signals, conversion, and customer journey", icon: "ShieldCheck", scope: "specific_store" },
        { type: "product_optimization", title: "Product Optimization", description: "Optimize listings — titles, descriptions, pricing psychology, cross-sells, and dead product cleanup", icon: "Sparkles", scope: "specific_store" },
        { type: "competitor_pricing_scan", title: "Competitor Pricing Scan", description: "Cross-platform pricing intelligence — Shopify + Amazon + Etsy + TikTok Shop in one report, with a recommended price band", icon: "DollarSign", scope: "global" },
        { type: "brand_identity_kit", title: "Brand Identity Kit", description: "Complete brand kit — voice + tone profile, color palette, name + tagline shortlist, and a logo concept — generated in one pass", icon: "Palette", scope: "global" },
      ],
      merchant: [
        { type: "store_optimization_sweep", title: "Store Optimization Sweep", description: "End-to-end existing-store improvement — sync, inventory health, margin guard, pricing change-set with approval gate, and top-N listing rewrites in one pass", icon: "Sparkles", scope: "specific_store" },
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
        { type: "margin_guard_audit", title: "Margin Guard Audit", description: "Scans every active SKU and flags products selling below your margin floor — with proposed price-fix or pause actions for owner approval", icon: "Shield", scope: "specific_store" },
        { type: "velocity_restock_predictor", title: "Velocity Restock Predictor", description: "Computes per-SKU sales velocity from real order data, projects stockout dates, and recommends reorder quantities tuned to supplier lead time", icon: "TrendingUp", scope: "specific_store" },
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
        { type: "subject_line_ab_test", title: "Subject-Line A/B Test", description: "Generates 5 subject-line variants using different psychological angles, predicts open-rate lift, and ranks the winner", icon: "Mail", scope: "global" },
        { type: "send_time_optimizer", title: "Send-Time Optimizer", description: "Builds a day-of-week × hour open-rate heatmap from your real SendGrid event data and recommends top 3 send windows for your audience", icon: "Clock", scope: "all_stores" },
      ],
    };
  }),
});
