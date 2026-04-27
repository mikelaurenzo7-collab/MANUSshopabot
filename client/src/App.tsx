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

// Lazy-loaded pages for code splitting
const Home = lazy(() => import("./pages/Home"));
const ArchitectPage = lazy(() => import("./pages/Architect"));
const MerchantPage = lazy(() => import("./pages/Merchant"));
const SocialPage = lazy(() => import("./pages/Social"));
const ActivityPage = lazy(() => import("./pages/Activity"));
const AnalyticsPage = lazy(() => import("./pages/Analytics"));
const ConfigPage = lazy(() => import("./pages/Config"));
const IntegrationsPage = lazy(() => import("./pages/Integrations"));

const OnboardingPage = lazy(() => import("./pages/Onboarding"));
const LandingPage = lazy(() => import("./pages/Landing"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const InviteAcceptPage = lazy(() => import("./pages/InviteAccept"));
const StatusPage = lazy(() => import("./pages/StatusPage"));
const PlatformHealthPage = lazy(() => import("./pages/PlatformHealth"));
const IntelligencePage = lazy(() => import("./pages/Intelligence"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PluginStorePage = lazy(() => import("./pages/PluginStore"));
const SupplierPOsPage = lazy(() => import("./pages/SupplierPOs"));
const PromptLabPage = lazy(() => import("./pages/PromptLab"));
const ProfilePage = lazy(() => import("./pages/Profile"));
const BotSettingsPage = lazy(() => import("./pages/BotSettings"));
const WorkflowsPage = lazy(() => import("./pages/Workflows"));
const ChatPage = lazy(() => import("./pages/Chat"));
const ApprovalsPage = lazy(() => import("./pages/Approvals"));
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
                    <Route path="/activity" component={ActivityPage} />
                    <Route path="/analytics" component={AnalyticsPage} />
                    <Route path="/integrations" component={IntegrationsPage} />

                    <Route path="/health">{() => <ErrorBoundary inline label="Platform Health"><PlatformHealthPage /></ErrorBoundary>}</Route>
                    <Route path="/intelligence" component={IntelligencePage} />
                    <Route path="/config" component={ConfigPage} />

                    <Route path="/plugins" component={PluginStorePage} />
                    <Route path="/supplier" component={SupplierPOsPage} />
                    <Route path="/prompt-lab" component={PromptLabPage} />
                    <Route path="/profile" component={ProfilePage} />
                    {/* /gmail-bot is now folded into Storefronts as the "Email Channel" tab.
                        Legacy bookmarks land on the right tab via this redirect. */}
                    <Route path="/gmail-bot">{() => <Redirect to="/storefronts#email" />}</Route>
                    <Route path="/bot-settings">{() => <ErrorBoundary inline label="Bot Settings"><BotSettingsPage /></ErrorBoundary>}</Route>
                    <Route path="/workflows">{() => <ErrorBoundary inline label="Workflows"><WorkflowsPage /></ErrorBoundary>}</Route>
                    <Route path="/chat">{() => <ErrorBoundary inline label="Bot Chat"><ChatPage /></ErrorBoundary>}</Route>
                    <Route path="/approvals">{() => <ErrorBoundary inline label="Approvals"><ApprovalsPage /></ErrorBoundary>}</Route>
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
