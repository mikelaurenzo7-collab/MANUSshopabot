/**
 * Input Sanitization Utilities
 * Server-side sanitization for all user-facing form inputs
 * Strips HTML tags, normalizes whitespace, and enforces length limits
 */

/** Strip HTML tags and dangerous characters from a string */
export function sanitizeText(input: string, maxLength = 1000): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .replace(/[<>&"'`]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#x27;", "`": "&#x60;" }[c] ?? c)) // encode entities
    .replace(/\s+/g, " ") // normalize whitespace
    .trim()
    .slice(0, maxLength);
}

/** Sanitize a URL — only allow http/https */
export function sanitizeUrl(input: string): string {
  if (typeof input !== "string") return "";
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

/** Sanitize a store/product name — alphanumeric, spaces, hyphens, apostrophes */
export function sanitizeName(input: string, maxLength = 200): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s\-'.,!@#$%^&*()+=/\\[\]{}|;:,.<>?]/g, "")
    .trim()
    .slice(0, maxLength);
}

/** Sanitize a numeric string — only digits and decimal point */
export function sanitizeNumeric(input: string | number): number | null {
  const str = String(input).replace(/[^0-9.]/g, "");
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

/** Sanitize an email address */
export function sanitizeEmail(input: string): string {
  if (typeof input !== "string") return "";
  const trimmed = input.trim().toLowerCase().slice(0, 254);
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(trimmed) ? trimmed : "";
}

/** Sanitize a multiline text block (for descriptions, instructions) */
export function sanitizeMultiline(input: string, maxLength = 5000): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "") // strip script tags
    .replace(/<[^>]*>/g, "") // strip remaining HTML
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, maxLength);
}

/** Sanitize a record of string key-value pairs (e.g., form fields) */
export function sanitizeRecord(record: Record<string, string>, maxValueLength = 500): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    const sanitizedKey = sanitizeText(key, 100);
    const sanitizedValue = sanitizeText(value, maxValueLength);
    if (sanitizedKey) result[sanitizedKey] = sanitizedValue;
  }
  return result;
}
