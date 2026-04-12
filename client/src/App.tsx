import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
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

function Router() {
  return (
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
