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

describe("Landing positioning — cofounder one-liners landed", () => {
  it("hero headline is the three-stab tagline (Hire / Run / Touch)", () => {
    const src = read(LANDING);
    // The new tagline structure:
    //   Hire three bots.
    //   Run your store.
    //   Touch nothing.
    expect(src).toContain("Hire three bots.");
    expect(src).toContain("Run your store.");
    expect(src).toContain("Touch nothing.");
  });

  it("hero subtext reads the handoff narrative (builds → runs → grows)", () => {
    const src = read(LANDING);
    // Color-coded role narrative: Builder (sky) builds, Merchant (cyan)
    // runs, Social (amber) grows. The colors must match the role icons
    // used elsewhere on the landing.
    expect(src).toMatch(/text-sky-300">Builder<\/span>\s+builds it/);
    expect(src).toMatch(/text-cyan-300">Merchant<\/span>\s+runs it/);
    expect(src).toMatch(/text-amber-300">Social<\/span>\s+grows it/);
  });

  it("hero subtext spells out the retention compound (the moat)", () => {
    const src = read(LANDING);
    // The "bots remember what worked for YOU" line is the strongest
    // differentiator from copy-only AI tools — and the visible moat.
    expect(src).toContain("The bots remember what worked for");
    expect(src).toContain("month over month, the operation gets better while your hours go down");
  });

  it("announcement pill is honest about platform readiness", () => {
    const src = read(LANDING);
    // Pre-rebrand: "Amazon FBA, TikTok Shop, and Shopify automation"
    // (implied all live). Now: Shopify-live + others rolling out.
    expect(src).toContain("Shopify-native today · Amazon, Etsy, TikTok Shop rolling out");
    expect(src).not.toContain("Amazon FBA, TikTok Shop, and Shopify automation in one platform");
  });

  it("BOTS taglines align with the role narrative", () => {
    const src = read(LANDING);
    expect(src).toContain('tagline: "Builds it — Day 1"');
    expect(src).toContain('tagline: "Runs it — forever"');
    expect(src).toContain('tagline: "Grows it — while you sleep"');
  });

  it("final CTA leads with the trial promise + the compound", () => {
    const src = read(LANDING);
    expect(src).toContain("Hire your three bots tonight.");
    expect(src).toContain("7-day free trial. No credit card.");
    expect(src).toContain("every month, they get better");
  });

  it("footer brand line uses the canonical role narrative", () => {
    const src = read(LANDING);
    expect(src).toContain("Builder builds it. Merchant runs it. Social grows it.");
    expect(src).toContain("Three bots. One operation. Zero touch.");
  });
});

describe("Landing — existing-store operator lane", () => {
  it("hero offers a dual-path affordance under the CTA", () => {
    const src = read(LANDING);
    // Two segments, two paths. New stores → /lifecycle.
    // Existing stores → /existing-store.
    expect(src).toContain("Starting from scratch");
    expect(src).toContain("I already have a Shopify store");
    expect(src).toContain('document.getElementById("existing-store")?.scrollIntoView');
    expect(src).toContain('document.getElementById("lifecycle")?.scrollIntoView');
  });

  it("dedicated #existing-store section exists and leads with the day-1 promise", () => {
    const src = read(LANDING);
    expect(src).toContain('id="existing-store"');
    // The headline that promises immediate operational takeover
    expect(src).toContain("The Merchant takes the wheel");
    expect(src).toContain("on day one");
    // Reassurance: no migration, no re-entry
    expect(src).toContain("No re-entry, no migration");
  });

  it("existing-store section walks the three-step takeover (sync → run → compound)", () => {
    const src = read(LANDING);
    expect(src).toContain("Sync your existing catalog");
    expect(src).toContain("Take the manual work off your plate");
    expect(src).toContain("Compound what's already working");
  });

  it("existing-store section enumerates the work that stops being theirs", () => {
    const src = read(LANDING);
    expect(src).toContain("What stops being your problem");
    // Spot-check the high-leverage operational items
    for (const item of [
      "Order fulfillment",
      "Inventory low-stock alerts",
      "Price-floor monitoring",
      "Customer support triage",
      "TikTok / Meta ad creative",
      "Email recovery flows",
    ]) {
      expect(src, `should call out ${item}`).toContain(item);
    }
  });

  it("existing-store section names the cost-displacement story honestly", () => {
    const src = read(LANDING);
    // Operators replace ~$200-500/mo of stitched tools — calling that
    // out anchors the price comparison without inventing numbers.
    expect(src).toContain("$200–$500/mo");
    expect(src).toContain("Klaviyo, Inventory Planner, Triple Whale");
  });

  it("existing-store CTA uses connect-language, not launch-language", () => {
    const src = read(LANDING);
    // "Connect my Shopify store" speaks to operators who already have
    // one. "Launch my bot empire" works for fresh-start users.
    expect(src).toContain("Connect my Shopify store");
    // OAuth scope reassurance under the CTA
    expect(src).toContain("OAuth read+write to your store");
  });

  it("FAQ has an existing-store entry covering the catalog-inheritance question", () => {
    const src = read(LANDING);
    expect(src).toContain("I already have a Shopify store — do the bots work with my existing catalog?");
    expect(src).toContain("inherit your products, orders, customers, and inventory immediately");
  });

  it("FAQ has an autonomy / approval-gate entry for users worried about bot mistakes", () => {
    const src = read(LANDING);
    expect(src).toContain("What if I don't want a bot to take an action without my approval?");
    expect(src).toContain("autonomy level");
    expect(src).toContain("Approval queue");
  });
});
