/**
 * workspace-shell.test.ts — source-pin regression for the per-store
 * workspace contract introduced in PR #82.
 *
 * Why this exists: the workspace shell is a single point of failure for
 * the per-store routing pivot. If its tab registry, route prefix, or
 * the suppression hook get refactored without updating the wiring,
 * operators land on broken pages with no visible error. This test
 * pins the contract so the build fails first.
 *
 * Pattern matches `claude-batch-files.test.ts` — grep-style assertions
 * over source. Doesn't need a DOM, runs in vitest's `node` environment.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const REPO = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

describe("Workspace shell contract", () => {
  it("WorkspaceShell exposes the suppression hook + route prefix", () => {
    const src = read("client/src/components/workspace/WorkspaceShell.tsx");
    // Public contract — pages import these to detect nesting.
    expect(src).toContain("export function useIsInsideWorkspaceShell");
    expect(src).toContain("export function useWorkspaceShellStoreId");
    expect(src).toContain("export function WorkspaceShell");
    // Route prefix the shell binds against.
    expect(src).toContain('"/store/:storeId/:rest*"');
    // Provider must wrap children so nested pages can read context.
    expect(src).toContain("WorkspaceShellContext.Provider");
  });

  it("All 9 workspace surfaces are registered as routes in App.tsx", () => {
    const src = read("client/src/App.tsx");
    // The workspace pivot ships these surfaces — losing any of them
    // breaks the corresponding sub-nav tab.
    expect(src).toContain('path="/store/:storeId"');
    expect(src).toContain('path="/store/:storeId/chat"');
    expect(src).toContain('path="/store/:storeId/workflows"');
    expect(src).toContain('path="/store/:storeId/builder"');
    expect(src).toContain('path="/store/:storeId/connectors"');
    expect(src).toContain('path="/store/:storeId/memory"');
    expect(src).toContain('path="/store/:storeId/instructions"');
    expect(src).toContain('path="/store/:storeId/insights"');
    expect(src).toContain('path="/store/:storeId/activity"');
  });

  it("Activity surface ships its own page wrapper", () => {
    const src = read("client/src/pages/WorkspaceActivity.tsx");
    expect(src).toContain("WorkspaceShell");
    expect(src).toContain('activeTab="activity"');
    // Folds approvals + workflow lifecycle into one timeline.
    expect(src).toContain("approvals.pending");
    expect(src).toContain("workflows.list");
  });

  it("Workspace pages use design-system tokens, not raw hex Tailwind utilities", () => {
    // Mirrors `scripts/preflight-sync.mjs` checkPageHexRegressions().
    // The CI "Manus sync smoke test" runs preflight with --strict, which
    // promotes any raw-hex utility (e.g. `ring-[#050507]`) into a hard
    // failure. PR #84 originally shipped `ring-[#050507]` on the
    // Activity timeline dot which broke the post-merge smoke run; this
    // assertion locks the regression so it cannot sneak past again.
    const HEX_RE = /(?:bg|text|border|from|via|to|fill|stroke|ring)-\[#[0-9a-fA-F]{3,8}\]/;
    const workspacePages = [
      "client/src/pages/WorkspaceOverview.tsx",
      "client/src/pages/WorkspaceChat.tsx",
      "client/src/pages/WorkspaceWorkflows.tsx",
      "client/src/pages/WorkspaceBuilder.tsx",
      "client/src/pages/WorkspaceConnectors.tsx",
      "client/src/pages/WorkspaceMemory.tsx",
      "client/src/pages/WorkspaceInstructions.tsx",
      "client/src/pages/WorkspaceInsights.tsx",
      "client/src/pages/WorkspaceActivity.tsx",
    ];
    const violations: string[] = [];
    for (const page of workspacePages) {
      const src = read(page);
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(HEX_RE);
        if (m) violations.push(`${page}:${i + 1} → ${m[0]}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("Workspace mark pulses while running workflows are in flight", () => {
    const shellSrc = read("client/src/components/workspace/WorkspaceShell.tsx");
    const cssSrc = read("client/src/index.css");
    // The shell flips a class on the brand mark when running > 0.
    expect(shellSrc).toContain("workspace-mark-pulsing");
    // The class drives the dual-ring keyframe animation.
    expect(cssSrc).toContain(".workspace-mark-pulsing");
    expect(cssSrc).toContain("@keyframes workspace-mark-ring");
    // Honors prefers-reduced-motion.
    expect(cssSrc).toMatch(/prefers-reduced-motion: reduce[\s\S]+workspace-mark-pulsing::before/);
  });

  it("Sparkline component is dependency-free + accessible", () => {
    const src = read("client/src/components/Sparkline.tsx");
    // Pure SVG primitive — no chart library import.
    expect(src).not.toMatch(/from ['"]recharts['"]/);
    expect(src).not.toMatch(/from ['"]d3-/);
    // Has an accessible label hook so screen readers describe the trend.
    expect(src).toContain("label?:");
    expect(src).toContain('aria-label={label}');
  });

  it("WorkspaceOverview renders the first-run welcome when freshly connected", () => {
    const src = read("client/src/pages/WorkspaceOverview.tsx");
    expect(src).toContain("isFreshlyConnected");
    expect(src).toContain("Welcome to ");
    // Three concrete next steps — bot / connectors / builder.
    expect(src).toContain("Open chat");
    expect(src).toContain("Connect a channel");
    expect(src).toContain("Launch your first workflow");
  });

  it("PageHeader honors the inside-workspace suppression hook", () => {
    const src = read("client/src/components/PageHeader.tsx");
    expect(src).toContain("useIsInsideWorkspaceShell");
    // Compact branch that runs when nested — the eyebrow path.
    expect(src).toContain("uppercase tracking-[0.16em] text-white/55");
  });

  it("Chat page suppresses its own header when inside a workspace", () => {
    const src = read("client/src/pages/Chat.tsx");
    expect(src).toContain("useIsInsideWorkspaceShell");
    expect(src).toContain("{!insideWorkspace && (");
  });

  it("Home store cards open the per-store workspace overview", () => {
    const src = read("client/src/pages/Home.tsx");
    // The pivot — store cards must route into /store/:id, not the
    // generic /storefronts shell.
    expect(src).toMatch(/setLocation\(`\/store\/\$\{store\.id\}`\)/);
  });

  it("Workflows page scopes its queries to the active workspace storeId when nested", () => {
    // The audit identified this as a refund-trigger: /store/:id/workflows
    // was showing every workflow in the org, not just this store's. The
    // fix wires the page through useWorkspaceShellStoreId() and passes
    // storeId into workflows.list/active/counts. Pin both sides.
    const pageSrc = read("client/src/pages/Workflows.tsx");
    expect(pageSrc).toContain("useIsInsideWorkspaceShell");
    expect(pageSrc).toContain("useWorkspaceShellStoreId");
    expect(pageSrc).toContain("scopedStoreId");
    // Server side accepts the optional storeId on every workflow feed
    // and re-validates org ownership.
    const routerSrc = read("server/routers/workflows.ts");
    expect(routerSrc).toContain("getActiveWorkflowsByOrg(ctx.org.id, storeId)");
    expect(routerSrc).toContain("getWorkflowCountsByOrg(ctx.org.id, storeId)");
    expect(routerSrc).toMatch(/active: orgProcedure[\s\S]+?\.input\(z\.object\(\{ storeId/);
    expect(routerSrc).toMatch(/counts: orgProcedure[\s\S]+?\.input\(z\.object\(\{ storeId/);
  });

  it("connectors.generateOAuthUrl validates store ownership before issuing a URL", () => {
    // Pre-existing HIGH issue surfaced by the workspace UX. The OAuth
    // callback writes against `storeRow.orgId`, so without an upfront
    // ownership check a user could plant their attacker-controlled
    // token on another tenant's store row.
    const src = read("server/routers/connectors.ts");
    expect(src).toContain('generateOAuthUrl: orgProcedure');
    expect(src).toMatch(/await requireStoreInOrg\(input\.storeId, ctx\.org\.id\)/);
  });

  it("WorkspaceOverview reads the canonical stores.overview shape, not a stale field tree", () => {
    // The audit found that the previous reads (`overview.revenue.today`,
    // `overview.orders.today`) silently returned undefined → every
    // paying operator saw $0.00 / 0 / flat. The server emits
    // `metrics.{todayRevenue, todayOrders, weekOrders, lastWeekOrders,
    // weekRevenueCents}` so we pin those.
    const pageSrc = read("client/src/pages/WorkspaceOverview.tsx");
    expect(pageSrc).toContain("metrics.todayRevenue");
    expect(pageSrc).toContain("metrics.todayOrders");
    expect(pageSrc).toContain("metrics.weekOrders");
    expect(pageSrc).toContain("metrics.lastWeekOrders");
    // The stale shape should be gone.
    expect(pageSrc).not.toContain("overview?.revenue?.today");
    expect(pageSrc).not.toContain("overview?.orders?.week");
    // Server emits the new fields the client now reads.
    const routerSrc = read("server/routers/stores.ts");
    expect(routerSrc).toContain("weekOrders: weekOrders.length");
    expect(routerSrc).toContain("lastWeekOrders: lastWeekOrders.length");
    expect(routerSrc).toContain("weekRevenueCents");
  });

  it("Shopify OAuth callback lands the operator on /store/:id, not the retired /architect route", () => {
    const src = read("server/shopifyOAuth.ts");
    // Default returnPath uses the resolved storeId from the
    // transaction (each branch sets `connectedStoreId`).
    expect(src).toContain("connectedStoreId");
    expect(src).toMatch(/connectedStoreId\s*\?\s*`\/store\/\$\{connectedStoreId\}`/);
    // Old retired route should not be the default.
    expect(src).not.toContain('returnTo || "/architect"');
    expect(src).not.toContain("/architect?error=connection_failed");
  });

  it("Operator-facing notifications use the unified Store Bot rename, not the legacy triad", () => {
    // The audit found legacy "Architect Bot / Merchant Bot" strings
    // surfacing in operator notifications under the unified rename.
    // Pin the operator-facing strings; internal comments are exempt
    // because they're dev-only and intentional.
    const filesAndPatterns: Array<[string, RegExp]> = [
      ["server/routers/architect.ts", /\bThe Architect Bot\b/],
      ["server/routers/merchant.ts", /\bThe Merchant Bot\b/],
      ["server/routers/supplier.ts", /\bMerchant Bot drafted\b/],
      ["server/shopifyWebhooks.ts", /\bThe Merchant Bot\b/],
    ];
    for (const [file, pattern] of filesAndPatterns) {
      const src = read(file);
      const m = src.match(pattern);
      expect(m, `${file} still has operator-facing legacy bot copy: ${m?.[0] ?? "(none)"}`).toBeNull();
    }
  });

  it("WorkspaceActivity strictly filters approvals to the active store (no over-display)", () => {
    const src = read("client/src/pages/WorkspaceActivity.tsx");
    // The earlier "include if untagged" filter is gone — all approvals
    // without a matching storeId are skipped now.
    expect(src).toContain("if (a.storeId !== storeId) continue;");
    expect(src).not.toContain("if (a.storeId && a.storeId !== storeId) continue;");
  });

  it("QuickAskFab traps focus and restores it to the trigger on close", () => {
    const src = read("client/src/components/workspace/QuickAskFab.tsx");
    // Trigger ref captured + popover ref captured for the focus trap.
    expect(src).toContain("triggerRef");
    expect(src).toContain("popoverRef");
    // Focus restoration on close.
    expect(src).toContain("requestAnimationFrame(() => target.focus");
    // Tab-key wraps inside the popover.
    expect(src).toContain('e.key !== "Tab"');
    expect(src).toMatch(/active === first/);
    expect(src).toMatch(/active === last/);
  });

  it("Workspace shell strip implements the WAI-ARIA tabs pattern (manual activation)", () => {
    const src = read("client/src/components/workspace/WorkspaceShell.tsx");
    // Tab strip declares role="tablist" + aria-label.
    expect(src).toContain('role="tablist"');
    expect(src).toContain('aria-label="Workspace sections"');
    // Each tab carries id + aria-controls binding to the body's id.
    expect(src).toContain('id={`workspace-tab-${t.id}`}');
    expect(src).toContain('aria-controls="workspace-panel"');
    // Body container declares role="tabpanel" + aria-labelledby pointing
    // back at the active tab id (tablist/tabpanel relationship).
    expect(src).toContain('role="tabpanel"');
    expect(src).toContain('aria-labelledby={`workspace-tab-${activeTab}`}');
    expect(src).toContain('id="workspace-panel"');
    // Roving tabindex: only the active tab is in the tab sequence.
    expect(src).toContain("tabIndex={active ? 0 : -1}");
    // Arrow keys + Home/End move focus among tabs.
    expect(src).toMatch(/key === "ArrowRight"/);
    expect(src).toMatch(/key === "ArrowLeft"/);
    expect(src).toMatch(/key === "Home"/);
    expect(src).toMatch(/key === "End"/);
  });

  it("WorkspaceMemory strictly filters memory by relatedStoreId — no untagged bleed", () => {
    const src = read("client/src/pages/WorkspaceMemory.tsx");
    // The audit identified that the previous "include if untagged"
    // filter leaked memory recorded against the legacy global agent
    // profile (or a sibling store) onto this workspace's memory list.
    expect(src).toMatch(/m\.relatedStoreId === storeId/);
    // The old loose predicate should be gone.
    expect(src).not.toContain("!m.relatedStoreId || m.relatedStoreId === storeId");
  });

  it("WorkspaceMemory type-filter buttons expose aria-pressed for screen readers", () => {
    const src = read("client/src/pages/WorkspaceMemory.tsx");
    // Both the "All" reset and the per-type filter buttons declare
    // aria-pressed so AT can convey the selected toggle state.
    expect(src).toMatch(/aria-pressed=\{selectedType === null\}/);
    expect(src).toMatch(/aria-pressed=\{selectedType === t\}/);
    // Wrapper has role="group" + aria-label so the button cluster
    // reads as a grouped filter, not a bag of disconnected toggles.
    expect(src).toContain('role="group"');
    expect(src).toContain('aria-label="Filter memory by type"');
  });

  it("WorkflowBuilder save toast tells the truth about the localStorage-only persistence", () => {
    const src = read("client/src/pages/WorkflowBuilder.tsx");
    // Honest copy: the toast says explicitly "on this device" and the
    // description warns that backend sync isn't wired yet. The
    // previous "Workflow saved as draft" message implied server
    // persistence and was a refund-trigger when operators discovered
    // their drafts didn't follow them across devices.
    expect(src).toContain('"Draft saved on this device"');
    expect(src).toContain("Backend draft sync isn't wired yet");
    // The misleading message should be gone.
    expect(src).not.toContain('toast.success("Workflow saved as draft")');
  });

  it("AGENTS.md documents the per-store workspace product model", () => {
    const src = read("AGENTS.md");
    // After the workspace pivot (#82), AI agents reading AGENTS.md need
    // to learn the product model so they don't ship cross-store sidebar
    // pages instead of workspace-scoped surfaces.
    expect(src).toContain("per-store workspaces");
    expect(src).toContain("/store/:storeId/*");
    expect(src).toContain("WorkspaceShell");
    expect(src).toContain("useIsInsideWorkspaceShell");
    expect(src).toContain("Store Bot");
  });

  it("WorkspaceOverview wires QueryErrorBanner across all 5 background queries", () => {
    const src = read("client/src/pages/WorkspaceOverview.tsx");
    // The audit flagged this page (5 queries, no isError UI) as a
    // silent-failure landmine. The banner mounts only on error.
    expect(src).toContain("QueryErrorBanner");
    expect(src).toContain("overviewQuery, workflowsQuery, credentialsQuery, socialAccountsQuery, memoryQuery");
  });

  it("Client observability is wired into the server bootstrap and the React entry", () => {
    // Server: registerClientObservabilityRoutes runs after the body
    // parser + before the unknown-/api/* 404 handler. Without the
    // wire-up the endpoints exist as code but never serve traffic.
    const serverSrc = read("server/_core/index.ts");
    expect(serverSrc).toContain('import { registerClientObservabilityRoutes } from "../clientObservability"');
    expect(serverSrc).toContain("registerClientObservabilityRoutes(app);");

    // Client: the React entry installs both the global error handlers
    // (window.onerror / unhandledrejection) and the web-vitals reporter
    // BEFORE rendering, so a synchronous mount-time crash still reaches
    // the server log.
    const mainSrc = read("client/src/main.tsx");
    expect(mainSrc).toContain("installGlobalErrorHandlers");
    expect(mainSrc).toContain("installWebVitalsReporter");
    // Both calls must precede the createRoot(...).render(...) call.
    const installPos = mainSrc.indexOf("installGlobalErrorHandlers();");
    const renderPos = mainSrc.indexOf("createRoot(");
    expect(installPos).toBeGreaterThan(0);
    expect(renderPos).toBeGreaterThan(installPos);

    // ErrorBoundary forwards crashes to /api/client-errors via reportError.
    const ebSrc = read("client/src/components/ErrorBoundary.tsx");
    expect(ebSrc).toContain('import { reportError } from "@/lib/clientObservability"');
    expect(ebSrc).toMatch(/reportError\(\{[\s\S]+?error,[\s\S]+?componentStack:/);
  });

  it("Critical dependency CVEs locked via pnpm overrides", () => {
    // The fast-xml-parser <5.3.5 entity-encoding bypass was the only
    // critical advisory. The post-fix override map pins it to >=5.3.8.
    // axios moved to >=1.13.5. path-to-regexp is pinned narrowly to
    // 0.1.13 SCOPED to express because Express 4.x's built-in router
    // requires the 0.1.x API (a wide ">=0.1.13" override would let
    // pnpm pick a newer major like 6.x with the named-export shape
    // and crash express on boot — caught by webhook integration tests).
    // Lodash override is preventive (no patched lodash-es yet).
    // This test pins the override map so a future "unpin to upgrade"
    // mistake fails the build first.
    const src = read("package.json");
    const pkg = JSON.parse(src);
    const overrides = pkg.pnpm?.overrides ?? {};
    expect(overrides["fast-xml-parser"]).toBe(">=5.3.8");
    expect(overrides["axios"]).toBe(">=1.13.5");
    expect(overrides["express>path-to-regexp"]).toBe("0.1.13");
    expect(overrides["lodash"]).toBe(">=4.17.21");
  });

  it("Sidebar workspace switcher navigates into the workspace, not just sets context", () => {
    const src = read("client/src/components/DashboardLayout.tsx");
    // Old behavior: setActiveStoreId(s.id) only. New behavior: also
    // navigates into the per-store world so the chrome stays in sync.
    expect(src).toMatch(/setActiveStoreId\(s\.id\);\s*\n\s*setLocation\(`\/store\/\$\{s\.id\}`\)/);
    expect(src).toContain("WorkspaceSidebarNav");
  });

  it("Leader-key shortcuts route into the active workspace when nested", () => {
    const src = read("client/src/components/DashboardLayout.tsx");
    // Workspace-aware target builder: when /store/:id is in the URL,
    // letters route to that workspace's surfaces, not the global pages.
    expect(src).toContain("buildTargets");
    expect(src).toMatch(/\/\^\\\/store\\\/\(\\d\+\)\(\?:\\\/\|\$\)\//);
    // 'b' / 'm' must hit /store/:id/chat (workspace-scoped Store Bot).
    expect(src).toContain("`${base}/chat`");
    expect(src).toContain("`${base}/workflows`");
    expect(src).toContain("`${base}/connectors`");
    expect(src).toContain("`${base}/memory`");
    expect(src).toContain("`${base}/instructions`");
    expect(src).toContain("`${base}/activity`");
    // Help overlay surfaces a different rowset when nested.
    expect(src).toContain("Workspace navigation");
    expect(src).toContain("Workspace · Chat");
    expect(src).toContain("Workspace · Activity");
  });

  it("Workspace persona helper persists per-store via localStorage with fallbacks", () => {
    const src = read("client/src/hooks/useWorkspacePersona.ts");
    // Storage key must include the storeId so two workspaces on the
    // same machine never collide.
    expect(src).toContain('STORAGE_PREFIX = "workspace_persona:"');
    // Cross-tab sync via the storage event so two windows on the same
    // workspace stay aligned.
    expect(src).toContain('addEventListener("storage"');
    // Sensible defaults so callers can render unconditionally.
    expect(src).toContain("Store Bot");
    expect(src).toContain("🤖");
    // Bounded length so a malicious / accidental large value can't bloat storage.
    expect(src).toMatch(/slice\(0,\s*40\)/);
    expect(src).toMatch(/slice\(0,\s*8\)/);
  });

  it("Persona surfaces in the WorkspaceShell mark + Instructions editor + Chat header", () => {
    const shellSrc = read("client/src/components/workspace/WorkspaceShell.tsx");
    const instructionsSrc = read("client/src/pages/WorkspaceInstructions.tsx");
    const chatSrc = read("client/src/pages/Chat.tsx");
    // Shell renders the persona emoji as a corner badge on the platform mark.
    expect(shellSrc).toContain("useWorkspacePersona");
    expect(shellSrc).toContain("hasPersona");
    expect(shellSrc).toContain("persona.emoji");
    // Instructions has the operator-facing editor with both inputs.
    expect(instructionsSrc).toContain("Bot persona");
    expect(instructionsSrc).toContain("draftPersonaName");
    expect(instructionsSrc).toContain("draftPersonaEmoji");
    expect(instructionsSrc).toContain("Save persona");
    // Chat header swaps in the persona name when set.
    expect(chatSrc).toContain("useWorkspacePersona");
    expect(chatSrc).toContain("personaName");
  });

  it("QuickAskFab follows operators across workspace surfaces (except chat)", () => {
    const fabSrc = read("client/src/components/workspace/QuickAskFab.tsx");
    const shellSrc = read("client/src/components/workspace/WorkspaceShell.tsx");
    // FAB reuses the existing Chat prefill bus — no new wiring on Chat side.
    expect(fabSrc).toContain('sessionStorage.setItem("cp-prefill"');
    expect(fabSrc).toContain('setLocation(`/store/${storeId}/chat`)');
    // Global "/" shortcut to open it (mirrors GitHub).
    expect(fabSrc).toContain('e.key !== "/"');
    expect(fabSrc).toContain('aria-keyshortcuts="/"');
    // Esc closes; persona name shown in label so a screen reader can read it.
    expect(fabSrc).toContain('e.key === "Escape"');
    expect(fabSrc).toContain("aria-label={`Ask ${personaName}");
    // Shell mounts the FAB on every tab EXCEPT chat (where the chat input is the surface).
    expect(shellSrc).toContain("QuickAskFab");
    expect(shellSrc).toContain('activeTab !== "chat"');
  });

  it("Page canvas is the warm-mocha palette, not the legacy black surface", () => {
    // The product is a "room" each store lives in: cool steel chrome
    // (sidebar / topbar) over a warm-mocha canvas. The legacy hardcoded
    // `bg-[#050505]` on the desktop and mobile <main> elements made the
    // canvas read as a terminal, not a workspace. This test pins:
    //   1. The new tokens are defined in BOTH :root and .dark.
    //   2. They are wired into @theme inline so `bg-page-canvas` etc.
    //      compile as Tailwind utilities.
    //   3. The desktop and mobile <main> elements consume the token
    //      class instead of reverting to a raw hex.
    const cssSrc = read("client/src/index.css");
    const layoutSrc = read("client/src/components/DashboardLayout.tsx");

    // Tokens defined (twice — :root + .dark).
    const tokenLines = cssSrc.match(/--page-canvas:\s*#211711;/g) ?? [];
    expect(tokenLines.length).toBeGreaterThanOrEqual(2);
    const elevatedLines = cssSrc.match(/--page-canvas-elevated:\s*#2C201A;/g) ?? [];
    expect(elevatedLines.length).toBeGreaterThanOrEqual(2);
    const softLines = cssSrc.match(/--page-canvas-soft:\s*#3A2C24;/g) ?? [];
    expect(softLines.length).toBeGreaterThanOrEqual(2);
    const cremaLines = cssSrc.match(/--crema-raw:\s*201,\s*169,\s*138;/g) ?? [];
    expect(cremaLines.length).toBeGreaterThanOrEqual(2);

    // Wired into @theme inline so Tailwind utilities compile.
    expect(cssSrc).toContain("--color-page-canvas: var(--page-canvas);");
    expect(cssSrc).toContain("--color-page-canvas-elevated: var(--page-canvas-elevated);");
    expect(cssSrc).toContain("--color-page-canvas-soft: var(--page-canvas-soft);");

    // Desktop <main> consumes the token, mobile <main> consumes the token.
    expect(layoutSrc).toMatch(/<main className="flex-1 flex flex-col relative h-full min-w-0 bg-page-canvas/);
    expect(layoutSrc).toMatch(/mobileMainRef[\s\S]+?bg-page-canvas/);
    // The legacy hardcoded canvas color should no longer appear on the
    // <main> elements (the chrome wrappers can keep #050505 — that's
    // the cool side of the two-tone).
    expect(layoutSrc).not.toMatch(/<main[^>]*bg-\[#050505\]/);

    // Ambient overlay wash uses the crema raw tuple (warm tone), not
    // a stray cool blue gradient that would fight the mocha.
    expect(cssSrc).toMatch(/\.main-ambient-animate[\s\S]+?rgba\(var\(--crema-raw\)/);
  });

  it("WorkspaceShell content wrapper does not paint over the warm canvas", () => {
    // The shell used to wrap children in `bg-terminal-bg/70` which laid a
    // 70%-opacity cool dark wash over the warm-mocha <main>, dulling the
    // intended palette. The wrapper is now transparent so the canvas
    // shows through cleanly.
    const src = read("client/src/components/workspace/WorkspaceShell.tsx");
    expect(src).not.toMatch(/className="page-enter[^"]*bg-terminal-bg\/70/);
  });

  it("Command palette surfaces workspace-scoped actions when nested", () => {
    const src = read("client/src/components/CommandPalette.tsx");
    expect(src).toContain('group: "workspace"');
    // Detection mirrors the leader-key pattern.
    expect(src).toMatch(/location\.match\(\/\^\\\/store\\\/\(\\d\+\)\(\?:\\\/\|\$\)\//);
    // 8 workspace actions cover every per-store surface + a "leave" exit.
    expect(src).toContain('id: "ws-chat"');
    expect(src).toContain('id: "ws-workflows"');
    expect(src).toContain('id: "ws-builder"');
    expect(src).toContain('id: "ws-connectors"');
    expect(src).toContain('id: "ws-memory"');
    expect(src).toContain('id: "ws-instructions"');
    expect(src).toContain('id: "ws-activity"');
    expect(src).toContain('id: "ws-leave"');
    // Header includes the active store's name so the operator never
    // confuses which workspace the actions apply to.
    expect(src).toContain("In this workspace");
    expect(src).toContain("activeWorkspaceStore.name");
  });
});
