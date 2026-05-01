import { trpc } from "@/lib/trpc";
import { installGlobalErrorHandlers, installWebVitalsReporter } from "@/lib/clientObservability";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { readActiveOrgIdFromStorage } from "./contexts/OrgContext";
import "./index.css";

const queryClient = new QueryClient();
const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT as string | undefined;
const analyticsWebsiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID as string | undefined;

function mountAnalyticsScript() {
  if (typeof document === "undefined") return;
  if (!analyticsEndpoint || !analyticsWebsiteId) return;

  const existingScript = document.querySelector<HTMLScriptElement>(
    `script[data-website-id="${analyticsWebsiteId}"]`
  );
  if (existingScript) return;

  const script = document.createElement("script");
  script.defer = true;
  script.src = `${analyticsEndpoint.replace(/\/$/, "")}/umami`;
  script.setAttribute("data-website-id", analyticsWebsiteId);
  document.head.appendChild(script);
}

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      // Attach the active org id (if any) on every request. The server
      // verifies membership and falls back to the user's currentOrgId
      // if this header is absent or stale.
      headers() {
        const orgId = readActiveOrgIdFromStorage();
        return orgId != null ? { "X-Org-Id": String(orgId) } : {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

mountAnalyticsScript();

// Observability — wire BEFORE rendering so a synchronous mount-time
// crash inside <App /> still reaches /api/client-errors via the
// `window.onerror` listener that `installGlobalErrorHandlers` registers.
// Vitals collection installs PerformanceObservers immediately; it
// doesn't depend on the React tree being up.
installGlobalErrorHandlers();
installWebVitalsReporter();

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
