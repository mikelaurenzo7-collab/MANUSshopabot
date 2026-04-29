/**
 * FirstRunTour.tsx — 3-stop coach-mark tour shown on the user's first
 * Command Center visit after onboarding completes.
 *
 * Item 12 of the cross-app polish proposal.
 *
 * The tour is intentionally lightweight:
 *   • A fixed-position card walks the user through three concepts —
 *     Command Center, Bot status, Integrations — without trying to
 *     point at specific DOM elements (which break when layouts change).
 *   • Dismissible at any step. The "completed" flag is stored in
 *     localStorage so it never reappears for the same browser, and
 *     paired with the `users.onboardedAt` server flag (read via the
 *     auth user) so anonymous / signed-out users don't see it.
 *   • Honors `prefers-reduced-motion` for the slide-in transition.
 *   • No focus trap so it never blocks keyboard users from interacting
 *     with the page underneath.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  X,
  Compass,
  Bot,
  Plug,
} from "lucide-react";

const TOUR_DONE_KEY_PREFIX = "shop_a_bot_first_run_tour_done:";

const STOPS = [
  {
    id: 1,
    title: "This is your Command Center",
    description:
      "Your live operations hub. See revenue, active workflows, and bot health at a glance — everything you need to run your business right now.",
    Icon: Compass,
    accent: "text-sky-300",
    accentBg: "bg-sky-500/15 border-sky-500/30",
  },
  {
    id: 2,
    title: "Four bots, one mission",
    description:
      "Builder builds your store, Merchant runs it, Social grows it, Communicator handles email. Click any bot card to open its cockpit or start a task.",
    Icon: Bot,
    accent: "text-cyan-300",
    accentBg: "bg-cyan-500/15 border-cyan-500/30",
  },
  {
    id: 3,
    title: "Connect your channels",
    description:
      "Add Shopify, WooCommerce, TikTok, Gmail, and more from Integrations → Connect. Wire up any platform in 30 seconds.",
    Icon: Plug,
    accent: "text-amber-300",
    accentBg: "bg-amber-500/15 border-amber-500/30",
    cta: { label: "Open Integrations", href: "/storefronts" },
  },
] as const;

function readDone(userKey: string | null): boolean {
  if (!userKey || typeof window === "undefined") return true;
  try {
    return (
      window.localStorage.getItem(TOUR_DONE_KEY_PREFIX + userKey) === "true"
    );
  } catch {
    return true;
  }
}

function writeDone(userKey: string | null) {
  if (!userKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOUR_DONE_KEY_PREFIX + userKey, "true");
  } catch {
    /* best-effort */
  }
}

export function FirstRunTour() {
  const { user, loading } = useAuth();

  const userKey = useMemo<string | null>(() => {
    if (!user) return null;
    const u = user as { id?: string | number | null; email?: string | null };
    if (u.id !== undefined && u.id !== null && u.id !== "") return String(u.id);
    return u.email ?? null;
  }, [user]);

  // Only show after the user has actually completed onboarding — otherwise
  // they'd see the tour while still in /onboarding.
  const onboardedAt = (user as { onboardedAt?: string | Date | null } | null)
    ?.onboardedAt;
  const eligible = !loading && !!user && !!onboardedAt;

  const [done, setDone] = useState<boolean>(true);
  const [stopIdx, setStopIdx] = useState(0);

  // Re-evaluate the dismissed flag once auth resolves and we know the
  // user key. Defaulting to `true` means the tour stays hidden until we
  // affirmatively decide to show it.
  useEffect(() => {
    if (!eligible) return;
    setDone(readDone(userKey));
  }, [eligible, userKey]);

  if (!eligible || done) return null;

  const stop = STOPS[stopIdx];
  const isLast = stopIdx === STOPS.length - 1;

  const dismiss = () => {
    setDone(true);
    writeDone(userKey);
  };

  return (
    <div
      role="dialog"
      aria-label={`First-run tour, step ${stop.id} of ${STOPS.length}`}
      aria-modal="false"
      className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-300"
    >
      <div className="rounded-xl border border-white/[0.10] bg-[#0a0b0f]/95 backdrop-blur-md shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-0.5 bg-white/[0.05]">
          <div
            className="h-full bg-gradient-to-r from-sky-500 to-cyan-500 transition-all duration-300"
            style={{ width: `${((stopIdx + 1) / STOPS.length) * 100}%` }}
          />
        </div>
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-lg ${stop.accentBg} border flex items-center justify-center shrink-0`}
            >
              <stop.Icon className={`w-4 h-4 ${stop.accent}`} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">
                  Tour · {stopIdx + 1} / {STOPS.length}
                </span>
                <button
                  type="button"
                  onClick={dismiss}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
                  aria-label="Dismiss tour"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
              <h3 className="mt-1 text-sm font-semibold text-white">
                {stop.title}
              </h3>
              <p className="mt-1.5 text-xs text-white/65 leading-relaxed">
                {stop.description}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="text-xs text-white/45 hover:text-white/75 transition-colors focus-visible:outline-none focus-visible:underline"
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              {isLast && "cta" in stop && stop.cta && (
                <Link
                  href={stop.cta.href}
                  onClick={dismiss}
                  className="text-xs font-medium text-sky-200 hover:text-sky-100 transition-colors"
                >
                  {stop.cta.label}
                </Link>
              )}
              {isLast ? (
                <Button size="sm" onClick={dismiss} className="gap-1.5">
                  Got it
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setStopIdx((i) => i + 1)}
                  className="gap-1.5"
                >
                  Next <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
