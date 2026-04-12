/**
 * Onboarding Wizard
 * Guides new users through the 4 steps to get their first bot running:
 * 1. Welcome — understand what ShopBot does
 * 2. Connect Store — link a Shopify/WooCommerce store
 * 3. Connect Socials — link Meta/TikTok/Twitter for the Hype-Man Bot
 * 4. Launch — pick a niche and fire the Architect Bot
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Bot,
  Package,
  Megaphone,
  Store,
  Share2,
  Zap,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Sparkles,
  ShoppingBag,
  Globe,
} from "lucide-react";

const STEPS = [
  { id: 1, title: "Welcome to ShopBot", icon: Sparkles },
  { id: 2, title: "Connect Your Store", icon: Store },
  { id: 3, title: "Connect Socials", icon: Share2 },
  { id: 4, title: "Launch Your First Bot", icon: Zap },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((step, i) => (
        <div key={step.id} className="flex items-center gap-2">
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
              step.id < currentStep
                ? "bg-emerald-500 text-white"
                : step.id === currentStep
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                  : "bg-secondary text-muted-foreground"
            }`}
          >
            {step.id < currentStep ? <CheckCircle2 className="h-4 w-4" /> : step.id}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-0.5 w-8 transition-all duration-300 ${step.id < currentStep ? "bg-emerald-500" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  const bots = [
    {
      name: "The Architect Bot",
      icon: Bot,
      color: "bg-violet-500/15 text-violet-400 border-violet-500/20",
      description: "Researches niches, sources products, and builds your store in under 30 minutes.",
    },
    {
      name: "The Merchant Bot",
      icon: Package,
      color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
      description: "Monitors inventory, processes orders, and adjusts pricing — all without you.",
    },
    {
      name: "The Hype-Man Bot",
      icon: Megaphone,
      color: "bg-amber-500/15 text-amber-400 border-amber-500/20",
      description: "Generates ad copy, schedules social posts, and runs email recovery flows.",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-2">
          <ShoppingBag className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Welcome to ShopBot</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Your three autonomous bots work 24/7 to build, run, and grow your e-commerce business.
          Zero-touch. No daily management required.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {bots.map(({ name, icon: Icon, color, description }) => (
          <Card key={name} className={`border ${color.split(" ").find(c => c.startsWith("border")) || "border-border/50"} bg-card`}>
            <CardContent className="p-4 space-y-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground">{name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-center">
        <Button onClick={onNext} size="lg" className="gap-2 px-8">
          Let's Get Started <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ConnectStoreStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [shopDomain, setShopDomain] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const { data: stores } = trpc.stores.list.useQuery();
  const hasStore = stores && stores.length > 0;

  const generateOAuthUrl = trpc.connectors.generateOAuthUrl.useMutation({
    onSuccess: (data) => {
      setIsConnecting(false);
      if (data.url) {
        window.location.href = data.url;
      } else {
        onNext();
      }
    },
    onError: () => setIsConnecting(false),
  });

  const handleConnect = () => {
    if (!shopDomain.trim()) return;
    const domain = shopDomain.replace(/https?:\/\//, "").replace(/\/$/, "");
    setIsConnecting(true);
    generateOAuthUrl.mutate({ platform: "shopify", shopDomain: domain, origin: window.location.origin });
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10 mb-2">
          <Store className="h-7 w-7 text-green-400" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Connect Your Store</h2>
        <p className="text-muted-foreground text-sm">
          The Architect Bot needs access to your store to build and manage it.
        </p>
      </div>

      {hasStore ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {stores.length} store{stores.length > 1 ? "s" : ""} connected
              </p>
              <p className="text-xs text-muted-foreground">{stores.map(s => s.name).join(", ")}</p>
            </div>
          </div>
          <Button onClick={onNext} className="w-full gap-2">
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shopDomain" className="text-sm text-foreground">Shopify Store Domain</Label>
            <div className="flex gap-2">
              <Input
                id="shopDomain"
                placeholder="your-store.myshopify.com"
                value={shopDomain}
                onChange={e => setShopDomain(e.target.value)}
                className="flex-1"
                onKeyDown={e => e.key === "Enter" && handleConnect()}
              />
              <Button onClick={handleConnect} disabled={isConnecting || !shopDomain.trim()} className="gap-2">
                {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Connect
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              You'll be redirected to Shopify to authorize access.
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/50" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {["WooCommerce", "Etsy", "Amazon", "TikTok Shop"].map(platform => (
              <Button
                key={platform}
                variant="outline"
                className="text-xs h-9 gap-1.5"
                onClick={() => onSkip()}
              >
                <Globe className="h-3.5 w-3.5" />
                {platform}
                <Badge variant="outline" className="text-[9px] ml-auto">Soon</Badge>
              </Button>
            ))}
          </div>

          <Button variant="ghost" onClick={onSkip} className="w-full text-muted-foreground text-sm">
            Skip for now — I'll connect later
          </Button>
        </div>
      )}
    </div>
  );
}

function ConnectSocialsStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { data: connSummary } = trpc.connectors.connectionSummary.useQuery();
  const connectedCount = typeof connSummary?.socialAccounts === 'number' ? connSummary.socialAccounts : 0;

  const platforms = [
    { name: "Meta (Facebook + Instagram)", key: "meta", color: "text-blue-400", emoji: "📘" },
    { name: "TikTok", key: "tiktok", color: "text-pink-400", emoji: "🎵" },
    { name: "Twitter / X", key: "twitter", color: "text-sky-400", emoji: "𝕏" },
    { name: "Pinterest", key: "pinterest", color: "text-red-400", emoji: "📌" },
  ];

  const generateOAuthUrl = trpc.connectors.generateSocialOAuthUrl.useMutation({
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 mb-2">
          <Share2 className="h-7 w-7 text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Connect Social Platforms</h2>
        <p className="text-muted-foreground text-sm">
          The Hype-Man Bot needs these to publish content and run ads automatically.
        </p>
      </div>

      {connectedCount > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <p className="text-sm text-foreground">{connectedCount} platform{connectedCount > 1 ? "s" : ""} connected</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {platforms.map(({ name, key, color, emoji }) => {
              const isConnected = false; // Will show as connected after OAuth callback
          return (
            <button
              key={key}
              onClick={() => !isConnected && generateOAuthUrl.mutate({ platform: key as any, origin: window.location.origin })}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                isConnected
                  ? "bg-emerald-500/10 border-emerald-500/20 cursor-default"
                  : "bg-secondary/30 border-border/50 hover:border-primary/30 hover:bg-secondary/60 cursor-pointer"
              }`}
            >
              <span className="text-xl">{emoji}</span>
              <span className={`text-sm font-medium flex-1 text-left ${color}`}>{name}</span>
              {isConnected ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onSkip} className="flex-1 text-muted-foreground">
          Skip for now
        </Button>
        <Button onClick={onNext} className="flex-1 gap-2">
          Continue <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function LaunchStep({ onComplete }: { onComplete: () => void }) {
  const [niche, setNiche] = useState("");
  const [isLaunching, setIsLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);

  const launchWorkflow = trpc.workflows.launch.useMutation({
    onSuccess: () => {
      setIsLaunching(false);
      setLaunched(true);
    },
    onError: () => setIsLaunching(false),
  });

  const nicheExamples = [
    "Minimalist Home Decor",
    "Pet Accessories",
    "Fitness & Wellness",
    "Eco-Friendly Products",
    "Gaming Peripherals",
    "Baby & Kids",
  ];

  const handleLaunch = () => {
    if (!niche.trim()) return;
    setIsLaunching(true);
    launchWorkflow.mutate({
      agentType: "architect",
      workflowType: "niche_research",
      title: `Niche Research: ${niche}`,
      description: `Automated niche research and store setup for: ${niche}`,
      scope: "global",
      input: { niche, source: "onboarding" },
    });
  };

  if (launched) {
    return (
      <div className="text-center space-y-6 py-4">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 mx-auto">
          <CheckCircle2 className="h-10 w-10 text-emerald-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Your Bot is Live!</h2>
          <p className="text-muted-foreground">
            The Architect Bot is researching <span className="text-primary font-medium">"{niche}"</span> right now.
            You'll see updates in the Activity feed.
          </p>
        </div>
        <div className="flex flex-col gap-2 max-w-xs mx-auto">
          <Button onClick={onComplete} size="lg" className="gap-2">
            Go to Command Center <ArrowRight className="h-4 w-4" />
          </Button>
          <p className="text-xs text-muted-foreground">
            Estimated time to market-ready store: ~30 minutes
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-2">
          <Zap className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Launch Your First Bot</h2>
        <p className="text-muted-foreground text-sm">
          Give the Architect Bot a niche and it will research, source products, and build your store.
        </p>
      </div>

      <div className="space-y-3">
        <Label htmlFor="niche" className="text-sm text-foreground">What niche do you want to sell in?</Label>
        <Input
          id="niche"
          placeholder="e.g. Minimalist Home Decor"
          value={niche}
          onChange={e => setNiche(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLaunch()}
          className="text-base"
        />
        <div className="flex flex-wrap gap-2">
          {nicheExamples.map(example => (
            <button
              key={example}
              onClick={() => setNiche(example)}
              className="text-xs px-2.5 py-1 rounded-full bg-secondary/60 border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 space-y-2">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Bot className="h-4 w-4 text-violet-400" /> What the Architect Bot will do:
        </h4>
        <ul className="space-y-1.5">
          {[
            "Research market demand, competition, and profit margins",
            "Source 10-20 winning products with supplier contacts",
            "Generate SEO-optimized product listings",
            "Configure your store theme, pages, and navigation",
            "Set up pricing strategy and profit targets",
          ].map(item => (
            <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onComplete} className="flex-1 text-muted-foreground">
          Skip — I'll do this later
        </Button>
        <Button
          onClick={handleLaunch}
          disabled={isLaunching || !niche.trim()}
          className="flex-1 gap-2"
          size="lg"
        >
          {isLaunching ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Launching...</>
          ) : (
            <><Zap className="h-4 w-4" /> Launch Bot</>
          )}
        </Button>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [, setLocation] = useLocation();

  const handleComplete = () => {
    // Mark onboarding as done in localStorage so we don't show it again
    localStorage.setItem("shopbot_onboarded", "true");
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold text-foreground">ShopBot</span>
          </div>
        </div>

        <StepIndicator currentStep={currentStep} />

        <Card className="bg-card border-border/50 shadow-xl">
          <CardContent className="p-8">
            {currentStep === 1 && (
              <WelcomeStep onNext={() => setCurrentStep(2)} />
            )}
            {currentStep === 2 && (
              <ConnectStoreStep
                onNext={() => setCurrentStep(3)}
                onSkip={() => setCurrentStep(3)}
              />
            )}
            {currentStep === 3 && (
              <ConnectSocialsStep
                onNext={() => setCurrentStep(4)}
                onSkip={() => setCurrentStep(4)}
              />
            )}
            {currentStep === 4 && (
              <LaunchStep onComplete={handleComplete} />
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Step {currentStep} of {STEPS.length} — {STEPS[currentStep - 1].title}
        </p>
      </div>
    </div>
  );
}
