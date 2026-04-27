/**
 * Onboarding Wizard
 * Guides new users through the 4 steps to get their first bot running:
 * 1. Welcome — understand what Shop_a_Bot does
 * 2. Connect Store — link a Shopify/WooCommerce store
 * 3. Connect Socials — link Meta/TikTok/Twitter for the Social Bot
 * 4. Launch — pick a niche and fire the Builder Bot
 */

import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Bot,
  Package,
  Megaphone,
  Store,
  Share2,
  Zap,
  Clock,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Sparkles,
  ShoppingBag,
  AlertCircle,
  PauseCircle,
} from "lucide-react";
import { BrandName, BRAND_NAME } from "@/components/BrandName";

/**
 * Persisted onboarding state — keyed per user so multi-account environments
 * don't collide. Survives refresh, OAuth bounces, and accidental tab close
 * (item 2 in the onboarding-polish proposal).
 */
const ONBOARDING_STORAGE_PREFIX = "shop_a_bot_onboarding_state:";
const ONBOARDING_STORAGE_VERSION = 1;

interface PersistedOnboardingState {
  v: number;
  currentStep: number;
  shopDomain?: string;
  storeName?: string;
  niche?: string;
}

function loadPersistedOnboarding(
  userKey: string | null
): PersistedOnboardingState | null {
  if (!userKey || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(
      ONBOARDING_STORAGE_PREFIX + userKey
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedOnboardingState;
    if (parsed?.v !== ONBOARDING_STORAGE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersistedOnboarding(
  userKey: string | null,
  patch: Partial<PersistedOnboardingState>
) {
  if (!userKey || typeof window === "undefined") return;
  try {
    const prev = loadPersistedOnboarding(userKey) ?? {
      v: ONBOARDING_STORAGE_VERSION,
      currentStep: 1,
    };
    const next: PersistedOnboardingState = {
      ...prev,
      ...patch,
      v: ONBOARDING_STORAGE_VERSION,
    };
    window.localStorage.setItem(
      ONBOARDING_STORAGE_PREFIX + userKey,
      JSON.stringify(next)
    );
  } catch {
    // Storage may be unavailable (private mode, quota); persistence is best-effort.
  }
}

function clearPersistedOnboarding(userKey: string | null) {
  if (!userKey || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ONBOARDING_STORAGE_PREFIX + userKey);
  } catch {
    /* noop */
  }
}

/**
 * Validate a Shopify domain client-side. Mirrors the server-side check so the
 * green tick (item 4) only fires when the value would actually be accepted by
 * the OAuth handshake.
 */
const SHOPIFY_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

function normalizeShopDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

function evaluateShopDomain(input: string): {
  status: "empty" | "valid" | "invalid";
  normalized: string;
  reason?: string;
} {
  const trimmed = input.trim();
  if (!trimmed) return { status: "empty", normalized: "" };
  let domain = normalizeShopDomain(trimmed);
  if (!domain.includes(".")) domain = `${domain}.myshopify.com`;
  if (!SHOPIFY_DOMAIN_RE.test(domain)) {
    return {
      status: "invalid",
      normalized: domain,
      reason: "Use the format your-store or your-store.myshopify.com",
    };
  }
  return { status: "valid", normalized: domain };
}

const STEPS = [
  { id: 1, title: `Welcome to ${BRAND_NAME}`, icon: Sparkles },
  { id: 2, title: "Connect Your Store", icon: Store },
  { id: 3, title: "Connect Socials", icon: Share2 },
  { id: 4, title: "Launch Your First Bot", icon: Zap },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <ol
      className="flex items-center justify-center gap-1 mb-8"
      aria-label="Onboarding progress"
    >
      {STEPS.map((step, i) => {
        const isComplete = step.id < currentStep;
        const isActive = step.id === currentStep;
        return (
          <li key={step.id} className="flex items-center gap-1">
            <div
              className="flex flex-col items-center gap-1.5"
              aria-current={isActive ? "step" : undefined}
            >
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 motion-reduce:transition-none ${
                  isComplete
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                    : isActive
                      ? "bg-sky-500 text-white ring-4 ring-sky-500/20 shadow-lg shadow-sky-500/30"
                      : "bg-white/[0.05] text-muted-foreground border border-white/[0.08]"
                }`}
                aria-label={`Step ${step.id}: ${step.title}${isComplete ? " (complete)" : isActive ? " (current)" : ""}`}
              >
                {isComplete ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : step.id}
              </div>
              <span
                className={`text-[10px] font-medium hidden sm:block transition-colors ${
                  isActive
                    ? "text-sky-300"
                    : isComplete
                      ? "text-emerald-300"
                      : "text-muted-foreground"
                }`}
              >
                {step.title.split(" ").slice(0, 2).join(" ")}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                aria-hidden="true"
                className={`h-0.5 w-10 mb-5 transition-all duration-500 motion-reduce:transition-none ${
                  isComplete ? "bg-gradient-to-r from-emerald-500 to-sky-500" : "bg-white/[0.06]"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
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

function ConnectStoreStep({
  onNext,
  onSkip,
  initialShopDomain,
  initialStoreName,
  onPersistDraft,
}: {
  onNext: () => void;
  onSkip: () => void;
  initialShopDomain: string;
  initialStoreName: string;
  onPersistDraft: (patch: { shopDomain?: string; storeName?: string }) => void;
}) {
  const [shopDomain, setShopDomain] = useState(initialShopDomain);
  const [storeName, setStoreName] = useState(initialStoreName);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");
  // Debounced live validation — green tick / inline error fires while typing
  // instead of only on submit (proposal item 4).
  const [validation, setValidation] = useState<{
    status: "empty" | "valid" | "invalid";
    normalized: string;
    reason?: string;
  }>(() => evaluateShopDomain(initialShopDomain));
  const [hasInteracted, setHasInteracted] = useState(false);
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

  // Re-evaluate the domain on a debounce so the green tick / inline error
  // settles ~300ms after the user stops typing.
  useEffect(() => {
    if (!hasInteracted) return;
    const t = setTimeout(() => {
      setValidation(evaluateShopDomain(shopDomain));
    }, 300);
    return () => clearTimeout(t);
  }, [shopDomain, hasInteracted]);

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

    const result = evaluateShopDomain(shopDomain);
    if (result.status !== "valid") {
      setError(
        result.reason ??
          "Invalid domain format. Use: your-store or your-store.myshopify.com"
      );
      return;
    }

    setIsConnecting(true);

    // Derive store name from domain if not provided
    const name = storeName.trim() || result.normalized.replace(".myshopify.com", "");

    // Create store record first, then OAuth URL is generated in onSuccess
    createStoreForOAuth.mutate({
      name,
      platform: "shopify",
      platformDomain: result.normalized,
    });
  };

  const showValid = hasInteracted && validation.status === "valid";
  const showInvalid =
    hasInteracted && validation.status === "invalid" && !!shopDomain.trim();

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10 mb-2">
          <Store className="h-7 w-7 text-green-300" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Connect Your Store</h2>
        <p className="text-muted-foreground text-sm">
          Builder Bot needs access to your store to build and manage it.
        </p>
      </div>

      {hasActiveStore ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="h-5 w-5 text-emerald-300 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {activeStores.length} store{activeStores.length > 1 ? "s" : ""} connected
              </p>
              <p className="text-xs text-muted-foreground">{activeStores.map((s: any) => s.name).join(", ")}</p>
            </div>
          </div>
          <Button onClick={onNext} className="w-full gap-2">
            Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <Label htmlFor="storeName" className="text-sm text-foreground">
                Store Name <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="storeName"
                placeholder="My Awesome Store"
                value={storeName}
                onChange={(e) => {
                  const v = e.target.value;
                  setStoreName(v);
                  setError("");
                  onPersistDraft({ storeName: v });
                }}
                className="mt-1.5"
                autoComplete="organization"
              />
            </div>
            <div>
              <Label htmlFor="shopDomain" className="text-sm text-foreground">
                Shopify Store Domain
              </Label>
              <div className="relative mt-1.5">
                <Input
                  id="shopDomain"
                  placeholder="your-store.myshopify.com"
                  value={shopDomain}
                  onChange={(e) => {
                    const v = e.target.value;
                    setShopDomain(v);
                    setHasInteracted(true);
                    setError("");
                    onPersistDraft({ shopDomain: v });
                  }}
                  onBlur={() => setHasInteracted(true)}
                  className={`pr-9 ${
                    showValid
                      ? "border-emerald-500/50 focus-visible:ring-emerald-500/30"
                      : showInvalid
                        ? "border-red-500/50 focus-visible:ring-red-500/30"
                        : ""
                  }`}
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                  aria-invalid={showInvalid || undefined}
                  aria-describedby="shopDomain-hint shopDomain-status"
                  autoComplete="url"
                  inputMode="url"
                  spellCheck={false}
                />
                <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                  {showValid && (
                    <CheckCircle2
                      className="h-4 w-4 text-emerald-400 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-75"
                      aria-hidden="true"
                    />
                  )}
                  {showInvalid && (
                    <AlertCircle
                      className="h-4 w-4 text-red-400"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </div>
              <p
                id="shopDomain-status"
                className="text-xs mt-1.5 min-h-[1rem]"
                aria-live="polite"
              >
                {showValid && (
                  <span className="text-emerald-300">
                    Looks good — we&apos;ll connect <span className="font-mono">{validation.normalized}</span>
                  </span>
                )}
                {showInvalid && (
                  <span className="text-red-300">{validation.reason}</span>
                )}
              </p>
              <p
                id="shopDomain-hint"
                className="text-xs text-muted-foreground/90 mt-1"
              >
                Enter your store name (e.g.,{" "}
                <span className="font-mono text-foreground/70">my-store</span>) or full domain (
                <span className="font-mono text-foreground/70">my-store.myshopify.com</span>)
              </p>
              <details className="mt-2 text-xs text-muted-foreground/90 group">
                <summary className="cursor-pointer hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 rounded">
                  What we&apos;ll access — and what we won&apos;t
                </summary>
                <div className="mt-2 space-y-1 pl-3 border-l border-border/50">
                  <p>
                    <span className="text-emerald-300">✓</span> Read products, orders, and inventory so the bots can run your store.
                  </p>
                  <p>
                    <span className="text-emerald-300">✓</span> Write product listings, prices, and themes you approve.
                  </p>
                  <p>
                    <span className="text-muted-foreground">✗</span> No access to customer payment details or your Shopify password.
                  </p>
                </div>
              </details>
            </div>
          </div>

          <Button
            onClick={handleConnect}
            disabled={isConnecting || !shopDomain.trim() || (hasInteracted && validation.status === "invalid")}
            className="w-full gap-2"
            size="lg"
          >
            {isConnecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:hidden" aria-hidden="true" /> Connecting to Shopify...
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Connect Shopify Store
              </>
            )}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
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
            ].map((platform) => (
              <Button
                key={platform.name}
                variant="outline"
                className="text-xs h-9 gap-1.5"
                onClick={() => {
                  toast.info(`${platform.name} can be connected after onboarding in the Integrations page.`);
                }}
              >
                <span aria-hidden="true">{platform.emoji}</span>
                {platform.name}
                <Badge variant="outline" className="text-[9px] ml-auto">
                  After Setup
                </Badge>
              </Button>
            ))}
          </div>

          <Button variant="ghost" onClick={onSkip} className="w-full text-muted-foreground text-sm">
            Skip for now — I&apos;ll connect later
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
    { name: "Meta (Facebook + Instagram)", key: "meta", color: "text-blue-300", emoji: "📘" },
    { name: "TikTok", key: "tiktok", color: "text-pink-300", emoji: "🎵" },
    { name: "Twitter / X", key: "twitter", color: "text-sky-300", emoji: "𝕏" },
    { name: "Pinterest", key: "pinterest", color: "text-red-300", emoji: "📌" },
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
          <Share2 className="h-7 w-7 text-amber-300" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Connect Social Platforms</h2>
        <p className="text-muted-foreground text-sm">
          Social Bot needs these to publish content and run ads automatically.
        </p>
      </div>

      {connectedCount > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <CheckCircle2 className="h-5 w-5 text-emerald-300 shrink-0" aria-hidden="true" />
          <p className="text-sm text-foreground">{connectedCount} platform{connectedCount > 1 ? "s" : ""} connected</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2" role="list">
        {platforms.map(({ name, key, color, emoji }) => {
          const isConnected = connectedPlatforms.has(key);
          const isLoading = generateOAuthUrl.isPending && generateOAuthUrl.variables?.platform === key;
          return (
            <button
              key={key}
              role="listitem"
              type="button"
              onClick={() => {
                if (!isConnected && !isLoading) {
                  generateOAuthUrl.mutate({ platform: key as any, origin: window.location.origin, returnTo: "/onboarding" });
                }
              }}
              disabled={isLoading}
              aria-label={isConnected ? `${name} (connected)` : `Connect ${name}`}
              aria-busy={isLoading || undefined}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 ${
                isConnected
                  ? "bg-emerald-500/10 border-emerald-500/20 cursor-default"
                  : "bg-secondary/30 border-border/50 hover:border-primary/30 hover:bg-secondary/60 cursor-pointer"
              }`}
            >
              <span className="text-xl" aria-hidden="true">{emoji}</span>
              <span className={`text-sm font-medium flex-1 text-left ${color}`}>{name}</span>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none text-muted-foreground shrink-0" aria-hidden="true" />
              ) : isConnected ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-300 shrink-0" aria-hidden="true" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      {connectedCount === 0 && (
        // Skip-cost transparency (item 6) — make the trade-off explicit so
        // skipping feels informed rather than lossy.
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/20 text-xs text-amber-100/90">
          <PauseCircle className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            <span className="font-medium text-amber-200">Social Bot will stay paused</span> until
            you connect at least one platform. You can do this in 30 seconds later from{" "}
            <span className="font-medium">Settings → Integrations</span>.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onSkip} className="flex-1 text-muted-foreground">
          Skip for now
        </Button>
        <Button onClick={onNext} className="flex-1 gap-2">
          Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function LaunchStep({
  onComplete,
  initialNiche,
  onPersistDraft,
}: {
  onComplete: () => void;
  initialNiche: string;
  onPersistDraft: (patch: { niche?: string }) => void;
}) {
  const [niche, setNiche] = useState(initialNiche);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);

  // Surface store-connection status so the post-launch promise ("store
  // ready in ~28 min") is only shown when a store actually exists.
  const { data: stores } = trpc.stores.list.useQuery();
  const hasStore = (stores?.length ?? 0) > 0;

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
      <div
        className="text-center space-y-6 py-4 relative"
        role="status"
        aria-live="polite"
      >
        {/* Background glow — animation suppressed for reduced-motion users (item 11) */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-sky-500/10 blur-3xl pointer-events-none motion-safe:animate-pulse motion-reduce:opacity-60" />

        <div className="relative">
          {/* Pulsing bot avatar */}
          <div className="inline-flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/20 to-cyan-500/10 border border-sky-500/30 mx-auto shadow-[0_0_30px_rgba(14,165,233,0.25)] motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-500">
            <Bot className="h-12 w-12 text-sky-300" aria-hidden="true" />
          </div>
          {/* Online badge */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 backdrop-blur-sm">
            <span
              aria-hidden="true"
              className="w-1.5 h-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.6)]"
            />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Online</span>
          </div>
        </div>

        <div className="space-y-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-700">
          <h2 className="text-2xl font-bold text-foreground">
            {hasStore ? "Your Bot is Awake" : "Builder is researching"}
          </h2>
          <p className="text-muted-foreground max-w-sm mx-auto">
            {hasStore ? (
              <>
                Builder Bot is researching <span className="text-sky-300 font-medium">&ldquo;{niche}&rdquo;</span> right now.
                Products are being sourced. Copy is being written. Your store is coming alive.
              </>
            ) : (
              <>
                Builder Bot is researching <span className="text-sky-300 font-medium">&ldquo;{niche}&rdquo;</span> —
                niche analysis, competitor scan, and product picks. Connect a store next so the
                Builder can import the products it recommends.
              </>
            )}
          </p>
          <div className="mt-4 max-w-sm mx-auto rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] px-4 py-3 text-left">
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-200 mb-1">What happens next</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {hasStore ? (
                <>
                  When Builder finishes, you&apos;ll see a handoff moment on your dashboard.
                  The <span className="text-cyan-200 font-medium">Merchant Bot</span> takes the keys and runs your store from there.
                </>
              ) : (
                <>
                  Research will land in your Command Center as a niche report.
                  Connect a Shopify store to turn the recommendations into a real, fulfilled storefront.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Live activity preview */}
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-1000">
          <div className="flex flex-col gap-2 max-w-xs mx-auto">
            <Button onClick={onComplete} size="lg" className="gap-2 btn-glow">
              Enter Command Center <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span>{hasStore ? "Store ready in ~28 minutes" : "Niche report ready in ~5 minutes"}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-2">
          <Zap className="h-7 w-7 text-primary" aria-hidden="true" />
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
          onChange={(e) => {
            const v = e.target.value;
            setNiche(v);
            onPersistDraft({ niche: v });
          }}
          onKeyDown={(e) => e.key === "Enter" && handleLaunch()}
          className="text-base"
          autoComplete="off"
        />
        <div className="flex flex-wrap gap-2" role="list" aria-label="Suggested niches">
          {nicheExamples.map((example) => (
            <button
              key={example}
              type="button"
              role="listitem"
              onClick={() => {
                setNiche(example);
                onPersistDraft({ niche: example });
              }}
              className="text-xs px-2.5 py-1 rounded-full bg-secondary/60 border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 space-y-2">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Bot className="h-4 w-4 text-sky-300" aria-hidden="true" /> What the Builder Bot will do:
        </h4>
        <ul className="space-y-1.5">
          {[
            "Research market demand, competition, and profit margins",
            "Source 10-20 winning products with supplier contacts",
            "Generate SEO-optimized product listings",
            "Configure your store theme, pages, and navigation",
            "Set up pricing strategy and profit targets",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300 shrink-0 mt-0.5" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onComplete} className="flex-1 text-muted-foreground">
          Skip — I&apos;ll do this later
        </Button>
        <Button
          onClick={handleLaunch}
          disabled={isLaunching || !niche.trim()}
          className="flex-1 gap-2"
          size="lg"
          aria-busy={isLaunching || undefined}
        >
          {isLaunching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Launching...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" aria-hidden="true" /> Launch Bot
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * OnboardingPage — orchestrator for the 4-step flow.
 *
 * Polish notes (proposal PR1):
 *   • Per-user `localStorage` persistence so currentStep + niche + storeName +
 *     shopDomain survive refresh, OAuth bounce, and accidental tab close
 *     (item 2).
 *   • Step transitions use an optimistic crossfade instead of a 350ms blanket
 *     skeleton so navigation feels instant rather than artificially delayed
 *     (item 17).
 *   • `Esc` opens a "Save & exit" confirmation; progress is saved when the
 *     user leaves so they resume in place next time (item 10).
 *   • A single polite live region announces step changes for screen-reader
 *     users (item 16).
 */
export default function OnboardingPage() {
  const { user } = useAuth();
  const userKey = (user as { id?: string | number; email?: string } | null)
    ? String(
        (user as { id?: string | number }).id ??
          (user as { email?: string }).email ??
          ""
      ) || null
    : null;

  // Initialize from persisted state (if any) so a refresh / OAuth bounce /
  // accidental close lands the user back on the step they were on.
  const initial = useMemo(
    () => loadPersistedOnboarding(userKey),
    [userKey]
  );

  const [currentStep, setCurrentStep] = useState<number>(initial?.currentStep ?? 1);
  const [shopDomainDraft, setShopDomainDraft] = useState<string>(initial?.shopDomain ?? "");
  const [storeNameDraft, setStoreNameDraft] = useState<string>(initial?.storeName ?? "");
  const [nicheDraft, setNicheDraft] = useState<string>(initial?.niche ?? "");
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [, setLocation] = useLocation();

  // Re-hydrate from storage once the user becomes available (auth resolves
  // asynchronously, so the very first render may have userKey = null).
  useEffect(() => {
    if (!userKey) return;
    const hydrated = loadPersistedOnboarding(userKey);
    if (!hydrated) return;
    setCurrentStep((prev) => (prev === 1 ? hydrated.currentStep : prev));
    setShopDomainDraft((prev) => prev || hydrated.shopDomain || "");
    setStoreNameDraft((prev) => prev || hydrated.storeName || "");
    setNicheDraft((prev) => prev || hydrated.niche || "");
  }, [userKey]);

  // If returning from OAuth, jump to the right step (overrides persistence).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "true" || params.get("error")) {
      setCurrentStep(2);
      savePersistedOnboarding(userKey, { currentStep: 2 });
    }
    if (params.get("social_connected")) {
      setCurrentStep(3);
      savePersistedOnboarding(userKey, { currentStep: 3 });
    }
  }, [userKey]);

  const goToStep = (step: number) => {
    setCurrentStep(step);
    savePersistedOnboarding(userKey, { currentStep: step });
  };

  const persistDraft = (patch: {
    shopDomain?: string;
    storeName?: string;
    niche?: string;
  }) => {
    if (patch.shopDomain !== undefined) setShopDomainDraft(patch.shopDomain);
    if (patch.storeName !== undefined) setStoreNameDraft(patch.storeName);
    if (patch.niche !== undefined) setNicheDraft(patch.niche);
    savePersistedOnboarding(userKey, patch);
  };

  // Esc opens "save & exit" — keyboard-first parity with Enter advancing
  // each step (item 10). Ignore when an interactive overlay (e.g. the
  // confirm dialog itself) is already open so Radix can handle close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showExitDialog) return;
      // Don't hijack Esc when a Radix overlay (dialog/popover) is open.
      if (document.querySelector("[data-state='open'][role='dialog']")) return;
      e.preventDefault();
      setShowExitDialog(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showExitDialog]);

  const completeOnboarding = trpc.auth.completeOnboarding.useMutation();
  const utils = trpc.useUtils();

  const handleComplete = async () => {
    // Server-truth — survives device switches and storage clears.
    try {
      await completeOnboarding.mutateAsync();
      // Refresh `auth.me` so the OnboardingGuard sees the new
      // `onboardedAt` immediately and doesn't bounce the user back here.
      await utils.auth.me.invalidate();
    } catch {
      // Non-fatal: localStorage fallback below still lets the user
      // through; they'll be re-flagged on their next sign-in once the
      // mutation succeeds.
    }
    localStorage.setItem("shop_a_bot_onboarded", "true");
    clearPersistedOnboarding(userKey);
    setLocation("/");
  };

  // "Save & exit" — keep the persisted draft so they resume here next time,
  // but don't mark onboarded. The OnboardingGuard will route them straight
  // back to /onboarding on their next visit.
  const handleSaveAndExit = () => {
    savePersistedOnboarding(userKey, { currentStep });
    setShowExitDialog(false);
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2">
            <BrandName size="xl" />
          </div>
        </div>

        <StepIndicator currentStep={currentStep} />

        {/* Polite SR announcement of step changes (item 16). */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          Step {currentStep} of {STEPS.length}: {STEPS[currentStep - 1].title}
        </div>

        <Card className="bg-card border-border/50 shadow-xl">
          <CardContent className="p-8">
            {/*
              Optimistic crossfade between steps (item 17). Replaces the
              350ms blanket skeleton — content is rendered immediately and
              animates in, which feels faster and avoids a flash of empty
              chrome. `motion-reduce` users get the new step instantly.
            */}
            <div
              key={currentStep}
              className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
            >
              {currentStep === 1 && (
                <WelcomeStep onNext={() => goToStep(2)} />
              )}
              {currentStep === 2 && (
                <ConnectStoreStep
                  onNext={() => goToStep(3)}
                  onSkip={() => goToStep(3)}
                  initialShopDomain={shopDomainDraft}
                  initialStoreName={storeNameDraft}
                  onPersistDraft={persistDraft}
                />
              )}
              {currentStep === 3 && (
                <ConnectSocialsStep
                  onNext={() => goToStep(4)}
                  onSkip={() => goToStep(4)}
                />
              )}
              {currentStep === 4 && (
                <LaunchStep
                  onComplete={handleComplete}
                  initialNiche={nicheDraft}
                  onPersistDraft={persistDraft}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground/90 mt-4">
          Step {currentStep} of {STEPS.length} — {STEPS[currentStep - 1].title}
          <span className="hidden sm:inline">
            {" "}
            · Press <kbd className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[10px] font-mono text-foreground/80">Esc</kbd> to save &amp; exit
          </span>
        </p>
      </div>

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save your progress and exit?</AlertDialogTitle>
            <AlertDialogDescription>
              We&apos;ll keep your spot at step {currentStep} of {STEPS.length} and any details you&apos;ve entered so far. You can pick up where you left off next time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveAndExit}>
              Save &amp; exit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
