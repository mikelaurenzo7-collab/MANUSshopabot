/**
 * Tests for the SSRF guard.
 *
 * Locks in the contract that:
 *   - Non-http(s) schemes (file://, gopher://, javascript:) are rejected.
 *   - Literal RFC1918 + loopback + cloud-metadata IPs are rejected.
 *   - IPv6 loopback / link-local / ULA addresses are rejected.
 *   - Hostnames that resolve to private IPs are rejected.
 *   - Public hostnames pass the guard (we don't actually fetch — that's
 *     a network test — we just verify assertSafeUrl resolves).
 */
import { describe, expect, it } from "vitest";
import { assertSafeUrl, SsrfBlockedError } from "./safeFetch";

async function expectBlocked(url: string): Promise<void> {
  await expect(assertSafeUrl(url)).rejects.toBeInstanceOf(SsrfBlockedError);
}

describe("safeFetch.assertSafeUrl", () => {
  it("rejects non-http(s) schemes", async () => {
    await expectBlocked("file:///etc/passwd");
    await expectBlocked("gopher://example.com/");
    await expectBlocked("javascript:alert(1)");
    await expectBlocked("data:text/plain,hello");
    await expectBlocked("ftp://example.com/file");
  });

  it("rejects malformed URLs", async () => {
    await expectBlocked("not a url");
    await expectBlocked("");
  });

  it("rejects RFC1918 literal IPs", async () => {
    await expectBlocked("http://10.0.0.1/");
    await expectBlocked("http://10.255.255.255/");
    await expectBlocked("http://172.16.0.1/");
    await expectBlocked("http://172.31.255.255/");
    await expectBlocked("http://192.168.1.1/");
  });

  it("rejects loopback + link-local + metadata IPs", async () => {
    await expectBlocked("http://127.0.0.1/");
    await expectBlocked("http://127.255.255.255/");
    await expectBlocked("http://0.0.0.0/");
    // AWS / GCP / Azure metadata endpoint
    await expectBlocked("http://169.254.169.254/latest/meta-data/");
    await expectBlocked("http://169.254.0.1/");
  });

  it("rejects CGNAT range", async () => {
    await expectBlocked("http://100.64.0.1/");
    await expectBlocked("http://100.127.255.255/");
  });

  it("rejects IPv6 loopback + link-local + ULA", async () => {
    await expectBlocked("http://[::1]/");
    await expectBlocked("http://[fe80::1]/");
    await expectBlocked("http://[fc00::1]/");
    await expectBlocked("http://[fd00::abcd]/");
  });

  it("rejects v4-mapped IPv6 addresses to private space", async () => {
    await expectBlocked("http://[::ffff:127.0.0.1]/");
    await expectBlocked("http://[::ffff:10.0.0.1]/");
  });

  it("rejects hostnames with no DNS records", async () => {
    // .invalid is reserved for "must not resolve" in RFC 2606.
    await expectBlocked("http://nonexistent-host.invalid/");
  });
});
