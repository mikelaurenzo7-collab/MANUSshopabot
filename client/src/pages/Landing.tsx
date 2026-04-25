import { useState } from "react";
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
      className="border border-white/[0.07] rounded-xl overflow-hidden transition-colors hover:border-white/[0.12]"
      onClick={() => setOpen(!open)}
    >
      <button className="w-full flex items-center justify-between px-6 py-4 text-left gap-4">
        <span className="text-sm font-semibold text-white/80">{q}</span>
        <ChevronDown
          className={`w-4 h-4 text-white/30 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-6 pb-5 text-sm text-white/45 leading-relaxed border-t border-white/[0.05] pt-4">
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
      <section className={`relative pb-24 px-4 overflow-hidden ${subscriptionSuccess ? "pt-52" : "pt-36"}`}>
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
              Get Started Free <ArrowRight className="w-4 h-4 ml-1" />
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
                  className="bento-card p-8 group relative overflow-hidden hover-lift"
                  style={{ "--hover-glow": colors.glow } as React.CSSProperties}
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

      {/* ── Social Proof / Testimonials ────────────────────────────────────── */}
      <section className="py-24 px-4 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="micro-label mb-3">Social Proof</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-white">What founders say</h2>
            <p className="mt-4 text-white/40 max-w-xl mx-auto">Real results from real store owners using SHOPaBOT.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bento-card p-7 flex flex-col gap-4">
                <Quote className="w-6 h-6 text-sky-500/40 shrink-0" />
                <p className="text-white/60 text-sm leading-relaxed flex-1">"{t.text}"</p>
                <div className="flex items-center gap-3 pt-2 border-t border-white/[0.06]">
                  <div className="w-9 h-9 rounded-full bg-sky-500/15 border border-sky-500/25 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-sky-300">{t.name.charAt(0)}</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white/80">{t.name}</div>
                    <div className="text-xs text-white/35">{t.role}</div>
                  </div>
                  <div className="ml-auto flex gap-0.5">
                    {Array.from({ length: t.stars }).map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-4 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="micro-label mb-3">Pricing</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-white">Simple Pricing</h2>
            <p className="mt-4 text-white/40 max-w-xl mx-auto">Start free for 7 days. Scale as your store grows. Cancel anytime.</p>
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
          <div className="text-center mb-16">
            <p className="micro-label mb-3">FAQ</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-white">Common questions</h2>
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
              <p className="text-white/25 text-xs mt-4">7-day free trial · No credit card required · Cancel anytime</p>
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
