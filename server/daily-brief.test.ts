/**
 * Daily Brief endpoint smoke tests.
 *
 * Guards the contract the front-end consumes: the brief always
 * returns three bot rollups (builder / merchant / social), each with
 * a numeric completedCount + a highlights array, and a commerce
 * footer with orders + revenueCents. Without these guarantees the
 * client lights up undefined-property warnings when the user opens
 * the dashboard on a fresh org.
 */
import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function ctx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    activeOrg: { id: 1, role: "owner" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("dashboard.dailyBrief", () => {
  it("returns the three bot rollups with the expected shape", async () => {
    const caller = appRouter.createCaller(ctx());
    const brief = await caller.dashboard.dailyBrief({ hoursBack: 24 });

    expect(brief).toHaveProperty("since");
    expect(brief).toHaveProperty("hoursBack", 24);
    for (const bot of ["builder", "merchant", "social"] as const) {
      expect(brief[bot]).toBeTruthy();
      expect(typeof brief[bot].completedCount).toBe("number");
      expect(typeof brief[bot].failedCount).toBe("number");
      expect(typeof brief[bot].runningCount).toBe("number");
      expect(Array.isArray(brief[bot].highlights)).toBe(true);
    }
    expect(brief.commerce).toBeTruthy();
    expect(typeof brief.commerce.orders).toBe("number");
    expect(typeof brief.commerce.revenueCents).toBe("number");
    expect(typeof brief.commerce.activeStoreCount).toBe("number");
    expect(typeof brief.totalCompleted).toBe("number");
  });

  it("clamps hoursBack to the documented bounds", async () => {
    const caller = appRouter.createCaller(ctx());
    // 0 / 200 are out of bounds — zod should reject before the
    // handler runs, so we only check that 1 and 168 are accepted.
    const briefMin = await caller.dashboard.dailyBrief({ hoursBack: 1 });
    const briefMax = await caller.dashboard.dailyBrief({ hoursBack: 168 });
    expect(briefMin.hoursBack).toBe(1);
    expect(briefMax.hoursBack).toBe(168);
    await expect(
      caller.dashboard.dailyBrief({ hoursBack: 0 } as any),
    ).rejects.toThrow();
    await expect(
      caller.dashboard.dailyBrief({ hoursBack: 999 } as any),
    ).rejects.toThrow();
  });

  it("rejects unauthenticated callers", async () => {
    const anon: TrpcContext = {
      user: null,
      activeOrg: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(anon);
    await expect(caller.dashboard.dailyBrief({ hoursBack: 24 })).rejects.toThrow();
  });
});

describe("Daily Brief + Pulse Stream front-end wiring", () => {
  it("DailyBrief.tsx component reads dashboard.dailyBrief", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "..", "client", "src", "components", "DailyBrief.tsx"),
      "utf-8",
    );
    expect(src).toContain("trpc.dashboard.dailyBrief");
    // Auto-hide on empty + collapsed-state preserved in sessionStorage.
    expect(src).toContain("totalCompleted === 0");
    expect(src).toContain("sessionStorage");
  });

  it("PulseStream.tsx renders an SVG with status-driven animation", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "..", "client", "src", "components", "PulseStream.tsx"),
      "utf-8",
    );
    expect(src).toContain("svg");
    expect(src).toContain("data-status");
    expect(src).toContain("pulse-stream-line");
  });

  it("Home page mounts DailyBrief", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "..", "client", "src", "pages", "Home.tsx"),
      "utf-8",
    );
    expect(src).toContain("import { DailyBrief }");
    expect(src).toContain("<DailyBrief />");
  });

  it("All three bot pages mount the PulseStream", async () => {
    const fs = await import("fs");
    const path = await import("path");
    for (const file of ["Architect.tsx", "Merchant.tsx", "Social.tsx"]) {
      const src = fs.readFileSync(
        path.resolve(__dirname, "..", "client", "src", "pages", file),
        "utf-8",
      );
      expect(src, `${file} must import PulseStream`).toContain("import { PulseStream }");
      expect(src, `${file} must render PulseStream`).toContain("<PulseStream");
    }
  });
});
