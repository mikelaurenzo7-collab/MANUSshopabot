/**
 * LLM rate-limit coverage contract.
 *
 * Every tRPC procedure that calls `invokeLLM` (or any
 * Anthropic/OpenAI client directly) must be wrapped with the
 * `llmRateLimit` middleware so cost-blowout protection is actually
 * enforced. The middleware caps per-user LLM-backed mutations at
 * 20/min via an in-memory bucket — see `server/_core/trpc.ts:146`.
 *
 * Pre-this-PR, `chat.message` and four merchant analysis procedures
 * fired LLM calls without the gate, leaving an attacker (or a
 * runaway UI) free to exhaust LLM budget. The audit identified
 * these as a HIGH-severity production-readiness gap.
 *
 * The test below scans every router for `invokeLLM` call sites and
 * verifies the enclosing procedure also uses `llmRateLimit`. A
 * future contributor who adds a new LLM-backed procedure will fail
 * this test until they add `.use(llmRateLimit)` — the pattern is
 * obvious from the failure message.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";

const REPO = resolve(__dirname, "..");
const ROUTERS_DIR = resolve(REPO, "server/routers");

function listRouterFiles(): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(ROUTERS_DIR)) {
    const full = join(ROUTERS_DIR, entry);
    if (statSync(full).isFile() && entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Find each top-level procedure declaration (`name: orgProcedure` or
 * `name: protectedProcedure`) and walk forward until the next
 * declaration. Returns the procedure body text so we can grep for
 * `invokeLLM` and `.use(llmRateLimit)` inside it.
 *
 * Handles a quirk of the codebase: declarations are indented two
 * spaces inside the `router({ ... })` literal.
 */
function extractProcedures(src: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  // Matches `  procedureName: <orgProcedure|protectedProcedure>` at
  // start-of-line. The trailing `Procedure` is the anchor; we accept
  // both `orgProcedure` and `protectedProcedure` (and any future
  // `*Procedure` builder).
  const re = /^(\s+)(\w+):\s*(\w*Procedure)\b/gm;
  const matches: Array<{ name: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    matches.push({ name: m[2], start: m.index });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start;
    const end = i + 1 < matches.length ? matches[i + 1].start : src.length;
    out.push({ name: matches[i].name, body: src.slice(start, end) });
  }
  return out;
}

describe("LLM rate-limit coverage", () => {
  it("every router procedure that calls invokeLLM is wrapped with llmRateLimit", () => {
    const routerFiles = listRouterFiles();
    expect(routerFiles.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of routerFiles) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("invokeLLM")) continue; // Router doesn't touch the LLM.
      const procedures = extractProcedures(src);
      for (const proc of procedures) {
        if (!proc.body.includes("invokeLLM")) continue;
        if (!proc.body.includes(".use(llmRateLimit)")) {
          violations.push(`${file.replace(REPO + "/", "")} → ${proc.name}`);
        }
      }
    }
    expect(violations, `Procedures call invokeLLM without llmRateLimit:\n  ${violations.join("\n  ")}`).toEqual([]);
  });

  it("chat.message + the four merchant analysis procedures explicitly carry llmRateLimit", () => {
    // Belt-and-suspenders: the generic scan above could be fooled by a
    // refactor that hides invokeLLM behind a helper. Pin the specific
    // procedures the audit flagged so they can't quietly lose the gate
    // even if the broader scan goes silent.
    const chatSrc = readFileSync(resolve(REPO, "server/routers/chat.ts"), "utf8");
    expect(chatSrc).toMatch(/message:\s*orgProcedure[\s\S]*?\.use\(llmRateLimit\)/);

    const merchantSrc = readFileSync(resolve(REPO, "server/routers/merchant.ts"), "utf8");
    for (const name of ["suggestPricing", "demandForecasting", "marginAnalyzer", "returnAnalysis"]) {
      expect(
        merchantSrc,
        `merchant.${name} missing .use(llmRateLimit)`,
      ).toMatch(new RegExp(`${name}:\\s*orgProcedure\\s*\\n\\s*\\.use\\(llmRateLimit\\)`));
    }
  });

  it("llmRateLimit middleware itself is configured at 20 req/min per user", () => {
    // The cap matters: too low and legitimate operators hit it; too
    // high and the cost-blowout protection is meaningless. Pin the
    // documented value so a refactor that flips the constant flags.
    const trpcSrc = readFileSync(resolve(REPO, "server/_core/trpc.ts"), "utf8");
    expect(trpcSrc).toMatch(/export const llmRateLimit = rateLimit\(\{\s*bucket:\s*"llm",\s*windowMs:\s*60_000,\s*max:\s*20\s*\}\)/);
  });
});
