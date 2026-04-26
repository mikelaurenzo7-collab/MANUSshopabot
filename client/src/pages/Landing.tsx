import { useState, type CSSProperties } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BrandName, BRAND_NAME } from "@/components/BrandName";
import {
  Bot, Package, Megaphone, ArrowRight, CheckCircle2,
  TrendingUp, Clock, ShoppingCart, Globe, Zap, Shield, BarChart3,
  ChevronDown, Star, Quote
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
    tagline: "Store live in 30 minutes",
    description: "Researches winning niches, sources products, configures your Shopify store, and writes all product copy — fully automated.",
    features: ["Niche & competitor research", "Product sourcing (Zendrop/AliExpress)", "Theme setup & legal pages", "SEO-optimized product listings"],
  },
  {
    icon: Package,
    name: "Merchant Bot" as const,
    tagline: "Zero-touch fulfillment",
    description: "Monitors inventory, processes every order automatically, adjusts pricing based on competitor data, and triages customer support tickets.",
    features: ["Automated order fulfillment", "Dynamic pricing engine", "Inventory sync & alerts", "Customer support triage"],
  },
  {
    icon: Megaphone,
    name: "Social Bot" as const,
    tagline: "Marketing on autopilot",
    description: "Creates ad creatives for TikTok & Meta, schedules social posts, runs email/SMS recovery flows, and optimizes SEO — all without you.",
    features: ["TikTok & Meta ad campaigns", "Social media scheduling", "Email & SMS recovery flows", "SEO optimization"],
  },
];

const METRICS = [
  { icon: Clock,        value: "< 30 min", label: "Store goes live",        color: "text-sky-400",     hex: "#38bdf8", glow: "rgba(56,189,248,0.14)"     },
  { icon: ShoppingCart, value: "0 clicks", label: "To fulfill an order",    color: "text-cyan-400",    hex: "#22d3ee", glow: "rgba(34,211,238,0.14)"     },
  { icon: TrendingUp,   value: "24 / 7",   label: "Bots running for you",   color: "text-emerald-400", hex: "#34d399", glow: "rgba(52,211,153,0.14)"     },
  { icon: Globe,        value: "15+",      label: "Platform integrations",  color: "text-orange-400",  hex: "#fb923c", glow: "rgba(251,146,60,0.14)"     },
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
/** CSS variables for metric bento cards. */
type MetricCSSVars = CSSProperties & { "--metric-color": string; "--metric-glow": string };

const TESTIMONIALS = [
  {
    name: "Marcus T.",
    role: "Shopify store owner",
    stars: 5,
    text: "I launched my first dropshipping store in 22 minutes. The Builder Bot handled everything — niche research, product import, even the legal pages. I didn't write a single line of copy.",
  },
  {
    name: "Priya S.",
    role: "E-commerce entrepreneur",
    stars: 5,
    text: "The Merchant Bot processes every order automatically. I went from spending 3 hours a day on fulfillment to literally zero. My store runs while I sleep.",
  },
  {
    name: "Jordan K.",
    role: "TikTok shop seller",
    stars: 5,
    text: "Social Bot created my first TikTok ad campaign in 4 minutes. It generated the creative, wrote the copy, and scheduled the posts. My ROAS went up 2.4x in the first week.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Do I need any technical skills to use SHOPaBOT?",
    a: "None at all. SHOPaBOT is designed for entrepreneurs, not developers. You connect your store, configure your preferences, and the bots handle everything else. No code, no APIs, no manual setup.",
  },
  {
    q: "Which platforms does SHOPaBOT support?",
    a: "SHOPaBOT integrates with Shopify, Amazon, Etsy, TikTok Shop, Pinterest, Instagram, Facebook, and 7+ additional platforms. New integrations are added regularly.",
  },
  {
    q: "How does the Builder Bot source products?",
    a: "The Builder Bot connects to Zendrop, AliExpress, and other supplier networks to find products that match your niche. It evaluates profit margins, competition levels, and trend data before importing anything to your store.",
  },
  {
    q: "Can I run multiple stores from one account?",
    a: "Yes. Growth plans support up to 3 stores, Pro supports 10, and Scale supports unlimited stores. Each store gets its own bot configuration and analytics dashboard.",
  },
  {
    q: "What happens if a bot makes a mistake?",
    a: "Every bot action is logged in real time and can be reviewed in the Activity feed. You can set approval gates for high-stakes actions (like large orders or ad spend above a threshold) so nothing happens without your sign-off.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes — every plan starts with a 7-day free trial. No credit card required to start. You can cancel anytime from your billing portal.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="border border-white/[0.07] rounded-2xl overflow-hidden transition-all duration-300 hover:border-white/[0.14] hover:bg-white/[0.015]"
      onClick={() => setOpen(!open)}
    >
      <button className="w-full flex items-center justify-between px-7 py-5 text-left gap-4">
        <span className="text-sm font-semibold text-white/85 leading-snug">{q}</span>
        <ChevronDown
          className={`w-4 h-4 text-sky-400/60 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${open ? "max-h-80 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="px-7 pb-6 text-sm text-white/50 leading-relaxed border-t border-white/[0.05] pt-4">
          {a}
        </div>
      </div>
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
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
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
                  size="sm"
                  className="bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/25 transition-all font-semibold"
                >
                  Get Started →
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className={`relative pb-32 px-6 overflow-hidden aurora-stage ${subscriptionSuccess ? "pt-56" : "pt-40"}`}>
        {/* Background effects */}
        <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-sky-500/12 to-transparent pointer-events-none" />
        <div className="light-leak-blue absolute -top-32 left-1/3 opacity-90" />
        <div className="light-leak-cyan absolute top-1/3 right-0 opacity-60" />
        <div className="light-leak-orange absolute bottom-0 left-0 opacity-50" />

        <div className="relative max-w-7xl mx-auto grid lg:grid-cols-[1fr_1.1fr] gap-16 items-center">
          <div className="text-center lg:text-left">
            {/* Announcement pill */}
            <div className="mb-10 inline-flex items-center gap-2.5 announcement-banner">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="micro-label">LIVE</span>
              <span className="text-white/55 text-sm">Amazon FBA · TikTok Shop · Shopify — all in one system</span>
              <ArrowRight className="w-3.5 h-3.5 text-white/30 shrink-0" />
            </div>

            {/* Headline */}
            <h1 className="text-6xl md:text-8xl lg:text-[90px] font-black tracking-[-0.04em] mb-7 leading-[0.86]">
              <span className="text-white">Your store</span>
              <br />
              <span className="hero-line-gradient">runs itself.</span>
            </h1>

            {/* Subtext */}
            <p className="text-lg md:text-xl text-white/62 max-w-xl mx-auto lg:mx-0 mb-12 leading-[1.65] font-normal">
              SHOPaBOT turns e-commerce into an autonomous operating system: Builder finds winners,
              Merchant fulfills profitably, and Social manufactures demand while you sleep.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3.5 justify-center lg:justify-start mb-16">
              <Button
                onClick={() => handlePricingClick("growth")}
                size="lg"
                className="btn-glow text-white px-9 h-13 text-base font-bold"
              >
                Launch my bot empire <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
              <Button
                onClick={() => {
                  document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
                }}
                variant="outline"
                size="lg"
                className="btn-glow-outline h-13 text-base font-semibold px-9 border-white/12"
              >
                See the system
              </Button>
            </div>

            {/* Trust strip */}
            <div className="grid sm:grid-cols-3 gap-3.5">
              {TRUST_ITEMS.map((item) => (
                <div key={item.label} className="luxury-stat-card text-left">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/12 border border-sky-500/22 flex items-center justify-center shrink-0">
                    <item.icon className="w-4.5 h-4.5 text-sky-400" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white/90 mb-0.5">{item.label}</div>
                    <div className="text-[11px] text-white/38">{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-2xl">
            <div className="commerce-orb" />
            <div className="command-preview">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-5">
                <div>
                  <p className="micro-label mb-1.5">Live Autonomous Store</p>
                  <h2 className="text-xl md:text-2xl font-black tracking-tight text-white">Revenue engine online</h2>
                </div>
                <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  24/7 Active
                </div>
              </div>

              <div className="grid md:grid-cols-[1fr_0.8fr] gap-4 p-5">
                <div className="space-y-3.5">
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
                              <span className="text-[10px] font-mono text-white/38">{progress}%</span>
                            </div>
                            <p className="text-[11px] text-white/42 truncate">{bot.tagline}</p>
                          </div>
                        </div>
                        <div className="mt-3.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full bot-progress" style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${colors.hex}, rgba(255,255,255,0.8))` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3.5">
                  <div className="revenue-card">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">Projected lift</p>
                    <div className="mt-2.5 text-4xl font-black tracking-tighter text-white">2.4x</div>
                    <div className="mt-4 flex h-24 items-end gap-1.5">
                      {HERO_GROWTH_BARS.map((height, index) => (
                        <div key={index} className="flex-1 rounded-t-md bg-gradient-to-t from-sky-500/30 to-cyan-300/95" style={{ height: `${height}%` }} />
                      ))}
                    </div>
                  </div>

                  <div className="action-feed-card">
                    {HERO_ACTION_FEED.map((item) => (
                      <div key={item} className="flex items-center gap-2 text-[11px] text-white/60">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
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

      {/* ── Metrics Strip ──────────────────────────────────────────────────── */}
      <section className="py-16 px-6 border-y border-white/[0.05]">
        <div className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-5">
          {METRICS.map((metric) => (
            <div
              key={metric.label}
              className="metric-bento p-7 text-center group"
              style={{ "--metric-color": metric.hex, "--metric-glow": metric.glow } as MetricCSSVars}
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4 transition-all duration-300 group-hover:scale-110`}
                style={{ background: metric.glow.replace("0.14", "0.12"), border: `1px solid ${metric.hex}33` }}>
                <metric.icon className={`w-5 h-5 ${metric.color}`} />
              </div>
              <div className="text-3xl font-black font-heading text-white mb-1.5 metric-number tracking-tight">{metric.value}</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{metric.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── The Three Bots ─────────────────────────────────────────────────── */}
      <section className="py-32 px-6 section-tinted">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <p className="micro-label mb-4">The Platform</p>
            <h2 className="text-4xl md:text-6xl font-black tracking-[-0.03em] text-white mb-5">Three bots. One empire.</h2>
            <p className="text-white/42 max-w-lg mx-auto text-lg leading-relaxed">Each bot is a specialist. Together they run your entire e-commerce operation — without you.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-7">
            {BOTS.map((bot) => {
              const colors = BOT_COLORS[bot.name];
              return (
                <div
                  key={bot.name}
                  className="bento-card p-10 group relative overflow-hidden hover-lift"
                  style={{ "--hover-glow": colors.glow } as HoverGlowCSSVars}
                >
                  {/* Top gradient accent */}
                  <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl" style={{ background: `linear-gradient(90deg, ${colors.hex}80, ${colors.hex}18)` }} />
                  {/* Ambient corner glow */}
                  <div className="absolute -top-12 -left-12 w-40 h-40 rounded-full opacity-20 pointer-events-none" style={{ background: `radial-gradient(circle, ${colors.hex}, transparent 70%)` }} />

                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-7 transition-all duration-300 group-hover:scale-110"
                    style={{ background: colors.bg, border: `1px solid ${colors.border}`, boxShadow: `0 0 24px ${colors.glow}` }}
                  >
                    <bot.icon className={`w-7 h-7 ${colors.icon}`} />
                  </div>

                  <p className="micro-label mb-2.5" style={{ color: colors.hex }}>
                    {bot.tagline}
                  </p>
                  <h3 className="text-2xl font-heading font-bold text-white mb-4">{bot.name}</h3>
                  <p className="text-white/45 text-sm leading-relaxed mb-8">{bot.description}</p>

                  <ul className="space-y-3">
                    {bot.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-white/60 text-sm">
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

      {/* ── Social Proof / Testimonials ────────────────────────────────────── */}
      <section className="py-32 px-6 border-t border-white/[0.05] section-orange-tint">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <p className="micro-label mb-4">Social Proof</p>
            <h2 className="text-4xl md:text-6xl font-black tracking-[-0.03em] text-white mb-5">What founders say</h2>
            <p className="text-white/42 max-w-md mx-auto text-lg">Real results from real store owners already automating with SHOPaBOT.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-7">
            {TESTIMONIALS.map((t, idx) => {
              const avatarColors = [
                "from-sky-500 to-cyan-500",
                "from-cyan-500 to-emerald-500",
                "from-orange-500 to-amber-500",
              ];
              return (
                <div key={t.name} className="testimonial-deep p-8 flex flex-col gap-5">
                  <Quote className="w-8 h-8 text-sky-500/50 shrink-0" />
                  <p className="text-white/65 text-base leading-[1.7] flex-1">"{t.text}"</p>
                  <div className="flex items-center gap-3.5 pt-4 border-t border-white/[0.06]">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarColors[idx]} flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(14,165,233,0.25)]`}>
                      <span className="text-sm font-bold text-white">{t.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white/90 truncate">{t.name}</div>
                      <div className="text-xs text-white/38 truncate">{t.role}</div>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      {Array.from({ length: t.stars }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-32 px-6 border-t border-white/[0.05]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <p className="micro-label mb-4">Pricing</p>
            <h2 className="text-4xl md:text-6xl font-black tracking-[-0.03em] text-white mb-5">Simple, honest pricing</h2>
            <p className="text-white/42 max-w-md mx-auto text-lg">Start free for 7 days. Scale as your store grows. Cancel anytime.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PRICING.map((tier) => (
              <div
                key={tier.name}
                className={`relative transition-all duration-300 ${
                  tier.featured
                    ? "pricing-featured"
                    : "bento-card rounded-xl"
                }`}
              >
                {tier.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-3.5 py-1.5 rounded-full ${
                      tier.featured
                        ? "bg-sky-500 text-white shadow-md shadow-sky-500/40"
                        : "bg-white/5 border border-white/10 text-white/55"
                    }`}>
                      {tier.badge}
                    </span>
                  </div>
                )}

                <div className="relative z-10 p-7">
                  <h3 className="text-base font-bold text-white mb-1.5">{tier.name}</h3>
                  <div className="flex items-baseline gap-0.5 mb-3">
                    <span className="text-3xl font-black text-white">{tier.price}</span>
                    <span className="text-white/35 text-sm">{tier.period}</span>
                  </div>
                  <p className="text-white/40 text-sm mb-5 leading-relaxed">{tier.description}</p>

                  <div className="h-px bg-white/[0.06] mb-5" />

                  <ul className="space-y-2.5 mb-7">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-white/58 text-sm">
                        <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    onClick={() => handlePricingClick(tier.planId)}
                    disabled={checkoutMutation.isPending}
                    className={`w-full h-10 text-sm font-semibold transition-all ${
                      tier.featured
                        ? "bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/25"
                        : "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/80 hover:text-white"
                    }`}
                  >
                    {checkoutMutation.isPending ? "Processing..." : "Start Free Trial"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section className="py-32 px-6 border-t border-white/[0.05] section-tinted">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-20">
            <p className="micro-label mb-4">FAQ</p>
            <h2 className="text-4xl md:text-6xl font-black tracking-[-0.03em] text-white mb-5">Common questions</h2>
            <p className="text-white/42 max-w-sm mx-auto text-lg">Everything you need to know before going autonomous.</p>
          </div>
          <div className="space-y-3.5">
            {FAQ_ITEMS.map((item) => (
              <FAQItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ────────────────────────────────────────────────────── */}
      <section className="py-32 px-6 border-t border-white/[0.05]">
        <div className="max-w-3xl mx-auto text-center">
          <div className="cta-aurora p-16 relative overflow-hidden">
            <div className="light-leak-blue absolute -top-24 left-1/2 -translate-x-1/2 opacity-60 pointer-events-none" />
            <div className="light-leak-cyan absolute bottom-0 right-0 opacity-30 pointer-events-none" />
            <div className="relative">
              <p className="micro-label mb-5">Ready to automate?</p>
              <h2 className="text-4xl md:text-5xl font-black tracking-[-0.03em] text-white mb-6 leading-[1.08]">
                Launch your first<br />autonomous store
              </h2>
              <p className="text-white/48 mb-10 text-lg leading-relaxed max-w-sm mx-auto">
                No coding. No daily management. Just bots running 24/7 to build and grow your business.
              </p>
              <Button
                onClick={() => handlePricingClick("growth")}
                size="lg"
                className="btn-glow text-white px-12 h-14 text-base font-bold mx-auto"
              >
                Start Free Trial <ArrowRight className="w-4.5 h-4.5 ml-2" />
              </Button>
              <p className="text-white/22 text-xs mt-5 tracking-wide">7-day free trial · No credit card required · Cancel anytime</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.05] bg-[#020204] py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start gap-12 mb-12">
            <div className="max-w-xs">
              <BrandName size="sm" />
              <p className="text-white/32 text-sm mt-3 leading-relaxed">
                Autonomous e-commerce orchestration. Three specialized bots. Zero daily management.
              </p>
              <div className="flex items-center gap-1.5 mt-4">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] text-emerald-400/70 font-medium tracking-wide">All systems operational</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-16 gap-y-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/25 mb-4">Product</p>
                <div className="space-y-3">
                  {["Features", "Pricing", "Changelog", "Roadmap"].map((link) => (
                    <a key={link} href="#" className="block text-white/38 text-sm hover:text-sky-400 transition-colors">
                      {link}
                    </a>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/25 mb-4">Company</p>
                <div className="space-y-3">
                  {["About", "Blog", "Contact", "Status"].map((link) => (
                    <a key={link} href="#" className="block text-white/38 text-sm hover:text-sky-400 transition-colors">
                      {link}
                    </a>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/25 mb-4">Legal</p>
                <div className="space-y-3">
                  {["Terms", "Privacy", "Cookies"].map((link) => (
                    <a key={link} href="#" className="block text-white/38 text-sm hover:text-sky-400 transition-colors">
                      {link}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="pt-8 border-t border-white/[0.04] flex flex-col sm:flex-row justify-between items-center gap-3">
            <span className="text-white/18 text-xs">© 2026 {BRAND_NAME}. All rights reserved.</span>
            <span className="text-white/18 text-xs">Built with AI. Powered by autonomous bots.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
