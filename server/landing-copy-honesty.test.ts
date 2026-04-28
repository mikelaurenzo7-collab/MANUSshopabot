/**
 * Landing copy honesty — lock in the marketing claims that match
 * what the product actually does.
 *
 * Past audits flagged a recurring failure mode: marketing copy ships
 * promises ("auto-sourcing live", "synced across 6 channels", "$4.2M
 * processed by Marcus the testimonial") that the product can't
 * actually deliver, then trial users churn the moment they hit the
 * gap. These assertions don't test rendering — they test the static
 * copy in `Landing.tsx` to keep marketing honest in the diff.
 *
 * Add a new assertion any time we catch a fabricated claim. The
 * test is cheap; the churn from a false promise is not.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

const LANDING = "client/src/pages/Landing.tsx";

describe("Landing copy — honest about platform support", () => {
  it("FAQ acknowledges Shopify is live but other platforms are rolling out", () => {
    const src = read(LANDING);
    expect(src).toContain("Shopify is live today via OAuth");
    expect(src).toContain("rolling out per-platform");
  });

  it("FAQ acknowledges supplier API submission is rolling out per-platform", () => {
    const src = read(LANDING);
    // Bot drafts POs locally; live API submission rolling out per platform
    expect(src).toContain("AliExpress / Zendrop / CJDropshipping");
    expect(src).toContain("rolling out per platform");
  });

  it("FAQ acknowledges approval gates are rolling out, not fully shipped", () => {
    const src = read(LANDING);
    expect(src).toContain("approval gates are rolling out");
  });

  it("FAQ promises a 7-day trial without a credit card (matches upsertUser trial seed)", () => {
    const src = read(LANDING);
    expect(src).toContain("7-day free trial");
    expect(src).toContain("No credit card required");
  });
});

describe("Landing copy — no fabricated testimonials or vanity numbers", () => {
  it("explicitly disclaims fabricated testimonials in the integrations section", () => {
    const src = read(LANDING);
    expect(src).toContain("No fabricated testimonials");
  });

  it("does not name fictional customers or invented revenue figures", () => {
    const src = read(LANDING);
    // Common drift: "Marcus generated $4.2M" / "Priya 2,400% ROAS" / "Jordan"
    expect(src).not.toMatch(/\$4\.2M\s+(processed|generated|earned)/);
    expect(src).not.toMatch(/2,400%\s+ROAS/);
    // First-name testimonials commonly fabricated in similar dashboards
    for (const name of ["Marcus generated", "Priya doubled", "Jordan tripled"]) {
      expect(src).not.toContain(name);
    }
  });
});

describe("Landing copy — hero action feed reflects real bot capabilities", () => {
  it("does not claim cross-channel inventory sync with a hardcoded channel count", () => {
    const src = read(LANDING);
    // Pre-fix: "Synced inventory across 6 channels" implied 6 live
    // platforms. Multi-store reality is one platform (Shopify) across
    // multiple connected accounts. Don't claim a specific platform count.
    expect(src).not.toContain("Synced inventory across 6 channels");
    expect(src).not.toMatch(/Synced inventory across \d+ channels/);
  });

  it("describes product creation as drafting (matches createProduct status:draft)", () => {
    const src = read(LANDING);
    // The architect bot creates draft products — review-then-publish.
    // Saying "imported" implies real product import; "drafted" is honest.
    expect(src).toContain("Drafted 18 margin-safe product listings");
  });
});

describe("Landing copy — pricing tier caps match server-side enforcement", () => {
  it("Starter / Growth / Pro / Scale store caps match stores.create FORBIDDEN gate", () => {
    const src = read(LANDING);
    // The server-side store creation gate enforces these exact caps —
    // marketing must match. Pro = 10, Growth = 3, Starter = 1.
    expect(src).toContain("1 connected store");
    expect(src).toContain("3 connected stores");
    expect(src).toContain("10 connected stores");
  });
});
