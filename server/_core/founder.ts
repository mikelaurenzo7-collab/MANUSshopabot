/**
 * Centralized founder bypass.
 *
 * Background: subscription gates and per-procedure rate caps blocked the
 * founder during dogfooding before any real billing wiring existed.
 * Several routers shipped with hardcoded `email === "..."` checks.
 *
 * Two problems with the old approach:
 *   1. Multiple emails (`mlaurenzo8@gmail.com`, `mikelaurenzo7@gmail.com`)
 *      checked inconsistently across files — some routers honored both,
 *      some only one, and a billing bypass on one but not the other.
 *   2. No audit trail when the bypass fired, so support tickets couldn't
 *      tell whether a free-access path was due to a real plan or the
 *      founder check.
 *
 * Fix: this single source of truth, fed by the FOUNDER_EMAILS env var
 * (comma-separated). Defaults match what the routers used historically
 * so behaviour is preserved.
 */
import { logger } from "./logger";

const DEFAULT_FOUNDER_EMAILS = ["mlaurenzo8@gmail.com", "mikelaurenzo7@gmail.com"];

function loadFounderEmails(): Set<string> {
  const raw = process.env.FOUNDER_EMAILS ?? "";
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  const final = list.length > 0 ? list : DEFAULT_FOUNDER_EMAILS.map((e) => e.toLowerCase());
  return new Set(final);
}

const FOUNDER_EMAILS = loadFounderEmails();

/**
 * Returns true if `email` matches a founder identity. Comparison is
 * case-insensitive. Logs the bypass at info level so support can
 * correlate "why does this user have access" tickets to the bypass.
 */
export function isFounderEmail(email: string | null | undefined, context?: { reason?: string }): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  const hit = FOUNDER_EMAILS.has(lower);
  if (hit && context?.reason) {
    logger.info("founder_bypass_used", { email: lower, reason: context.reason });
  }
  return hit;
}
