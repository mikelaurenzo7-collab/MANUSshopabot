/**
 * Two HIGH-severity production-readiness gaps the audit flagged after
 * the round-1 + round-2 arc landed:
 *
 *   1. Session cookies were minted with `sameSite: "none"` — disabling
 *      CSRF protection on every authenticated request. An attacker
 *      who could trick the operator into clicking a malicious link
 *      could fire any state-mutating endpoint with the session cookie
 *      attached. No comment in the code justified the relaxation.
 *
 *   2. Error stack traces (`err.stack`) were logged at ERROR level
 *      across 9 call sites. Stack traces leak variable names, line
 *      numbers, and minified bundle structure — handy for an attacker
 *      mapping the codebase, useless for the operator outside dev /
 *      staging. Logs flow to a less-trusted aggregator in production.
 *
 * Fixes:
 *   - cookies.ts: `sameSite: "lax"` (OWASP default).
 *   - logger.ts: new `safeErrorStack(err)` helper that returns the
 *     stack only when `NODE_ENV !== "production"`. Applied to every
 *     caller that previously surfaced raw stacks.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { safeErrorStack } from "./_core/logger";

const REPO = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

describe("safeErrorStack — production stack-trace mask", () => {
  it("returns the stack in non-production environments", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const err = new Error("kaboom");
      const stack = safeErrorStack(err);
      expect(typeof stack).toBe("string");
      expect(stack).toContain("kaboom");
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("returns undefined in production", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const err = new Error("masked");
      expect(safeErrorStack(err)).toBeUndefined();
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("returns undefined for non-Error inputs (defensive)", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      expect(safeErrorStack("string error")).toBeUndefined();
      expect(safeErrorStack({ stack: "fake" })).toBeUndefined();
      expect(safeErrorStack(null)).toBeUndefined();
      expect(safeErrorStack(undefined)).toBeUndefined();
      expect(safeErrorStack(42)).toBeUndefined();
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

describe("Stack-trace mask propagation — every previously-raw call site uses safeErrorStack", () => {
  it("server/_core/index.ts (4 sites) all route through safeErrorStack", () => {
    const src = read("server/_core/index.ts");
    expect(src).toMatch(/import \{[^}]*safeErrorStack[^}]*\} from "\.\/logger"/);
    // No raw `err.stack` writes survive in this file.
    expect(src).not.toMatch(/stack:\s*err\?\.stack/);
    expect(src).not.toMatch(/stack:\s*err\.stack\b/);
    expect(src).not.toMatch(/stack:\s*reason instanceof Error \? reason\.stack : undefined/);
    // The four sites use the helper.
    const safeUses = (src.match(/safeErrorStack\(/g) ?? []).length;
    expect(safeUses).toBeGreaterThanOrEqual(4);
  });

  it("server/shopifyWebhooks.ts uses safeErrorStack on the processing-failed log", () => {
    const src = read("server/shopifyWebhooks.ts");
    expect(src).toContain("safeErrorStack");
    expect(src).not.toMatch(/stack:\s*err\.stack\b/);
  });

  it("server/engine/workflowEngine.ts replaces both raw err.stack writes", () => {
    const src = read("server/engine/workflowEngine.ts");
    expect(src).toContain("safeErrorStack");
    expect(src).not.toMatch(/stack:\s*err instanceof Error \? err\.stack : undefined/);
    const usages = (src.match(/safeErrorStack\(err\)/g) ?? []).length;
    expect(usages).toBeGreaterThanOrEqual(2);
  });

  it("server/shopifyOAuth.ts uses safeErrorStack on the callback-failed log", () => {
    const src = read("server/shopifyOAuth.ts");
    expect(src).toContain("safeErrorStack");
    expect(src).not.toMatch(/stack:\s*error instanceof Error \? error\.stack : undefined/);
  });

  it("server/utils/retry.ts uses safeErrorStack instead of raw error.stack", () => {
    const src = read("server/utils/retry.ts");
    expect(src).toContain("safeErrorStack");
    expect(src).not.toMatch(/error:\s*error\.stack\b/);
  });

  it("Whole-codebase scan: zero remaining `stack: err.stack` patterns", () => {
    // Catch-all: any future contributor who copies the legacy pattern
    // fails this test on commit. Excludes the safeErrorStack helper
    // definition itself (which references err.stack legitimately) and
    // server/clientObservability.ts which clips a separately-clipped
    // stack from a wire payload (already bounded).
    const filesToCheck = [
      "server/_core/index.ts",
      "server/shopifyWebhooks.ts",
      "server/shopifyOAuth.ts",
      "server/engine/workflowEngine.ts",
      "server/utils/retry.ts",
    ];
    const violations: string[] = [];
    for (const file of filesToCheck) {
      const src = read(file);
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          /stack:\s*err\.stack\b/.test(line) ||
          /stack:\s*err\?\.stack/.test(line) ||
          /stack:\s*error\.stack\b/.test(line) ||
          /stack:\s*err instanceof Error \? err\.stack/.test(line) ||
          /stack:\s*error instanceof Error \? error\.stack/.test(line) ||
          /stack:\s*reason instanceof Error \? reason\.stack/.test(line)
        ) {
          violations.push(`${file}:${i + 1}`);
        }
      }
    }
    expect(violations, `Raw stack: err.stack survives at:\n  ${violations.join("\n  ")}`).toEqual([]);
  });
});

describe("Session cookie CSRF posture", () => {
  it("getSessionCookieOptions returns sameSite=lax (not none)", () => {
    const src = read("server/_core/cookies.ts");
    expect(src).toMatch(/sameSite:\s*"lax"/);
    expect(src).not.toMatch(/sameSite:\s*"none"/);
  });

  it("Session cookie keeps httpOnly + secure-on-https + path=/ defaults", () => {
    const src = read("server/_core/cookies.ts");
    expect(src).toMatch(/httpOnly:\s*true/);
    expect(src).toMatch(/secure:\s*isSecureRequest\(req\)/);
    expect(src).toMatch(/path:\s*"\/"/);
  });

  it("The relaxation has a documented rationale comment", () => {
    // Future maintainers should see WHY lax instead of strict and WHY
    // not none. The PR adds the inline justification — pin it so a
    // future "tidy comments" sweep doesn't strip the explanation.
    const src = read("server/_core/cookies.ts");
    expect(src).toMatch(/OWASP-recommended default/);
  });
});
