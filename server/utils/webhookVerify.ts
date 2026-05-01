/**
 * Shared webhook signature verification utilities.
 *
 * Replaces the duplicated `rawBodyMiddleware` + per-platform HMAC helpers
 * that previously lived inside `server/shopifyWebhooks.ts` and
 * `server/platformWebhooks.ts`. Each provider has its own quirks
 * (digest encoding, header names, timestamp+nonce envelopes), so we
 * keep one helper per provider behind a single import surface.
 *
 * Audit P1 #10 (`AUDIT_2026_04.md` row 10).
 */

import crypto from "crypto";
import type { Request, Response } from "express";

/** Express middleware that buffers the request body so HMAC helpers
 *  can run against the byte-exact payload. Mounted on every webhook
 *  route — never on JSON-parsed routes (raw body is consumed once). */
export function rawBodyMiddleware(req: Request, _res: Response, next: () => void) {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    (req as any).rawBody = Buffer.concat(chunks);
    next();
  });
}

/** Pull the buffered raw body off the request. Returns `null` if the
 *  middleware never ran (caller should reject with 400). */
export function getRawBody(req: Request): Buffer | null {
  const buf = (req as any).rawBody;
  return Buffer.isBuffer(buf) ? buf : null;
}

/** Constant-time HMAC-SHA256 verification. `digest` defaults to `hex`
 *  (Etsy, eBay, TikTok Shop, generic providers). Shopify uses
 *  `base64`. */
export function verifyHmacSha256(
  rawBody: Buffer,
  signature: string,
  secret: string,
  digest: "hex" | "base64" = "hex",
): boolean {
  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest(digest);
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** Shopify-specific convenience wrapper — base64 digest, header is
 *  `X-Shopify-Hmac-Sha256`. */
export function verifyShopifyHmac(rawBody: Buffer, hmacHeader: string, secret: string): boolean {
  return verifyHmacSha256(rawBody, hmacHeader, secret, "base64");
}

/** TikTok Shop signs `timestamp + nonce + body` with the app secret.
 *  Header pattern: `x-tts-timestamp`, `x-tts-nonce`, `x-tts-signature`.
 *  Ref: https://partner.tiktokshop.com/docv2/page/650a3f6a4a0bb702c0093333 */
export function verifyTikTokShopSignature(
  rawBody: Buffer,
  timestamp: string,
  nonce: string,
  signature: string,
  appSecret: string,
): boolean {
  const payload = `${timestamp}${nonce}${rawBody.toString("utf8")}`;
  const computed = crypto.createHmac("sha256", appSecret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** Meta/Facebook/Instagram webhook signature verification.
 *  Header is `X-Hub-Signature-256` formatted as `sha256=<hex>`. */
export function verifyMetaHmac(rawBody: Buffer, hubSignature: string, appSecret: string): boolean {
  const expectedPrefix = "sha256=";
  if (!hubSignature.startsWith(expectedPrefix)) return false;
  const provided = hubSignature.slice(expectedPrefix.length);
  return verifyHmacSha256(rawBody, provided, appSecret, "hex");
}

/** Amazon webhook signature verification. The codebase fronts Amazon
 *  SP-API notifications with a shared-secret HMAC-SHA256 envelope so
 *  the signing path matches Etsy / eBay rather than carrying SNS
 *  X.509 cert pinning. The signature is the hex digest of the raw
 *  body, delivered via the `x-amazon-signature` header. The header
 *  may include an optional `sha256=` prefix to mirror Meta's pattern;
 *  both shapes are accepted. */
export function verifyAmazonHmac(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;
  return verifyHmacSha256(rawBody, provided, secret, "hex");
}

/** eBay webhook signature verification. eBay signs payloads with
 *  HMAC-SHA256 over the raw body using the verification token from
 *  the developer portal. Header is `x-ebay-signature` (hex digest). */
export function verifyEbayHmac(rawBody: Buffer, signature: string, verificationToken: string): boolean {
  const provided = signature.startsWith("sha256=")
    ? signature.slice("sha256=".length)
    : signature;
  return verifyHmacSha256(rawBody, provided, verificationToken, "hex");
}
