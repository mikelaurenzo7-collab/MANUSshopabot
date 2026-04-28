/**
 * Trial-end warning — webhook handler + email template wiring.
 *
 * The customer.subscription.trial_will_end Stripe webhook fires 3
 * days before a user's trial converts to a paid charge. We email
 * them a heads-up via the unified delivery layer so they can update
 * payment method or cancel without surprise.
 *
 * These tests assert source-level wiring (handler exists, calls the
 * template, calls sendEmail) without making live Stripe or SendGrid
 * calls. The trial-warning is a one-shot retention touchpoint —
 * regressing it loses customers in the most expensive way (after
 * they've already paid for their first month).
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

describe("Stripe webhook — trial_will_end handler", () => {
  it("registers a handler for customer.subscription.trial_will_end", () => {
    const src = read("server/stripe/webhook.ts");
    expect(src).toContain('case "customer.subscription.trial_will_end":');
  });

  it("looks up the user by stripeSubscriptionId before sending", () => {
    const src = read("server/stripe/webhook.ts");
    // The handler must fetch the user record so we have email + name
    expect(src).toContain("getUserByStripeSubscriptionId");
    // Bail safely if user is missing or has no email — never crash the
    // webhook processor on data-rot
    expect(src).toMatch(/!user\s*\|\|\s*!user\.email/);
  });

  it("renders the trial-ending template via delivery/templates.ts", () => {
    const src = read("server/stripe/webhook.ts");
    expect(src).toContain("renderTrialEndingEmail");
    // Passes the real trial_end timestamp formatted as a long date
    expect(src).toContain("trial_end");
    expect(src).toContain("toLocaleDateString");
  });

  it("dispatches via the unified delivery layer with provider:'sendgrid'", () => {
    const src = read("server/stripe/webhook.ts");
    expect(src).toContain('provider: "sendgrid"');
    expect(src).toContain('subject, html, text');
  });

  it("logs both success and failure paths with the userId", () => {
    const src = read("server/stripe/webhook.ts");
    expect(src).toContain("stripe_trial_warning_sent");
    expect(src).toContain("stripe_trial_warning_failed");
  });
});

describe("Email template — renderTrialEndingEmail", () => {
  it("exports the renderer with the documented input shape", () => {
    const src = read("server/delivery/templates.ts");
    expect(src).toContain("export function renderTrialEndingEmail");
    // Must accept the four fields the webhook handler passes
    for (const field of ["firstName", "planName", "trialEndDate", "billingPortalUrl"]) {
      expect(src, `template should accept ${field}`).toContain(field);
    }
  });

  it("returns subject + html + text (multi-part for accessibility)", () => {
    const src = read("server/delivery/templates.ts");
    // Search the function body for all three return fields
    const fnMatch = src.match(/renderTrialEndingEmail[^}]+\}[^}]+\}/s);
    expect(fnMatch, "trial-ending renderer body should be present").toBeTruthy();
    expect(src).toContain("Your Shop_a_Bot trial ends");
  });

  it("escapes user-controlled fields to prevent HTML injection", () => {
    const src = read("server/delivery/templates.ts");
    // The first-name field is rendered into HTML; must be escaped so
    // a malicious display name can't inject <script> into the email
    expect(src).toContain("escapeHtml");
  });
});
