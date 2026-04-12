import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Zap, Bot, Package, Megaphone, ArrowRight, CheckCircle2,
  TrendingUp, Clock, ShoppingCart, Star, Shield, BarChart3,
  Play, Globe, Cpu
} from "lucide-react";

const APP_LOGO = (import.meta.env.VITE_APP_LOGO as string | undefined) ||
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663544407089/R65at2L4nXpfNokxNrB7Yp/shopbots-logo-jtbPJz7S5VtEogc7An2qZH.webp";

const BOTS = [
  {
    icon: Bot,
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
    glow: "shadow-violet-500/20",
    name: "Builder Bot",
    tagline: "Store live in 30 minutes",
    description:
      "Researches winning niches, sources products from top suppliers, configures your Shopify store, and writes all product copy — fully automated.",
    features: ["Niche & competitor research", "Product sourcing (Zendrop/AliExpress)", "Theme setup & legal pages", "SEO-optimized product listings"],
  },
  {
    icon: Package,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/20",
    glow: "shadow-cyan-500/20",
    name: "Merchant Bot",
    tagline: "Zero-touch fulfillment",
    description:
      "Monitors inventory, processes every order automatically, adjusts pricing based on competitor data, and triages customer support tickets.",
    features: ["Automated order fulfillment", "Dynamic pricing engine", "Inventory sync & alerts", "Customer support triage"],
  },
  {
    icon: Megaphone,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    glow: "shadow-amber-500/20",
    name: "Social Bot",
    tagline: "Marketing on autopilot",
    description:
      "Creates ad creatives for TikTok & Meta, schedules social posts, runs email/SMS recovery flows, and optimizes SEO — all without you.",
    features: ["TikTok & Meta ad campaigns", "Social media scheduling", "Email & SMS recovery flows", "SEO optimization"],
  },
];

const METRICS = [
  { icon: Clock, value: "< 30 min", label: "Store goes live", color: "text-violet-400" },
  { icon: ShoppingCart, value: "0 clicks", label: "To fulfill an order", color: "text-cyan-400" },
  { icon: TrendingUp, value: "24 / 7", label: "Bots running for you", color: "text-amber-400" },
  { icon: Globe, value: "15+", label: "Platform integrations", color: "text-green-400" },
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
  },
];

const TESTIMONIALS = [
  {
    name: "Marcus T.",
    role: "Dropshipper, 3 stores",
    avatar: "MT",
    text: "Builder Bot set up my Minimalist Home Decor store in 22 minutes. Merchant Bot has processed 847 orders without me touching anything.",
    stars: 5,
  },
  {
    name: "Priya S.",
    role: "E-commerce entrepreneur",
    avatar: "PS",
    text: "Social Bot's TikTok campaigns are converting at 4.2%. I used to spend 3 hours a day on ads. Now I spend zero.",
    stars: 5,
  },
  {
    name: "Jordan K.",
    role: "Side hustle → full-time",
    avatar: "JK",
    text: "I was skeptical about 'zero-touch fulfillment' but it's real. 1,200 orders fulfilled automatically in my first month.",
    stars: 5,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <img src={APP_LOGO} alt="ShopBOTS" className="h-8 w-auto object-contain" />
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { window.location.href = getLoginUrl(); }}
              className="text-muted-foreground hover:text-foreground"
            >
              Sign In
            </Button>
            <Button
              size="sm"
              onClick={() => { window.location.href = getLoginUrl(); }}
              className="btn-glow bg-primary hover:bg-primary/90"
            >
              Get Started Free
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative">
          <Badge variant="outline" className="mb-6 border-primary/30 text-primary text-xs tracking-wider uppercase">
            <Cpu className="h-3 w-3 mr-1.5" />
            Autonomous Commerce Platform
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Your E-Commerce Empire,{" "}
            <span className="bg-gradient-to-r from-primary via-violet-400 to-cyan-400 bg-clip-text text-transparent">
              Run by Bots
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Three specialized AI agents handle everything — building your store, fulfilling orders, and marketing across TikTok & Meta. You collect the revenue.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              size="lg"
              onClick={() => { window.location.href = getLoginUrl(); }}
              className="btn-glow bg-primary hover:bg-primary/90 text-base px-8 h-12"
            >
              <Zap className="h-4 w-4 mr-2" />
              Launch Your Command Center
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-base px-8 h-12 border-border/50 hover:border-primary/50"
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            >
              <Play className="h-4 w-4 mr-2" />
              See How It Works
            </Button>
          </div>
          <p className="text-xs text-muted-foreground/50 mt-4">No credit card required · Cancel anytime</p>
        </div>
      </section>

      {/* Metrics Strip */}
      <section className="py-12 px-4 border-y border-border/30 bg-secondary/20">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {METRICS.map((m) => (
            <div key={m.label} className="text-center">
              <m.icon className={`h-5 w-5 mx-auto mb-2 ${m.color}`} />
              <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Bots */}
      <section id="how-it-works" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Meet Your Bot Squad</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Three specialized agents working in parallel — each an expert in their domain.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {BOTS.map((bot) => (
              <Card key={bot.name} className={`border ${bot.bg} shadow-lg ${bot.glow} hover:shadow-xl transition-all duration-300 metric-lift`}>
                <CardContent className="p-6">
                  <div className={`inline-flex items-center justify-center h-12 w-12 rounded-xl ${bot.bg} mb-4`}>
                    <bot.icon className={`h-6 w-6 ${bot.color}`} />
                  </div>
                  <div className="mb-1">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${bot.color}`}>{bot.tagline}</span>
                  </div>
                  <h3 className="text-xl font-bold mb-3">{bot.name}</h3>
                  <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{bot.description}</p>
                  <ul className="space-y-2">
                    {bot.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${bot.color}`} />
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

      {/* Social Proof */}
      <section className="py-20 px-4 bg-secondary/10 border-y border-border/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Sellers Are Already Winning</h2>
            <p className="text-muted-foreground">Real results from ShopBOTS beta users</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <Card key={t.name} className="bg-card border-border/50">
                <CardContent className="p-6">
                  <div className="flex gap-0.5 mb-4">
                    {[...Array(t.stars)].map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-5">"{t.text}"</p>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                      {t.avatar}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.role}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Simple, Transparent Pricing</h2>
            <div className="flex items-center justify-center gap-2">
              <p className="text-muted-foreground">Start free, scale as you grow</p>
              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Beta Pricing</Badge>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PRICING.map((tier) => (
              <Card
                key={tier.name}
                className={`relative border transition-all ${
                  tier.highlight
                    ? "border-primary/60 shadow-lg shadow-primary/10 bg-primary/5"
                    : "border-border/50 bg-card"
                }`}
              >
                {tier.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className={`text-[10px] ${tier.highlight ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                      {tier.badge}
                    </Badge>
                  </div>
                )}
                <CardContent className="p-5 pt-6">
                  <div className="mb-4">
                    <h3 className="font-bold text-base">{tier.name}</h3>
                    <div className="flex items-baseline gap-0.5 mt-1">
                      <span className="text-2xl font-bold">{tier.price}</span>
                      <span className="text-xs text-muted-foreground">{tier.period}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{tier.description}</p>
                  <ul className="space-y-1.5 mb-5">
                    {tier.bots.map((b) => (
                      <li key={b} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    className={`w-full text-xs ${tier.highlight ? "btn-glow bg-primary hover:bg-primary/90" : ""}`}
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

      {/* Trust Strip */}
      <section className="py-12 px-4 border-t border-border/30 bg-secondary/10">
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-3 gap-6 text-center">
            {[
              { icon: Shield, label: "SOC 2 Ready", sub: "Enterprise-grade security" },
              { icon: BarChart3, label: "Real-time Analytics", sub: "Full ROI visibility" },
              { icon: Zap, label: "15+ Integrations", sub: "Shopify, TikTok, Meta & more" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-2">
                <item.icon className="h-5 w-5 text-primary" />
                <div className="text-sm font-semibold">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Your Bots Are Standing By
          </h2>
          <p className="text-muted-foreground mb-8 text-lg">
            Launch your Command Center in seconds. Your first store can be live in under 30 minutes.
          </p>
          <Button
            size="lg"
            onClick={() => { window.location.href = getLoginUrl(); }}
            className="btn-glow bg-primary hover:bg-primary/90 text-base px-10 h-12"
          >
            <Zap className="h-4 w-4 mr-2" />
            Start Free Today
          </Button>
          <p className="text-xs text-muted-foreground/50 mt-4">No credit card · Cancel anytime · 30-day money-back guarantee</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border/30">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <img src={APP_LOGO} alt="ShopBOTS" className="h-6 w-auto object-contain opacity-60" />
          <p className="text-xs text-muted-foreground/50">
            © {new Date().getFullYear()} ShopBOTS. Autonomous Commerce Platform.
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground/50">
            <span>Privacy</span>
            <span>Terms</span>
            <span>Support</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
