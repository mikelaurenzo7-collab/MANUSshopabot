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

describe("Landing positioning — autonomous Store Bot one-liners landed", () => {
  it("hero headline is the three-stab tagline (Hire / Run / Touch)", () => {
    const src = read(LANDING);
    // The new tagline structure:
    //   Hire one expert.
    //   Run your store.
    //   Touch nothing.
    expect(src).toContain("Hire one expert.");
    expect(src).toContain("Run your store.");
    expect(src).toContain("Touch nothing.");
  });

  it("hero subtext reads the one-expert capability narrative", () => {
    const src = read(LANDING);
    expect(src).toContain("Store Bot builds it, runs it, and grows it");
    expect(src).toContain("new store owner");
  });

  it("hero subtext spells out the retention compound (the moat)", () => {
    const src = read(LANDING);
    // The "Store Bot remembers what worked for YOU" line is the strongest
    // differentiator from copy-only AI tools — and the visible moat.
    expect(src).toContain("Store Bot remembers what worked for");
    expect(src).toContain("month over month, the operation gets better while your hours go down");
  });

  it("announcement pill is honest about platform readiness", () => {
    const src = read(LANDING);
    // Pre-rebrand: "Amazon FBA, TikTok Shop, and Shopify automation"
    // (implied all live). Now: Shopify-live + others rolling out.
    expect(src).toContain("Shopify-native today · Amazon, Etsy, TikTok Shop rolling out");
    expect(src).not.toContain("Amazon FBA, TikTok Shop, and Shopify automation in one platform");
  });

  it("Store Bot mode taglines align with the one-expert lifecycle", () => {
    const src = read(LANDING);
    expect(src).toContain('tagline: "Builds your first store — Day 1"');
    expect(src).toContain('tagline: "Runs it — forever"');
    expect(src).toContain('tagline: "Grows it — while you sleep"');
  });

  it("final CTA leads with the trial promise + the compound", () => {
    const src = read(LANDING);
    expect(src).toContain("Hire your autonomous Store Bot tonight.");
    expect(src).toContain("7-day free trial. No credit card.");
    expect(src).toContain("every month, it gets better");
  });

  it("footer brand line uses the canonical role narrative", () => {
    const src = read(LANDING);
    expect(src).toContain("Store Bot builds it, runs it, and grows it.");
    expect(src).toContain("One expert. One operation. Zero touch.");
  });
});

describe("Landing — existing-store operator lane", () => {
  it("hero offers a dual-path affordance under the CTA", () => {
    const src = read(LANDING);
    // Two segments, two paths. New stores → /lifecycle.
    // Existing stores → /existing-store.
    expect(src).toContain("Start my first store");
    expect(src).toContain("I already have a store");
    expect(src).toContain('document.getElementById("existing-store")?.scrollIntoView');
    expect(src).toContain('document.getElementById("lifecycle")?.scrollIntoView');
  });

  it("dedicated #existing-store section exists and leads with the day-1 promise", () => {
    const src = read(LANDING);
    expect(src).toContain('id="existing-store"');
    // The headline that promises immediate operational takeover
    expect(src).toContain("Store Bot can take the wheel");
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
    // one. The primary hero CTA works for fresh-start users.
    expect(src).toContain("Connect my Shopify store");
    // OAuth scope reassurance under the CTA
    expect(src).toContain("OAuth read+write to your store");
  });

  it("FAQ has an existing-store entry covering the catalog-inheritance question", () => {
    const src = read(LANDING);
    expect(src).toContain("I already have a Shopify store — can Store Bot take over my existing catalog?");
    expect(src).toContain("Store Bot inherits your products, orders, customers, and inventory immediately");
  });

  it("FAQ has an autonomy / approval-gate entry for users worried about bot mistakes", () => {
    const src = read(LANDING);
    expect(src).toContain("What if I don't want a bot to take an action without my approval?");
    expect(src).toContain("autonomy level");
    expect(src).toContain("Approval queue");
  });
});

describe("Landing — outcomes strip + pricing matrix + sticky CTA", () => {
  it("outcomes strip names four concrete before/after pairs grounded in real capabilities", () => {
    const src = read(LANDING);
    expect(src).toContain("function OutcomesStrip");
    // Section title — "what changes" framing, not "save 10 hours" lies.
    expect(src).toContain("The day you hire Store Bot");
    // Before/after pairs are ordered launch → operations → growth → audited reasoning.
    expect(src).toContain("Manual store setup");
    expect(src).toContain("Expert-guided launch");
    expect(src).toContain("Manual fulfillment");
    expect(src).toContain("Store Bot on autopilot");
    expect(src).toContain("Manual ad creative");
    expect(src).toContain("Store Bot generates");
    // Reasoning lift framing — operator-facing, no internal "cookbook" word.
    expect(src).toContain("Black-box AI agents");
    expect(src).toContain("Audited reasoning");
  });

  it("pricing matrix surfaces a comparison table with all four tiers + reasoning-lift parity", () => {
    const src = read(LANDING);
    expect(src).toContain("function PricingMatrix");
    // Reasoning lifts are platform-wide and listed across every plan —
    // they don't gate on tier. The matrix says so explicitly so operators
    // don't think they have to upgrade for the audit trail.
    expect(src).toContain("Self-critique on every high-stakes step");
    expect(src).toContain("Parallel drafting on brand naming + decisions");
    expect(src).toContain("Autonomous workflows");
    expect(src).toContain("Audit trail on the workflow detail page");
    // CTA row at the bottom — one button per plan so operators don't
    // have to scroll back up after comparing.
    expect(src).toContain("Pick {p.name}");
  });

  it("trust strip names the real technology stack, not generic promises", () => {
    const src = read(LANDING);
    // Old generic content out, real stack in.
    expect(src).not.toContain('"Instant setup"');
    expect(src).not.toContain('"No code required"');
    expect(src).toContain("Claude Opus 4.7");
    expect(src).toContain("Shopify OAuth");
    expect(src).toContain("Stripe billing");
  });

  it("mobile-only sticky CTA bar is wired to the trial flow", () => {
    const src = read(LANDING);
    expect(src).toContain("function MobileStickyCTA");
    // lg:hidden hides on desktop where the top-nav CTA is already visible.
    expect(src).toMatch(/lg:hidden\s+fixed\s+bottom-0/);
    expect(src).toContain("Start 7-day free trial");
    expect(src).toContain("No credit card to start");
    // The footer adds a bottom spacer on mobile so its content doesn't
    // get hidden under the sticky bar.
    expect(src).toContain('lg:hidden h-20');
  });

  it("pricing matrix horizontally scrolls on mobile + shows a swipe hint", () => {
    const src = read(LANDING);
    // The 5-column grid is unreadable below ~640px; outer overflow-x
    // lets users swipe instead of squinting.
    expect(src).toContain("overflow-x-auto pricing-matrix-scroll");
    expect(src).toContain("min-w-[640px]");
    // Visible-on-mobile-only hint so users know the table extends past
    // the viewport.
    expect(src).toContain("swipe to compare every tier");
    expect(src).toMatch(/className="md:hidden[\s\S]*?"\s*>\s*←\s*swipe/);
  });

  it("OutcomesStrip After block shows a top divider on mobile + left divider on desktop", () => {
    const src = read(LANDING);
    // Top border kicks in on mobile (when the After stacks under the
    // Before) so the two halves are visually distinct without the
    // arrow connector that's hidden below md.
    expect(src).toMatch(/border-t md:border-t-0/);
  });
});
