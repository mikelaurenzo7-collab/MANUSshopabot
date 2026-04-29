import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { useEffect, lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { OrgProvider } from "./contexts/OrgContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import DashboardLayout from "./components/DashboardLayout";
import BotPageShell from "./components/BotPageShell";
import { CommandPalette } from "./components/CommandPalette";
import { StripeSuccessBanner } from "./components/StripeSuccessBanner";
import { useAuth } from "./_core/hooks/useAuth";
import { Loader2 } from "lucide-react";

// Lazy-loaded pages for code splitting. Pages that only render inside hub
// shell tabs (Activity, Approvals, Profile, Members, BotSettings,
// PlatformHealth, Analytics, Intelligence, Integrations, PluginStore,
// SupplierPOs, GmailBot) are imported directly by their parent shell —
// not lazy-loaded here — and reach via Redirect for legacy URLs.
const Home = lazy(() => import("./pages/Home"));
const ArchitectPage = lazy(() => import("./pages/Architect"));
const MerchantPage = lazy(() => import("./pages/Merchant"));
const SocialPage = lazy(() => import("./pages/Social"));
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

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function OnboardingGuard() {
  const [location, setLocation] = useLocation();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) return; // Not logged in — auth handles redirect
    if (location === "/onboarding") return; // Already on onboarding

    // Server-truth first — `onboardedAt` is set by `auth.completeOnboarding`
    // when the wizard's Finish handler fires. Falls back to legacy
    // localStorage flags so users mid-flight don't get bounced back into
    // onboarding right after this deploy.
    const onboardedFromServer = (user as { onboardedAt?: string | Date | null }).onboardedAt;
    const hasOnboarded =
      !!onboardedFromServer ||
      localStorage.getItem("shop_a_bot_onboarded") ||
      localStorage.getItem("shopabots_onboarded") ||
      localStorage.getItem("beastbots_onboarded") ||
      localStorage.getItem("shopbots_onboarded") ||
      localStorage.getItem("shopbot_onboarded");
    if (!hasOnboarded) {
      setLocation("/onboarding");
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
                    <Route path="/architect">{() => <ErrorBoundary inline label="Builder Bot"><BotPageShell agentType="architect"><ArchitectPage /></BotPageShell></ErrorBoundary>}</Route>
                    <Route path="/merchant">{() => <ErrorBoundary inline label="Merchant Bot"><BotPageShell agentType="merchant"><MerchantPage /></BotPageShell></ErrorBoundary>}</Route>
                    <Route path="/social">{() => <ErrorBoundary inline label="Social Bot"><BotPageShell agentType="social"><SocialPage /></BotPageShell></ErrorBoundary>}</Route>
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
                    <Route path="/gmail-bot">{() => <Redirect to="/storefronts#email" />}</Route>
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
              style: {
                background: "oklch(0.19 0.012 270)",
                border: "1px solid oklch(0.28 0.015 270)",
                color: "oklch(0.93 0.005 270)",
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
