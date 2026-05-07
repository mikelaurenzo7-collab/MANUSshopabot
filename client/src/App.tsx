/**
 * App.tsx — top-level router.
 *
 * Shell-tab architecture (see `AUDIT_2026_04.md` §4): only the *shell*
 * pages (Home, Chat, Storefronts, Inbox, Insights, Settings, Workflows,
 * Onboarding, Landing, …) are registered here. Tabbed sub-pages live
 * inside each shell:
 *
 * - `Inbox.tsx`       → mounts `Activity.tsx`, `Approvals.tsx`
 * - `Insights.tsx`    → mounts `Analytics.tsx`, `Intelligence.tsx`,
 *                       `CampaignFunnel.tsx`
 * - `Settings.tsx`    → mounts `Profile.tsx`, `Members.tsx`,
 *                       `BotSettings.tsx`, `PlatformHealth.tsx`
 * - `Storefronts.tsx` → mounts `Integrations.tsx`, `PluginStore.tsx`,
 *                       `SupplierPOs.tsx`
 *
 * The legacy standalone bot pages (Architect / Merchant / Social /
 * Communicator / GmailBot) were retired — `/architect`, `/merchant`,
 * `/social`, `/communicator`, and `/gmail-bot` now redirect to `/chat`,
 * the unified Store Bot surface. Tab pages are imported directly by
 * their parent shell and are therefore *not* lazy-loaded here. When
 * adding a new feature page, decide first whether it deserves a
 * top-level route (rare) or a tab inside an existing shell (default).
 */

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { useEffect, lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { OrgProvider } from "./contexts/OrgContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import DashboardLayout from "./components/DashboardLayout";
import { CommandPalette } from "./components/CommandPalette";
import { StripeSuccessBanner } from "./components/StripeSuccessBanner";
import { useAuth } from "./_core/hooks/useAuth";
import { Loader2 } from "lucide-react";

// Lazy-loaded shell pages (top-level routes only — see comment block above).
const Home = lazy(() => import("./pages/Home"));
const ConfigPage = lazy(() => import("./pages/Config"));

const OnboardingPage = lazy(() => import("./pages/Onboarding"));
const LandingPage = lazy(() => import("./pages/Landing"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const InviteAcceptPage = lazy(() => import("./pages/InviteAccept"));
const StatusPage = lazy(() => import("./pages/StatusPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PromptLabPage = lazy(() => import("./pages/PromptLab"));
const WorkflowsPage = lazy(() => import("./pages/Workflows"));
const WorkflowBuilderPage = lazy(() => import("./pages/WorkflowBuilder"));
const ChatPage = lazy(() => import("./pages/Chat"));
const InboxPage = lazy(() => import("./pages/Inbox"));
const StorefrontsPage = lazy(() => import("./pages/Storefronts"));
const InsightsPage = lazy(() => import("./pages/Insights"));
const SettingsPage = lazy(() => import("./pages/Settings"));

// Per-store workspace surfaces — `/store/:storeId/*`. Each route mounts
// the WorkspaceShell (platform-tinted header + workspace sub-nav) around
// the matching content. The shell auto-syncs the URL :storeId into
// WorkspaceContext so existing context-scoped queries Just Work.
const WorkspaceOverviewPage = lazy(() => import("./pages/WorkspaceOverview"));
const WorkspaceChatPage = lazy(() => import("./pages/WorkspaceChat"));
const WorkspaceWorkflowsPage = lazy(() => import("./pages/WorkspaceWorkflows"));
const WorkspaceBuilderPage = lazy(() => import("./pages/WorkspaceBuilder"));
const WorkspaceSourcingPage = lazy(() => import("./pages/WorkspaceSourcing"));
const WorkspaceConnectorsPage = lazy(() => import("./pages/WorkspaceConnectors"));
const WorkspaceMemoryPage = lazy(() => import("./pages/WorkspaceMemory"));
const WorkspaceInstructionsPage = lazy(() => import("./pages/WorkspaceInstructions"));
const WorkspaceInsightsPage = lazy(() => import("./pages/WorkspaceInsights"));
const WorkspaceActivityPage = lazy(() => import("./pages/WorkspaceActivity"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// Legacy localStorage keys retained so users who completed onboarding before
// the server-side `users.onboardedAt` column existed still bypass the guard.
// `shop_a_bot_onboarded` is the current write target; the rest are historical
// brand renames we still honor on read so no one is bounced back into the
// wizard on the deploy that consolidated them.
const ONBOARDED_STORAGE_KEYS = [
  "shop_a_bot_onboarded",
  "shopabots_onboarded",
  "beastbots_onboarded",
  "shopbots_onboarded",
  "shopbot_onboarded",
] as const;
const PRIMARY_ONBOARDED_KEY = ONBOARDED_STORAGE_KEYS[0];

function readLocalOnboardedFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return ONBOARDED_STORAGE_KEYS.some(
      (key) => window.localStorage.getItem(key) != null
    );
  } catch {
    // Private mode / disabled storage — fall back to server-only signal.
    return false;
  }
}

function writeLocalOnboardedFlag(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(PRIMARY_ONBOARDED_KEY) == null) {
      window.localStorage.setItem(PRIMARY_ONBOARDED_KEY, "true");
    }
  } catch {
    /* best-effort — guard still works via server signal */
  }
}

function OnboardingGuard() {
  const [location, setLocation] = useLocation();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) return; // Not logged in — auth handles redirect
    if (location === "/onboarding") return; // Already on onboarding

    // Server-truth first — `onboardedAt` is set by `auth.completeOnboarding`
    // when the wizard's Finish handler fires. The User row from drizzle
    // already includes this column, but the `useAuth` hook returns a
    // loosely-typed shape, so we narrow defensively here.
    const onboardedFromServer = (user as { onboardedAt?: string | Date | null })
      .onboardedAt;
    const hasOnboardedLocally = readLocalOnboardedFlag();
    const hasOnboarded = !!onboardedFromServer || hasOnboardedLocally;

    if (!hasOnboarded) {
      setLocation("/onboarding");
      return;
    }

    // Mirror the server signal into localStorage so the next visit on
    // this device doesn't re-prompt even if `auth.me` is briefly slow,
    // failing, or hasn't returned before the guard re-runs from a stale
    // cache. Idempotent — only writes when the flag is missing.
    if (onboardedFromServer && !hasOnboardedLocally) {
      writeLocalOnboardedFlag();
    }
  }, [user, loading, location, setLocation]);

  return null;
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* Public marketing landing page */}
        <Route path="/landing" component={LandingPage} />
        {/* Public legal pages — full-screen, outside DashboardLayout */}
        <Route path="/privacy">{() => <LegalPage kind="privacy" />}</Route>
        <Route path="/terms">{() => <LegalPage kind="terms" />}</Route>
        <Route path="/docs">{() => <LegalPage kind="docs" />}</Route>
        {/* Org invite acceptance — full-screen, public-ish (auth required for the mutation) */}
        <Route path="/invite/:token" component={InviteAcceptPage} />
        {/* Public platform status page — anonymous-accessible, no PII. */}
        <Route path="/status" component={StatusPage} />
        {/* Onboarding is full-screen, outside DashboardLayout */}
        <Route path="/onboarding" component={OnboardingPage} />
        <Route>
          <>
            <OnboardingGuard />
            <DashboardLayout>
              <Suspense fallback={<PageLoader />}>
                <ErrorBoundary inline label="page">
                  <Switch>
                    <Route path="/" component={Home} />
                    {/* Stripe checkout success_url points here — keep both
                        routes pointing at Home so the URL is stable even
                        if we ever rename. StripeSuccessBanner reads
                        ?subscription=success and fires automatically. */}
                    <Route path="/command-center" component={Home} />
                    <Route path="/architect">{() => <Redirect to="/chat" />}</Route>
                    <Route path="/merchant">{() => <Redirect to="/chat" />}</Route>
                    <Route path="/social">{() => <Redirect to="/chat" />}</Route>
                    <Route path="/communicator">{() => <Redirect to="/chat" />}</Route>
                    {/* Legacy direct routes redirect to their consolidated hub tab.
                        Old bookmarks resolve cleanly into the new layout instead of
                        rendering naked, header-less pages. */}
                    <Route path="/activity">{() => <Redirect to="/inbox#activity" />}</Route>
                    <Route path="/approvals">{() => <Redirect to="/inbox#approvals" />}</Route>
                    <Route path="/analytics">{() => <Redirect to="/insights#stores" />}</Route>
                    <Route path="/intelligence">{() => <Redirect to="/insights#intelligence" />}</Route>
                    <Route path="/integrations">{() => <Redirect to="/storefronts#integrations" />}</Route>
                    <Route path="/plugins">{() => <Redirect to="/storefronts#plugins" />}</Route>
                    <Route path="/supplier">{() => <Redirect to="/storefronts#supplier" />}</Route>
                    <Route path="/gmail-bot">{() => <Redirect to="/chat" />}</Route>
                    <Route path="/profile">{() => <Redirect to="/settings#profile" />}</Route>
                    <Route path="/bot-settings">{() => <Redirect to="/settings#bots" />}</Route>
                    <Route path="/health">{() => <Redirect to="/settings#platform" />}</Route>

                    <Route path="/config" component={ConfigPage} />
                    <Route path="/prompt-lab" component={PromptLabPage} />
                    <Route path="/workflows">{() => <ErrorBoundary inline label="Workflows"><WorkflowsPage /></ErrorBoundary>}</Route>
                    <Route path="/workflow-builder">{() => <ErrorBoundary inline label="Workflow Builder"><WorkflowBuilderPage /></ErrorBoundary>}</Route>
                    <Route path="/chat">{() => <ErrorBoundary inline label="Bot Chat"><ChatPage /></ErrorBoundary>}</Route>
                    <Route path="/inbox">{() => <ErrorBoundary inline label="Inbox"><InboxPage /></ErrorBoundary>}</Route>
                    <Route path="/storefronts">{() => <ErrorBoundary inline label="Storefronts"><StorefrontsPage /></ErrorBoundary>}</Route>
                    <Route path="/insights">{() => <ErrorBoundary inline label="Insights"><InsightsPage /></ErrorBoundary>}</Route>
                    <Route path="/settings">{() => <ErrorBoundary inline label="Settings"><SettingsPage /></ErrorBoundary>}</Route>

                    {/* ── Per-store workspaces ────────────────────────────────────
                        Each connected store becomes its own "world" with chat,
                        workflows, builder, connectors, memory, and instructions
                        all scoped to that store. The shell self-syncs the URL
                        :storeId into WorkspaceContext.activeStoreId so existing
                        context-scoped queries continue to focus correctly. */}
                    <Route path="/store/:storeId">{() => <ErrorBoundary inline label="Workspace"><WorkspaceOverviewPage /></ErrorBoundary>}</Route>
                    <Route path="/store/:storeId/chat">{() => <ErrorBoundary inline label="Workspace Chat"><WorkspaceChatPage /></ErrorBoundary>}</Route>
                    <Route path="/store/:storeId/workflows">{() => <ErrorBoundary inline label="Workspace Workflows"><WorkspaceWorkflowsPage /></ErrorBoundary>}</Route>
                    <Route path="/store/:storeId/builder">{() => <ErrorBoundary inline label="Workspace Builder"><WorkspaceBuilderPage /></ErrorBoundary>}</Route>
                    <Route path="/store/:storeId/sourcing">{() => <ErrorBoundary inline label="Workspace Sourcing"><WorkspaceSourcingPage /></ErrorBoundary>}</Route>
                    <Route path="/store/:storeId/connectors">{() => <ErrorBoundary inline label="Workspace Connectors"><WorkspaceConnectorsPage /></ErrorBoundary>}</Route>
                    <Route path="/store/:storeId/memory">{() => <ErrorBoundary inline label="Workspace Memory"><WorkspaceMemoryPage /></ErrorBoundary>}</Route>
                    <Route path="/store/:storeId/instructions">{() => <ErrorBoundary inline label="Workspace Instructions"><WorkspaceInstructionsPage /></ErrorBoundary>}</Route>
                    <Route path="/store/:storeId/insights">{() => <ErrorBoundary inline label="Workspace Insights"><WorkspaceInsightsPage /></ErrorBoundary>}</Route>
                    <Route path="/store/:storeId/activity">{() => <ErrorBoundary inline label="Workspace Activity"><WorkspaceActivityPage /></ErrorBoundary>}</Route>
                    <Route path="/404" component={NotFound} />
                    <Route component={NotFound} />
                  </Switch>
                </ErrorBoundary>
              </Suspense>
            </DashboardLayout>
          </>
        </Route>
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            theme="dark"
            toastOptions={{
              // Warm-mocha tinted toast surface — harmonizes with the
              // page-canvas warm room. Cool-blue oklch toast read as a
              // floating cold patch over the espresso content area.
              style: {
                background: "oklch(0.22 0.012 50)",
                border: "1px solid oklch(0.32 0.018 55)",
                color: "oklch(0.94 0.008 60)",
              },
            }}
          />
          <StripeSuccessBanner />
          <OrgProvider>
            <WorkspaceProvider>
              <CommandPalette>
                <Router />
              </CommandPalette>
            </WorkspaceProvider>
          </OrgProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
