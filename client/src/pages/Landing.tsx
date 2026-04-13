import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BrandName, BRAND_NAME } from "@/components/BrandName";
import {
  Zap, Bot, Package, Megaphone, ArrowRight, CheckCircle2,
  TrendingUp, Clock, ShoppingCart, Star, Shield, BarChart3,
  Play, Globe, Cpu, Sparkles, Terminal, ChevronRight
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   DATA — unchanged functional logic
   ═══════════════════════════════════════════════════════════════════════════ */

const APP_LOGO = (import.meta.env.VITE_APP_LOGO as string | undefined) ||
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663544407089/R65at2L4nXpfNokxNrB7Yp/beastbots-logo-5mUP2nWBTL76U95J5hXgrq.webp";

const BOTS = [
  {
    icon: Bot,
    color: "text-sky-400",
    bg: "bg-sky-500/10 border-sky-500/25",
    glow: "shadow-sky-500/20",
    hoverGlow: "hover:shadow-sky-500/30 hover:border-sky-400/50",
    iconBg: "bg-sky-500/15",
    pulseClass: "bot-card-active architect",
    name: "Builder Bot",
    tagline: "Store live in 30 minutes",
    description:
      "Researches winning niches, sources products from top suppliers, configures your Shopify store, and writes all product copy — fully automated.",
    features: ["Niche & competitor research", "Product sourcing (Zendrop/AliExpress)", "Theme setup & legal pages", "SEO-optimized product listings"],
  },
  {
    icon: Package,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/25",
    glow: "shadow-cyan-500/20",
    hoverGlow: "hover:shadow-cyan-500/30 hover:border-cyan-400/50",
    iconBg: "bg-cyan-500/15",
    pulseClass: "bot-card-active merchant",
    name: "Merchant Bot",
    tagline: "Zero-touch fulfillment",
    description:
      "Monitors inventory, processes every order automatically, adjusts pricing based on competitor data, and triages customer support tickets.",
    features: ["Automated order fulfillment", "Dynamic pricing engine", "Inventory sync & alerts", "Customer support triage"],
  },
  {
    icon: Megaphone,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/25",
    glow: "shadow-amber-500/20",
    hoverGlow: "hover:shadow-amber-500/30 hover:border-amber-400/50",
    iconBg: "bg-amber-500/15",
    pulseClass: "bot-card-active social",
    name: "Social Bot",
    tagline: "Marketing on autopilot",
    description:
      "Creates ad creatives for TikTok & Meta, schedules social posts, runs email/SMS recovery flows, and optimizes SEO — all without you.",
    features: ["TikTok & Meta ad campaigns", "Social media scheduling", "Email & SMS recovery flows", "SEO optimization"],
  },
];

const METRICS = [
  { icon: Clock, value: "< 30 min", label: "Store goes live", color: "text-sky-400", glow: "shadow-sky-500/20" },
  { icon: ShoppingCart, value: "0 clicks", label: "To fulfill an order", color: "text-cyan-400", glow: "shadow-cyan-500/20" },
  { icon: TrendingUp, value: "24 / 7", label: "Bots running for you", color: "text-amber-400", glow: "shadow-amber-500/20" },
  { icon: Globe, value: "15+", label: "Platform integrations", color: "text-green-400", glow: "shadow-green-500/20" },
];

const PRICING = [
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    description: "Research niches, source products, build your first store.",
    bots: ["Builder Bot"],
    highlight: false,
    badge: null,
    cta: "Get Started",
    planId: "starter",
    borderClass: "border-white/[0.06]",
    bgClass: "",
  },
  {
    name: "Growth",
    price: "$149",
    period: "/mo",
    description: "Full store automation with zero-touch fulfillment.",
    bots: ["Builder Bot", "Merchant Bot"],
    highlight: false,
    badge: "Popular",
    cta: "Start Growing",
    planId: "growth",
    borderClass: "border-cyan-500/25",
    bgClass: "",
  },
  {
    name: "Pro",
    price: "$299",
    period: "/mo",
    description: "All 3 bots — build, sell, and market on autopilot.",
    bots: ["Builder Bot", "Merchant Bot", "Social Bot"],
    highlight: true,
    badge: "Best Value",
    cta: "Go Pro",
    planId: "pro",
    borderClass: "border-sky-500/40",
    bgClass: "",
  },
  {
    name: "Scale",
    price: "$599",
    period: "/mo",
    description: "Power sellers with ML optimization and multi-store intelligence.",
    bots: ["All 3 Bots", "Analytics Bot", "Multi-Store"],
    highlight: false,
    badge: "Coming Soon",
    disabled: true,
    cta: "Notify Me",
    borderClass: "border-white/[0.04]",
    bgClass: "",
  },
];

const TESTIMONIALS = [
  {
    name: "Marcus T.",
    role: "Dropshipper, 3 stores",
    avatar: "MT",
    text: "Builder Bot set up my Minimalist Home Decor store in 22 minutes. Merchant Bot has processed 847 orders without me touching anything.",
    stars: 5,
    accentColor: "text-sky-400",
    avatarBg: "bg-sky-500/20 text-sky-300",
  },
  {
    name: "Priya S.",
    role: "E-commerce entrepreneur",
    avatar: "PS",
    text: "Social Bot's TikTok campaigns are converting at 4.2%. I used to spend 3 hours a day on ads. Now I spend zero.",
    stars: 5,
    accentColor: "text-cyan-400",
    avatarBg: "bg-cyan-500/20 text-cyan-300",
  },
  {
    name: "Jordan K.",
    role: "Side hustle → full-time",
    avatar: "JK",
    text: "I was skeptical about 'zero-touch fulfillment' but it's real. 1,200 orders fulfilled automatically in my first month.",
    stars: 5,
    accentColor: "text-amber-400",
    avatarBg: "bg-amber-500/20 text-amber-300",
  },
];

const PLATFORMS = [
  "Shopify", "Amazon", "Etsy", "eBay", "TikTok Shop", "Meta Ads",
  "Google Ads", "WooCommerce", "BigCommerce", "Walmart", "Pinterest",
  "Twitter/X", "Wix", "YouTube", "Zendrop",
];

const TERMINAL_LINES = [
  { type: "prompt", text: "$ orchaistrate deploy --niche \"minimalist home decor\"" },
  { type: "output", text: "Scanning 12,847 products across 3 suppliers..." },
  { type: "success", text: "✓ 847 winning products identified (avg margin 62%)" },
  { type: "output", text: "Generating store theme + product listings..." },
  { type: "success", text: "✓ Shopify store configured — 4 collections, 120 products" },
  { type: "info", text: "→ Merchant Bot: inventory sync active (15-min intervals)" },
  { type: "info", text: "→ Social Bot: TikTok campaign draft ready for review" },
  { type: "success", text: "✓ Store is LIVE. Time elapsed: 22m 14s" },
];

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

function PricingSection() {
  const { user } = useAuth();
  const checkout = trpc.stripe.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      toast.success("Redirecting to checkout…");
      window.open(data.url, "_blank");
    },
    onError: (err) => toast.error(err.message),
  });

  const handlePlanClick = (planId: string | undefined, disabled?: boolean) => {
    if (disabled) return;
    if (!planId) return;
    if (!user) {
      // Not logged in — send to login first, then they'll land in Command Center
      window.location.href = getLoginUrl();
      return;
    }
    checkout.mutate({ planId: planId as any, origin: window.location.origin });
  };

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {PRICING.map((tier) => (
        <div
          key={tier.name}
          className={`bento-card transition-all duration-500 ${
            tier.highlight
              ? "bento-card-featured scale-[1.02] shadow-xl shadow-sky-500/10"
              : ""
          } relative`}
        >
          {tier.badge && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
              <Badge
                className={`text-[10px] px-3 py-0.5 font-semibold tracking-wide ${
                  tier.highlight
                    ? "bg-sky-500 text-white shadow-lg shadow-sky-500/30"
                    : tier.badge === "Popular"
                    ? "bg-cyan-500 text-black"
                    : "bg-white/5 text-muted-foreground border border-white/[0.06]"
                }`}
              >
                {tier.badge}
              </Badge>
            </div>
          )}
          <div className="p-6 pt-7">
            <div className="mb-5">
              <h3 className="font-bold text-base font-heading text-white">{tier.name}</h3>
              <div className="flex items-baseline gap-0.5 mt-1.5">
                <span className={`text-3xl font-black font-heading tracking-tight ${tier.highlight ? "hero-line-gradient" : "text-white"}`}>{tier.price}</span>
                <span className="text-xs text-muted-foreground ml-0.5">{tier.period}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-5 leading-relaxed">{tier.description}</p>
            <div className="h-px bg-white/[0.04] mb-4" />
            <ul className="space-y-2 mb-6">
              {tier.bots.map((b) => (
                <li key={b} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              className={`w-full text-xs font-semibold transition-all duration-500 ${
                tier.highlight ? "btn-glow" : "bg-white/[0.04] border border-white/[0.08] text-white hover:bg-white/[0.08] hover:border-sky-500/30"
              }`}
              variant={tier.highlight ? "default" : "outline"}
              disabled={tier.disabled || (checkout.isPending && checkout.variables?.planId === tier.planId)}
              onClick={() => handlePlanClick(tier.planId, tier.disabled)}
            >
              {checkout.isPending && checkout.variables?.planId === tier.planId ? "Redirecting…" : tier.cta}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  
  return (
    <div className="min-h-screen bg-transparent text-foreground overflow-x-hidden page-enter">

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 topbar-glass">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <BrandName size="lg" />
          <div className="flex items-center gap-3">
            {user ? (
              <Button
                size="sm"
                onClick={() => { window.location.href = "/"; }}
                className="btn-glow text-sm px-5 py-2"
              >
                Go to Dashboard
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { window.location.href = getLoginUrl(); }}
                  className="text-muted-foreground hover:text-foreground transition-all duration-500"
                >
                  Sign In
                </Button>
                <Button
                  size="sm"
                  onClick={() => { window.location.href = getLoginUrl(); }}
                  className="btn-glow text-sm px-5 py-2"
                >
                  Get Started Free
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-28 px-4 relative hero-background grid-bg overflow-hidden">
        {/* Light leaks */}
        <div className="light-leak-blue" style={{ top: "-200px", left: "10%", opacity: 0.12 }} />
        <div className="light-leak-cyan" style={{ top: "100px", right: "-100px", opacity: 0.08 }} />
        <div className="light-leak-orange" style={{ bottom: "-100px", left: "40%", opacity: 0.05 }} />

        {/* Ghost watermark */}
        <div className="ghost-watermark" style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
          ORCHESTRATE
        </div>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          {/* Announcement banner (Supabase) */}
          <div className="flex justify-center mb-8">
            <div className="announcement-banner">
              <span className="text-sky-400 font-semibold">NEW</span>
              <span className="text-muted-foreground">Merchant Bot now supports Amazon FBA</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
          </div>

          {/* Micro-label (Intel) */}
          <div className="micro-label mb-6">Autonomous Commerce Platform</div>

          {/* Two-line hero (Supabase) */}
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-2 leading-[1.0] font-heading text-white">
            Your store runs itself.
          </h1>
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-8 leading-[1.0] font-heading hero-line-gradient">
            You collect the revenue.
          </h2>

          {/* Vercel metric callouts */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Three AI agents orchestrate your entire e-commerce operation —{" "}
            <span className="stat-callout">30-min</span> store setup,{" "}
            <span className="stat-callout-cyan">0-touch</span> fulfillment,{" "}
            <span className="stat-callout-amber">24/7</span> marketing.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
            <Button
              size="lg"
              onClick={() => { window.location.href = getLoginUrl(); }}
              className="btn-glow text-base px-10 h-13"
            >
              <Zap className="h-4 w-4 mr-2" />
              Launch Command Center
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="btn-glow-outline text-base px-10 h-13"
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            >
              <Play className="h-4 w-4 mr-2" />
              See How It Works
            </Button>
          </div>
          <p className="text-xs text-muted-foreground/30 tracking-wide">No credit card required · Cancel anytime · 30-day guarantee</p>
        </div>
      </section>

      {/* ── Platform Ticker (Supabase) ──────────────────────────────────────── */}
      <section className="py-8 border-y border-white/[0.04] glass-subtle">
        <div className="max-w-6xl mx-auto">
          <div className="ticker-wrapper">
            <div className="ticker-track">
              {[...PLATFORMS, ...PLATFORMS].map((p, i) => (
                <div
                  key={`${p}-${i}`}
                  className="flex items-center gap-2 px-6 py-2 text-sm text-muted-foreground/50 whitespace-nowrap"
                >
                  <Globe className="h-3.5 w-3.5" />
                  {p}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Metrics Strip ───────────────────────────────────────────────────── */}
      <section className="py-16 px-4 relative">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {METRICS.map((m) => (
            <div key={m.label} className="text-center group">
              <div className={`inline-flex items-center justify-center h-12 w-12 rounded-xl mb-3 bento-card border border-white/[0.06] group-hover:border-sky-500/30 transition-all duration-500 shadow-lg ${m.glow}`}>
                <m.icon className={`h-5 w-5 ${m.color}`} />
              </div>
              <div className={`text-2xl font-black font-heading metric-number tracking-tight ${m.color}`}>{m.value}</div>
              <div className="text-[11px] text-muted-foreground mt-1.5 tracking-widest uppercase">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Terminal Card (Supabase) ─────────────────────────────────────────── */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="micro-label mb-4 text-center">Live Bot Activity</div>
          <div className="terminal-card">
            <div className="terminal-header">
              <div className="terminal-dot bg-red-500/80" />
              <div className="terminal-dot bg-amber-500/80" />
              <div className="terminal-dot bg-green-500/80" />
              <span className="text-[11px] text-muted-foreground/40 ml-2 tracking-wide">orchaistrate — builder-bot</span>
            </div>
            <div className="terminal-body space-y-1">
              {TERMINAL_LINES.map((line, i) => (
                <div key={i} className={`terminal-line-${line.type}`}>
                  {line.text}
                </div>
              ))}
              <div className="terminal-line-prompt">
                $ <span className="terminal-cursor" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bots (Bento Grid) ──────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-4 relative">
        <div className="light-leak-blue" style={{ top: "0", right: "-200px", opacity: 0.06 }} />
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <div className="micro-label mb-4">The Beast Squad</div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tighter mb-4 font-heading text-white">
              Three bots. One mission.
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-base leading-relaxed">
              Specialized agents working in parallel — each an expert in their domain.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 stagger-list">
            {BOTS.map((bot) => (
              <div
                key={bot.name}
                className={`bento-card p-0 ${bot.pulseClass}`}
              >
                {/* Top accent bar */}
                <div className={`h-[2px] w-full ${bot.color === "text-sky-400" ? "bg-gradient-to-r from-transparent via-sky-500 to-transparent" : bot.color === "text-cyan-400" ? "bg-gradient-to-r from-transparent via-cyan-500 to-transparent" : "bg-gradient-to-r from-transparent via-amber-500 to-transparent"}`} />
                <div className="p-7">
                  <div className={`inline-flex items-center justify-center h-12 w-12 rounded-xl ${bot.iconBg} border ${bot.bg} mb-5 group-hover:scale-105 transition-transform duration-500`}>
                    <bot.icon className={`h-6 w-6 ${bot.color}`} />
                  </div>
                  <div className="mb-2">
                    <span className={`micro-label ${bot.color === "text-sky-400" ? "" : bot.color === "text-cyan-400" ? "micro-label-cyan" : "micro-label-amber"}`}>{bot.tagline}</span>
                  </div>
                  <h3 className="text-xl font-bold mb-3 font-heading text-white">{bot.name}</h3>
                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{bot.description}</p>
                  <div className="h-px bg-white/[0.04] mb-5" />
                  <ul className="space-y-2.5">
                    {bot.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <CheckCircle2 className={`h-4 w-4 shrink-0 ${bot.color}`} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social Proof / Testimonials ─────────────────────────────────────── */}
      <section className="py-24 px-4 relative overflow-hidden">
        <div className="light-leak-cyan" style={{ bottom: "-100px", left: "20%", opacity: 0.05 }} />
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="text-center mb-14">
            <div className="micro-label mb-4">Social Proof</div>
            <h2 className="text-3xl md:text-4xl font-black tracking-tighter mb-3 font-heading text-white">Sellers are already winning.</h2>
            <p className="text-muted-foreground">Real results from <span className="font-semibold text-foreground/80">{BRAND_NAME}</span> beta users</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5 stagger-list">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="testimonial-card">
                <div className="flex gap-0.5 mb-4">
                  {[...Array(t.stars)].map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">"{t.text}"</p>
                <div className="h-px bg-white/[0.04] mb-5" />
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold border border-white/[0.06] ${t.avatarBg}`}>
                    {t.avatar}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{t.name}</div>
                    <div className={`text-xs ${t.accentColor}`}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-4 relative">
        <div className="light-leak-blue" style={{ top: "-100px", left: "50%", transform: "translateX(-50%)", opacity: 0.06 }} />
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="text-center mb-14">
            <div className="micro-label mb-4">Pricing</div>
            <h2 className="text-3xl md:text-4xl font-black tracking-tighter mb-3 font-heading text-white">Simple, transparent pricing.</h2>
            <div className="flex items-center justify-center gap-3">
              <p className="text-muted-foreground">Start free, scale as you grow</p>
              <Badge variant="outline" className="text-[10px] border-sky-500/25 text-sky-400 bg-sky-500/5">Beta Pricing</Badge>
            </div>
          </div>
          <PricingSection />
        </div>
      </section>

      {/* ── Trust Strip ─────────────────────────────────────────────────────── */}
      <section className="py-14 px-4 border-y border-white/[0.04]">
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-3 gap-8 text-center">
            {[
              { icon: Shield, label: "SOC 2 Ready", sub: "Enterprise-grade security", color: "text-sky-400", bg: "bg-sky-500/10" },
              { icon: BarChart3, label: "Real-time Analytics", sub: "Full ROI visibility", color: "text-cyan-400", bg: "bg-cyan-500/10" },
              { icon: Zap, label: "15+ Integrations", sub: "Shopify, TikTok, Meta & more", color: "text-amber-400", bg: "bg-amber-500/10" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-3 group">
                <div className={`h-12 w-12 rounded-xl ${item.bg} flex items-center justify-center border border-white/[0.06] group-hover:border-sky-500/20 transition-all duration-500`}>
                  <item.icon className={`h-5 w-5 ${item.color}`} />
                </div>
                <div className="text-sm font-semibold text-white">{item.label}</div>
                <div className="text-[11px] text-muted-foreground">{item.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────────── */}
      <section className="py-32 px-4 relative overflow-hidden grid-bg">
        <div className="light-leak-blue" style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: 0.1 }} />
        <div className="ghost-watermark" style={{ bottom: "10%", left: "50%", transform: "translateX(-50%)", fontSize: "clamp(60px, 12vw, 160px)" }}>
          DEPLOY
        </div>
        <div className="max-w-2xl mx-auto text-center relative z-10">
          <div className="micro-label mb-6">Ready to Launch</div>
          <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-5 font-heading text-white">
            Your bots are standing by.
          </h2>
          <p className="text-muted-foreground mb-10 text-lg leading-relaxed">
            Launch your Command Center in seconds. Your first store can be live in under 30 minutes.
          </p>
          <Button
            size="lg"
            onClick={() => { window.location.href = getLoginUrl(); }}
            className="btn-glow text-base px-12 h-14"
          >
            <Zap className="h-5 w-5 mr-2" />
            Start Free Today
          </Button>
          <p className="text-xs text-muted-foreground/30 mt-6 tracking-wide">No credit card · Cancel anytime · 30-day money-back guarantee</p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="py-10 px-4 border-t border-white/[0.04] glass-subtle">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <BrandName size="sm" className="opacity-50 hover:opacity-80 transition-opacity duration-500" />
          <p className="text-[11px] text-muted-foreground/30 tracking-wide">
            © {new Date().getFullYear()} {BRAND_NAME}. Autonomous Commerce Platform.
          </p>
          <div className="flex gap-6 text-[11px] text-muted-foreground/30 hover:[&>span]:text-muted-foreground/60 [&>span]:transition-colors [&>span]:duration-500 [&>span]:cursor-pointer tracking-wide">
            <span>Privacy</span>
            <span>Terms</span>
            <span>Support</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
