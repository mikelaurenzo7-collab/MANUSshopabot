/**
 * webhookVerify.test.ts — security-critical HMAC verification helpers.
 *
 * The verifiers in `webhookVerify.ts` gate every inbound webhook (Shopify,
 * Etsy, TikTok Shop, eBay, Amazon, Meta). A regression here means we
 * either accept forged webhooks (fulfillment-fraud risk) or reject real
 * ones (revenue / customer-experience risk). Both are scary, so this
 * file pins the contract end-to-end with computed-vs-supplied test
 * vectors.
 */

import crypto from "crypto";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { Readable } from "stream";

import {
  rawBodyMiddleware,
  getRawBody,
  verifyHmacSha256,
  verifyShopifyHmac,
  verifyTikTokShopSignature,
  verifyMetaHmac,
} from "./webhookVerify";

const TEST_BODY = '{"order_id":4711,"total":"99.99","customer":{"email":"buyer@example.com"}}';
const TEST_SECRET = "shhhh-this-is-secret";

function hmacHex(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}
function hmacBase64(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("base64");
}

describe("verifyHmacSha256", () => {
  it("accepts a valid hex signature", () => {
    const sig = hmacHex(TEST_BODY, TEST_SECRET);
    expect(verifyHmacSha256(Buffer.from(TEST_BODY), sig, TEST_SECRET, "hex")).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = hmacHex(TEST_BODY, TEST_SECRET);
    const tampered = TEST_BODY.replace("99.99", "0.99");
    expect(verifyHmacSha256(Buffer.from(tampered), sig, TEST_SECRET, "hex")).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const sig = hmacHex(TEST_BODY, TEST_SECRET);
    const tampered = sig.slice(0, -2) + "ff";
    expect(verifyHmacSha256(Buffer.from(TEST_BODY), tampered, TEST_SECRET, "hex")).toBe(false);
  });

  it("rejects when the secret is wrong", () => {
    const sig = hmacHex(TEST_BODY, TEST_SECRET);
    expect(verifyHmacSha256(Buffer.from(TEST_BODY), sig, "different-secret", "hex")).toBe(false);
  });

  it("accepts a base64 signature when digest='base64'", () => {
    const sig = hmacBase64(TEST_BODY, TEST_SECRET);
    expect(verifyHmacSha256(Buffer.from(TEST_BODY), sig, TEST_SECRET, "base64")).toBe(true);
  });

  it("returns false when signature length doesn't match digest length (timingSafeEqual throws)", () => {
    // timingSafeEqual requires equal-length buffers — we catch and return false.
    expect(verifyHmacSha256(Buffer.from(TEST_BODY), "tooShort", TEST_SECRET, "hex")).toBe(false);
  });

  it("treats empty signature as invalid", () => {
    expect(verifyHmacSha256(Buffer.from(TEST_BODY), "", TEST_SECRET, "hex")).toBe(false);
  });

  it("defaults to hex digest", () => {
    const sig = hmacHex(TEST_BODY, TEST_SECRET);
    expect(verifyHmacSha256(Buffer.from(TEST_BODY), sig, TEST_SECRET)).toBe(true);
    // ...and rejects a base64 signature in the default mode
    const b64 = hmacBase64(TEST_BODY, TEST_SECRET);
    expect(verifyHmacSha256(Buffer.from(TEST_BODY), b64, TEST_SECRET)).toBe(false);
  });
});

describe("verifyShopifyHmac", () => {
  it("accepts a valid base64 signature (Shopify's wire format)", () => {
    const sig = hmacBase64(TEST_BODY, TEST_SECRET);
    expect(verifyShopifyHmac(Buffer.from(TEST_BODY), sig, TEST_SECRET)).toBe(true);
  });

  it("rejects a hex signature (Shopify uses base64)", () => {
    const sig = hmacHex(TEST_BODY, TEST_SECRET);
    expect(verifyShopifyHmac(Buffer.from(TEST_BODY), sig, TEST_SECRET)).toBe(false);
  });

  it("rejects with a wrong secret", () => {
    const sig = hmacBase64(TEST_BODY, TEST_SECRET);
    expect(verifyShopifyHmac(Buffer.from(TEST_BODY), sig, "wrong")).toBe(false);
  });
});

describe("verifyTikTokShopSignature", () => {
  const ts = "1722470400000";
  const nonce = "abcdef";

  function tiktokSig(timestamp: string, n: string, body: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(`${timestamp}${n}${body}`).digest("hex");
  }

  it("accepts a valid timestamp+nonce+body signature", () => {
    const sig = tiktokSig(ts, nonce, TEST_BODY, TEST_SECRET);
    expect(verifyTikTokShopSignature(Buffer.from(TEST_BODY), ts, nonce, sig, TEST_SECRET)).toBe(true);
  });

  it("rejects when the timestamp is altered (replay-attack mitigation)", () => {
    const sig = tiktokSig(ts, nonce, TEST_BODY, TEST_SECRET);
    expect(verifyTikTokShopSignature(Buffer.from(TEST_BODY), "1722470500000", nonce, sig, TEST_SECRET)).toBe(false);
  });

  it("rejects when the nonce is altered", () => {
    const sig = tiktokSig(ts, nonce, TEST_BODY, TEST_SECRET);
    expect(verifyTikTokShopSignature(Buffer.from(TEST_BODY), ts, "different-nonce", sig, TEST_SECRET)).toBe(false);
  });

  it("rejects when the body is altered", () => {
    const sig = tiktokSig(ts, nonce, TEST_BODY, TEST_SECRET);
    expect(
      verifyTikTokShopSignature(Buffer.from(TEST_BODY.replace("4711", "9999")), ts, nonce, sig, TEST_SECRET),
    ).toBe(false);
  });

  it("rejects with an empty signature", () => {
    expect(verifyTikTokShopSignature(Buffer.from(TEST_BODY), ts, nonce, "", TEST_SECRET)).toBe(false);
  });
});

describe("verifyMetaHmac", () => {
  it("accepts a valid X-Hub-Signature-256 header", () => {
    const sig = hmacHex(TEST_BODY, TEST_SECRET);
    expect(verifyMetaHmac(Buffer.from(TEST_BODY), `sha256=${sig}`, TEST_SECRET)).toBe(true);
  });

  it("rejects a header without the sha256= prefix", () => {
    const sig = hmacHex(TEST_BODY, TEST_SECRET);
    expect(verifyMetaHmac(Buffer.from(TEST_BODY), sig, TEST_SECRET)).toBe(false);
  });

  it("rejects an md5= or sha1= prefix (Meta only ships sha256= today)", () => {
    const sig = hmacHex(TEST_BODY, TEST_SECRET);
    expect(verifyMetaHmac(Buffer.from(TEST_BODY), `sha1=${sig}`, TEST_SECRET)).toBe(false);
    expect(verifyMetaHmac(Buffer.from(TEST_BODY), `md5=${sig}`, TEST_SECRET)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const sig = hmacHex(TEST_BODY, TEST_SECRET);
    expect(verifyMetaHmac(Buffer.from("{}"), `sha256=${sig}`, TEST_SECRET)).toBe(false);
  });

  it("rejects an empty header", () => {
    expect(verifyMetaHmac(Buffer.from(TEST_BODY), "", TEST_SECRET)).toBe(false);
  });
});

describe("rawBodyMiddleware + getRawBody", () => {
  function fakeReq(body: string): Request {
    const stream = new Readable({ read() {} });
    stream.push(body);
    stream.push(null);
    return stream as unknown as Request;
  }

  it("buffers the request body and exposes it via getRawBody", async () => {
    const req = fakeReq(TEST_BODY);
    const next = vi.fn();
    rawBodyMiddleware(req, {} as Response, next);
    // The 'end' event fires after the next tick; await it.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledOnce();
    const buf = getRawBody(req);
    expect(buf).not.toBeNull();
    expect(buf!.toString("utf8")).toBe(TEST_BODY);
  });

  it("getRawBody returns null when the middleware did not run", () => {
    const req = {} as Request;
    expect(getRawBody(req)).toBe(null);
  });

  it("buffered body verifies with the same HMAC the source provided", async () => {
    const req = fakeReq(TEST_BODY);
    const next = vi.fn();
    rawBodyMiddleware(req, {} as Response, next);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const sig = hmacBase64(TEST_BODY, TEST_SECRET);
    const buffered = getRawBody(req)!;
    expect(verifyShopifyHmac(buffered, sig, TEST_SECRET)).toBe(true);
  });
});
