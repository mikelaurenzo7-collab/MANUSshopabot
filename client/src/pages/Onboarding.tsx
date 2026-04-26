/**
 * Onboarding Wizard
 * Guides new users through the 4 steps to get their first bot running:
 * 1. Welcome — understand what SHOPaBOT does
 * 2. Connect Store — link a Shopify/WooCommerce store
 * 3. Connect Socials — link Meta/TikTok/Twitter for the Social Bot
 * 4. Launch — pick a niche and fire the Builder Bot
 */

import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
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
  AlertCircle,
} from "lucide-react";
import { BrandName, BRAND_NAME } from "@/components/BrandName";
import { Skeleton } from "@/components/ui/skeleton";

const STEPS = [
  { id: 1, title: "Welcome to SHOPaBOT", icon: Sparkles },
  { id: 2, title: "Connect Your Store", icon: Store },
  { id: 3, title: "Connect Socials", icon: Share2 },
  { id: 4, title: "Launch Your First Bot", icon: Zap },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {STEPS.map((step, i) => {
        const isComplete = step.id < currentStep;
        const isActive = step.id === currentStep;
        return (
          <div key={step.id} className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  isComplete
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                    : isActive
                      ? "bg-sky-500 text-white ring-4 ring-sky-500/20 shadow-lg shadow-sky-500/30"
                      : "bg-white/[0.05] text-muted-foreground border border-white/[0.08]"
                }`}
              >
                {isComplete ? <CheckCircle2 className="h-4 w-4" /> : step.id}
              </div>
              <span className={`text-[10px] font-medium hidden sm:block transition-colors ${
                isActive ? "text-sky-400" : isComplete ? "text-emerald-400" : "text-muted-foreground"
              }`}>
                {step.title.split(" ").slice(0, 2).join(" ")}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-10 mb-5 transition-all duration-500 ${
                isComplete ? "bg-gradient-to-r from-emerald-500 to-sky-500" : "bg-white/[0.06]"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  const bots = [
    {
      name: "Builder Bot",
      icon: Bot,
      color: "bg-sky-500/15 text-sky-400 border-sky-500/20",
      description: "Researches niches, sources products, and builds your store in under 30 minutes.",
    },
    {
      name: "Merchant Bot",
      icon: Package,
      color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
      description: "Monitors inventory, processes orders, and adjusts pricing — all without you.",
    },
    {
      name: "Social Bot",
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
        <h2 className="text-2xl font-bold text-foreground">Welcome to <BrandName size="2xl" /></h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Your three autonomous bots work 24/7 to build, run, and grow your e-commerce business.
          Zero-touch. No daily management required.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {bots.map(({ name, icon: Icon, color, description }) => {
          const borderClass = color.split(" ").find(c => c.startsWith("border")) || "border-white/[0.08]";
          const glowColor = color.includes("sky") ? "hover:shadow-sky-500/10" : color.includes("cyan") ? "hover:shadow-cyan-500/10" : "hover:shadow-amber-500/10";
          return (
            <Card key={name} className={`border ${borderClass} bg-card/50 backdrop-blur-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-lg ${glowColor} cursor-default`}>
              <CardContent className="p-5 space-y-3">
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${color} border`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-foreground">{name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
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
  const [storeName, setStoreName] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");
  const { data: stores, refetch: refetchStores } = trpc.stores.list.useQuery();
  const activeStores = stores?.filter((s: any) => s.status === "active") ?? [];
  const hasActiveStore = activeStores.length > 0;

  // Check if we just returned from a successful OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "true") {
      toast.success("Store connected successfully!");
      refetchStores();
      // Clean URL
      window.history.replaceState({}, "", "/onboarding");
    }
    if (params.get("error")) {
      setError("Connection failed. Please try again.");
      window.history.replaceState({}, "", "/onboarding");
    }
  }, []);

  // Step 1: Create store record, then Step 2: Get OAuth URL
  const createStoreForOAuth = trpc.stores.create.useMutation({
    onSuccess: (newStore) => {
      // Now get the Shopify OAuth URL using the new store's ID
      shopifyOAuthUrl.mutate({
        shopDomain: shopDomain.trim(),
        storeId: newStore.id,
        origin: window.location.origin,
        returnTo: "/onboarding",
      });
    },
    onError: (err) => {
      setIsConnecting(false);
      setError(err.message);
    },
  });

  const shopifyOAuthUrl = trpc.stores.shopifyOAuthUrl.useMutation({
    onSuccess: (data) => {
      // Redirect to Shopify OAuth consent screen
      window.location.href = data.url;
    },
    onError: (err) => {
      setIsConnecting(false);
      setError(err.message);
    },
  });

  const handleConnect = () => {
    setError("");
    if (!shopDomain.trim()) {
      setError("Please enter your Shopify store domain");
      return;
    }

    // Clean and validate the domain
    let domain = shopDomain.trim().toLowerCase();
    domain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!domain.includes(".")) domain = `${domain}.myshopify.com`;

    // Basic validation
    if (!domain.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)) {
      setError("Invalid domain format. Use: your-store or your-store.myshopify.com");
      return;
    }

    setIsConnecting(true);

    // Derive store name from domain if not provided
    const name = storeName.trim() || domain.replace(".myshopify.com", "");

    // Create store record first, then OAuth URL is generated in onSuccess
    createStoreForOAuth.mutate({
      name,
      platform: "shopify",
      platformDomain: domain,
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10 mb-2">
          <Store className="h-7 w-7 text-green-400" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Connect Your Store</h2>
        <p className="text-muted-foreground text-sm">
          Builder Bot needs access to your store to build and manage it.
        </p>
      </div>

      {hasActiveStore ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {activeStores.length} store{activeStores.length > 1 ? "s" : ""} connected
              </p>
              <p className="text-xs text-muted-foreground">{activeStores.map((s: any) => s.name).join(", ")}</p>
            </div>
          </div>
          <Button onClick={onNext} className="w-full gap-2">
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <Label htmlFor="storeName" className="text-sm text-foreground">Store Name <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="storeName"
                placeholder="My Awesome Store"
                value={storeName}
                onChange={e => { setStoreName(e.target.value); setError(""); }}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="shopDomain" className="text-sm text-foreground">Shopify Store Domain</Label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  id="shopDomain"
                  placeholder="your-store.myshopify.com"
                  value={shopDomain}
                  onChange={e => { setShopDomain(e.target.value); setError(""); }}
                  className="flex-1"
                  onKeyDown={e => e.key === "Enter" && handleConnect()}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Enter your store name (e.g., <span className="font-mono text-foreground/70">my-store</span>) or full domain (<span className="font-mono text-foreground/70">my-store.myshopify.com</span>)
              </p>
            </div>
          </div>

          <Button
            onClick={handleConnect}
            disabled={isConnecting || !shopDomain.trim()}
            className="w-full gap-2"
            size="lg"
          >
            {isConnecting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Connecting to Shopify...</>
            ) : (
              <><ExternalLink className="h-4 w-4" /> Connect Shopify Store</>
            )}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/50" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">other platforms</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { name: "WooCommerce", emoji: "🌐" },
              { name: "Etsy", emoji: "🧡" },
              { name: "Amazon", emoji: "📦" },
              { name: "TikTok Shop", emoji: "🎵" },
            ].map(platform => (
              <Button
                key={platform.name}
                variant="outline"
                className="text-xs h-9 gap-1.5"
                onClick={() => {
                  toast.info(`${platform.name} can be connected after onboarding in the Integrations page.`);
                }}
              >
                <span>{platform.emoji}</span>
                {platform.name}
                <Badge variant="outline" className="text-[9px] ml-auto">After Setup</Badge>
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
  const { data: socialAccounts, refetch: refetchSocial } = trpc.connectors.listSocialAccounts.useQuery();
  const connectedPlatforms = new Set(
    (socialAccounts ?? []).filter((a: any) => a.status === "active").map((a: any) => a.platform)
  );
  const connectedCount = connectedPlatforms.size;

  const platforms = [
    { name: "Meta (Facebook + Instagram)", key: "meta", color: "text-blue-400", emoji: "📘" },
    { name: "TikTok", key: "tiktok", color: "text-pink-400", emoji: "🎵" },
    { name: "Twitter / X", key: "twitter", color: "text-sky-400", emoji: "𝕏" },
    { name: "Pinterest", key: "pinterest", color: "text-red-400", emoji: "📌" },
  ];

  const generateOAuthUrl = trpc.connectors.generateSocialOAuthUrl.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else if ((data as any).message) {
        toast.info((data as any).message);
      }
    },
    onError: (err) => {
      toast.error(`Connection failed: ${err.message}`);
    },
  });

  // Check if we just returned from a successful social OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("social_connected")) {
      toast.success(`${params.get("social_connected")} connected successfully!`);
      refetchSocial();
      window.history.replaceState({}, "", "/onboarding");
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 mb-2">
          <Share2 className="h-7 w-7 text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Connect Social Platforms</h2>
        <p className="text-muted-foreground text-sm">
          Social Bot needs these to publish content and run ads automatically.
        </p>
      </div>

      {connectedCount > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <p className="text-sm text-foreground">{connectedCount} platform{connectedCount > 1 ? "s" : ""} connected</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2">
        {platforms.map(({ name, key, color, emoji }) => {
          const isConnected = connectedPlatforms.has(key);
          const isLoading = generateOAuthUrl.isPending && generateOAuthUrl.variables?.platform === key;
          return (
            <button
              key={key}
              onClick={() => {
                if (!isConnected && !isLoading) {
                  generateOAuthUrl.mutate({ platform: key as any, origin: window.location.origin, returnTo: "/onboarding" });
                }
              }}
              disabled={isLoading}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                isConnected
                  ? "bg-emerald-500/10 border-emerald-500/20 cursor-default"
                  : "bg-secondary/30 border-border/50 hover:border-primary/30 hover:bg-secondary/60 cursor-pointer"
              }`}
            >
              <span className="text-xl">{emoji}</span>
              <span className={`text-sm font-medium flex-1 text-left ${color}`}>{name}</span>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
              ) : isConnected ? (
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
    onError: (err) => {
      setIsLaunching(false);
      toast.error(`Launch failed: ${err.message}`);
    },
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
            Builder Bot is researching <span className="text-primary font-medium">"{niche}"</span> right now.
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
          Give the Builder Bot a niche and it will research, source products, and build your store.
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
          <Bot className="h-4 w-4 text-sky-400" /> What the Builder Bot will do:
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

/** Skeleton shown for 350ms during step transitions to prevent layout flash */
function StepSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Icon + heading */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <Skeleton className="h-16 w-16 rounded-2xl bg-white/[0.06]" />
        <Skeleton className="h-7 w-56 rounded-lg bg-white/[0.06]" />
        <Skeleton className="h-4 w-80 rounded bg-white/[0.04]" />
      </div>
      {/* Content rows */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-28 rounded-xl bg-white/[0.04]" />
        ))}
      </div>
      {/* CTA */}
      <Skeleton className="h-11 w-full rounded-lg bg-white/[0.06]" />
    </div>
  );
}

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [displayStep, setDisplayStep] = useState(1);
  const [, setLocation] = useLocation();
  const transitionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If returning from OAuth, jump to the right step
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "true" || params.get("error")) {
      setCurrentStep(2);
      setDisplayStep(2);
    }
    if (params.get("social_connected")) {
      setCurrentStep(3);
      setDisplayStep(3);
    }
  }, []);

  const goToStep = (step: number) => {
    if (transitionTimeout.current) clearTimeout(transitionTimeout.current);
    setIsTransitioning(true);
    setCurrentStep(step);
    // Show skeleton for 350ms, then reveal the new step
    transitionTimeout.current = setTimeout(() => {
      setDisplayStep(step);
      setIsTransitioning(false);
    }, 350);
  };

  const handleComplete = () => {
    localStorage.setItem("shopabots_onboarded", "true");
    setLocation("/");
  };

  return (
    <div className="relative overflow-hidden min-h-screen bg-background flex items-center justify-center p-4">
      <div className="ghost-watermark" aria-hidden="true">ONBOARDING</div>
      <div className="light-leak-blue" style={{ top: '5%', left: '10%' }} aria-hidden="true" />
      <div className="light-leak-purple" style={{ top: '60%', right: '5%' }} aria-hidden="true" />
      <div className="w-full max-w-2xl relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2">
            <BrandName size="xl" />
          </div>
        </div>

        <StepIndicator currentStep={currentStep} />

        <Card className="bg-card border-border/50 shadow-xl">
          <CardContent className="p-8">
            {isTransitioning ? (
              <StepSkeleton />
            ) : (
              <div
                key={displayStep}
                className="animate-in fade-in slide-in-from-bottom-2 duration-300"
              >
                {displayStep === 1 && (
                  <WelcomeStep onNext={() => goToStep(2)} />
                )}
                {displayStep === 2 && (
                  <ConnectStoreStep
                    onNext={() => goToStep(3)}
                    onSkip={() => goToStep(3)}
                  />
                )}
                {displayStep === 3 && (
                  <ConnectSocialsStep
                    onNext={() => goToStep(4)}
                    onSkip={() => goToStep(4)}
                  />
                )}
                {displayStep === 4 && (
                  <LaunchStep onComplete={handleComplete} />
                )}
              </div>
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
