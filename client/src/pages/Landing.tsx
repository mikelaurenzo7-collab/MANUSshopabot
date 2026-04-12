import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Zap, Bot, Package, Megaphone, ArrowRight, CheckCircle2,
  TrendingUp, Clock, ShoppingCart, Star, Shield, BarChart3,
  Play, Globe, Cpu, Sparkles
} from "lucide-react";

const APP_LOGO = (import.meta.env.VITE_APP_LOGO as string | undefined) ||
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663544407089/R65at2L4nXpfNokxNrB7Yp/shopbots-logo-jtbPJz7S5VtEogc7An2qZH.webp";

const BOTS = [
  {
    icon: Bot,
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/25",
    glow: "shadow-violet-500/20",
    hoverGlow: "hover:shadow-violet-500/30 hover:border-violet-400/50",
    iconBg: "bg-violet-500/15",
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
  { icon: Clock, value: "< 30 min", label: "Store goes live", color: "text-violet-400", glow: "shadow-violet-500/20" },
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
    borderClass: "border-border/40",
    bgClass: "bg-card/60",
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
    borderClass: "border-cyan-500/30",
    bgClass: "bg-cyan-500/5",
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
    borderClass: "border-primary/60",
    bgClass: "bg-primary/8",
  },
  {
    name: "Scale",
    price: "$599",
    period: "/mo",
    description: "Power sellers with ML optimization and multi-store intelligence.",
    bots: ["All 3 Bots", "Analytics Bot", "Multi-Store"],
    highlight: false,
    badge: "Coming Soon",
    cta: "Notify Me",
    disabled: true,
    borderClass: "border-border/30",
    bgClass: "bg-card/40",
  },
];

const TESTIMONIALS = [
  {
    name: "Marcus T.",
    role: "Dropshipper, 3 stores",
    avatar: "MT",
    text: "Builder Bot set up my Minimalist Home Decor store in 22 minutes. Merchant Bot has processed 847 orders without me touching anything.",
    stars: 5,
    accentColor: "text-violet-400",
    avatarBg: "bg-violet-500/20 text-violet-300",
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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden page-enter">

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 topbar-glass">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <img src={APP_LOGO} alt="BeastBots" className="h-8 w-auto object-contain" />
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { window.location.href = getLoginUrl(); }}
              className="text-muted-foreground hover:text-foreground transition-all duration-300"
            >
              Sign In
            </Button>
            <Button
              size="sm"
              onClick={() => { window.location.href = getLoginUrl(); }}
              className="btn-glow bg-primary hover:bg-primary/90 transition-all duration-300 font-semibold"
            >
              Get Started Free
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="pt-36 pb-24 px-4 relative hero-background">
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 mb-8">
            <Badge
              variant="outline"
              className="border-primary/40 text-primary text-xs tracking-widest uppercase px-4 py-1.5 bg-primary/5 backdrop-blur-sm"
            >
              <Sparkles className="h-3 w-3 mr-1.5" />
              Autonomous Commerce Platform
            </Badge>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-[1.05] hero-gradient-text">
            Your E-Commerce Empire,{" "}
            <br className="hidden md:block" />
            Run by Bots
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
            Three specialized AI agents handle everything — building your store, fulfilling orders, and marketing across TikTok & Meta.{" "}
            <span className="text-foreground/80 font-medium">You collect the revenue.</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
            <Button
              size="lg"
              onClick={() => { window.location.href = getLoginUrl(); }}
              className="btn-glow bg-primary hover:bg-primary/90 text-base px-10 h-13 font-semibold transition-all duration-300"
            >
              <Zap className="h-4 w-4 mr-2" />
              Launch Your Command Center
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-base px-10 h-13 border-border/50 hover:border-primary/50 bg-transparent hover:bg-primary/5 transition-all duration-300"
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            >
              <Play className="h-4 w-4 mr-2" />
              See How It Works
            </Button>
          </div>
          <p className="text-xs text-muted-foreground/40 tracking-wide">No credit card required · Cancel anytime · 30-day guarantee</p>
        </div>
      </section>

      {/* ── Metrics Strip ───────────────────────────────────────────────────── */}
      <section className="py-14 px-4 border-y border-border/20 bg-gradient-to-r from-transparent via-primary/3 to-transparent">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {METRICS.map((m) => (
            <div key={m.label} className="text-center group">
              <div className={`inline-flex items-center justify-center h-10 w-10 rounded-xl mb-3 bg-card/60 border border-border/30 group-hover:border-border/60 transition-all duration-300 shadow-lg ${m.glow}`}>
                <m.icon className={`h-5 w-5 ${m.color}`} />
              </div>
              <div className={`text-2xl font-bold font-heading metric-number ${m.color}`}>{m.value}</div>
              <div className="text-xs text-muted-foreground mt-1 tracking-wide">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bots ────────────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4 gradient-text">Meet Your Bot Squad</h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-base leading-relaxed">
              Three specialized agents working in parallel — each an expert in their domain.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 stagger-list">
            {BOTS.map((bot) => (
              <Card
                key={bot.name}
                className={`relative border ${bot.bg} shadow-xl ${bot.glow} ${bot.hoverGlow} transition-all duration-350 glass-card overflow-hidden group`}
              >
                {/* Subtle corner accent */}
                <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-10 ${bot.iconBg}`} />
                <CardContent className="p-8 relative">
                  <div className={`inline-flex items-center justify-center h-14 w-14 rounded-2xl ${bot.iconBg} border ${bot.bg} mb-5 shadow-lg group-hover:scale-105 transition-transform duration-300`}>
                    <bot.icon className={`h-7 w-7 ${bot.color}`} />
                  </div>
                  <div className="mb-2">
                    <span className={`text-xs font-bold uppercase tracking-widest ${bot.color}`}>{bot.tagline}</span>
                  </div>
                  <h3 className="text-xl font-bold mb-3 font-heading">{bot.name}</h3>
                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{bot.description}</p>
                  <hr className="gradient-divider mb-5" />
                  <ul className="space-y-2.5">
                    {bot.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <CheckCircle2 className={`h-4 w-4 shrink-0 ${bot.color}`} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social Proof ────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/3 to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-3 font-heading">Sellers Are Already Winning</h2>
            <p className="text-muted-foreground">Real results from BeastBots beta users</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 stagger-list">
            {TESTIMONIALS.map((t) => (
              <Card key={t.name} className="glass-card border-border/30 hover:border-primary/30 transition-all duration-300">
                <CardContent className="p-7">
                  <div className="flex gap-0.5 mb-4">
                    {[...Array(t.stars)].map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">"{t.text}"</p>
                  <hr className="gradient-divider mb-5" />
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold border border-border/30 ${t.avatarBg}`}>
                      {t.avatar}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{t.name}</div>
                      <div className={`text-xs ${t.accentColor}`}>{t.role}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-3 font-heading">Simple, Transparent Pricing</h2>
            <div className="flex items-center justify-center gap-3">
              <p className="text-muted-foreground">Start free, scale as you grow</p>
              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary bg-primary/5">Beta Pricing</Badge>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PRICING.map((tier) => (
              <Card
                key={tier.name}
                className={`relative border transition-all duration-300 ${tier.bgClass} ${tier.borderClass} ${
                  tier.highlight
                    ? "shadow-xl shadow-primary/15 scale-[1.02]"
                    : "hover:border-primary/30 hover:shadow-lg"
                } glass-card`}
              >
                {tier.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                    <Badge
                      className={`text-[10px] px-3 py-0.5 font-semibold tracking-wide ${
                        tier.highlight
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                          : tier.badge === "Popular"
                          ? "bg-cyan-500 text-background"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {tier.badge}
                    </Badge>
                  </div>
                )}
                <CardContent className="p-6 pt-7">
                  <div className="mb-5">
                    <h3 className="font-bold text-base font-heading">{tier.name}</h3>
                    <div className="flex items-baseline gap-0.5 mt-1.5">
                      <span className={`text-3xl font-extrabold font-heading ${tier.highlight ? "gradient-text" : ""}`}>{tier.price}</span>
                      <span className="text-xs text-muted-foreground ml-0.5">{tier.period}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-5 leading-relaxed">{tier.description}</p>
                  <hr className="gradient-divider mb-4" />
                  <ul className="space-y-2 mb-6">
                    {tier.bots.map((b) => (
                      <li key={b} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    className={`w-full text-xs font-semibold transition-all duration-300 ${
                      tier.highlight ? "btn-glow bg-primary hover:bg-primary/90" : ""
                    }`}
                    variant={tier.highlight ? "default" : "outline"}
                    disabled={tier.disabled}
                    onClick={() => { if (!tier.disabled) window.location.href = getLoginUrl(); }}
                  >
                    {tier.cta}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust Strip ─────────────────────────────────────────────────────── */}
      <section className="py-14 px-4 border-y border-border/20">
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-3 gap-8 text-center">
            {[
              { icon: Shield, label: "SOC 2 Ready", sub: "Enterprise-grade security", color: "text-violet-400", bg: "bg-violet-500/10" },
              { icon: BarChart3, label: "Real-time Analytics", sub: "Full ROI visibility", color: "text-cyan-400", bg: "bg-cyan-500/10" },
              { icon: Zap, label: "15+ Integrations", sub: "Shopify, TikTok, Meta & more", color: "text-amber-400", bg: "bg-amber-500/10" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-3 group">
                <div className={`h-11 w-11 rounded-xl ${item.bg} flex items-center justify-center border border-border/30 group-hover:scale-105 transition-transform duration-300`}>
                  <item.icon className={`h-5 w-5 ${item.color}`} />
                </div>
                <div className="text-sm font-semibold">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────────── */}
      <section className="py-28 px-4 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-radial-[ellipse_60%_50%_at_50%_50%] from-primary/10 via-transparent to-transparent" />
        </div>
        <div className="max-w-2xl mx-auto text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-extrabold mb-5 font-heading hero-gradient-text">
            Your Bots Are Standing By
          </h2>
          <p className="text-muted-foreground mb-10 text-lg leading-relaxed">
            Launch your Command Center in seconds. Your first store can be live in under 30 minutes.
          </p>
          <Button
            size="lg"
            onClick={() => { window.location.href = getLoginUrl(); }}
            className="btn-glow bg-primary hover:bg-primary/90 text-base px-12 h-14 font-semibold transition-all duration-300"
          >
            <Zap className="h-5 w-5 mr-2" />
            Start Free Today
          </Button>
          <p className="text-xs text-muted-foreground/40 mt-5 tracking-wide">No credit card · Cancel anytime · 30-day money-back guarantee</p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="py-8 px-4 border-t border-border/20">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <img src={APP_LOGO} alt="BeastBots" className="h-6 w-auto object-contain opacity-50 hover:opacity-80 transition-opacity duration-300" />
          <p className="text-xs text-muted-foreground/40">
            © {new Date().getFullYear()} BeastBots. Autonomous Commerce Platform.
          </p>
          <div className="flex gap-5 text-xs text-muted-foreground/40 hover:[&>span]:text-muted-foreground/70 [&>span]:transition-colors [&>span]:duration-200 [&>span]:cursor-pointer">
            <span>Privacy</span>
            <span>Terms</span>
            <span>Support</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
