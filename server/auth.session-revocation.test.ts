/**
 * Auth session revocation contract tests.
 *
 * Pins the security-critical behavior of the JWT session pipeline:
 *
 *   1. Default session lifetime is the shorter `SESSION_TTL_MS` (30
 *      days), not the legacy 1-year default. This bounds the blast
 *      radius on a stolen cookie.
 *   2. Every signed session carries a `jti` + `iat` claim. The `jti`
 *      is the per-session id we log; the `iat` is the cutoff anchor
 *      for revocation.
 *   3. `verifySession` rejects tokens whose `iat` is earlier than
 *      `user.tokensInvalidBefore` — even if the JWT signature is
 *      still cryptographically valid. This is the "log out
 *      everywhere" gate.
 *   4. The `auth.logoutEverywhere` mutation calls
 *      `revokeAllSessionsForUser` to bump the cutoff, AND clears the
 *      calling browser's cookie so the next request 401s cleanly.
 *
 * Source-pin pattern matches `workspace-shell.test.ts` /
 * `router-contracts.test.ts` — assertions over source so a future
 * refactor that quietly downgrades the auth path fails the build
 * first instead of shipping a regression to production.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// vi.hoisted runs BEFORE every other top-level statement (including
// imports) so the env var is in place when sdk.ts captures it into
// ENV.cookieSecret at module-load time.
vi.hoisted(() => {
  process.env.JWT_SECRET = "test-secret-at-least-32-bytes-long-for-hs256-keys";
});

const REPO = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

describe("Session revocation — source contract", () => {
  it("defines SESSION_TTL_MS as 30 days, not the legacy 1-year default", () => {
    const src = read("shared/const.ts");
    expect(src).toMatch(/export const SESSION_TTL_MS = 1000 \* 60 \* 60 \* 24 \* 30/);
    // ONE_YEAR_MS still exists (legacy callers) but new code uses
    // SESSION_TTL_MS by default.
    expect(src).toContain("ONE_YEAR_MS");
  });

  it("schema users table has the tokensInvalidBefore revocation column", () => {
    const src = read("drizzle/schema.ts");
    expect(src).toMatch(/tokensInvalidBefore:\s*timestamp\("tokensInvalidBefore"\)/);
    // Migration ships the ALTER TABLE.
    const migration = read("drizzle/0029_steep_maximus.sql");
    expect(migration).toContain("ADD `tokensInvalidBefore`");
  });

  it("signSession sets jti + iat claims and uses SESSION_TTL_MS by default", () => {
    const src = read("server/_core/sdk.ts");
    // Default lifetime is the new shorter constant.
    expect(src).toMatch(/options\.expiresInMs \?\? SESSION_TTL_MS/);
    // jti is crypto-random (not Math.random or sequential).
    expect(src).toContain("crypto.randomBytes(16).toString(\"base64url\")");
    // jose builder calls — both .setIssuedAt and .setJti must run on
    // every signed token. The legacy path didn't include iat.
    expect(src).toMatch(/\.setIssuedAt\(issuedAtSeconds\)/);
    expect(src).toMatch(/\.setJti\(jti\)/);
  });

  it("verifySession compares iat against user.tokensInvalidBefore", () => {
    const src = read("server/_core/sdk.ts");
    // Pull iat off the verified payload.
    expect(src).toMatch(/const \{ openId, appId, name, iat \} = payload as Record<string, unknown>/);
    // Legacy tokens (no iat) are treated as iat=0 so a single
    // logoutEverywhere click invalidates them.
    expect(src).toMatch(/typeof iat === "number" \? iat : 0/);
    // The actual revocation gate.
    expect(src).toMatch(/user\?\.tokensInvalidBefore/);
    expect(src).toMatch(/issuedAtSeconds\s*<\s*cutoffSeconds/);
    // Logs the rejection reason so support can correlate "I was
    // randomly logged out" tickets.
    expect(src).toContain("Session revoked (issued before tokensInvalidBefore cutoff)");
  });

  it("revokeAllSessionsForUser writes through db.updateUser", () => {
    const src = read("server/_core/sdk.ts");
    expect(src).toMatch(/revokeAllSessionsForUser\(userId: number, cutoff: Date = new Date\(\)\)/);
    expect(src).toMatch(/db\.updateUser\(userId,\s*\{\s*tokensInvalidBefore:\s*cutoff\s*\}\)/);
  });

  it("auth.logoutEverywhere mutation is wired and clears the calling browser's cookie", () => {
    const src = read("server/routers.ts");
    expect(src).toMatch(/logoutEverywhere:\s*protectedProcedure\.mutation/);
    // The mutation bumps the cutoff via the SDK helper.
    expect(src).toMatch(/sdk\.revokeAllSessionsForUser\(ctx\.user\.id,\s*cutoff\)/);
    // AND it drops the current browser's cookie so subsequent requests
    // 401 cleanly instead of carrying a now-revoked token.
    expect(src).toMatch(/logoutEverywhere[\s\S]+?clearCookie\(COOKIE_NAME/);
    // Returns the cutoff timestamp so the client can update its UI.
    expect(src).toMatch(/return\s*\{\s*success:\s*true,\s*revokedAt:\s*cutoff\s*\}/);
  });

  it("OAuth callback uses SESSION_TTL_MS, not ONE_YEAR_MS, for both JWT + cookie", () => {
    const src = read("server/_core/oauth.ts");
    expect(src).toContain("SESSION_TTL_MS");
    expect(src).toMatch(/expiresInMs:\s*SESSION_TTL_MS/);
    expect(src).toMatch(/maxAge:\s*SESSION_TTL_MS/);
    // No legacy 1-year cookie path remains.
    expect(src).not.toMatch(/maxAge:\s*ONE_YEAR_MS/);
    expect(src).not.toMatch(/expiresInMs:\s*ONE_YEAR_MS/);
  });
});

// ── Behavior tests with the real signSession / verifySession ────────
// We can drive the JWT codec end-to-end without a live DB by mocking
// `db.getUserByOpenId` so verifySession's revocation lookup returns
// a deterministic user row. The crypto and clock comparison logic is
// the part of the pipeline that benefits most from a real run.

const getUserByOpenIdMock = vi.hoisted(() => vi.fn());

vi.mock("../server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/db")>();
  return {
    ...actual,
    getUserByOpenId: getUserByOpenIdMock,
    updateUser: vi.fn(),
  };
});

describe("Session revocation — verify behavior end-to-end", () => {
  beforeEach(() => {
    getUserByOpenIdMock.mockReset();
  });

  it("a freshly minted session passes verification when no revocation cutoff is set", async () => {
    const { sdk } = await import("./_core/sdk");
    getUserByOpenIdMock.mockResolvedValueOnce({
      id: 1,
      openId: "u_alice",
      tokensInvalidBefore: null,
    });
    const token = await sdk.signSession({
      openId: "u_alice",
      appId: "app",
      name: "Alice",
    });
    const verified = await sdk.verifySession(token);
    expect(verified).toEqual({ openId: "u_alice", appId: "app", name: "Alice" });
  });

  it("a session minted BEFORE the revocation cutoff is rejected", async () => {
    const { sdk } = await import("./_core/sdk");
    // Mint a token "in the past" — we'll then say tokensInvalidBefore
    // is "now", which makes the iat claim earlier than the cutoff.
    const oldToken = await sdk.signSession(
      { openId: "u_bob", appId: "app", name: "Bob" },
    );

    // Wait a beat so the cutoff is strictly later than the iat (the
    // iat is in seconds, so we need at least 1s difference).
    await new Promise((r) => setTimeout(r, 1100));

    getUserByOpenIdMock.mockResolvedValueOnce({
      id: 2,
      openId: "u_bob",
      tokensInvalidBefore: new Date(),
    });
    const verified = await sdk.verifySession(oldToken);
    expect(verified).toBeNull();
  });

  it("a session minted AFTER the revocation cutoff still passes verification", async () => {
    const { sdk } = await import("./_core/sdk");
    // Cutoff in the past — operator clicked "logout everywhere"
    // yesterday, then signed in fresh today.
    const oldCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    getUserByOpenIdMock.mockResolvedValueOnce({
      id: 3,
      openId: "u_carol",
      tokensInvalidBefore: oldCutoff,
    });
    const freshToken = await sdk.signSession({
      openId: "u_carol",
      appId: "app",
      name: "Carol",
    });
    const verified = await sdk.verifySession(freshToken);
    expect(verified).toEqual({ openId: "u_carol", appId: "app", name: "Carol" });
  });

  it("legacy tokens without an iat claim are invalidated by ANY cutoff", async () => {
    // Hand-roll a JWT with no iat (the pre-revocation format) using
    // jose directly. This proves migration behavior: a single
    // logoutEverywhere click flushes every legacy 1-year session.
    const { SignJWT } = await import("jose");
    const { sdk } = await import("./_core/sdk");
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const legacyToken = await new SignJWT({
      openId: "u_dan",
      appId: "app",
      name: "Dan",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor(Date.now() / 1000) + 60_000)
      .sign(secret);

    getUserByOpenIdMock.mockResolvedValueOnce({
      id: 4,
      openId: "u_dan",
      // Cutoff is anything past 1970-01-01 — the legacy iat=0
      // comparison rejects the token.
      tokensInvalidBefore: new Date("2020-01-01"),
    });
    const verified = await sdk.verifySession(legacyToken);
    expect(verified).toBeNull();
  });
});
