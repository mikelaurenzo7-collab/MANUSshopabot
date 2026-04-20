import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandName } from "@/components/BrandName";
import {
  Zap, Bot, Package, Megaphone, ArrowRight, CheckCircle2,
  TrendingUp, Clock, ShoppingCart, Globe, Terminal, ChevronRight
} from "lucide-react";

const APP_LOGO = (import.meta.env.VITE_APP_LOGO as string | undefined) ||
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663544407089/R65at2L4nXpfNokxNrB7Yp/beastbots-logo-5mUP2nWBTL76U95J5hXgrq.webp";

const BOTS = [
  {
    icon: Bot,
    name: "Builder Bot",
    tagline: "Store live in 30 minutes",
    description: "Researches winning niches, sources products, configures your Shopify store, and writes all product copy — fully automated.",
    features: ["Niche & competitor research", "Product sourcing (Zendrop/AliExpress)", "Theme setup & legal pages", "SEO-optimized product listings"],
  },
  {
    icon: Package,
    name: "Merchant Bot",
    tagline: "Zero-touch fulfillment",
    description: "Monitors inventory, processes every order automatically, adjusts pricing based on competitor data, and triages customer support tickets.",
    features: ["Automated order fulfillment", "Dynamic pricing engine", "Inventory sync & alerts", "Customer support triage"],
  },
  {
    icon: Megaphone,
    name: "Social Bot",
    tagline: "Marketing on autopilot",
    description: "Creates ad creatives for TikTok & Meta, schedules social posts, runs email/SMS recovery flows, and optimizes SEO — all without you.",
    features: ["TikTok & Meta ad campaigns", "Social media scheduling", "Email & SMS recovery flows", "SEO optimization"],
  },
];

const METRICS = [
  { icon: Clock, value: "< 30 min", label: "Store goes live" },
  { icon: ShoppingCart, value: "0 clicks", label: "To fulfill an order" },
  { icon: TrendingUp, value: "24 / 7", label: "Bots running for you" },
  { icon: Globe, value: "15+", label: "Platform integrations" },
];

const PRICING = [
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    description: "Research niches, source products, build your first store.",
    bots: ["Builder Bot"],
    planId: "starter",
  },
  {
    name: "Growth",
    price: "$149",
    period: "/mo",
    description: "Full store automation with zero-touch fulfillment.",
    bots: ["Builder Bot", "Merchant Bot"],
    badge: "Popular",
    planId: "growth",
  },
  {
    name: "Pro",
    price: "$299",
    period: "/mo",
    description: "Add marketing automation and multi-store management.",
    bots: ["Builder Bot", "Merchant Bot", "Social Bot"],
    planId: "pro",
  },
  {
    name: "Scale",
    price: "$599",
    period: "/mo",
    description: "Unlimited stores, priority support, custom integrations.",
    bots: ["Builder Bot", "Merchant Bot", "Social Bot"],
    badge: "Enterprise",
    planId: "scale",
  },
];

export default function Landing() {
  const { user } = useAuth();
  const checkoutMutation = trpc.stripe.createCheckoutSession.useMutation();

  const handlePricingClick = (planId: string) => {
    if (!user) {
      window.location.href = `/manus-oauth/login?returnPath=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    checkoutMutation.mutate({ planId: planId as "starter" | "growth" | "pro" | "scale", origin: window.location.origin }, {
      onSuccess: (data) => {
        if (data.url) {
          window.open(data.url, "_blank");
          toast.success("Opening checkout in new tab...");
        }
      },
      onError: (err: any) => {
        toast.error(err.message || "Failed to create checkout session");
      },
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1e293b] bg-[#0a0a0a]/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={APP_LOGO} alt="SHOPaBOT" className="h-8 w-8" />
            <span className="font-mono text-sm font-bold uppercase tracking-widest">SHOPaBOT</span>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Button
                onClick={() => window.location.href = "/"}
                className="bg-[#1e293b] hover:bg-sky-500/20 border border-[#1e293b] hover:border-sky-500 text-white font-mono text-xs uppercase px-4 py-2 transition-all"
              >
                Dashboard
              </Button>
            ) : (
              <Button
                onClick={() => window.location.href = `/manus-oauth/login?returnPath=${encodeURIComponent(window.location.pathname)}`}
                className="bg-sky-500 hover:bg-sky-600 text-white font-mono text-xs uppercase px-4 py-2 transition-all"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 border-b border-[#1e293b]">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-8 inline-block">
            <div className="border border-[#1e293b] bg-[#050505] px-4 py-2 rounded-none">
              <span className="text-sky-400 font-mono text-[10px] uppercase tracking-widest font-bold">NEW</span>
              <span className="text-[#64748b] font-mono text-[10px] ml-2">Merchant Bot now supports Amazon FBA</span>
            </div>
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-6 font-mono uppercase">
            Autonomous<br />E-Commerce
          </h1>
          <p className="text-lg md:text-xl text-[#64748b] max-w-2xl mx-auto mb-10 leading-relaxed font-mono">
            Three AI bots handle your entire store — from niche research to order fulfillment to marketing. Launch in 30 minutes. Zero daily management.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={() => handlePricingClick("growth")}
              className="bg-sky-500 hover:bg-sky-600 text-white font-mono text-sm uppercase px-8 py-3 transition-all flex items-center justify-center gap-2"
            >
              Get Started <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => window.location.href = "#pricing"}
              className="bg-[#1e293b] hover:bg-sky-500/20 border border-[#1e293b] hover:border-sky-500 text-white font-mono text-sm uppercase px-8 py-3 transition-all"
            >
              View Pricing
            </Button>
          </div>
        </div>
      </section>

      {/* Metrics */}
      <section className="py-16 px-4 border-b border-[#1e293b]">
        <div className="max-w-6xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {METRICS.map((metric) => (
            <div key={metric.label} className="border border-[#1e293b] bg-[#050505] p-6 rounded-none hover:border-sky-500/50 transition-all">
              <metric.icon className="w-5 h-5 text-sky-400 mb-3" />
              <div className="font-mono text-2xl font-bold text-white mb-1">{metric.value}</div>
              <div className="text-[#64748b] font-mono text-[10px] uppercase tracking-widest">{metric.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Three Bots */}
      <section className="py-20 px-4 border-b border-[#1e293b]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-16 font-mono uppercase text-center">The Three Bots</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {BOTS.map((bot) => (
              <div key={bot.name} className="border border-[#1e293b] bg-[#050505] p-8 rounded-none hover:border-sky-500/50 hover:shadow-lg hover:shadow-sky-500/10 transition-all">
                <bot.icon className="w-8 h-8 text-sky-400 mb-4" />
                <h3 className="font-mono text-lg font-bold uppercase tracking-widest mb-2">{bot.name}</h3>
                <p className="text-sky-400 font-mono text-[10px] uppercase tracking-widest mb-4">{bot.tagline}</p>
                <p className="text-[#64748b] font-mono text-sm mb-6 leading-relaxed">{bot.description}</p>
                <ul className="space-y-2">
                  {bot.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-[#64748b] font-mono text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 border-b border-[#1e293b]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-16 font-mono uppercase text-center">Simple Pricing</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PRICING.map((tier) => (
              <div key={tier.name} className={`border ${tier.badge ? "border-sky-500/50 bg-sky-500/5" : "border-[#1e293b] bg-[#050505]"} p-6 rounded-none relative hover:border-sky-500/50 transition-all`}>
                {tier.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[#0a0a0a] border border-sky-500 text-sky-400 font-mono text-[9px] uppercase tracking-widest px-3 py-1 rounded-none">{tier.badge}</span>
                  </div>
                )}
                <h3 className="font-mono text-lg font-bold uppercase tracking-widest mb-2">{tier.name}</h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-black font-mono">{tier.price}</span>
                  <span className="text-[#64748b] font-mono text-xs">{tier.period}</span>
                </div>
                <p className="text-[#64748b] font-mono text-xs mb-4 leading-relaxed">{tier.description}</p>
                <div className="h-px bg-[#1e293b] mb-4" />
                <ul className="space-y-2 mb-6">
                  {tier.bots.map((bot) => (
                    <li key={bot} className="flex items-center gap-2 text-[#64748b] font-mono text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      {bot}
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => handlePricingClick(tier.planId)}
                  disabled={checkoutMutation.isPending}
                  className={`w-full font-mono text-xs uppercase py-2 transition-all ${tier.badge ? "bg-sky-500 hover:bg-sky-600 text-white" : "bg-[#1e293b] hover:bg-sky-500/20 border border-[#1e293b] hover:border-sky-500 text-white"}`}
                >
                  {checkoutMutation.isPending ? "Processing..." : "Get Started"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center border border-[#1e293b] bg-[#050505] p-12 rounded-none">
          <h2 className="text-3xl md:text-4xl font-black tracking-tighter mb-4 font-mono uppercase">Ready to automate?</h2>
          <p className="text-[#64748b] font-mono text-sm mb-8 leading-relaxed">
            Launch your first autonomous store in 30 minutes. No coding. No daily management. Just bots.
          </p>
          <Button
            onClick={() => handlePricingClick("growth")}
            className="bg-sky-500 hover:bg-sky-600 text-white font-mono text-sm uppercase px-8 py-3 transition-all flex items-center justify-center gap-2 mx-auto"
          >
            Start Free Trial <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1e293b] bg-[#050505] py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <img src={APP_LOGO} alt="SHOPaBOT" className="h-6 w-6" />
            <span className="font-mono text-xs uppercase tracking-widest text-[#64748b]">© 2026 SHOPaBOT</span>
          </div>
          <div className="flex gap-6 text-[#64748b] font-mono text-xs">
            <a href="#" className="hover:text-sky-400 transition-colors">Terms</a>
            <a href="#" className="hover:text-sky-400 transition-colors">Privacy</a>
            <a href="#" className="hover:text-sky-400 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
