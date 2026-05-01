/**
 * Amazon + eBay webhook signature verification.
 *
 * Pre-this-PR, both handlers parsed and acted on payloads without
 * verifying signatures: any client that knew the URL pattern could
 * POST a forged order event with `?shop_id=N` and the handler would
 * look up the store, fan out a `bot_event`, and trigger downstream
 * processing. That's a cross-tenant order-injection primitive.
 *
 * This test pins:
 *   - Both verifier helpers exist + accept the documented header shapes.
 *   - Both verifiers use constant-time HMAC-SHA256 (via verifyHmacSha256).
 *   - Both webhook handlers wire the verifier into the request lifecycle
 *     BEFORE the response is acked or any state is mutated.
 *   - Production fail-closed: missing secret in NODE_ENV=production
 *     returns 503 with a structured `*_secret_missing_in_production`
 *     log; dev mode logs `*_unsigned_dev_mode` and continues.
 *   - The new ENV entries (`amazonWebhookSecret`, `ebayVerificationToken`)
 *     are wired through `_core/env.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  verifyAmazonHmac,
  verifyEbayHmac,
  verifyHmacSha256,
} from "./utils/webhookVerify";
import crypto from "node:crypto";

const REPO = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

describe("Amazon webhook signature verification", () => {
  it("accepts a hex-digest signature signed with the shared secret", () => {
    const body = Buffer.from(JSON.stringify({ TopicArn: "arn:aws:sns:...", Message: "{}" }));
    const secret = "test-secret-12345";
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyAmazonHmac(body, sig, secret)).toBe(true);
  });

  it("accepts the optional `sha256=` prefix on the header (Meta-style)", () => {
    const body = Buffer.from(JSON.stringify({ orderId: "abc" }));
    const secret = "test-secret-12345";
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyAmazonHmac(body, `sha256=${sig}`, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = Buffer.from(JSON.stringify({ orderId: "abc" }));
    const secret = "test-secret-12345";
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    // Tamper: insert one byte.
    const tampered = Buffer.concat([body, Buffer.from("X")]);
    expect(verifyAmazonHmac(tampered, sig, secret)).toBe(false);
  });

  it("rejects when the secret is wrong", () => {
    const body = Buffer.from(JSON.stringify({ orderId: "abc" }));
    const sig = crypto.createHmac("sha256", "real-secret").update(body).digest("hex");
    expect(verifyAmazonHmac(body, sig, "attacker-secret")).toBe(false);
  });

  it("rejects garbage signatures without throwing", () => {
    const body = Buffer.from("payload");
    expect(verifyAmazonHmac(body, "not-a-real-signature", "secret")).toBe(false);
    expect(verifyAmazonHmac(body, "", "secret")).toBe(false);
  });
});

describe("eBay webhook signature verification", () => {
  it("accepts a hex-digest signature signed with the verification token", () => {
    const body = Buffer.from(JSON.stringify({ eventType: "ItemUpdated" }));
    const token = "ebay-verification-token";
    const sig = crypto.createHmac("sha256", token).update(body).digest("hex");
    expect(verifyEbayHmac(body, sig, token)).toBe(true);
  });

  it("accepts the optional `sha256=` prefix on the header", () => {
    const body = Buffer.from(JSON.stringify({ orderId: 42 }));
    const token = "ebay-verification-token";
    const sig = crypto.createHmac("sha256", token).update(body).digest("hex");
    expect(verifyEbayHmac(body, `sha256=${sig}`, token)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const body = Buffer.from(JSON.stringify({ eventType: "ItemUpdated" }));
    const token = "ebay-verification-token";
    const sig = crypto.createHmac("sha256", token).update(body).digest("hex");
    const tampered = Buffer.from(JSON.stringify({ eventType: "ItemDeleted" }));
    expect(verifyEbayHmac(tampered, sig, token)).toBe(false);
  });

  it("rejects when the verification token is wrong", () => {
    const body = Buffer.from("payload");
    const sig = crypto.createHmac("sha256", "real-token").update(body).digest("hex");
    expect(verifyEbayHmac(body, sig, "attacker-token")).toBe(false);
  });
});

describe("Source contract — handlers fail closed in production", () => {
  const src = read("server/platformWebhooks.ts");

  it("Amazon handler verifies HMAC BEFORE acking the response or claiming dedup", () => {
    // The verification block must run before res.status(200) / dedup.tryClaim.
    // Two-step assertion: (a) the verifier is called, (b) the call site
    // sits ahead of the ack and the dedup claim.
    expect(src).toMatch(/handleAmazonWebhook[\s\S]+?verifyAmazonHmac\(rawBody,\s*signature,\s*secret\)/);
    const handlerStart = src.indexOf("async function handleAmazonWebhook");
    const handlerEnd = src.indexOf("// ─── eBay Webhook Handler", handlerStart);
    const handlerBody = src.slice(handlerStart, handlerEnd);
    const verifyPos = handlerBody.indexOf("verifyAmazonHmac(");
    const ackPos = handlerBody.indexOf("res.status(200).json({ received: true })");
    const dedupPos = handlerBody.indexOf("dedup.tryClaim(");
    expect(verifyPos).toBeGreaterThan(0);
    expect(ackPos).toBeGreaterThan(verifyPos);
    expect(dedupPos).toBeGreaterThan(verifyPos);
  });

  it("eBay handler verifies HMAC BEFORE acking the response or claiming dedup", () => {
    expect(src).toMatch(/handleEbayWebhook[\s\S]+?verifyEbayHmac\(rawBody,\s*signature,\s*verificationToken\)/);
    const handlerStart = src.indexOf("async function handleEbayWebhook");
    const handlerBody = src.slice(handlerStart);
    const verifyPos = handlerBody.indexOf("verifyEbayHmac(");
    const ackPos = handlerBody.indexOf("res.status(200).json({ received: true })");
    const dedupPos = handlerBody.indexOf("dedup.tryClaim(");
    expect(verifyPos).toBeGreaterThan(0);
    expect(ackPos).toBeGreaterThan(verifyPos);
    expect(dedupPos).toBeGreaterThan(verifyPos);
  });

  it("Both handlers fail closed in production when the secret is missing", () => {
    expect(src).toMatch(/amazon_webhook_secret_missing_in_production/);
    expect(src).toMatch(/ebay_webhook_token_missing_in_production/);
    // Both production branches return a 503 — not a 200 — so an
    // operator who deploys without the secret notices via the failed
    // webhook test from the platform's developer portal.
    expect(src).toMatch(/amazon_webhook_secret_missing_in_production[\s\S]+?return res\.status\(503\)/);
    expect(src).toMatch(/ebay_webhook_token_missing_in_production[\s\S]+?return res\.status\(503\)/);
  });

  it("Both handlers reject signature-missing and signature-failed cases with 401", () => {
    expect(src).toMatch(/amazon_webhook_signature_missing[\s\S]+?return res\.status\(401\)/);
    expect(src).toMatch(/amazon_webhook_hmac_failed[\s\S]+?return res\.status\(401\)/);
    expect(src).toMatch(/ebay_webhook_signature_missing[\s\S]+?return res\.status\(401\)/);
    expect(src).toMatch(/ebay_webhook_hmac_failed[\s\S]+?return res\.status\(401\)/);
  });

  it("ENV exposes both new webhook secrets", () => {
    const envSrc = read("server/_core/env.ts");
    expect(envSrc).toMatch(/amazonWebhookSecret:\s*process\.env\.AMAZON_WEBHOOK_SECRET/);
    expect(envSrc).toMatch(/ebayVerificationToken:\s*process\.env\.EBAY_VERIFICATION_TOKEN/);
  });

  it("verifyAmazonHmac + verifyEbayHmac use the constant-time HMAC primitive (no shortcut)", () => {
    const verifySrc = read("server/utils/webhookVerify.ts");
    expect(verifySrc).toMatch(/verifyAmazonHmac[\s\S]+?verifyHmacSha256\(rawBody,\s*provided,\s*secret/);
    expect(verifySrc).toMatch(/verifyEbayHmac[\s\S]+?verifyHmacSha256\(rawBody,\s*provided,\s*verificationToken/);
    // The base helper uses crypto.timingSafeEqual.
    expect(verifySrc).toContain("crypto.timingSafeEqual(");
  });
});

// Sanity — make sure the helpers we just added match the established
// constant-time primitive's behavior end-to-end.
describe("Round-trip: produce + verify", () => {
  it("HMAC produced with crypto.createHmac round-trips through verifyHmacSha256", () => {
    const body = Buffer.from("hello world");
    const secret = "round-trip-secret";
    const hex = crypto.createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyHmacSha256(body, hex, secret, "hex")).toBe(true);
  });
});
