/**
 * Shop_a_Bot — Canonical Bot Taxonomy
 *
 * One autonomous Store Bot with three operating modes. The internal enum
 * (`agentType`) uses `architect | merchant | social` for historical
 * DB compatibility; user-facing copy uses "Launch mode", "Operator mode",
 * and "Growth mode". Map between the two ONLY through this module.
 *
 * Imported by both client and server, so keep it dependency-free.
 */

export type BotId = "architect" | "merchant" | "social";

export interface BotProfile {
  /** Internal id used by `agentType`, signal registry, telemetry. */
  id: BotId;
  /** Short user-facing name. */
  name: string;
  /** Marketing-quality one-liner. */
  tagline: string;
  /** What the bot does, in plain language, for the Tools / Bots views. */
  description: string;
  /** Brand color (hex) used for accents on cards/badges. */
  color: string;
  /** Lucide icon name (string so this stays JSX-free). */
  iconName: "Bot" | "Package" | "Megaphone";
}

export const BOTS: ReadonlyArray<BotProfile> = [
  {
    id: "architect",
    name: "Launch mode",
    tagline: "Store live in 30 minutes",
    description:
      "Researches winning niches, sources products, configures your storefront, and writes all product copy — fully automated.",
    color: "#38bdf8",
    iconName: "Bot",
  },
  {
    id: "merchant",
    name: "Operator mode",
    tagline: "Zero-touch fulfillment",
    description:
      "Processes every order, optimizes pricing, syncs inventory, and triages support tickets so you never touch the warehouse.",
    color: "#22d3ee",
    iconName: "Package",
  },
  {
    id: "social",
    name: "Growth mode",
    tagline: "Marketing on autopilot",
    description:
      "Generates ads, schedules posts, runs email/SMS flows, and optimizes SEO — turns customer signals into demand.",
    color: "#fb923c",
    iconName: "Megaphone",
  },
] as const;

export const BOT_BY_ID: Record<BotId, BotProfile> = Object.fromEntries(
  BOTS.map((b) => [b.id, b]),
) as Record<BotId, BotProfile>;

/** Display name for a bot id (returns the id itself if unknown — never throws). */
export function botName(id: string): string {
  return (BOT_BY_ID as Record<string, BotProfile | undefined>)[id]?.name ?? id;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Store Lifecycle — the Launch → Operator mode handoff                        */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Every store moves through three phases. Launch mode leads the first;
 * Operator mode leads the third; the second is the celebration in between.
 *
 * - `building`     Launch mode is in the cockpit. Operator mode is on the bench.
 * - `transitioning` Setup is done. The user has not yet acknowledged the
 *                  handoff — we want a celebration moment, not a silent
 *                  hand-off, because this is the most emotional milestone
 *                  in the customer journey.
 * - `operating`    Operator mode is in the cockpit. Launch mode is on call for
 *                  redesigns. Growth mode is fully unblocked.
 */
export type LifecycleStage = "building" | "transitioning" | "operating";

export interface LifecycleStageProfile {
  id: LifecycleStage;
  /** What we tell the user this phase is. */
  label: string;
  /** Which bot is the lead. */
  leadBotId: BotId;
  /** Which bots are visible/active in this phase. */
  visibleBotIds: ReadonlyArray<BotId>;
  /** One-line copy used in headers, badges, dashboard chips. */
  headline: string;
  /** Two-line copy used in onboarding, empty states. */
  subhead: string;
  /** Hex accent color for chrome. */
  color: string;
}

export const LIFECYCLE_STAGES: ReadonlyArray<LifecycleStageProfile> = [
  {
    id: "building",
    label: "Building",
    leadBotId: "architect",
    visibleBotIds: ["architect"],
    headline: "Store Bot is in launch mode, bringing your store to life.",
    subhead:
      "Niche research, product sourcing, copy, theme — all hands on deck. Operator mode is on standby until launch day.",
    color: "#38bdf8",
  },
  {
    id: "transitioning",
    label: "Launch Day",
    leadBotId: "merchant",
    visibleBotIds: ["architect", "merchant", "social"],
    headline: "Your store is live. Time to hand the keys to operator mode.",
    subhead:
      "Launch mode did its job. From here, operator mode runs your daily operation — orders, pricing, inventory, support — and growth mode starts pulling demand.",
    color: "#22d3ee",
  },
  {
    id: "operating",
    label: "Operating",
    leadBotId: "merchant",
    visibleBotIds: ["merchant", "social", "architect"],
    headline: "Your store runs itself.",
    subhead:
      "Operator mode fulfills, growth mode scales, and launch mode is one click away whenever you want to redesign or expand.",
    color: "#22d3ee",
  },
] as const;

export const LIFECYCLE_BY_ID: Record<LifecycleStage, LifecycleStageProfile> = Object.fromEntries(
  LIFECYCLE_STAGES.map((s) => [s.id, s]),
) as Record<LifecycleStage, LifecycleStageProfile>;

/**
 * The narrative shown in the Handoff Moment modal. This is the single most
 * emotional UI surface in the product — keep it short, warm, declarative.
 */
export const HANDOFF_NARRATIVE = {
  eyebrow: "Launch Day",
  title: "Store Bot has built your store.",
  subtitle: "Time to switch to operator mode.",
  body:
    "Your store is live. From here, Store Bot shifts into operator mode for the daily operation — orders, inventory, pricing, support — while growth mode manufactures demand. Launch mode stays on call for whenever you want to redesign or expand.",
  /** What operator mode takes over, by name. Order matters — reads like a list. */
  merchantTakesOver: [
    "Order processing",
    "Inventory & restocks",
    "Dynamic pricing",
    "Support triage",
  ],
  /** What launch mode remains available for. */
  builderRemains: [
    "Redesigns & rebrands",
    "New collections",
    "Theme overhauls",
    "Niche pivots",
  ],
  primaryCta: "Switch to operator mode",
  secondaryCta: "Stay in launch mode for now",
} as const;

/**
 * Heuristic: when is a store ready to graduate from `building` to
 * `transitioning`? Both client and server use this so the surface and the
 * truth never disagree.
 */
export interface ReadinessSignals {
  /** Store has at least one connected platform credential / OAuth token. */
  storeConnected: boolean;
  /** At least one product has been imported. */
  productCount: number;
  /** At least one paid order has been received. */
  hasFirstOrder: boolean;
  /** Builder marked setup complete explicitly. */
  setupMarkedComplete: boolean;
}

/**
 * Returns true when the store has crossed the bar to be offered the
 * Builder→Merchant handoff. Conservative on purpose — we'd rather suggest
 * the handoff late than steal the moment when the store isn't actually ready.
 */
export function isHandoffReady(s: ReadinessSignals): boolean {
  if (s.setupMarkedComplete) return true;
  if (s.hasFirstOrder) return true;
  return s.storeConnected && s.productCount >= 5;
}

