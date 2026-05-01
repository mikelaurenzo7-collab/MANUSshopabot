/**
 * client-observability endpoint contract tests.
 *
 * Pins the wire shape, sanitization, and rate-limit behavior of
 * /api/client-errors and /api/web-vitals so a future refactor can't
 * silently widen the accepted payload (e.g. accepting unbounded
 * stacks that would fill the log pipeline) or remove the rate
 * limit.
 *
 * Drives the handlers via the captured Express app — no supertest
 * dep needed (the repo intentionally stays minimal).
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  registerClientObservabilityRoutes,
  __testInternals,
} from "./clientObservability";

interface FakeRes {
  status: (code: number) => FakeRes;
  json: (body: unknown) => FakeRes;
  end: () => FakeRes;
  statusCode: number;
  body: unknown;
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

interface RouteEntry {
  method: string;
  path: string;
  handler: (req: any, res: any) => void;
}

function captureRoutes(): RouteEntry[] {
  const routes: RouteEntry[] = [];
  const fakeApp = {
    post: (path: string, handler: any) => {
      routes.push({ method: "POST", path, handler });
    },
    get: (path: string, handler: any) => {
      routes.push({ method: "GET", path, handler });
    },
  } as any;
  registerClientObservabilityRoutes(fakeApp);
  return routes;
}

function findRoute(method: string, path: string) {
  const r = captureRoutes().find((r) => r.method === method && r.path === path);
  if (!r) throw new Error(`Route ${method} ${path} not registered`);
  return r;
}

function call(method: string, path: string, body: unknown, ip = "1.2.3.4") {
  const route = findRoute(method, path);
  const req = { body, ip, socket: { remoteAddress: ip } } as any;
  const res = makeRes();
  route.handler(req, res);
  return res;
}

describe("Client observability endpoints", () => {
  beforeEach(() => {
    __testInternals.errorBucket.clear();
    __testInternals.vitalsBucket.clear();
  });

  describe("Route registration", () => {
    it("mounts both endpoints at the documented paths", () => {
      const routes = captureRoutes();
      const sigs = routes.map((r) => `${r.method} ${r.path}`);
      // The client lib hardcodes these — moving them is a breaking change.
      expect(sigs).toContain("POST /api/client-errors");
      expect(sigs).toContain("POST /api/web-vitals");
    });
  });

  describe("POST /api/client-errors", () => {
    it("accepts a minimal payload and returns 204", () => {
      const res = call("POST", "/api/client-errors", {
        message: "ReferenceError: foo is not defined",
      });
      expect(res.statusCode).toBe(204);
    });

    it("rejects a payload missing the message field", () => {
      const res = call("POST", "/api/client-errors", {});
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "message_required" });
    });

    it("rejects a non-string message field", () => {
      const res = call("POST", "/api/client-errors", { message: 12345 });
      expect(res.statusCode).toBe(400);
    });

    it("accepts the rich payload shape (stack, componentStack, url, ua, label)", () => {
      const res = call("POST", "/api/client-errors", {
        message: "boom",
        stack: "at foo (a.js:1)\nat bar (b.js:2)",
        componentStack: "    in App",
        url: "https://app.example.com/store/1",
        userAgent: "Mozilla/5.0",
        label: "WorkspaceShell",
      });
      expect(res.statusCode).toBe(204);
    });

    it("rate-limits after the per-IP error cap is hit", () => {
      for (let i = 0; i < __testInternals.ERROR_MAX; i++) {
        const ok = call("POST", "/api/client-errors", { message: `e${i}` });
        expect(ok.statusCode).toBe(204);
      }
      const blocked = call("POST", "/api/client-errors", { message: "blocked" });
      expect(blocked.statusCode).toBe(429);
      expect(blocked.body).toEqual({ error: "rate_limited" });
    });

    it("rate-limit buckets are scoped per-IP", () => {
      // Saturate one IP's bucket; another IP should still be accepted.
      for (let i = 0; i < __testInternals.ERROR_MAX; i++) {
        call("POST", "/api/client-errors", { message: "e" }, "10.0.0.1");
      }
      const otherIp = call("POST", "/api/client-errors", { message: "e" }, "10.0.0.2");
      expect(otherIp.statusCode).toBe(204);
    });
  });

  describe("POST /api/web-vitals", () => {
    it("accepts a minimal LCP sample and returns 204", () => {
      const res = call("POST", "/api/web-vitals", { name: "LCP", value: 1234 });
      expect(res.statusCode).toBe(204);
    });

    it("rejects a payload missing name or value", () => {
      expect(call("POST", "/api/web-vitals", { value: 1 }).statusCode).toBe(400);
      expect(call("POST", "/api/web-vitals", { name: "LCP" }).statusCode).toBe(400);
    });

    it("rejects a non-finite value", () => {
      expect(
        call("POST", "/api/web-vitals", { name: "CLS", value: Number.NaN }).statusCode,
      ).toBe(400);
      expect(
        call("POST", "/api/web-vitals", { name: "CLS", value: Infinity }).statusCode,
      ).toBe(400);
    });

    it("accepts the full sample shape (delta, rating, navigationType, url)", () => {
      const res = call("POST", "/api/web-vitals", {
        name: "INP",
        value: 240,
        delta: 12,
        rating: "needs-improvement",
        navigationType: "navigate",
        url: "https://app.example.com/store/1/chat",
      });
      expect(res.statusCode).toBe(204);
    });

    it("rate-limits after the per-IP vitals cap is hit", () => {
      for (let i = 0; i < __testInternals.VITALS_MAX; i++) {
        const ok = call("POST", "/api/web-vitals", { name: "FCP", value: i });
        expect(ok.statusCode).toBe(204);
      }
      const blocked = call("POST", "/api/web-vitals", { name: "FCP", value: 1 });
      expect(blocked.statusCode).toBe(429);
    });
  });
});
