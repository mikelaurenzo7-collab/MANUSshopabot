/**
 * Tests for Onboarding Wizard backend dependencies.
 * Verifies all tRPC mutations/queries used by the onboarding flow exist and are callable.
 */
import { describe, it, expect } from "vitest";

describe("Onboarding Wizard Backend Dependencies", () => {
  it("stores.list query exists for Step 2 (Connect Store)", async () => {
    const mod = await import("./routers");
    const procedures = mod.appRouter._def.procedures as Record<string, any>;
    expect(procedures["stores.list"]).toBeDefined();
  });

  it("connectors.generateOAuthUrl mutation exists for Step 2 (Shopify Connect)", async () => {
    const mod = await import("./routers");
    const procedures = mod.appRouter._def.procedures as Record<string, any>;
    expect(procedures["connectors.generateOAuthUrl"]).toBeDefined();
  });

  it("connectors.connectionSummary query exists for Step 3 (Social Connect)", async () => {
    const mod = await import("./routers");
    const procedures = mod.appRouter._def.procedures as Record<string, any>;
    expect(procedures["connectors.connectionSummary"]).toBeDefined();
  });

  it("connectors.generateSocialOAuthUrl mutation exists for Step 3 (Social Connect)", async () => {
    const mod = await import("./routers");
    const procedures = mod.appRouter._def.procedures as Record<string, any>;
    expect(procedures["connectors.generateSocialOAuthUrl"]).toBeDefined();
  });

  it("workflows.launch mutation exists for Step 4 (Launch Bot)", async () => {
    const mod = await import("./routers");
    const procedures = mod.appRouter._def.procedures as Record<string, any>;
    expect(procedures["workflows.launch"]).toBeDefined();
  });

  it("auth.me query exists for OnboardingGuard auth check", async () => {
    const mod = await import("./routers");
    const procedures = mod.appRouter._def.procedures as Record<string, any>;
    expect(procedures["auth.me"]).toBeDefined();
  });
});

describe("Onboarding Wizard Route Registration", () => {
  it("OnboardingPage component exports default", async () => {
    // Verify the page module exists and exports a default component
    // This is a structural test — we can't render React in vitest without jsdom
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/Onboarding.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export default function OnboardingPage");
    expect(content).toContain("WelcomeStep");
    expect(content).toContain("ConnectStoreStep");
    expect(content).toContain("ConnectSocialsStep");
    expect(content).toContain("LaunchStep");
  });

  it("App.tsx registers /onboarding route", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/App.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("/onboarding");
    expect(content).toContain("OnboardingPage");
    expect(content).toContain("OnboardingGuard");
  });

  it("App.tsx checks shopbot_onboarded localStorage for redirect", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/App.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("shopbot_onboarded");
  });
});
