/**
 * onboardingTelemetry.ts — Lightweight client-side analytics stub.
 *
 * Item 18 of the onboarding polish proposal. We don't have a fully wired
 * analytics path yet, but emitting these named events from the right
 * places means the day a real provider lands (Segment, PostHog, etc.) we
 * only need to swap out the transport — call sites stay untouched.
 *
 * The stub:
 *   • logs to `console.debug` in development so engineers can verify
 *     events fire from the right place;
 *   • forwards to `window.dispatchEvent` so external scripts (e.g. a
 *     marketing-site bridge) can subscribe today without us shipping a
 *     vendor SDK;
 *   • is a no-op in SSR / non-browser contexts.
 *
 * Adding a real provider later is a one-file change here.
 */
export type OnboardingEventName =
  | "onboarding_step_viewed"
  | "onboarding_step_completed"
  | "onboarding_step_back"
  | "onboarding_skipped"
  | "onboarding_abandoned"
  | "onboarding_persona_selected"
  | "onboarding_celebration_shown";

export interface OnboardingEventPayload {
  step?: number;
  stepName?: string;
  persona?: string;
  reason?: string;
  [key: string]: unknown;
}

const isBrowser = (): boolean =>
  typeof window !== "undefined" && typeof document !== "undefined";

/**
 * Emit an onboarding telemetry event. Safe to call from any context;
 * silently no-ops on the server and never throws.
 */
export function trackOnboardingEvent(
  name: OnboardingEventName,
  payload: OnboardingEventPayload = {}
): void {
  if (!isBrowser()) return;
  try {
    if (
      typeof import.meta !== "undefined" &&
      (import.meta as { env?: { DEV?: boolean } }).env?.DEV
    ) {
      // eslint-disable-next-line no-console
      console.debug("[onboarding]", name, payload);
    }
    // Custom-event bridge — anyone can `addEventListener("onboarding")`
    // without us pulling in a vendor SDK.
    window.dispatchEvent(
      new CustomEvent("onboarding", { detail: { name, ...payload } })
    );
  } catch {
    /* telemetry is best-effort — never block the user flow */
  }
}
