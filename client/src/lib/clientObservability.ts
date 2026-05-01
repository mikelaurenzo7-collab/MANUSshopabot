/**
 * Client observability — minimal, self-hosted error + Core Web Vitals
 * reporter that POSTs to `/api/client-errors` and `/api/web-vitals`.
 *
 * Intentionally has no external dependency: this is a small wrapper
 * over `PerformanceObserver` + `navigator.sendBeacon`. We avoid pulling
 * in `web-vitals` or a Sentry SDK so the bundle stays light and Manus
 * syncs don't require pnpm-lock churn for an SDK update.
 *
 * Rules:
 *   - Never throw out of these helpers — observability must not crash
 *     the app it's observing.
 *   - Cap field lengths so a runaway error message can't fill the
 *     network or the server's log pipeline. The server applies its
 *     own caps as a defense in depth.
 *   - Prefer `navigator.sendBeacon` so reports survive `pagehide` /
 *     `visibilitychange:hidden` (mobile lock screens, tab switches).
 */

const ERROR_ENDPOINT = "/api/client-errors";
const VITALS_ENDPOINT = "/api/web-vitals";

const MAX_MESSAGE = 2_000;
const MAX_STACK = 8_000;
const MAX_COMPONENT_STACK = 4_000;
const MAX_URL = 2_000;
const MAX_USER_AGENT = 512;
const MAX_LABEL = 80;

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length === 0) return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

function safePost(url: string, payload: unknown): void {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const queued = navigator.sendBeacon(url, blob);
      if (queued) return;
    }
    if (typeof fetch === "function") {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        credentials: "include",
        keepalive: true,
      }).catch(() => {
        /* swallow — observability must never crash the app */
      });
    }
  } catch {
    /* swallow */
  }
}

// ── Error reporting ─────────────────────────────────────────────────────────

export interface ReportErrorInput {
  error: unknown;
  componentStack?: string;
  label?: string;
}

/** Best-effort report of a runtime error to the server. Never throws. */
export function reportError({ error, componentStack, label }: ReportErrorInput): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const payload = {
      message: clip(err.message, MAX_MESSAGE) ?? "Unknown error",
      stack: clip(err.stack, MAX_STACK),
      componentStack: clip(componentStack, MAX_COMPONENT_STACK),
      url: typeof location !== "undefined" ? clip(location.href, MAX_URL) : undefined,
      userAgent: typeof navigator !== "undefined" ? clip(navigator.userAgent, MAX_USER_AGENT) : undefined,
      label: clip(label, MAX_LABEL),
    };
    safePost(ERROR_ENDPOINT, payload);
  } catch {
    /* swallow */
  }
}

let globalHandlersInstalled = false;

/**
 * Install `window.onerror` + `window.onunhandledrejection` listeners so
 * uncaught errors (outside any React tree) still reach the server.
 * Safe to call multiple times — reinstalls are no-ops.
 */
export function installGlobalErrorHandlers(): void {
  if (globalHandlersInstalled) return;
  if (typeof window === "undefined") return;
  globalHandlersInstalled = true;

  window.addEventListener("error", (event) => {
    reportError({
      error: event.error ?? new Error(event.message || "window.onerror"),
      label: "window.onerror",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportError({
      error: event.reason ?? new Error("unhandledrejection"),
      label: "unhandledrejection",
    });
  });
}

// ── Core Web Vitals ─────────────────────────────────────────────────────────

interface VitalSample {
  name: string;
  value: number;
  delta?: number;
  rating?: "good" | "needs-improvement" | "poor";
  navigationType?: string;
}

function reportVital(sample: VitalSample): void {
  try {
    safePost(VITALS_ENDPOINT, {
      ...sample,
      url: typeof location !== "undefined" ? clip(location.href, MAX_URL) : undefined,
    });
  } catch {
    /* swallow */
  }
}

// Thresholds from web.dev — used to attach a coarse "rating" so the
// server log can be filtered without re-deriving the cutoff every time.
function rate(name: string, value: number): VitalSample["rating"] {
  if (name === "LCP") return value <= 2_500 ? "good" : value <= 4_000 ? "needs-improvement" : "poor";
  if (name === "CLS") return value <= 0.1 ? "good" : value <= 0.25 ? "needs-improvement" : "poor";
  if (name === "INP") return value <= 200 ? "good" : value <= 500 ? "needs-improvement" : "poor";
  if (name === "FCP") return value <= 1_800 ? "good" : value <= 3_000 ? "needs-improvement" : "poor";
  if (name === "TTFB") return value <= 800 ? "good" : value <= 1_800 ? "needs-improvement" : "poor";
  return undefined;
}

let vitalsInstalled = false;

/**
 * Start collecting LCP / CLS / INP / FCP / TTFB and forwarding them to
 * /api/web-vitals. Final values are flushed on `pagehide` /
 * `visibilitychange:hidden` so SPA navigations and tab closes both
 * deliver the sample.
 *
 * Safe to call multiple times — reinstalls are no-ops.
 */
export function installWebVitalsReporter(): void {
  if (vitalsInstalled) return;
  if (typeof window === "undefined") return;
  if (typeof PerformanceObserver === "undefined") return;
  vitalsInstalled = true;

  const supportedTypes = new Set<string>(
    (PerformanceObserver as any).supportedEntryTypes ?? [],
  );

  const observe = (type: string, cb: (list: PerformanceObserverEntryList) => void): void => {
    if (!supportedTypes.has(type)) return;
    try {
      const obs = new PerformanceObserver(cb);
      obs.observe({ type, buffered: true } as PerformanceObserverInit);
    } catch {
      /* swallow */
    }
  };

  // ── LCP — keep the largest paint we've seen and flush on hide ──────────
  let lcpValue = 0;
  observe("largest-contentful-paint", (list) => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1] as any;
    if (last && typeof last.startTime === "number") {
      lcpValue = last.startTime;
    }
  });

  // ── CLS — sum unexpected layout shifts (no input-attribution windowing
  //   for simplicity; web.dev's session-window math would be heavier
  //   than what we want to ship inline). Good enough for a "P2 vs P95"
  //   signal, which is what an operator monitoring dashboard needs. ────
  let clsValue = 0;
  observe("layout-shift", (list) => {
    for (const entry of list.getEntries()) {
      const e = entry as any;
      if (!e.hadRecentInput && typeof e.value === "number") {
        clsValue += e.value;
      }
    }
  });

  // ── INP — track the worst interaction latency. `event` entries with
  //   an `interactionId` are the per-tap deltas. ──────────────────────
  let inpValue = 0;
  observe("event", (list) => {
    for (const entry of list.getEntries()) {
      const e = entry as any;
      if (e.interactionId && typeof e.duration === "number") {
        if (e.duration > inpValue) inpValue = e.duration;
      }
    }
  });

  // ── FCP — first paint of any user-perceptible content ──────────────
  observe("paint", (list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === "first-contentful-paint") {
        const value = entry.startTime;
        reportVital({ name: "FCP", value, rating: rate("FCP", value) });
      }
    }
  });

  // ── TTFB — from the navigation entry ───────────────────────────────
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav && typeof nav.responseStart === "number") {
      const ttfb = nav.responseStart;
      reportVital({
        name: "TTFB",
        value: ttfb,
        rating: rate("TTFB", ttfb),
        navigationType: nav.type,
      });
    }
  } catch {
    /* swallow */
  }

  // ── Flush LCP / CLS / INP on hide ──────────────────────────────────
  let flushed = false;
  const flush = (): void => {
    if (flushed) return;
    flushed = true;
    if (lcpValue > 0) reportVital({ name: "LCP", value: lcpValue, rating: rate("LCP", lcpValue) });
    if (clsValue > 0) reportVital({ name: "CLS", value: clsValue, rating: rate("CLS", clsValue) });
    if (inpValue > 0) reportVital({ name: "INP", value: inpValue, rating: rate("INP", inpValue) });
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}

// Exported for tests.
export const __testInternals = {
  clip,
  rate,
  MAX_MESSAGE,
  MAX_STACK,
};
