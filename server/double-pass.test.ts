/**
 * Double-pass polish — second sweep for "what isn't immaculate yet."
 *
 * The first pass nailed the obvious surfaces. This pass caught:
 *
 *   1. **A real live bug**: the GmailBot Compose form's Send button
 *      had no onClick. Input/Textarea fields had no value/onChange.
 *      Users typing an email and hitting Send saw NOTHING happen —
 *      classic "looks like it works, doesn't" failure mode.
 *
 *   2. CountUp had stopped propagating. Intelligence's MetricCard +
 *      pricing-action counts + DLQ totals were rendering as static
 *      numbers. Now animate to match the rest of the app.
 *
 *   3. GmailBot inbox was using off-brand bg-gray-900 / border-gray-700
 *      hand-rolled chrome instead of the bento card pattern.
 *
 *   4. Inbox loading was a flat "Loading inbox…" gray text. Now
 *      animated skeletons that match real card height. Empty state
 *      uses the shared aurora-drift pattern.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

describe("GmailBot Compose — bug fix lockdown", () => {
  const SRC = "client/src/pages/GmailBot.tsx";

  it("Compose Input fields are wired to state (value + onChange)", () => {
    const src = read(SRC);
    // Pre-fix the three Inputs/Textarea had NO value/onChange — typing
    // did nothing visible because the fields weren't controlled.
    expect(src).toContain("value={composeTo}");
    expect(src).toContain("value={composeSubject}");
    expect(src).toContain("value={composeBody}");
    expect(src).toContain("onChange={(e) => setComposeTo(e.target.value)}");
    expect(src).toContain("onChange={(e) => setComposeSubject(e.target.value)}");
    expect(src).toContain("onChange={(e) => setComposeBody(e.target.value)}");
  });

  it("Send button has an onClick that calls the send mutation", () => {
    const src = read(SRC);
    // Pre-fix the button rendered "Send Email" with no handler. Click
    // → no-op. New: handleSendCompose validates + dispatches.
    expect(src).toContain("onClick={handleSendCompose}");
    expect(src).toContain("const handleSendCompose = ()");
    expect(src).toContain("sendEmailMutation.mutate({ to, subject, body, isHtml: false })");
  });

  it("Send button is disabled while the mutation is in flight or fields are empty", () => {
    const src = read(SRC);
    // Prevents double-send + clarifies the disabled affordance
    expect(src).toContain("disabled={\n                  sendEmailMutation.isPending");
    expect(src).toContain("!composeTo.trim()");
    expect(src).toContain("!composeSubject.trim()");
    expect(src).toContain("!composeBody.trim()");
    // Loading label so the user knows it's working
    expect(src).toContain('Sending…');
  });

  it("Validates email shape client-side before round-tripping the server", () => {
    const src = read(SRC);
    expect(src).toContain("/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(to)");
    expect(src).toContain("That doesn't look like a valid email address");
  });

  it("Clears the form on send success (prevents accidental double-send)", () => {
    const src = read(SRC);
    expect(src).toMatch(/onSuccess[\s\S]*setComposeTo\(""\)[\s\S]*setComposeSubject\(""\)[\s\S]*setComposeBody\(""\)/);
  });
});

describe("GmailBot Inbox — premium chrome polish", () => {
  const SRC = "client/src/pages/GmailBot.tsx";

  it("loading state uses animated skeletons (not 'Loading inbox…' gray text)", () => {
    const src = read(SRC);
    expect(src).not.toContain("Loading inbox...");
    expect(src).toContain("animate-pulse");
  });

  it("empty state uses the shared aurora pattern with an 'Inbox zero' headline", () => {
    const src = read(SRC);
    expect(src).toContain('className="empty-state"');
    expect(src).toContain("Inbox zero");
  });

  it("message rows use bento card chrome (no off-brand bg-gray-900)", () => {
    const src = read(SRC);
    // The previous border-gray-700 / hover:bg-gray-900/50 styling is gone
    expect(src).not.toContain("border-gray-700");
    expect(src).not.toContain("hover:bg-gray-900");
    // Replaced with the canonical bento pattern
    expect(src).toContain("border border-white/[0.06] bg-white/[0.02]");
    expect(src).toContain("hover:border-cyan-400/25");
  });

  it("input fields use canonical bg-input/50 instead of bg-gray-900", () => {
    const src = read(SRC);
    expect(src).not.toContain('className="bg-gray-900 border-gray-700"');
    expect(src).toContain("bg-input/50 border-white/[0.08]");
  });
});

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
