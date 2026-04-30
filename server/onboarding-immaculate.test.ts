/**
 * Onboarding — perfectionist-pass lockdown.
 *
 * Audited the entire flow end-to-end. These assertions lock in the
 * fixes so the next change can't quietly regress them. Each one
 * represents a specific UX or trust failure mode the audit caught.
 *
 * The onboarding funnel is the highest-leverage surface in the
 * product — every percentage point of completion compounds across
 * every cohort. Tests here are cheap; the lost-conversion cost of
 * regression is not.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

const SRC = "client/src/pages/Onboarding.tsx";

describe("Onboarding — emoji-free brand consistency", () => {
  it("bot previews use plain text (not decorative emoji)", () => {
    const src = read(SRC);
    // Pre-fix: "I'll have your store live by morning ☕"
    expect(src).not.toMatch(/preview:\s*"[^"]*[☕📦📨📈📊]/);
  });

  it("Connect-Store 'other platforms' use lucide icons, not emoji", () => {
    const src = read(SRC);
    expect(src).not.toMatch(/{ name: "WooCommerce", emoji:/);
    // The new shape uses an `icon:` LucideIcon
    expect(src).toContain('{ name: "WooCommerce", icon: Globe');
    expect(src).toContain('{ name: "Etsy", icon: Heart');
    expect(src).toContain('{ name: "Amazon", icon: Package');
    expect(src).toContain('{ name: "TikTok Shop", icon: Music');
  });

  it("Connect-Socials platform list uses lucide icons", () => {
    const src = read(SRC);
    expect(src).not.toMatch(/key: "meta"[^,}]*emoji:/);
    expect(src).toContain("icon: Facebook");
    expect(src).toContain("icon: Music");
    expect(src).toContain("icon: Pin");
  });
});

describe("Onboarding — back navigation", () => {
  it("OnboardingPage renders a Back affordance on steps 2-4", () => {
    const src = read(SRC);
    expect(src).toContain("currentStep > 1");
    expect(src).toContain("goBack");
    expect(src).toMatch(/Back to \$\{STEPS\[currentStep - 2\]/);
  });

  it("goBack handler routes through goToStep with reason='back'", () => {
    const src = read(SRC);
    expect(src).toMatch(/goToStep\(currentStep - 1, \{ reason: "back" \}\)/);
  });

  it("telemetry includes onboarding_step_back as a typed event", () => {
    const tel = read("client/src/lib/onboardingTelemetry.ts");
    expect(tel).toContain('"onboarding_step_back"');
  });
});

describe("Onboarding — trust callout (OAuth conversion lever)", () => {
  it("'What we'll access' is always visible (not hidden in <details>)", () => {
    const src = read(SRC);
    // Pre-fix the trust info was inside a <details> disclosure that
    // most users never opened. Now it's a permanent inline callout.
    expect(src).not.toMatch(/<details[^>]*>[\s\S]*?What we'll access/);
    // Permanent callout shape
    expect(src).toContain("What we'll access — and what we won't");
    expect(src).toContain('aria-label="Permissions granted by this connection"');
  });

  it("trust block enumerates two grants (read + write) and one explicit refusal", () => {
    const src = read(SRC);
    expect(src).toContain("Read products, orders, and inventory");
    expect(src).toContain("Write product listings, prices, and themes you approve");
    expect(src).toContain("No access to customer payment details or your Shopify password");
  });
});

describe("Onboarding — consequence-aware skip copy", () => {
  it("Connect-Store skip preview is explicit about what stays paused", () => {
    const src = read(SRC);
    // Pre-fix: "Skip for now — I'll connect later" (vague)
    // Post-fix: explicit consequence
    expect(src).toContain("Store Bot stays paused until a store is connected");
  });

  it("Connect-Socials skip toggles consequence copy when nothing is connected", () => {
    const src = read(SRC);
    expect(src).toMatch(/connectedCount === 0\s*\?\s*"Skip — growth mode stays paused"/);
  });

  it("Launch step skip is explicit about what 'skip' means", () => {
    const src = read(SRC);
    expect(src).toContain("Skip — finish onboarding without launching");
  });
});

describe("Onboarding — keyboard-first ergonomics", () => {
  it("Welcome step listens for Enter to advance the flow", () => {
    const src = read(SRC);
    // The keydown listener is mounted via useEffect on the Welcome step
    expect(src).toMatch(/window\.addEventListener\("keydown",\s*onKey\)/);
    expect(src).toMatch(/if \(e\.key !== "Enter"\) return/);
    // Don't double-fire when focus is already on a Button
    expect(src).toContain('t.tagName === "BUTTON"');
  });
});

describe("Onboarding — time-to-value microcopy", () => {
  it("each step header includes a time-and-purpose subline", () => {
    const src = read(SRC);
    // Connect Store
    expect(src).toContain("~30 seconds · Shopify OAuth");
    // Connect Socials
    expect(src).toContain("Optional · ~30 seconds each · OAuth");
    // Launch
    expect(src).toContain("~5 minutes · runs in the background");
  });
});

describe("Onboarding — OAuth success card", () => {
  it("post-OAuth card spells out two concrete next-effects (not just 'connected')", () => {
    const src = read(SRC);
    // Pre-fix: just "Builder Bot now has read & write access. We'll keep…"
    // Post-fix: two concrete consequence lines
    expect(src).toContain("Store Bot has read &amp; write access on your products and orders");
    expect(src).toContain("Operator mode starts watching inventory the moment onboarding finishes");
  });

  it("Connect-Shopify CTA is honest about what happens (OAuth redirect)", () => {
    const src = read(SRC);
    // "Authorize on Shopify" is more accurate than "Connect Shopify Store"
    // because clicking redirects to Shopify's OAuth consent screen.
    expect(src).toContain("Authorize on Shopify");
    expect(src).toContain("Redirecting to Shopify…");
  });
});
