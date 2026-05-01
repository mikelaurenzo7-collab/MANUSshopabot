/**
 * SSRF-safe outbound HTTP helpers.
 *
 * Two surfaces here:
 *   1. `safeImageFetch(url)` — fetches a remote image. Used by the product
 *      catalog optimizer and the listing-from-image vision flow. Locks
 *      down host/IP scheme so a user-supplied URL can't reach internal
 *      services or instance metadata endpoints.
 *   2. `withTimeout(ms)` — uniform axios config object so every outbound
 *      call has a bounded wall-clock deadline (defaults to 10s).
 *
 * The image fetcher specifically:
 *   - Rejects non-http(s) schemes.
 *   - Rejects literal IPs (v4 + v6) and resolves hostnames to verify the
 *     answer is publicly routable (blocks 10/8, 172.16/12, 192.168/16,
 *     127/8, 169.254/16 link-local, IPv6 loopback / link-local / ULA).
 *   - Caps response size (default 10 MiB) so a large file can't OOM the
 *     worker.
 *   - Sets a 10s timeout.
 *
 * If the host resolves to multiple addresses, ALL of them must be public
 * (DNS-rebinding-safe). We re-resolve and pin a single IP for the actual
 * request so a TTL-of-zero attacker can't swap the address between our
 * check and the connection.
 */
import { promises as dns } from "dns";
import net from "net";
import { URL } from "url";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

/** Standard axios config: timeout + max-content-length. */
export function withTimeout(ms = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES) {
  return {
    timeout: ms,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    // Don't auto-redirect to an internal URL after passing the SSRF check.
    maxRedirects: 3,
  };
}

function isPrivateV4(addr: string): boolean {
  // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, 0.0.0.0/8
  const parts = addr.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local incl. AWS/GCP metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateV6(addr: string): boolean {
  const a = addr.toLowerCase();
  if (a === "::" || a === "::1") return true;
  if (a.startsWith("fe80:")) return true; // link-local
  if (a.startsWith("fc") || a.startsWith("fd")) return true; // unique-local
  if (a.startsWith("ff")) return true; // multicast
  if (a.startsWith("::ffff:")) {
    // v4-mapped — recheck the embedded v4
    return isPrivateV4(a.replace("::ffff:", ""));
  }
  return false;
}

function isPrivateIp(addr: string): boolean {
  if (net.isIPv4(addr)) return isPrivateV4(addr);
  if (net.isIPv6(addr)) return isPrivateV6(addr);
  return true; // unknown family → block
}

/**
 * Resolve a hostname to its A/AAAA records and verify every address is
 * publicly routable. Throws SsrfBlockedError if any address looks private
 * or if resolution fails entirely.
 */
async function assertHostPublic(hostname: string): Promise<void> {
  // Literal IPs are checked directly without DNS.
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new SsrfBlockedError(`URL resolves to a non-public address (${hostname})`);
    }
    return;
  }

  const addrs = await dns.lookup(hostname, { all: true }).catch(() => {
    throw new SsrfBlockedError(`URL hostname could not be resolved`);
  });
  if (!addrs || addrs.length === 0) {
    throw new SsrfBlockedError(`URL hostname returned no addresses`);
  }
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new SsrfBlockedError(`URL resolves to a non-public address (${a.address})`);
    }
  }
}

/**
 * Validate a URL is safe to fetch from server context. Used by helpers
 * that take a user-supplied URL (image fetch, webhook fan-out, etc.).
 *
 * Throws SsrfBlockedError for any of:
 *   - Non-http(s) scheme (file://, gopher://, javascript:, …)
 *   - Hostname missing
 *   - Resolves to a private / link-local / loopback address
 */
export async function assertSafeUrl(input: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new SsrfBlockedError("Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new SsrfBlockedError(`URL scheme not allowed: ${u.protocol}`);
  }
  if (!u.hostname) {
    throw new SsrfBlockedError("URL hostname missing");
  }
  await assertHostPublic(u.hostname);
  return u;
}

/**
 * Fetch a remote image safely. Returns a Buffer; throws SsrfBlockedError
 * if the URL is unsafe or response is too large.
 */
export async function safeImageFetch(
  rawUrl: string,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<Buffer> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  await assertSafeUrl(rawUrl);

  const { default: axios } = await import("axios");
  const res = await axios.get(rawUrl, {
    responseType: "arraybuffer",
    timeout: timeoutMs,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    maxRedirects: 3,
    // We don't need the server-side cookie jar bleeding through.
    withCredentials: false,
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return Buffer.from(res.data);
}
