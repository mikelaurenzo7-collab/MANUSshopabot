import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BrandName, BRAND_NAME } from "@/components/BrandName";
import {
  Bot, Package, Megaphone, ArrowRight, CheckCircle2,
  TrendingUp, Clock, ShoppingCart, Globe, Zap, Shield, BarChart3
} from "lucide-react";

const APP_LOGO = (import.meta.env.VITE_APP_LOGO as string | undefined) ||
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663544407089/R65at2L4nXpfNokxNrB7Yp/beastbots-logo-5mUP2nWBTL76U95J5hXgrq.webp";

const BOT_COLORS = {
  "Builder Bot":  { bg: "rgba(14,165,233,0.1)",  border: "rgba(14,165,233,0.3)",  icon: "text-sky-400",  glow: "rgba(14,165,233,0.15)" },
  "Merchant Bot": { bg: "rgba(6,182,212,0.1)",   border: "rgba(6,182,212,0.3)",   icon: "text-cyan-400", glow: "rgba(6,182,212,0.15)"  },
  "Social Bot":   { bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.25)", icon: "text-orange-400",glow: "rgba(249,115,22,0.12)" },
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
    bots: ["Builder Bot"],
    planId: "starter",
    featured: false,
    badge: null,
  },
  {
    name: "Growth",
    price: "$149",
    period: "/mo",
    description: "Full store automation with zero-touch fulfillment.",
    bots: ["Builder Bot", "Merchant Bot"],
    planId: "growth",
    featured: true,
    badge: "Most Popular",
  },
  {
    name: "Pro",
    price: "$299",
    period: "/mo",
    description: "Add marketing automation and multi-store management.",
    bots: ["Builder Bot", "Merchant Bot", "Social Bot"],
    planId: "pro",
    featured: false,
    badge: null,
  },
  {
    name: "Scale",
    price: "$599",
    period: "/mo",
    description: "Unlimited stores, priority support, custom integrations.",
    bots: ["Builder Bot", "Merchant Bot", "Social Bot"],
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

export default function Landing() {
  const { user } = useAuth();
  const checkoutMutation = trpc.stripe.createCheckoutSession.useMutation();

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

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 topbar-glass">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <BrandName size="sm" />
          <div className="flex items-center gap-3">
            {user ? (
              <Button
                onClick={() => window.location.href = "/"}
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
                  className="bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/20 transition-all"
                >
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative pt-36 pb-24 px-4 overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
        <div className="light-leak-blue absolute -top-32 left-1/2 -translate-x-1/2 opacity-60" />
        <div className="light-leak-cyan absolute top-1/2 right-0 opacity-30" />

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Announcement pill */}
          <div className="mb-8 inline-flex items-center gap-2 announcement-banner">
            <span className="micro-label">NEW</span>
            <span className="text-white/50 text-sm">Merchant Bot now supports Amazon FBA</span>
            <ArrowRight className="w-3.5 h-3.5 text-white/30" />
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter mb-6 leading-[0.95]">
            <span className="text-white">Autonomous</span>
            <br />
            <span className="hero-line-gradient">E-Commerce</span>
          </h1>

          {/* Subtext */}
          <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
            Three AI bots handle your entire store — from niche research to order fulfillment to marketing.
            Launch in 30 minutes. Zero daily management.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => handlePricingClick("growth")}
              size="lg"
              className="btn-glow text-white px-8 h-12 text-base font-semibold"
            >
              Get Started <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button
              onClick={() => {
                document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
              }}
              variant="outline"
              size="lg"
              className="btn-glow-outline h-12 text-base font-semibold px-8"
            >
              View Pricing
            </Button>
          </div>

          {/* Trust strip */}
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
            {TRUST_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2.5 text-left">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                  <item.icon className="w-4 h-4 text-sky-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white/80">{item.label}</div>
                  <div className="text-xs text-white/35">{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Metrics Strip ──────────────────────────────────────────────────── */}
      <section className="py-12 px-4 border-y border-white/[0.06]">
        <div className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4">
          {METRICS.map((metric) => (
            <div
              key={metric.label}
              className="bento-card p-6 text-center group"
            >
              <metric.icon className={`w-5 h-5 ${metric.color} mx-auto mb-3 group-hover:scale-110 transition-transform duration-300`} />
              <div className="text-2xl font-black font-heading text-white mb-1 metric-number">{metric.value}</div>
              <div className="micro-label-muted text-[10px] uppercase tracking-widest">{metric.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── The Three Bots ─────────────────────────────────────────────────── */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="micro-label mb-3">The Platform</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-white">The Three Bots</h2>
            <p className="mt-4 text-white/40 max-w-xl mx-auto">Each bot is a specialist. Together they run your entire e-commerce operation.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {BOTS.map((bot) => {
              const colors = BOT_COLORS[bot.name];
              return (
                <div
                  key={bot.name}
                  className="bento-card p-8 group relative overflow-hidden"
                  style={{ "--hover-glow": colors.glow } as React.CSSProperties}
                >
                  {/* Icon */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110"
                    style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
                  >
                    <bot.icon className={`w-6 h-6 ${colors.icon}`} />
                  </div>

                  <p className="micro-label mb-2" style={{ color: colors.icon.replace("text-", "") === "sky-400" ? "#38bdf8" : colors.icon.replace("text-", "") === "cyan-400" ? "#22d3ee" : "#fb923c" }}>
                    {bot.tagline}
                  </p>
                  <h3 className="text-xl font-bold text-white mb-3">{bot.name}</h3>
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

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-4 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="micro-label mb-3">Pricing</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-white">Simple Pricing</h2>
            <p className="mt-4 text-white/40 max-w-xl mx-auto">Start free. Scale as your store grows. Cancel anytime.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PRICING.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-xl p-6 transition-all duration-300 ${
                  tier.featured
                    ? "bg-sky-500/5 border border-sky-500/40 shadow-lg shadow-sky-500/10 hover:shadow-sky-500/20 hover:border-sky-500/60"
                    : "bento-card"
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
                  {tier.bots.map((bot) => (
                    <li key={bot} className="flex items-center gap-2 text-white/55 text-sm">
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      {bot}
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
                  {checkoutMutation.isPending ? "Processing..." : "Get Started"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ────────────────────────────────────────────────────── */}
      <section className="py-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="bento-card-featured rounded-2xl p-12 relative overflow-hidden">
            <div className="light-leak-blue absolute -top-20 left-1/2 -translate-x-1/2 opacity-40 pointer-events-none" />
            <div className="relative">
              <p className="micro-label mb-4">Ready to automate?</p>
              <h2 className="text-3xl md:text-4xl font-black tracking-tighter text-white mb-4">
                Launch your first autonomous store
              </h2>
              <p className="text-white/40 mb-8 leading-relaxed">
                No coding. No daily management. Just bots working 24/7 to build and grow your business.
              </p>
              <Button
                onClick={() => handlePricingClick("growth")}
                size="lg"
                className="btn-glow text-white px-10 h-12 text-base font-semibold mx-auto"
              >
                Start Free Trial <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
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
              {["Terms", "Privacy", "Contact", "Docs", "Status"].map((link) => (
                <a key={link} href="#" className="text-white/35 text-sm hover:text-sky-400 transition-colors">
                  {link}
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
