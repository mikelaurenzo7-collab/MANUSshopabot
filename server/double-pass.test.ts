/**
 * Double-pass polish — second sweep for "what isn't immaculate yet."
 *
 * The first pass nailed the obvious surfaces. This pass caught:
 *
 *   1. CountUp had stopped propagating. Intelligence's MetricCard +
 *      pricing-action counts + DLQ totals were rendering as static
 *      numbers. Now animate to match the rest of the app.
 *
 * Historical GmailBot Compose / Inbox guards lived here too, but the
 * standalone GmailBot page was retired in favor of the unified Chat
 * surface (legacy /gmail-bot now redirects to /chat). The page file
 * was deleted, so those source-grep checks are gone with it.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

describe("Intelligence — CountUp on every metric surface", () => {
  const SRC = "client/src/pages/Intelligence.tsx";

  it("imports CountUp", () => {
    const src = read(SRC);
    expect(src).toContain('import { CountUp } from "@/components/CountUp"');
  });

  it("MetricCard parses numeric values (currency, percentage, plain) and animates them", () => {
    const src = read(SRC);
    // Same parsing pattern as Home Kpi: prefix + number + suffix
    expect(src).toContain("numericMatch = value.match(/^([^\\d-]*)(-?[\\d,]+(?:\\.\\d+)?)(.*)$/)");
    expect(src).toContain("<CountUp");
  });

  it("Pricing-action breakdown counts (lower / hold / raise) animate", () => {
    const src = read(SRC);
    expect(src).toMatch(/<CountUp value=\{count as number\} \/>/);
  });

  it("DLQ totals (Total + Pending Retry) animate", () => {
    const src = read(SRC);
    expect(src).toContain("<CountUp value={dlq.total} />");
    expect(src).toContain("<CountUp value={dlq.pending} />");
  });
});
