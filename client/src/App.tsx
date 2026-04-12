import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import { useEffect, lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
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
const WorkflowsPage = lazy(() => import("./pages/Workflows"));
const OnboardingPage = lazy(() => import("./pages/Onboarding"));
const LandingPage = lazy(() => import("./pages/Landing"));
const PlatformHealthPage = lazy(() => import("./pages/PlatformHealth"));
const IntelligencePage = lazy(() => import("./pages/Intelligence"));
const NotFound = lazy(() => import("./pages/NotFound"));
const OrchestratorGraphPage = lazy(() => import("./pages/OrchestratorGraph"));
const PluginStorePage = lazy(() => import("./pages/PluginStore"));
const SupplierPOsPage = lazy(() => import("./pages/SupplierPOs"));
const PromptLabPage = lazy(() => import("./pages/PromptLab"));
const ProfilePage = lazy(() => import("./pages/Profile"));

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
    const hasOnboarded = localStorage.getItem("beastbots_onboarded") || localStorage.getItem("shopbots_onboarded") || localStorage.getItem("shopbot_onboarded");
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
                <Switch>
                  <Route path="/" component={Home} />
                  <Route path="/architect" component={ArchitectPage} />
                  <Route path="/merchant" component={MerchantPage} />
                  <Route path="/social" component={SocialPage} />
                  <Route path="/activity" component={ActivityPage} />
                  <Route path="/analytics" component={AnalyticsPage} />
                  <Route path="/integrations" component={IntegrationsPage} />
                  <Route path="/workflows" component={WorkflowsPage} />
                  <Route path="/health" component={PlatformHealthPage} />
                  <Route path="/intelligence" component={IntelligencePage} />
                  <Route path="/config" component={ConfigPage} />
                  <Route path="/orchestrator" component={OrchestratorGraphPage} />
                  <Route path="/plugins" component={PluginStorePage} />
                  <Route path="/supplier" component={SupplierPOsPage} />
                  <Route path="/prompt-lab" component={PromptLabPage} />
                  <Route path="/profile" component={ProfilePage} />
                  <Route path="/404" component={NotFound} />
                  <Route component={NotFound} />
                </Switch>
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
