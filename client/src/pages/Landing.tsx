import { useState, type CSSProperties } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BrandName, BRAND_NAME } from "@/components/BrandName";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import {
  Bot, Package, Megaphone, ArrowRight, CheckCircle2,
  TrendingUp, Clock, ShoppingCart, Globe, Zap, Shield, BarChart3,
  ChevronDown, KeyRound, Loader2,
} from "lucide-react";
import { useLocation } from "wouter";

const BOT_COLORS = {
  "Builder Bot":  { bg: "rgba(14,165,233,0.1)",  border: "rgba(14,165,233,0.3)",  icon: "text-sky-400",  glow: "rgba(14,165,233,0.15)", hex: "#38bdf8" },
  "Merchant Bot": { bg: "rgba(6,182,212,0.1)",   border: "rgba(6,182,212,0.3)",   icon: "text-cyan-400", glow: "rgba(6,182,212,0.15)",  hex: "#22d3ee" },
  "Social Bot":   { bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.25)", icon: "text-orange-400",glow: "rgba(249,115,22,0.12)", hex: "#fb923c" },
} as const;

const BOTS = [
  {
    icon: Bot,
    name: "Builder Bot" as const,
    tagline: "Day 1 — store live in 30 minutes",
    description: "Researches winning niches, sources products, configures your storefront, and writes all product copy — then hands the keys to the Merchant.",
    features: ["Niche & competitor research", "Product research + draft purchase orders", "Theme setup & legal pages", "SEO-optimized product listings"],
  },
  {
    icon: Package,
    name: "Merchant Bot" as const,
    tagline: "Day 2+ — zero-touch fulfillment",
    description: "Takes over the moment your store launches. Processes every order, optimizes pricing, syncs inventory, and triages support — forever.",
    features: ["Automated order fulfillment", "Dynamic pricing engine", "Inventory sync & alerts", "Customer support triage"],
  },
  {
    icon: Megaphone,
    name: "Social Bot" as const,
    tagline: "From launch — demand on autopilot",
    description: "Wakes up alongside the Merchant. Creates ad creatives for TikTok & Meta, schedules social posts, runs email/SMS recovery flows, and optimizes SEO.",
    features: ["TikTok & Meta ad campaigns", "Social media scheduling", "Email & SMS recovery flows", "SEO optimization"],
  },
];

const METRICS = [
  { icon: Clock,        value: "< 30 min", label: "Store goes live",        color: "text-sky-400"    },
  { icon: ShoppingCart, value: "0 clicks", label: "To fulfill an order",    color: "text-cyan-400"   },
  { icon: TrendingUp,   value: "24 / 7",   label: "Bots running for you",   color: "text-emerald-400"},
  { icon: Globe,        value: "15+",      label: "Platform integrations",  color: "text-orange-400" },
];

const PRICING = [
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    description: "Research niches, source products, build your first store.",
    features: [
      "1 connected store",
      "Builder Bot — full access",
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
    description: "Full store automation with zero-touch fulfillment.",
    features: [
      "3 connected stores",
      "Builder Bot + Merchant Bot",
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
      "All 3 Bots — full access",
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
      "All 3 Bots + Elite workflows",
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

const TRUST_ITEMS = [
  { icon: Zap,      label: "Instant setup",      sub: "Live in 30 minutes"     },
  { icon: Shield,   label: "No code required",   sub: "Fully managed bots"     },
  { icon: BarChart3,label: "Real-time analytics", sub: "Track every metric"    },
];

const BOT_PREVIEW_PROGRESS_PERCENTAGES = [82, 67, 91];
const HERO_GROWTH_BARS = [32, 48, 38, 70, 58, 84, 96];
const HERO_ACTION_FEED = [
  "Imported 18 margin-safe SKUs",
  "Synced inventory across 6 channels",
  "Generated 12 TikTok creatives",
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
  "15+ platform integrations",
  "3 AI bots running 24/7",
  "Zero manual fulfillment",
  "Builder → Merchant → Social, in one platform",
  "Stripe-grade billing built in",
  "Built for Shopify, Amazon, Etsy, TikTok Shop & more",
];

const FAQ_ITEMS = [
  {
    q: "Do I need any technical skills to use Shop_a_Bot?",
    a: "None at all. Shop_a_Bot is designed for entrepreneurs, not developers. You connect your store, configure your preferences, and the bots handle everything else. No code, no APIs, no manual setup.",
  },
  {
    q: "What is the Builder→Merchant handoff?",
    a: "It's the moment your store graduates from setup to operation. The Builder spends Day 1 building your storefront. The day you go live, you click ‘hand over the keys’ and the Merchant takes the wheel — orders, pricing, inventory, support — forever. The Builder stays on call for redesigns and new collections.",
  },
  {
    q: "Which platforms does Shop_a_Bot support?",
    a: "Shop_a_Bot integrates with Shopify, Amazon, Etsy, TikTok Shop, Pinterest, Instagram, Facebook, and 7+ additional platforms. New integrations are added regularly.",
  },
  {
    q: "How does the Builder Bot source products?",
    a: "The Builder Bot researches products that match your niche — evaluating profit margins, competition levels, and trend data — and drafts purchase orders for the suppliers you've connected (Shopify-native today; AliExpress / Zendrop / CJDropshipping API submission rolling out per platform — drafts are recorded and ready to submit the moment a supplier key is connected in Settings).",
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

  const handlePricingClick = (planId: string) => {
    if (!user) {
      window.location.href = `/manus-oauth/login?returnPath=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    checkoutMutation.mutate(
      { planId: planId as "starter" | "growth" | "pro" | "scale", origin: window.location.origin },
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

  return (
    <div className="min-h-screen bg-[#050507] text-white overflow-x-hidden">

      {/* ── Subscription Success Banner ─────────────────────────────────────── */}
      {subscriptionSuccess && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-emerald-500/90 backdrop-blur-sm text-white text-sm font-semibold text-center py-3 px-4 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Subscription activated! Your bots are ready.
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
            {/* Announcement pill */}
            <div className="mb-8 inline-flex items-center gap-2 announcement-banner">
              <span className="eyebrow">New</span>
              <span className="text-white/65 text-sm">Amazon FBA, TikTok Shop, and Shopify automation in one platform</span>
              <ArrowRight className="w-3.5 h-3.5 text-white/35" />
            </div>

            {/* Headline */}
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter mb-6 leading-[0.88]">
              <span className="text-white">Your store</span>
              <br />
              <span className="hero-title-shine">runs itself.</span>
            </h1>

            {/* Subtext */}
            <p className="text-lg md:text-xl text-white/58 max-w-2xl mx-auto lg:mx-0 mb-10 leading-relaxed font-normal">
              Shop_a_Bot turns e-commerce into an autonomous operating system. The Builder ships your store. The Merchant
              <span className="text-cyan-300"> takes the keys</span> the day it goes live. The Social Bot manufactures demand while you sleep.
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
                    Launch my bot empire <ArrowRight className="w-4 h-4 ml-1" />
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

      {/* ── The Three Bots ─────────────────────────────────────────────────── */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 reveal reveal-visible">
            <span className="eyebrow mb-4">The Platform</span>
            <h2 className="mt-4 text-4xl md:text-5xl font-black tracking-tighter text-white">Three bots. One lifecycle.</h2>
            <p className="mt-4 text-white/40 max-w-xl mx-auto">The Builder ships your store. The Merchant runs it. The Social Bot grows it. Each bot wakes up at the right moment.</p>
          </div>

          {/* Lifecycle ribbon */}
          <div className="max-w-4xl mx-auto mb-12 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-3 md:gap-2 items-stretch">
            <LifecyclePill stage="Day 1" title="Building" lead="Builder is in the cockpit." hex="#38bdf8" Icon={Bot} />
            <div className="hidden md:flex items-center justify-center"><KeyRound className="w-4 h-4 text-amber-300/70" /></div>
            <LifecyclePill stage="Launch Day" title="Handoff" lead="Builder hands the keys to the Merchant." hex="#fbbf24" Icon={KeyRound} highlight />
            <div className="hidden md:flex items-center justify-center"><ArrowRight className="w-4 h-4 text-white/30" /></div>
            <LifecyclePill stage="Day 2+" title="Operating" lead="Merchant fulfills, Social grows." hex="#22d3ee" Icon={Package} />
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {BOTS.map((bot) => {
              const colors = BOT_COLORS[bot.name];
              return (
                <div
                  key={bot.name}
                  className="bento-card spotlight-card p-8 group relative overflow-hidden hover-lift"
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
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How It Works — honest capability walkthrough ───────────────────── */}
      <section className="py-24 px-4 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 reveal reveal-visible">
            <span className="eyebrow mb-4">How It Works</span>
            <h2 className="mt-4 text-4xl md:text-5xl font-black tracking-tighter text-white">From signup to autopilot</h2>
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
                title: "Bots wake up",
                text: "Builder researches your niche and configures your storefront. Merchant takes the keys on launch day and runs orders, pricing, and inventory. Social manufactures demand.",
              },
              {
                step: "Step 3",
                accent: "#fb923c",
                Icon: Shield,
                title: "You stay in control",
                text: "Every bot action is logged in the Activity feed in real time. Pause, override, or roll back any workflow at any moment — your bots run with full audit trail.",
              },
            ].map(({ step, accent, Icon, title, text }) => (
              <div key={step} className="bento-card spotlight-card lift-on-hover p-7 flex flex-col gap-4">
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
      <section id="pricing" className="py-24 px-4 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 reveal reveal-visible">
            <span className="eyebrow mb-4">Pricing</span>
            <h2 className="mt-4 text-4xl md:text-5xl font-black tracking-tighter text-white">Simple Pricing</h2>
            <p className="mt-4 text-white/40 max-w-xl mx-auto">Start free for 7 days. Scale as your store grows. Cancel anytime.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PRICING.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-xl p-6 transition-all duration-500 lift-on-hover ${
                  tier.featured
                    ? "tier-popular bg-gradient-to-b from-sky-500/[0.08] via-sky-500/[0.03] to-transparent shadow-[0_0_40px_rgba(14,165,233,0.15)]"
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
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16 reveal reveal-visible">
            <span className="eyebrow mb-4">FAQ</span>
            <h2 className="mt-4 text-4xl md:text-5xl font-black tracking-tighter text-white">Common questions</h2>
          </div>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item) => (
              <FAQItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto text-center reveal reveal-visible">
          <div className="bento-card-featured gradient-ring rounded-2xl p-12 relative overflow-hidden">
            <div className="aurora-mesh opacity-50" />
            <div className="light-leak-blue absolute -top-20 left-1/2 -translate-x-1/2 opacity-40 pointer-events-none" />
            <div className="relative">
              <p className="eyebrow mb-4">Ready to automate?</p>
              <h2 className="text-3xl md:text-4xl font-black tracking-tighter text-white mb-4">
                Launch your first autonomous store
              </h2>
              <p className="text-white/40 mb-8 leading-relaxed">
                No coding. No daily management. Just bots working 24/7 to build and grow your business.
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
              <p className="text-white/30 text-sm mt-2 max-w-xs">
                Autonomous e-commerce orchestration. Three bots. Zero management.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {[
                { label: "Terms", href: "/terms" },
                { label: "Privacy", href: "/privacy" },
                { label: "Contact", href: "mailto:hello@shop-a-bot.app" },
                { label: "Docs", href: "/docs" },
                { label: "Status", href: "https://status.shop-a-bot.app", external: true },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
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
        </div>
      </footer>
    </div>
  );
}
