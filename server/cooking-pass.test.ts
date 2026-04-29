/**
 * "Keep cooking" round — real-impact + design-polish regression guards.
 *
 *   1. Social Detect Trends button now LAUNCHES the workflow (was a
 *      dead toast that just told the user to navigate elsewhere).
 *   2. architect.saveListingAsDraftProduct: vision-generated listing
 *      → real draft product row. Closes the loop on the listing tool.
 *   3. PageHeader / EmptyState design system: shared component swept
 *      across Insights, Inbox, Storefronts, Analytics, PromptLab.
 *   4. Integrations "Coming soon" is now a disabled-button-with-tooltip
 *      (was a dead div, no hover affordance).
 *   5. Home Kpi cards animate via CountUp on mount.
 *
 * All assertions are source-level — no live API or DB calls.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

describe("Real-impact: Social trend detector launches the workflow", () => {
  it("Social.tsx wires the button to trpc.workflows.launch (no more dead toast redirect)", () => {
    const src = read("client/src/pages/Social.tsx");
    expect(src).toContain("launchTrendDetector");
    expect(src).toContain("trpc.workflows.launch.useMutation");
    expect(src).toContain('workflowType: "viral_trend_detector"');
    // Old dead-toast redirect must be gone
    expect(src).not.toContain('toast.info("Trend detection runs via Workflows');
  });
});

describe("Real-impact: saveListingAsDraftProduct closes the vision-listing loop", () => {
  it("registers the mutation on the architectRouter", async () => {
    const mod = await import("./routers/architect");
    const procedures = mod.architectRouter._def.procedures as Record<string, any>;
    expect(procedures.saveListingAsDraftProduct).toBeDefined();
  });

  it("composes description from prose + bullets + conversion angle and rounds price to whole dollars", () => {
    const src = read("server/routers/architect.ts");
    // bullets get collapsed into a "• …" block in the description
    expect(src).toMatch(/bulletPoints[\s\S]+?bulletPoints.map\(\(b\) => `• \$\{b\}`\)/);
    // price rounds the midpoint to whole dollars (no .99 cents)
    expect(src).toMatch(/Math\.round\(midCents \/ 100\)/);
    // status is draft, not active — review-then-publish is the contract
    expect(src).toContain('status: "draft"');
  });

  it("VisionListingPanel exposes a Save-as-draft button gated by store selection", () => {
    const src = read("client/src/pages/Architect.tsx");
    expect(src).toContain("trpc.architect.saveListingAsDraftProduct.useMutation");
    expect(src).toContain("Save as draft product");
    expect(src).toContain("Pick a store above to enable save-as-draft");
  });
});

describe("Design system: shared PageHeader sweeps the page surface", () => {
  it("the PageHeader component exists and exports the canonical accent palette", () => {
    const src = read("client/src/components/PageHeader.tsx");
    expect(src).toContain("export function PageHeader");
    // 7 accent colors keyed to page identities
    for (const accent of ["sky", "cyan", "violet", "emerald", "fuchsia", "amber", "rose"]) {
      expect(src).toContain(`${accent}:`);
    }
    // Signature scan-line under every header — main consolidated this
    // into a `.page-accent-line` utility so the dimension lives in one
    // place; we still require the gradient direction so the visual
    // intent is encoded in the JSX.
    expect(src).toContain("bg-gradient-to-r");
    // Ambient halo behind every header
    expect(src).toContain("blur-3xl");
  });

  it("Insights / Inbox / Storefronts / Analytics / PromptLab all use PageHeader", () => {
    for (const file of [
      "client/src/pages/Insights.tsx",
      "client/src/pages/Inbox.tsx",
      "client/src/pages/Storefronts.tsx",
      "client/src/pages/Analytics.tsx",
      "client/src/pages/PromptLab.tsx",
    ]) {
      const src = read(file);
      expect(src).toContain('import { PageHeader }');
      expect(src).toContain("<PageHeader");
    }
  });
});

describe("Design system: EmptyState aurora drift", () => {
  it("index.css adds an animated aurora behind .empty-state via ::before/::after", () => {
    const src = read("client/src/index.css");
    expect(src).toContain(".empty-state::before");
    expect(src).toContain(".empty-state::after");
    expect(src).toContain("@keyframes empty-state-aurora");
    // Pure CSS — no JS hook required
    expect(src).toMatch(/empty-state\s*\{[\s\S]+?overflow:\s*hidden/);
  });
});

describe("Design polish: Integrations Coming-soon is now actionable", () => {
  it("uses a disabled button with a tooltip instead of a flat div", () => {
    const src = read("client/src/pages/Integrations.tsx");
    expect(src).toContain("TooltipProvider");
    expect(src).toContain("Coming soon");
    expect(src).toContain("Hourglass");
    // The dead div pattern should be gone
    expect(src).not.toMatch(/className="w-full text-center text-\[11px\] text-slate-400 border border-dashed[^"]*"\s+aria-label=\{`\$\{platform\.name\} coming soon`\}\s*>\s*Coming soon/);
  });
});

describe("Design polish: CountUp animates Home Kpi cards", () => {
  it("CountUp component exists and respects prefers-reduced-motion", () => {
    const src = read("client/src/components/CountUp.tsx");
    expect(src).toContain("export function CountUp");
    expect(src).toContain("prefers-reduced-motion");
    expect(src).toContain("requestAnimationFrame");
  });

  it("Home Kpi extracts numeric component and renders <CountUp>", () => {
    const src = read("client/src/pages/Home.tsx");
    expect(src).toContain('import { CountUp }');
    expect(src).toContain("<CountUp");
    // Non-numeric values ("Healthy", "Attention") fall back to plain text
    expect(src).toContain("numericMatch ? (");
  });
});
