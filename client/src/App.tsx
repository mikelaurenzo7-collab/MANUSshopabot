import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import { useEffect, lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import DashboardLayout from "./components/DashboardLayout";
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
    // Check if user has completed onboarding
    // Support old keys for backward compatibility
    const hasOnboarded = localStorage.getItem("shopabots_onboarded") || localStorage.getItem("beastbots_onboarded") || localStorage.getItem("shopbots_onboarded") || localStorage.getItem("shopbot_onboarded");
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
                    <Route path="/architect">{() => <ErrorBoundary inline label="Builder Bot"><ArchitectPage /></ErrorBoundary>}</Route>
                    <Route path="/merchant">{() => <ErrorBoundary inline label="Merchant Bot"><MerchantPage /></ErrorBoundary>}</Route>
                    <Route path="/social">{() => <ErrorBoundary inline label="Social Bot"><SocialPage /></ErrorBoundary>}</Route>
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
                    <Route path="/gmail-bot">{() => { window.location.replace("/social"); return null; }}</Route>
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
          <WorkspaceProvider>
            <CommandPalette>
              <Router />
            </CommandPalette>
          </WorkspaceProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
