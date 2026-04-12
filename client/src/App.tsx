import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import ArchitectPage from "./pages/Architect";
import MerchantPage from "./pages/Merchant";
import HypeManPage from "./pages/HypeMan";
import ActivityPage from "./pages/Activity";
import AnalyticsPage from "./pages/Analytics";
import ConfigPage from "./pages/Config";
import IntegrationsPage from "./pages/Integrations";
import WorkflowsPage from "./pages/Workflows";
import OnboardingPage from "./pages/Onboarding";
import LandingPage from "./pages/Landing";
import { useAuth } from "./_core/hooks/useAuth";

function OnboardingGuard() {
  const [location, setLocation] = useLocation();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) return; // Not logged in — auth handles redirect
    if (location === "/onboarding") return; // Already on onboarding
    // Check if user has completed onboarding
    // Support both old key (shopbot_onboarded) and new key (shopbots_onboarded) for backward compatibility
    const hasOnboarded = localStorage.getItem("shopbots_onboarded") || localStorage.getItem("shopbot_onboarded");
    if (!hasOnboarded) {
      setLocation("/onboarding");
    }
  }, [user, loading, location, setLocation]);

  return null;
}

function Router() {
  return (
    <Switch>
      {/* Public marketing landing page */}
      <Route path="/landing" component={LandingPage} />
      {/* Onboarding is full-screen, outside DashboardLayout */}
      <Route path="/onboarding" component={OnboardingPage} />
      <Route>
        <>
          <OnboardingGuard />
          <DashboardLayout>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/architect" component={ArchitectPage} />
              <Route path="/merchant" component={MerchantPage} />
              <Route path="/hypeman" component={HypeManPage} />
              <Route path="/activity" component={ActivityPage} />
              <Route path="/analytics" component={AnalyticsPage} />
              <Route path="/integrations" component={IntegrationsPage} />
              <Route path="/workflows" component={WorkflowsPage} />
              <Route path="/config" component={ConfigPage} />
              <Route path="/404" component={NotFound} />
              <Route component={NotFound} />
            </Switch>
          </DashboardLayout>
        </>
      </Route>
    </Switch>
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
