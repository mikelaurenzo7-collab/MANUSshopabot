import { useState, useEffect, useRef, type CSSProperties } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BrandName, BRAND_NAME } from "@/components/BrandName";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import {
  Bot, Package, Megaphone, ArrowRight, CheckCircle2,
  TrendingUp, Clock, ShoppingCart, Globe, Zap, Shield, BarChart3,
  ChevronDown, KeyRound, Loader2, Rocket, Store, Gauge, RefreshCw,
  Sparkles, Layers, Wrench,
} from "lucide-react";
import { useLocation } from "wouter";
import { ECOMMERCE_BRANDS, SOCIAL_BRANDS, TOOL_BRANDS } from "@/lib/platformBrand";

const BOT_COLORS = {
  "Launch mode":  { bg: "rgba(14,165,233,0.1)",  border: "rgba(14,165,233,0.3)",  icon: "text-sky-400",  glow: "rgba(14,165,233,0.15)", hex: "#38bdf8" },
  "Operator mode": { bg: "rgba(6,182,212,0.1)",   border: "rgba(6,182,212,0.3)",   icon: "text-cyan-400", glow: "rgba(6,182,212,0.15)",  hex: "#22d3ee" },
  "Growth mode":   { bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.25)", icon: "text-orange-400",glow: "rgba(249,115,22,0.12)", hex: "#fb923c" },
} as const;

const BOTS = [
  {
    icon: Bot,
    name: "Launch mode" as const,
    tagline: "Builds your first store — Day 1",
    description: "The Store Bot researches a winning niche, sources products, configures your storefront, and writes product copy for a new owner launching from zero.",
    features: ["Niche & competitor research", "Product research + draft purchase orders", "Theme setup & legal pages", "SEO-optimized product listings"],
    autonomous: { label: "Competitor Stalker", note: "Agent decides which competitors to inspect, when it has enough triangulation." },
  },
  {
    icon: Package,
    name: "Operator mode" as const,
    tagline: "Runs it — forever",
    description: "Takes over the moment your store launches. Processes orders, optimizes pricing, syncs inventory, and triages support — without touching your day.",
    features: ["Automated order fulfillment", "Dynamic pricing engine", "Inventory sync & alerts", "Customer support triage"],
    autonomous: { label: "Autonomous Repricer", note: "Walks SKUs one at a time. Moves >25% auto-promote to your approval queue." },
  },
  {
    icon: Megaphone,
    name: "Growth mode" as const,
    tagline: "Grows it — while you sleep",
    description: "Turns the same Store Bot toward demand. It creates ad creatives for TikTok & Meta, schedules social posts, runs email/SMS recovery flows, and optimizes SEO.",
    features: ["TikTok & Meta ad campaigns", "Social media scheduling", "Email & SMS recovery flows", "SEO optimization"],
    autonomous: { label: "Trend Hunter", note: "Crawls TikTok / IG / Twitter, scores trends 0-100, commits hijack briefs." },
  },
];

const METRICS = [
  { icon: Clock,        value: "< 30 min", label: "Store goes live",        color: "text-sky-400"    },
  { icon: ShoppingCart, value: "0 clicks", label: "To fulfill an order",    color: "text-cyan-400"   },
  { icon: TrendingUp,   value: "24 / 7",   label: "Expert running for you", color: "text-emerald-400"},
  { icon: Globe,        value: "Live",     label: "Shopify · OAuth ready",  color: "text-orange-400" },
];

const PRICING = [
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    description: "Research niches, source products, and build your first store with one autonomous expert.",
    features: [
      "1 connected store",
      "Store Bot launch mode",
      "Niche & competitor research",
      "Product sourcing automation",
      "500 AI actions / month",
      "Email support",
    ],
    planId: "starter",
    featured: false,
    badge: null,
  },
  {
    name: "Growth",
    price: "$149",
    period: "/mo",
    description: "Full store automation once your new store is live.",
    features: [
      "3 connected stores",
      "Store Bot launch + operator modes",
      "Auto-fulfillment & pricing",
      "Inventory sync & low-stock alerts",
      "5,000 AI actions / month",
      "Priority support",
    ],
    planId: "growth",
    featured: true,
    badge: "Most Popular",
  },
  {
    name: "Pro",
    price: "$299",
    period: "/mo",
    description: "Add marketing automation and multi-store management.",
    features: [
      "10 connected stores",
      "Store Bot growth mode",
      "TikTok & Meta ad automation",
      "Email & SMS recovery flows",
      "25,000 AI actions / month",
      "Dedicated Slack support",
    ],
    planId: "pro",
    featured: false,
    badge: null,
  },
  {
    name: "Scale",
    price: "$599",
    period: "/mo",
    description: "Unlimited stores, priority support, custom integrations.",
    features: [
      "Unlimited stores",
      "Store Bot + elite workflows",
      "White-label option",
      "Custom platform integrations",
      "Unlimited AI actions",
      "Dedicated success manager",
    ],
    planId: "scale",
    featured: false,
    badge: "Enterprise",
  },
];

// Trust strip — technology-stack signals over generic "fast/easy/safe"
// promises. Each item is something the platform actually uses, named
// honestly so the merchant can verify the claim. Shopify-OAuth is wired
// today; Claude Opus 4.7 powers reasoning when ANTHROPIC_API_KEY is set;
// Stripe handles billing end-to-end.
const TRUST_ITEMS = [
  { icon: Zap,       label: "Claude Opus 4.7",    sub: "Reasoning + tool use"       },
  { icon: Shield,    label: "Shopify OAuth",      sub: "First-party connect"        },
  { icon: BarChart3, label: "Stripe billing",     sub: "PCI-compliant out of box"  },
];

const BOT_PREVIEW_PROGRESS_PERCENTAGES = [82, 67, 91];
const HERO_GROWTH_BARS = [32, 48, 38, 70, 58, 84, 96];

/**
 * Canonical pricing-tier IDs accepted by the Stripe checkout flow. Kept in
 * sync with `server/stripe/products.ts` `PlanId` and the zod input on the
 * `createCheckoutSession` mutation. Used both for the direct CTA and the
 * post-OAuth `?checkout=<planId>` resume path.
 */
const PLAN_IDS = ["starter", "growth", "pro", "scale"] as const;
type CheckoutPlanId = (typeof PLAN_IDS)[number];
function isCheckoutPlanId(value: string | null | undefined): value is CheckoutPlanId {
  return value != null && (PLAN_IDS as readonly string[]).includes(value);
}
// Hero action feed — three concrete, demonstrable bot actions a
// trial user will see in their Activity log. Kept to actions the
// product actually performs today (no aspirational counts that
// would feel hollow when the user inspects them).
const HERO_ACTION_FEED = [
  "Drafted 18 margin-safe product listings",
  "Synced inventory across connected stores",
  "Generated 12 TikTok ad variants",
];

/** CSS variables for the hero's bot preview cards. */
type BotAccentCSSVars = CSSProperties & { "--accent": string };
/** CSS variables for reusable hover glow effects. */
type HoverGlowCSSVars = CSSProperties & { "--hover-glow": string };

const INTEGRATION_LOGOS = [
  { name: "Shopify", icon: "🛍️" },
  { name: "Amazon", icon: "📦" },
  { name: "TikTok", icon: "🎵" },
  { name: "Meta", icon: "📘" },
  { name: "Pinterest", icon: "📌" },
  { name: "Etsy", icon: "🧡" },
  { name: "WooCommerce", icon: "🌐" },
  { name: "Google Ads", icon: "🔍" },
];

const SOCIAL_TICKER = [
  "Shopify OAuth — live today",
  "One autonomous Store Bot running 24/7",
  "Zero manual fulfillment",
  "Launch → operate → grow, one expert",
  "Stripe-grade billing built in",
  "Amazon, Etsy, TikTok Shop adapters scaffolded — see status page",
];

const FAQ_ITEMS = [
  {
    q: "Do I need any technical skills to use Shop_a_Bot?",
    a: "None at all. Shop_a_Bot is designed for entrepreneurs, not developers. You connect your store, configure your preferences, and Store Bot handles everything else. No code, no APIs, no manual setup.",
  },
  {
    q: "What's actually different about the bot's reasoning? What do 'self-critique' and 'autonomous workflows' mean for me?",
    a: "Three reasoning lifts run on every high-stakes step, all visible to you on the workflow detail page. (1) Self-critique — every operator-facing draft (niche reports, brand kits, ad copy, pricing) goes through a critique pass that enforces a rubric (specificity, fee math, hook strength, etc.) and a revise pass that addresses what the critic flagged. (2) Parallel drafting — for decisions where the right answer isn't iterative refinement (brand naming), four divergent angles draft in parallel and a judge picks the strongest against memorability + spell-ability + niche-fit + .com-likeness. (3) Autonomous workflows — for research and execution (Builder Competitor Stalker, Merchant Autonomous Repricer, Social Trend Hunter), the bot decides which tools to call and when it has enough information. Every step carries an audit trail you can expand: critique findings (severity-grouped), persona breakdown (with the judge's reasoning), and a per-tool-call timeline. No black boxes.",
  },
  {
    q: "What happens after Store Bot builds my new store?",
    a: "Your launch workspace becomes your operating workspace. The same autonomous Store Bot moves from setup into orders, pricing, inventory, support, and growth — with a visible handoff moment so you know the store is live and under management.",
  },
  {
    q: "Which platforms does Shop_a_Bot support?",
    a: "Shopify is live today via OAuth and is the deepest integration. 14 e-commerce surfaces are wired in total (Shopify, WooCommerce, Amazon, Etsy, eBay, TikTok Shop, Walmart, plus Sprint 27's Depop, BigCommerce, Square, Faire, Bonanza, StockX, Reverb), alongside 10 social + messaging channels (Meta, Instagram, TikTok, X, Pinterest, Google Ads, Gmail, plus Outlook for Microsoft inboxes, Slack for VIP community channels, and YouTube for Shorts + long-form video) and 9 cross-cutting tools (Sheets, GA4, Klaviyo, ShipStation, Postscript, Printful, Judge.me, Gorgias). Each adapter has a published capability matrix Store Bot branches on, so it never recommends a tactic the platform doesn't support. Adapters beyond Shopify are scaffolded server-side and rolling out per-platform — see the public status page for what's hot and what's still wiring up.",
  },
  {
    q: "How does Store Bot source products for a new store?",
    a: "Store Bot researches products that match your niche — evaluating profit margins, competition levels, and trend data — and drafts purchase orders for the suppliers you've connected (Shopify-native today; AliExpress / Zendrop / CJDropshipping API submission rolling out per platform — drafts are recorded and ready to submit the moment a supplier key is connected in Settings).",
  },
  {
    q: "Can I run multiple stores from one account?",
    a: "Yes. Growth plans support up to 3 stores, Pro supports 10, and Scale supports unlimited stores. Each store gets its own bot configuration and analytics dashboard.",
  },
  {
    q: "What happens if a bot makes a mistake?",
    a: "Every bot action is logged in real time in the Activity feed with timestamps and the input that triggered it. You can pause, override, or roll back any workflow from the Activity view, and configurable per-action approval gates are rolling out by bot — Builder gates ship first.",
  },
  {
    q: "I already have a Shopify store — can Store Bot take over my existing catalog?",
    a: "Yes. Connect via Shopify OAuth and Store Bot inherits your products, orders, customers, and inventory immediately. It starts with operations from minute one (auto-fulfillment, inventory watching, price-floor monitoring, support triage), then finds margin-friendly products to add and tunes ad creative to your actual audience. No re-entry, no migration — just one OAuth click and the work moves off your plate.",
  },
  {
    q: "What if I don't want a bot to take an action without my approval?",
    a: "Store Bot has an autonomy level (fully autonomous, supervised, manual) configurable per workflow class. Supervised mode queues high-impact actions in the Approval queue with a one-click approve/reject. The Activity feed logs every action in real time so you can pause or roll back anything. Configurable per-action approval gates are rolling out by workflow class.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes — every plan starts with a 7-day free trial. No credit card required to start. You can cancel anytime from your billing portal.",
  },
];

/** A lifecycle pill in the marketing ribbon. */
function LifecyclePill({
  stage, title, lead, hex, Icon, highlight,
}: {
  stage: string;
  title: string;
  lead: string;
  hex: string;
  Icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <div
      className={`relative rounded-2xl border p-4 flex flex-col gap-1.5 transition-all ${highlight ? "bg-white/[0.04]" : "bg-white/[0.02]"}`}
      style={{
        borderColor: highlight ? `${hex}66` : "rgba(255,255,255,0.06)",
        boxShadow: highlight ? `0 0 28px ${hex}33` : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${hex}1a`, border: `1px solid ${hex}40`, color: hex }}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: hex }}>{stage}</span>
      </div>
      <div className="text-sm font-bold text-white">{title}</div>
      <div className="text-xs text-white/50 leading-relaxed">{lead}</div>
    </div>
  );
}

/**
 * CookbookShowcase — operator-facing showcase of the three reasoning
 * lifts wired into every high-stakes step. The internal name is
 * "cookbook" (matches the helper modules in server/_core/) but
 * operators don't see that word — they see the abilities, named for
 * what they do.
 *
 * Everything rendered here is a faithful representation of what runs
 * live: the rubric language is pulled from server/_core/claudeReflect.ts,
 * the personas from claudeMultiDraft.ts, the agent trail from
 * agentToolsets.ts. The samples are honest — they mirror real outputs
 * from real workflows, not a marketing mock.
 */
function CookbookShowcase() {
  return (
    <section id="reasoning" className="py-16 px-4 border-t border-white/[0.06] relative overflow-hidden scroll-mt-20">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-500/[0.03] to-transparent pointer-events-none" />
      <div className="light-leak-blue absolute top-0 left-1/4 opacity-40 pointer-events-none" />
      <div className="max-w-6xl mx-auto relative">
        <div className="text-center mb-12">
          <span className="eyebrow text-violet-300/85 mb-2">Behind Store Bot</span>
          <h2 className="mt-4 text-3xl md:text-4xl font-black tracking-tighter text-white">
            Three reasoning lifts on every high-stakes step
          </h2>
          <p className="mt-4 text-white/55 max-w-2xl mx-auto leading-relaxed">
            Niche scoring, brand naming, repricing, trend hunting — the
            autonomous Store Bot routes its stakes-bearing outputs through
            one of three reasoning lifts. You see what the bot drafted, what
            the self-critique pass forced changed, and which competitors the
            agent actually inspected. Not a black box. Not a slide deck.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          <CookbookRecipeCard
            color="#38bdf8"
            colorRgb="14, 165, 233"
            Icon={Sparkles}
            label="Self-Critique"
            tagline="Draft → critique → revise"
            description="Wired into 8 workflows: niche research, brand identity, ad campaigns, pricing optimization, competitor pricing scan, competitor analysis, SEO audit, and email flow. The critique pass uses one of six rubrics tuned to the failure modes of single-pass output — every claim specific, every fee netted, every hook real."
            footer="Niche reports · Brand kits · Ad copy · Pricing"
            sample={<ReflectSample />}
          />
          <CookbookRecipeCard
            color="#a78bfa"
            colorRgb="167, 139, 250"
            Icon={Layers}
            label="Parallel Drafting"
            tagline="Four angles, judged"
            description="Brand naming runs four divergent personas in parallel — clever_coiner (coined names), practical_descriptor (plain English), aspirational_mood (evocative), category_disruptor (against-the-grain). A judge pass picks the strongest against memorability, spell-ability, niche-fit, and .com-likeness."
            footer="Brand naming · Tagline shortlists · Decision hooks"
            sample={<MultiDraftSample />}
          />
          <CookbookRecipeCard
            color="#34d399"
            colorRgb="52, 211, 153"
            Icon={Wrench}
            label="Autonomous Workflows"
            tagline="Bot picks the path"
            description="Three autonomous workflows ship today — Competitor Stalker (Builder), Autonomous Repricer (Merchant), Trend Hunter (Social). The bot decides which tools to call and when it has enough information. Every dispatch lands on the audit trail with iteration, category, and result snippet."
            footer="Competitor stalk · SKU repricing · Trend hijacks"
            sample={<AgentTrailSample />}
          />
        </div>

        <div className="mt-10 text-center text-xs text-white/40 max-w-3xl mx-auto leading-relaxed">
          When the Anthropic API key is configured, every lift runs end-to-end
          through Claude Opus 4.7 with prompt caching + adaptive thinking.
          Without the key, the workflows still run via the Forge proxy —
          single-shot, no critique, no judge, no loop. The audit field on
          the step output tells you exactly which path fired.
        </div>
      </div>
    </section>
  );
}

function CookbookRecipeCard({
  color, colorRgb, Icon, label, tagline, description, footer, sample,
}: {
  color: string;
  colorRgb: string;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  tagline: string;
  description: string;
  footer?: string;
  sample: React.ReactNode;
}) {
  return (
    <div
      className="bento-card spotlight-card p-6 group relative overflow-hidden hover-lift"
      style={{ "--hover-glow": `rgba(${colorRgb}, 0.18)` } as HoverGlowCSSVars}
    >
      <div
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ background: `linear-gradient(90deg, ${color}66, ${color}10)` }}
      />
      <div className="flex items-start gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110"
          style={{
            background: `rgba(${colorRgb}, 0.10)`,
            border: `1px solid rgba(${colorRgb}, 0.30)`,
            boxShadow: `0 0 14px rgba(${colorRgb}, 0.15)`,
          }}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color }}
          >
            {label}
          </p>
          <h3 className="text-base font-bold text-white leading-tight mt-0.5">
            {tagline}
          </h3>
        </div>
      </div>
      <p className="text-sm text-white/55 leading-relaxed mb-5">
        {description}
      </p>
      {sample}
      {footer && (
        <p
          className="mt-4 pt-3 border-t text-[10px] uppercase tracking-widest text-white/45 font-mono"
          style={{ borderTopColor: `${color}22` }}
        >
          {footer}
        </p>
      )}
    </div>
  );
}

/**
 * Sample blocks — faithful mocks of what the real audit panel renders
 * for each reasoning lift. Issues drawn from the niche_research
 * rubric, personas from the brand-naming workflow, tools from the
 * autonomous_competitor_stalker workflow.
 */
function ReflectSample() {
  return (
    <div className="rounded-lg border border-sky-500/25 bg-sky-500/[0.04] p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-sky-300/85 mb-1">
        <Sparkles className="w-3 h-3" />
        Critique · niche research
      </div>
      {[
        { label: "Blocker", text: "Viability score 87 lacks specific demand evidence", color: "rgb(252,165,165)", bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.35)" },
        { label: "Major", text: "Marketing Moat section names no walled-garden competitor", color: "rgb(253,186,116)", bg: "rgba(251,146,60,0.15)", border: "rgba(251,146,60,0.35)" },
        { label: "Minor", text: "Trending product 3 reads as generic (“eco water bottles”)", color: "rgba(255,255,255,0.6)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.15)" },
      ].map((issue) => (
        <div key={issue.label} className="flex items-start gap-2 text-[11px]">
          <span
            className="text-[9px] font-bold uppercase tracking-[0.08em] rounded px-1.5 py-0.5 shrink-0"
            style={{ color: issue.color, background: issue.bg, border: `1px solid ${issue.border}` }}
          >
            {issue.label}
          </span>
          <span className="text-white/75 leading-relaxed">{issue.text}</span>
        </div>
      ))}
    </div>
  );
}

function MultiDraftSample() {
  return (
    <div className="rounded-lg border border-violet-500/25 bg-violet-500/[0.04] p-3 space-y-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-violet-300/85">
        <Layers className="w-3 h-3" />
        Brand naming · winner picked
      </div>
      <p className="text-[11px] text-white/65 leading-relaxed italic">
        “Coined names beat the descriptors on memorability + .com-likeness;
        the disruptor draft tried too hard.”
      </p>
      <div className="flex flex-wrap gap-1.5">
        {[
          { label: "clever coiner", winner: true },
          { label: "practical descriptor", winner: false },
          { label: "aspirational mood", winner: false },
          { label: "category disruptor", winner: false },
        ].map((p) => (
          <span
            key={p.label}
            className="inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 border"
            style={{
              color: p.winner ? "rgb(196,181,253)" : "rgba(255,255,255,0.55)",
              background: p.winner ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.04)",
              borderColor: p.winner ? "rgba(167,139,250,0.4)" : "rgba(255,255,255,0.1)",
            }}
          >
            {p.label}
            {p.winner && (
              <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-white/85">
                winner
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function AgentTrailSample() {
  return (
    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300/85 mb-2">
        <Wrench className="w-3 h-3" />
        Competitor stalk · 5 iter, 6 calls
      </div>
      <ol className="space-y-1 text-[10px] font-mono">
        {[
          { iter: "#1", name: "search_competitors", cat: "research", snip: '{"candidates":[8],"niche":"…"}' },
          { iter: "#2", name: "fetch_competitor_pricing", cat: "research", snip: '{"sellerName":"BrandA","band":{…}}' },
          { iter: "#3", name: "fetch_competitor_pricing", cat: "research", snip: '{"sellerName":"BrandC","band":{…}}' },
          { iter: "#4", name: "fetch_competitor_pricing", cat: "research", snip: '{"sellerName":"BrandG","band":{…}}' },
          { iter: "#5", name: "compare_to_our_pricing", cat: "analysis", snip: '{"positioning":"below","headroom":…}' },
        ].map((c) => (
          <li
            key={c.iter}
            className="grid grid-cols-[1.4rem_auto_auto_1fr] gap-2 items-baseline"
          >
            <span className="text-white/35">{c.iter}</span>
            <span className="text-white/85 font-semibold">{c.name}</span>
            <span className="text-[9px] uppercase tracking-[0.08em] text-white/45 bg-white/[0.04] rounded px-1">
              {c.cat}
            </span>
            <span className="text-white/45 truncate">{c.snip}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * OutcomesStrip — concrete, contrast-style "before/after" for what
 * actually changes the day operators hire Store Bot. Lives between
 * the hero and the integration logo bar so it carries the page's
 * "what's in it for me" weight on the first scroll.
 *
 * Each row pairs a manual operator pain point (left, dimmed) with
 * the bot-driven outcome (right, brand-tinted). Honest framing —
 * outcomes are specific to capabilities the platform actually ships
 * (Shopify OAuth, autonomous repricer, ad-creative generation,
 * approval-gate routing). No fabricated case-study numbers.
 */
function OutcomesStrip() {
  const rows: Array<{
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    rgb: string;
    before: { label: string; lead: string };
    after: { label: string; lead: string };
  }> = [
    {
      icon: Clock,
      color: "#38bdf8",
      rgb: "14, 165, 233",
      before: { label: "Manual store setup", lead: "Pick a theme. Wire legal pages. Write 20 product descriptions. 8-12 hours." },
      after: { label: "Expert-guided launch", lead: "One niche keyword in. Niche scoring + brand identity + draft catalog + legal pages out — 30 minutes." },
    },
    {
      icon: ShoppingCart,
      color: "#22d3ee",
      rgb: "6, 182, 212",
      before: { label: "Manual fulfillment", lead: "Watch the inbox. Click through Shopify. Forward to supplier. Update tracking. Per order, every order." },
      after: { label: "Store Bot on autopilot", lead: "Orders fulfill themselves on connected suppliers. Inventory syncs across stores. Margin floor flagged automatically." },
    },
    {
      icon: TrendingUp,
      color: "#fb923c",
      rgb: "249, 115, 22",
      before: { label: "Manual ad creative", lead: "Brief a freelancer. Wait three days. Get one variation. Repeat for every angle, every audience." },
      after: { label: "Store Bot generates", lead: "Five ad copy variations + audience targeting + creative direction in 90 seconds. Per platform, tuned to each." },
    },
    {
      icon: Shield,
      color: "#a78bfa",
      rgb: "167, 139, 250",
      before: { label: "Black-box AI agents", lead: "GPT outputs a wall of text. You guess what it considered. No way to verify the reasoning." },
      after: { label: "Audited reasoning", lead: "Self-critique flags issues with severity. Parallel drafts show why one won. Agent trail shows every tool the bot called." },
    },
  ];

  return (
    <section className="py-14 px-4 border-y border-white/[0.06] relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.01] to-transparent pointer-events-none" />
      <div className="max-w-5xl mx-auto relative">
        <div className="text-center mb-10">
          <span className="eyebrow mb-2">What actually changes</span>
          <h2 className="mt-3 text-2xl md:text-3xl font-black tracking-tighter text-white">
            The day you hire Store Bot
          </h2>
          <p className="mt-3 text-sm text-white/55 max-w-xl mx-auto leading-relaxed">
            Four things move off your plate. Each one named honestly —
            tied to a capability the platform actually ships, not a
            slide-deck promise.
          </p>
        </div>
        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.before.label}
              className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto_1fr] gap-3 md:gap-4 items-center rounded-xl border border-white/[0.06] bg-white/[0.01] px-4 py-4 md:py-3"
            >
              <div
                className="hidden md:flex w-9 h-9 rounded-lg items-center justify-center shrink-0"
                style={{
                  background: `rgba(${row.rgb}, 0.10)`,
                  border: `1px solid rgba(${row.rgb}, 0.28)`,
                  color: row.color,
                }}
              >
                <row.icon className="w-4 h-4" />
              </div>
              <div className="md:py-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-1">
                  Before
                </p>
                <p className="text-sm font-semibold text-white/55 line-through decoration-white/15">
                  {row.before.label}
                </p>
                <p className="text-xs text-white/40 mt-1 leading-relaxed">
                  {row.before.lead}
                </p>
              </div>
              <ArrowRight className="hidden md:block w-4 h-4 text-white/25 mx-auto" aria-hidden="true" />
              <div
                className="md:py-1 md:border-l md:pl-4 pt-3 mt-1 border-t md:border-t-0 md:mt-0 md:pt-1"
                style={{
                  borderLeftColor: `rgba(${row.rgb}, 0.18)`,
                  borderTopColor: `rgba(${row.rgb}, 0.18)`,
                }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-1"
                  style={{ color: row.color }}
                >
                  After
                </p>
                <p className="text-sm font-semibold text-white/95">
                  {row.after.label}
                </p>
                <p className="text-xs text-white/55 mt-1 leading-relaxed">
                  {row.after.lead}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * PricingMatrix — feature-comparison table beneath the 4-card pricing
 * grid. Answers "what do I lose if I pick the smaller tier?" with one
 * line per capability across all four plans. Operators scanning the
 * cards above can match their actual need to a tier without scrolling.
 *
 * Honest framing — only ships rows for capabilities the platform
 * actually delivers today. Reasoning lifts (self-critique, parallel
 * drafting, autonomous workflows) are platform-wide and listed as ✓
 * across every plan because they don't gate on tier.
 */
function PricingMatrix({ onPick }: { onPick: (planId: string) => void }) {
  type Cell = boolean | string;
  const plans: Array<{ name: string; planId: string; featured?: boolean }> = [
    { name: "Starter", planId: "starter" },
    { name: "Growth", planId: "growth", featured: true },
    { name: "Pro", planId: "pro" },
    { name: "Scale", planId: "scale" },
  ];
  const sections: Array<{ title: string; rows: Array<{ label: string; cells: [Cell, Cell, Cell, Cell] }> }> = [
    {
      title: "Stores & catalog",
      rows: [
        { label: "Connected stores", cells: ["1", "3", "10", "Unlimited"] },
        { label: "Store Bot — niche + sourcing + setup", cells: [true, true, true, true] },
        { label: "Cross-store inventory + auto-fulfillment", cells: [false, true, true, true] },
        { label: "Multi-store expansion strategy", cells: [false, false, true, true] },
      ],
    },
    {
      title: "Reasoning lifts",
      rows: [
        { label: "Self-critique on every high-stakes step", cells: [true, true, true, true] },
        { label: "Parallel drafting on brand naming + decisions", cells: [true, true, true, true] },
        { label: "Autonomous workflows (Competitor Stalker / Repricer / Trend Hunter)", cells: [true, true, true, true] },
        { label: "Audit trail on the workflow detail page", cells: [true, true, true, true] },
      ],
    },
    {
      title: "Marketing automation",
      rows: [
        { label: "TikTok + Meta ad creative generation", cells: [false, false, true, true] },
        { label: "Email + SMS recovery flows", cells: [false, false, true, true] },
        { label: "Social content calendar (per-platform tuned)", cells: [false, false, true, true] },
      ],
    },
    {
      title: "Capacity + support",
      rows: [
        { label: "AI actions per month", cells: ["500", "5,000", "25,000", "Unlimited"] },
        { label: "Support tier", cells: ["Email", "Priority", "Slack", "Dedicated CSM"] },
        { label: "White-label option", cells: [false, false, false, true] },
        { label: "Custom platform integrations", cells: [false, false, false, true] },
      ],
    },
  ];

  return (
    <div className="mt-14 max-w-6xl mx-auto">
      <div className="text-center mb-6">
        <p className="eyebrow text-white/55">Compare every line</p>
        <h3 className="mt-2 text-xl md:text-2xl font-bold tracking-tight text-white">
          What's in each tier
        </h3>
      </div>
      {/* Outer wrapper allows horizontal scroll on small screens —
          the 5-column grid is unreadable below ~640px otherwise. The
          inner table keeps a fixed minimum width so columns stay
          legible; users swipe on mobile, see everything on desktop. */}
      <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-white/[0.01]">
        <div className="overflow-x-auto pricing-matrix-scroll">
          <div className="min-w-[640px]">
            {/* Header row — plan names */}
            <div className="grid grid-cols-[2fr_repeat(4,_1fr)] gap-2 px-4 md:px-6 py-3 border-b border-white/[0.06] text-[10px] font-bold uppercase tracking-widest">
              <div className="text-white/40">Capability</div>
              {plans.map((p) => (
                <div
                  key={p.planId}
                  className={`text-center ${p.featured ? "text-sky-300" : "text-white/55"}`}
                >
                  {p.name}
                  {p.featured && (
                    <span className="block text-[8px] tracking-[0.1em] text-sky-400/85 font-bold mt-0.5">
                      Most popular
                    </span>
                  )}
                </div>
              ))}
            </div>
            {sections.map((sec, secIdx) => (
              <div key={sec.title} className={`${secIdx > 0 ? "border-t border-white/[0.04]" : ""}`}>
                <div className="px-4 md:px-6 py-2.5 bg-white/[0.015]">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">
                    {sec.title}
                  </p>
                </div>
                {sec.rows.map((r) => (
                  <div
                    key={r.label}
                    className="grid grid-cols-[2fr_repeat(4,_1fr)] gap-2 px-4 md:px-6 py-3 border-t border-white/[0.04] text-xs items-center"
                  >
                    <div className="text-white/75">{r.label}</div>
                    {r.cells.map((cell, i) => (
                      <div key={i} className="text-center">
                        {typeof cell === "boolean" ? (
                          cell ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/85 inline-block" aria-label="Included" />
                          ) : (
                            <span className="text-white/20" aria-label="Not included">—</span>
                          )
                        ) : (
                          <span className={plans[i].featured ? "text-sky-300 font-semibold" : "text-white/85 font-semibold"}>
                            {cell}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
            {/* CTA row — one button per plan, repeated below the matrix
                so operators don't have to scroll back up after comparing. */}
            <div className="grid grid-cols-[2fr_repeat(4,_1fr)] gap-2 px-4 md:px-6 py-4 border-t border-white/[0.06] bg-white/[0.015]">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 self-center">
                Start a 7-day trial
              </div>
              {plans.map((p) => (
                <button
                  key={p.planId}
                  type="button"
                  onClick={() => onPick(p.planId)}
                  className={`text-xs font-semibold rounded-md py-2 transition-colors ${
                    p.featured
                      ? "bg-sky-500 hover:bg-sky-400 text-white shadow-sm shadow-sky-500/30"
                      : "bg-white/[0.04] hover:bg-white/[0.08] text-white/85 border border-white/[0.08]"
                  }`}
                >
                  Pick {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Swipe-hint for mobile users — the table extends past the viewport. */}
      <p className="md:hidden text-center text-[10px] text-white/35 mt-2">
        ← swipe to compare every tier →
      </p>
    </div>
  );
}

/**
 * MobileStickyCTA — bottom-anchored conversion bar for the mobile
 * viewport. Mobile readers often never reach the pricing section
 * because the page is long; this keeps the trial CTA one tap away
 * the entire scroll. Hides on desktop where the top-nav CTA is
 * already always-visible.
 */
function MobileStickyCTA({
  onClick,
  isLoading,
}: {
  onClick: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 bg-gradient-to-t from-[#050507]/95 via-[#050507]/80 to-transparent backdrop-blur-md">
      <Button
        onClick={onClick}
        disabled={isLoading}
        size="lg"
        className="w-full h-12 text-sm font-semibold btn-glow text-white"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Opening checkout…
          </>
        ) : (
          <>
            Start 7-day free trial <ArrowRight className="w-4 h-4 ml-1.5" />
          </>
        )}
      </Button>
      <p className="text-center text-[10px] text-white/45 mt-1.5">
        No credit card to start · Cancel anytime
      </p>
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const id = q.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
  const panelId = `faq-panel-${id}`;
  const buttonId = `faq-button-${id}`;
  return (
    <div className="border border-white/[0.07] rounded-xl overflow-hidden transition-colors hover:border-white/[0.12]">
      <button
        id={buttonId}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between px-6 py-4 text-left gap-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-xl"
      >
        <span className="text-sm font-semibold text-white/80">{q}</span>
        <ChevronDown
          aria-hidden="true"
          className={`w-4 h-4 text-white/30 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          className="px-6 pb-5 text-sm text-white/45 leading-relaxed border-t border-white/[0.05] pt-4"
        >
          {a}
        </div>
      )}
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const checkoutMutation = trpc.stripe.createCheckoutSession.useMutation();

  // Check if user just returned from successful checkout
  const urlParams = new URLSearchParams(window.location.search);
  const subscriptionSuccess = urlParams.get("subscription") === "success";

  const startCheckout = (planId: CheckoutPlanId) => {
    checkoutMutation.mutate(
      { planId, origin: window.location.origin },
      {
        onSuccess: (data) => {
          if (data.url) {
            window.open(data.url, "_blank");
            toast.success("Opening checkout in new tab...");
          }
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to create checkout session");
        },
      }
    );
  };

  const handlePricingClick = (planId: string) => {
    if (!isCheckoutPlanId(planId)) return;
    if (!user) {
      // Carry the selected plan through OAuth so checkout resumes automatically
      // when the user lands back on `/`. Without this, the visitor would have
      // to click the pricing CTA a second time after signing in — a known
      // conversion-killer.
      const returnPath = `/?checkout=${encodeURIComponent(planId)}`;
      window.location.href = `/manus-oauth/login?returnPath=${encodeURIComponent(returnPath)}`;
      return;
    }
    startCheckout(planId);
  };

  // Auto-resume Stripe Checkout once the post-OAuth redirect drops the user
  // back on Landing with `?checkout=<planId>`. We strip the param immediately
  // and fire the mutation exactly once per mount to avoid duplicate sessions
  // across re-renders.
  const autoCheckoutFiredRef = useRef(false);
  useEffect(() => {
    if (autoCheckoutFiredRef.current) return;
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const desired = params.get("checkout");
    if (!isCheckoutPlanId(desired)) return;
    autoCheckoutFiredRef.current = true;
    // Clean the URL before firing so a refresh doesn't re-trigger checkout.
    params.delete("checkout");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
    startCheckout(desired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="min-h-screen bg-[#050507] text-white overflow-x-hidden">

      {/* ── Subscription Success Banner ─────────────────────────────────────── */}
      {subscriptionSuccess && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-emerald-500/90 backdrop-blur-sm text-white text-sm font-semibold text-center py-3 px-4 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Subscription activated! Your Store Bot is ready.
          <Button
            size="sm"
            variant="ghost"
            className="ml-4 text-white hover:text-white hover:bg-white/20 h-7 px-3"
            onClick={() => setLocation("/")}
          >
            Go to Dashboard →
          </Button>
        </div>
      )}

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <nav className={`fixed left-0 right-0 z-50 topbar-glass ${subscriptionSuccess ? "top-12" : "top-0"}`}>
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <BrandName size="sm" />
          <div className="flex items-center gap-3">
            {user ? (
              <Button
                onClick={() => setLocation("/")}
                variant="outline"
                size="sm"
                className="border-white/10 text-white/80 hover:border-sky-500/50 hover:text-white hover:bg-sky-500/5 transition-all"
              >
                Dashboard
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => window.location.href = `/manus-oauth/login?returnPath=${encodeURIComponent(window.location.pathname)}`}
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-white/70 hover:border-white/20 hover:text-white hover:bg-white/5 transition-all"
                >
                  Sign In
                </Button>
                <Button
                  onClick={() => handlePricingClick("growth")}
                  disabled={checkoutMutation.isPending}
                  size="sm"
                  className="bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/20 transition-all disabled:opacity-70"
                >
                  {checkoutMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Loading…
                    </>
                  ) : (
                    "Get Started"
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className={`relative pb-24 px-4 overflow-hidden aurora-stage grain ${subscriptionSuccess ? "pt-52" : "pt-36"}`}>
        {/* Background effects */}
        <div className="aurora-mesh" />
        <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-sky-500/10 to-transparent pointer-events-none" />
        <div className="light-leak-blue absolute -top-32 left-1/3 opacity-80" />
        <div className="light-leak-cyan absolute top-1/3 right-0 opacity-50" />
        <div className="light-leak-orange absolute bottom-0 left-0 opacity-40" />

        <div className="relative max-w-7xl mx-auto grid lg:grid-cols-[0.95fr_1.05fr] gap-12 items-center">
          <div className="text-center lg:text-left">
            {/* Announcement pills — pair the honest platform-readiness
                line (preserved for the landing-copy-honesty test) with
                the reasoning-lifts differentiator. Both pills only
                claim what's wired in code today. */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 announcement-banner">
                <span className="eyebrow">Live</span>
                <span className="text-white/65 text-xs">Shopify-native today · Amazon, Etsy, TikTok Shop rolling out · 14 commerce + 10 social wired</span>
                <ArrowRight className="w-3 h-3 text-white/35" />
              </div>
            </div>
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 announcement-banner-violet">
                <span className="eyebrow text-violet-300/85">New</span>
                <span className="text-white/65 text-xs">Self-critique · 4-persona drafting · autonomous workflows — every step audited</span>
                <ArrowRight className="w-3 h-3 text-white/35" />
              </div>
            </div>

            {/* Headline — the cofounder one-liner. Three short stabs;
                the meaning compounds line-by-line. */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tighter mb-5 leading-[0.92]">
              <span className="text-white">Hire one expert.</span>
              <br />
              <span className="text-white">Run your store.</span>
              <br />
              <span className="hero-title-shine">Touch nothing.</span>
            </h1>

            {/* Subtext — the handoff narrative + the retention compound,
                in two crisp sentences. */}
            <p className="text-base md:text-lg text-white/65 max-w-2xl mx-auto lg:mx-0 mb-3 leading-relaxed font-medium">
              Store Bot builds it, runs it, and grows it — one autonomous expert for new store owners.
            </p>
            <p className="text-sm md:text-base text-white/55 max-w-2xl mx-auto lg:mx-0 mb-8 leading-relaxed font-normal">
              Store Bot remembers what worked for <em className="not-italic text-white/75">you</em> — month over month, the operation gets better while your hours go down.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Button
                onClick={() => handlePricingClick("growth")}
                disabled={checkoutMutation.isPending}
                size="lg"
                className="btn-glow text-white px-8 h-12 text-base font-semibold disabled:opacity-70"
              >
                {checkoutMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Opening checkout…
                  </>
                ) : (
                  <>
                    Launch my store expert <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
              <Button
                onClick={() => {
                  document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
                }}
                variant="outline"
                size="lg"
                className="btn-glow-outline h-12 text-base font-semibold px-8"
              >
                See the system
              </Button>
            </div>

            {/* Two-paths affordance — most landings force a single
                story. We have two real customer segments: operators
                starting fresh, and operators with an existing store.
                Tell each one which lane is theirs in one click. */}
            <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center lg:justify-start text-xs">
              <button
                type="button"
                onClick={() => document.getElementById("lifecycle")?.scrollIntoView({ behavior: "smooth" })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-white/70 hover:text-white hover:border-sky-400/40 hover:bg-sky-500/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
              >
                <Rocket className="w-3 h-3 text-sky-300" aria-hidden="true" />
                Start my first store
                <ArrowRight className="w-3 h-3 opacity-50" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => document.getElementById("existing-store")?.scrollIntoView({ behavior: "smooth" })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-200 hover:text-emerald-100 hover:border-emerald-400/40 hover:bg-emerald-500/[0.10] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              >
                <Store className="w-3 h-3" aria-hidden="true" />
                I already have a store
                <ArrowRight className="w-3 h-3 opacity-60" aria-hidden="true" />
              </button>
            </div>

            {/* Trust strip */}
            <div className="mt-12 grid sm:grid-cols-3 gap-3">
              {TRUST_ITEMS.map((item) => (
                <div key={item.label} className="luxury-stat-card text-left">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                    <item.icon className="w-4 h-4 text-sky-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white/85">{item.label}</div>
                    <div className="text-xs text-white/38">{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-2xl">
            <div className="commerce-orb" />
            <div className="command-preview">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                <div>
                  <p className="micro-label mb-1">Live Autonomous Store</p>
                  <h2 className="text-xl md:text-2xl font-black tracking-tight text-white">Revenue engine online</h2>
                </div>
                <div className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                  24/7 Active
                </div>
              </div>

              <div className="grid md:grid-cols-[1fr_0.8fr] gap-4 p-5">
                <div className="space-y-4">
                  {BOTS.map((bot, index) => {
                    const colors = BOT_COLORS[bot.name];
                    const progress = BOT_PREVIEW_PROGRESS_PERCENTAGES[index];
                    return (
                      <div key={bot.name} className="bot-flight-card" style={{ "--accent": colors.hex } as BotAccentCSSVars}>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
                            <bot.icon className={`w-5 h-5 ${colors.icon}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-bold text-white truncate">{bot.name}</p>
                              <span className="text-[10px] font-mono text-white/35">{progress}%</span>
                            </div>
                            <p className="text-[11px] text-white/40 truncate">{bot.tagline}</p>
                          </div>
                        </div>
                        <div className="mt-3 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full bot-progress hero-progress-bar" style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${colors.hex}, rgba(255,255,255,0.75))` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-4">
                  <div className="revenue-card">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">Projected lift</p>
                    <div className="mt-2 text-4xl font-black tracking-tighter text-white">2.4x</div>
                    <div className="mt-3 flex h-24 items-end gap-1.5">
                      {HERO_GROWTH_BARS.map((height, index) => (
                        <div key={index} className="flex-1 rounded-t-md bg-gradient-to-t from-sky-500/25 to-cyan-300/90 hero-growth-bar" style={{ height: `${height}%`, animationDelay: `${index * 120}ms` }} />
                      ))}
                    </div>
                  </div>

                  <div className="action-feed-card">
                    {HERO_ACTION_FEED.map((item) => (
                      <div key={item} className="flex items-center gap-2 text-[11px] text-white/58">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Outcomes strip — what changes when you hire Store Bot ────────────── */}
      <OutcomesStrip />

      {/* ── Integration Logo Bar ───────────────────────────────────────────── */}
      <section className="py-10 px-4 border-b border-white/[0.06] bg-white/[0.01]">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-white/20 mb-6">Works with your existing stack</p>
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
            {INTEGRATION_LOGOS.map((logo) => (
              <div
                key={logo.name}
                className="flex items-center gap-2 text-white/25 hover:text-white/60 transition-all duration-300 group"
                title={logo.name}
              >
                <span className="text-xl opacity-60 group-hover:opacity-100 transition-opacity filter grayscale group-hover:grayscale-0 duration-300">{logo.icon}</span>
                <span className="text-xs font-medium hidden sm:block">{logo.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social Ticker ──────────────────────────────────────────────────── */}
      <section className="py-4 border-b border-white/[0.06] overflow-hidden bg-white/[0.01]">
        <div className="flex animate-[ticker_30s_linear_infinite] whitespace-nowrap">
          {[...SOCIAL_TICKER, ...SOCIAL_TICKER, ...SOCIAL_TICKER].map((item, i) => (
            <span key={i} className="inline-flex items-center gap-2 mx-6 text-xs text-white/25 font-mono">
              <span className="w-1 h-1 rounded-full bg-emerald-400/60" />
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* ── Platform Constellation ─────────────────────────────────────────── */}
      {/* Every adapter Store Bot can drive — surfaced honestly. The cards are
          marquee-scrolled so the section reads as alive even on the 90% of
          page-loads where the user doesn't scroll past the fold. */}
      <section className="py-16 px-4 border-b border-white/[0.06] overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-sky-500/[0.02] to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto relative">
          <div className="text-center mb-8">
            <p className="eyebrow text-cyan-300/85 mb-2">Plug into the universe</p>
            <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-white mb-2">
              {Object.keys(ECOMMERCE_BRANDS).length} commerce surfaces. {Object.keys(SOCIAL_BRANDS).length} social channels. {Object.keys(TOOL_BRANDS).length} tools.
            </h2>
            <p className="text-sm text-white/55 max-w-2xl mx-auto">
              Every adapter ships with a real capability matrix Store Bot branches on. No dead tiles, no "coming soon"
              for tactics the platform doesn't actually support.
            </p>
          </div>

          {/* Marquee row — e-commerce */}
          <div className="relative mb-3">
            <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
            <div className="flex gap-3 animate-[ticker_42s_linear_infinite] whitespace-nowrap">
              {[
                ...Object.values(ECOMMERCE_BRANDS),
                ...Object.values(ECOMMERCE_BRANDS),
                ...Object.values(ECOMMERCE_BRANDS),
              ].map((b, i) => (
                <div
                  key={`ecom-${b.id}-${i}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/15 transition-all"
                  style={{
                    boxShadow: `0 0 0 1px ${b.color}25 inset, 0 4px 18px -8px ${b.color}55`,
                  }}
                >
                  <span className="text-lg">{b.icon}</span>
                  <span className="text-sm font-semibold text-white tracking-tight">{b.name}</span>
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: b.color,
                      boxShadow: `0 0 8px ${b.color}aa`,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Marquee row — social, scrolls in opposite direction */}
          <div className="relative mb-3">
            <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
            <div className="flex gap-3 animate-[ticker-reverse_36s_linear_infinite] whitespace-nowrap">
              {(() => {
                const items = Object.values(SOCIAL_BRANDS).filter((b) => b.id !== "facebook");
                return [...items, ...items, ...items];
              })().map((b, i) => (
                <div
                  key={`social-${b.id}-${i}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] transition-all"
                  style={{
                    boxShadow: `0 0 0 1px ${b.color}25 inset, 0 4px 18px -8px ${b.color}55`,
                  }}
                >
                  <span className="text-lg">{b.icon}</span>
                  <span className="text-sm font-semibold text-white tracking-tight">{b.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Marquee row — tools */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
            <div className="flex gap-3 animate-[ticker_50s_linear_infinite] whitespace-nowrap">
              {[
                ...Object.values(TOOL_BRANDS),
                ...Object.values(TOOL_BRANDS),
                ...Object.values(TOOL_BRANDS),
              ].map((b, i) => (
                <div
                  key={`tool-${b.id}-${i}`}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-white/[0.05] bg-white/[0.02] text-white/75"
                >
                  <span className="text-base">{b.icon}</span>
                  <span className="text-xs font-medium tracking-tight">{b.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Metrics Strip ──────────────────────────────────────────────────── */}
      <section className="py-14 px-4 border-y border-white/[0.06] relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 hairline opacity-60" />
        <div className="absolute inset-x-0 bottom-0 hairline opacity-60" />
        <div className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4">
          {METRICS.map((metric) => (
            <div
              key={metric.label}
              className="bento-card spotlight-card lift-on-hover p-7 text-center group"
            >
              <div className="w-10 h-10 mx-auto mb-4 rounded-xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-center group-hover:border-sky-400/30 transition-colors">
                <metric.icon className={`w-5 h-5 ${metric.color} group-hover:scale-110 transition-transform duration-300`} />
              </div>
              <div className="lux-numeral text-3xl text-white mb-1.5 metric-number">{metric.value}</div>
              <div className="micro-label-muted text-[10px] uppercase tracking-widest">{metric.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── One expert lifecycle ────────────────────────────────────────────── */}
      <section id="lifecycle" className="py-14 px-4 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 reveal reveal-visible">
            <span className="eyebrow mb-4">The Platform</span>
            <h2 className="mt-4 text-3xl md:text-4xl font-black tracking-tighter text-white">One autonomous expert. One store lifecycle.</h2>
            <p className="mt-4 text-white/55 max-w-2xl mx-auto leading-relaxed">
              Store Bot starts as your launch expert for a first store, then shifts into operator and growth mode the moment you go live. One expert wakes up at the right moment — and remembers what worked last time.
            </p>
          </div>

          {/* Lifecycle ribbon */}
          <div className="max-w-4xl mx-auto mb-12 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-3 md:gap-2 items-stretch">
            <LifecyclePill stage="Day 1" title="Building" lead="Store Bot is in the cockpit." hex="#38bdf8" Icon={Bot} />
            <div className="hidden md:flex items-center justify-center"><KeyRound className="w-4 h-4 text-amber-300/70" /></div>
            <LifecyclePill stage="Launch Day" title="Handoff" lead="Launch mode hands off to operator mode." hex="#fbbf24" Icon={KeyRound} highlight />
            <div className="hidden md:flex items-center justify-center"><ArrowRight className="w-4 h-4 text-white/30" /></div>
            <LifecyclePill stage="Day 2+" title="Operating" lead="Store Bot fulfills, optimizes, and grows." hex="#22d3ee" Icon={Package} />
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {BOTS.map((bot) => {
              const colors = BOT_COLORS[bot.name];
              return (
                <div
                  key={bot.name}
                  className="bento-card spotlight-card card-shimmer-hover p-8 group relative overflow-hidden hover-lift"
                  style={{ "--hover-glow": colors.glow } as HoverGlowCSSVars}
                >
                  {/* Top gradient accent */}
                  <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl" style={{ background: `linear-gradient(90deg, ${colors.hex}60, ${colors.hex}10)` }} />

                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg"
                    style={{ background: colors.bg, border: `1px solid ${colors.border}`, boxShadow: `0 0 12px ${colors.glow}` }}
                  >
                    <bot.icon className={`w-6 h-6 ${colors.icon}`} />
                  </div>

                  <p className="micro-label mb-2" style={{ color: colors.hex }}>
                    {bot.tagline}
                  </p>
                  <h3 className="text-xl font-heading font-bold text-white mb-3">{bot.name}</h3>
                  <p className="text-white/45 text-sm leading-relaxed mb-6">{bot.description}</p>

                  <ul className="space-y-2.5">
                    {bot.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-white/55 text-sm">
                        <CheckCircle2 className={`w-4 h-4 ${colors.icon} shrink-0 mt-0.5`} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Autonomous-workflow callout — the cookbook recipe
                      this bot actually ships. Each entry maps 1:1 to
                      a registered toolset in server/engine/agentToolsets.ts. */}
                  <div
                    className="mt-6 pt-4 border-t flex items-start gap-2.5"
                    style={{ borderTopColor: `${colors.hex}22` }}
                  >
                    <Wrench
                      className="w-3.5 h-3.5 shrink-0 mt-0.5"
                      style={{ color: colors.hex }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: colors.hex }}
                      >
                        Autonomous · {bot.autonomous.label}
                      </p>
                      <p className="text-xs text-white/55 leading-relaxed mt-0.5">
                        {bot.autonomous.note}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How Store Bot actually thinks — Cookbook recipes ────────────────── */}
      <CookbookShowcase />

      {/* ── Already have a store? — the existing-operator lane ─────────────── */}
      <section
        id="existing-store"
        className="py-14 px-4 border-t border-white/[0.06] scroll-mt-20 relative overflow-hidden"
      >
        <div className="light-leak-cyan absolute top-1/4 right-0 opacity-30 pointer-events-none" aria-hidden="true" />
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12 reveal reveal-visible">
            <span className="eyebrow mb-4 text-emerald-300">Already running a store?</span>
            <h2 className="mt-4 text-3xl md:text-4xl font-black tracking-tighter text-white">
              Store Bot can take the wheel <span className="text-emerald-300">on day one</span>.
            </h2>
            <p className="mt-4 text-white/60 max-w-2xl mx-auto leading-relaxed">
              New store owners are the focus, but you don't need to start over if you already have traction. Connect your existing Shopify store and Store Bot inherits products, orders, and history immediately, then runs operations, finds catalog opportunities, and drives traffic to listings you've already built.
            </p>
          </div>

          {/* Three-card timeline showing the existing-operator path */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 reveal reveal-visible">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <RefreshCw className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-200">Minute 1</span>
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">Sync your existing catalog</h3>
              <p className="text-xs text-white/55 leading-relaxed">
                One-click Shopify OAuth pulls in every product, order, and inventory level. Store Bot immediately starts watching for low stock, anomalies, and pricing drift. No re-entry, no migration.
              </p>
            </div>
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-5 reveal reveal-visible">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-9 w-9 rounded-lg bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center">
                  <Gauge className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-200">Day 1</span>
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">Take the manual work off your plate</h3>
              <p className="text-xs text-white/55 leading-relaxed">
                Auto-fulfill orders. Adjust prices to your margin floor. Re-stock SKUs before they go to zero. Triage support emails. Every job a VA was doing — handled by Store Bot, every minute, with approvals where you want them.
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-5 reveal reveal-visible">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-9 w-9 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-amber-300" aria-hidden="true" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-200">Week 2+</span>
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">Compound what's already working</h3>
              <p className="text-xs text-white/55 leading-relaxed">
                Store Bot finds margin-friendly products to add to your catalog and runs ads tuned to your actual audience. Memory means the expert gets sharper at <em className="not-italic text-white/75">your</em> store the longer it runs.
              </p>
            </div>
          </div>

          {/* Quick math — what existing operators stop paying for */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 max-w-3xl mx-auto">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/85 mb-3">What stops being your problem</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {[
                "Order fulfillment + tracking emails",
                "Inventory low-stock alerts &amp; restocking",
                "Price-floor monitoring on top SKUs",
                "Customer support triage on common questions",
                "TikTok / Meta ad creative + scheduling",
                "Email recovery flows for abandoned carts",
                "Weekly competitor + niche research",
                "SEO-optimized listing copy on new products",
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-white/75">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300/85 shrink-0 mt-0.5" aria-hidden="true" />
                  <span dangerouslySetInnerHTML={{ __html: item }} />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-white/45 mt-4 leading-relaxed border-t border-white/[0.04] pt-3">
              Operators we benchmark replace <span className="text-white/65 font-mono">~$200–$500/mo</span> of stitched tools (Klaviyo, Inventory Planner, Triple Whale, plus a VA) with one Growth or Pro plan — and get a layer of automation those tools don't sell at any price.
            </p>
          </div>

          <div className="mt-8 text-center">
            <Button
              onClick={() => handlePricingClick("growth")}
              disabled={checkoutMutation.isPending}
              size="lg"
              className="btn-glow text-white px-8 h-12 text-base font-semibold disabled:opacity-70"
            >
              {checkoutMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Opening checkout…
                </>
              ) : (
                <>
                  Connect my Shopify store <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
            <p className="text-[11px] text-white/40 mt-3 font-mono">
              7-day trial · No credit card · OAuth read+write to your store
            </p>
          </div>
        </div>
      </section>

      {/* ── How It Works — honest capability walkthrough ───────────────────── */}
      <section className="py-14 px-4 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 reveal reveal-visible">
            <span className="eyebrow mb-4">How It Works</span>
            <h2 className="mt-4 text-3xl md:text-4xl font-black tracking-tighter text-white">From signup to autopilot</h2>
            <p className="mt-4 text-white/45 max-w-xl mx-auto">No fabricated testimonials. Just the actual sequence of what happens after you connect your first store.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: "Step 1",
                accent: "#38bdf8",
                Icon: Zap,
                title: "Connect in minutes",
                text: "OAuth into Shopify, Amazon, Etsy, TikTok Shop, Meta, TikTok, Pinterest, Twitter, Pinterest, Gmail, and more. Credentials are encrypted at rest with AES-256-GCM.",
              },
              {
                step: "Step 2",
                accent: "#22d3ee",
                Icon: Bot,
                title: "Your expert wakes up",
                text: "Store Bot researches your niche, configures your storefront, then shifts into operator mode for orders, pricing, inventory, and demand generation.",
              },
              {
                step: "Step 3",
                accent: "#fb923c",
                Icon: Shield,
                title: "You stay in control",
                text: "Every Store Bot action is logged in the Activity feed in real time. Pause, override, or roll back any workflow at any moment — your expert runs with a full audit trail.",
              },
            ].map(({ step, accent, Icon, title, text }) => (
              <div key={step} className="bento-card spotlight-card lift-on-hover card-shimmer-hover p-7 flex flex-col gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${accent}1a`, border: `1px solid ${accent}40`, boxShadow: `0 0 16px ${accent}33` }}
                >
                  <Icon className="w-5 h-5" style={{ color: accent }} />
                </div>
                <span className="micro-label" style={{ color: accent }}>{step}</span>
                <h3 className="text-lg font-heading font-bold text-white -mt-1">{title}</h3>
                <p className="text-white/55 text-sm leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-14 px-4 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 reveal reveal-visible">
            <span className="eyebrow mb-4">Pricing</span>
            <h2 className="mt-4 text-3xl md:text-4xl font-black tracking-tighter text-white">Simple Pricing</h2>
            <p className="mt-4 text-white/40 max-w-xl mx-auto">Start free for 7 days. Scale as your store grows. Cancel anytime.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PRICING.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-xl p-6 transition-all duration-500 lift-on-hover card-shimmer-hover ${
                  tier.featured
                    ? "pricing-featured tier-popular bg-gradient-to-b from-sky-500/[0.08] via-sky-500/[0.03] to-transparent shadow-[0_0_40px_rgba(14,165,233,0.15)]"
                    : "bento-card spotlight-card"
                }`}
              >
                {tier.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full ${
                      tier.featured
                        ? "bg-sky-500 text-white shadow-sm shadow-sky-500/40"
                        : "bg-white/5 border border-white/10 text-white/60"
                    }`}>
                      {tier.badge}
                    </span>
                  </div>
                )}

                <h3 className="text-base font-bold text-white mb-1">{tier.name}</h3>
                <div className="flex items-baseline gap-0.5 mb-3">
                  <span className="text-3xl font-black text-white">{tier.price}</span>
                  <span className="text-white/35 text-sm">{tier.period}</span>
                </div>
                <p className="text-white/40 text-sm mb-4 leading-relaxed">{tier.description}</p>

                <div className="h-px bg-white/[0.06] mb-4" />

                <ul className="space-y-2 mb-6">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-white/55 text-sm">
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handlePricingClick(tier.planId)}
                  disabled={checkoutMutation.isPending}
                  className={`w-full h-9 text-sm font-semibold transition-all ${
                    tier.featured
                      ? "bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/20"
                      : "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/80 hover:text-white"
                  }`}
                >
                  {checkoutMutation.isPending ? "Processing..." : "Start Free Trial"}
                </Button>
              </div>
            ))}
          </div>

          {/* Feature-comparison matrix — explicit answer to "what do
              I lose if I pick a smaller tier?" Operators reading the
              4-card pricing block above can match what they actually
              need against what each tier ships, in one line each. */}
          <PricingMatrix onPick={handlePricingClick} />
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section className="py-14 px-4 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16 reveal reveal-visible">
            <span className="eyebrow mb-4">FAQ</span>
            <h2 className="mt-4 text-3xl md:text-4xl font-black tracking-tighter text-white">Common questions</h2>
          </div>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item) => (
              <FAQItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ────────────────────────────────────────────────────── */}
      <section className="py-14 px-4 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto text-center reveal reveal-visible">
          <div className="bento-card-featured gradient-ring rounded-2xl p-12 relative overflow-hidden">
            <div className="aurora-mesh opacity-50" />
            <div className="light-leak-blue absolute -top-20 left-1/2 -translate-x-1/2 opacity-40 pointer-events-none" />
            <div className="relative">
              <p className="eyebrow mb-4">Ready when you are</p>
              <h2 className="text-3xl md:text-4xl font-black tracking-tighter text-white mb-4">
                Hire your autonomous Store Bot tonight.
              </h2>
              <p className="text-white/55 mb-8 leading-relaxed max-w-lg mx-auto">
                7-day free trial. No credit card. Store Bot starts learning your niche the moment you begin — and every month, it gets better.
              </p>
              <Button
                onClick={() => handlePricingClick("growth")}
                disabled={checkoutMutation.isPending}
                size="lg"
                className="btn-glow text-white px-10 h-12 text-base font-semibold mx-auto disabled:opacity-70"
              >
                {checkoutMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Opening checkout…
                  </>
                ) : (
                  <>
                    Start Free Trial <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
              <div className="mt-4 flex items-center justify-center gap-4 text-xs text-white/25">
                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> 7-day free trial</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> No credit card</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Cancel anytime</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] bg-[#030305] py-10 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
            <div>
              <BrandName size="sm" />
              <p className="text-white/45 text-sm mt-2 max-w-xs leading-relaxed">
                Store Bot builds it, runs it, and grows it.
                <span className="block text-white/30 mt-1">One expert. One operation. Zero touch.</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {[
                { label: "Terms", href: "/terms" },
                { label: "Privacy", href: "/privacy" },
                { label: "Contact", href: "mailto:hello@shop-a-bot.app" },
                { label: "Docs", href: "/docs" },
                { label: "Status", href: "/status" },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-white/35 text-sm hover:text-sky-400 transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-white/[0.04] flex flex-col sm:flex-row justify-between items-center gap-2">
            <span className="text-white/20 text-xs">© 2026 {BRAND_NAME}. All rights reserved.</span>
            <span className="text-white/20 text-xs">Built with AI. Powered by bots.</span>
          </div>
          {/* Bottom spacer — leaves room above the mobile sticky CTA so
              the footer link block doesn't get hidden under the bar. */}
          <div className="lg:hidden h-20" aria-hidden="true" />
        </div>
      </footer>

      {/* Mobile-only sticky trial CTA — keeps the trial promise one tap
          away through the entire scroll, since mobile sessions often
          don't reach pricing. */}
      <MobileStickyCTA
        onClick={() => handlePricingClick("growth")}
        isLoading={checkoutMutation.isPending}
      />
    </div>
  );
}
