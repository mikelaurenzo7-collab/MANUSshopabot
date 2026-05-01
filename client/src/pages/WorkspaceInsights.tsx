/**
 * WorkspaceInsights — store-scoped analytics inside the workspace shell.
 *
 * Wraps the existing Insights page. Insights' inner tabs (My Stores /
 * Campaigns / Cross-Store) already key off `WorkspaceContext.activeStoreId`
 * for the per-store views — the shell wires the URL :storeId into
 * context for us, so the inner page automatically focuses on this store.
 */
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

const InsightsPage = lazy(() => import("./Insights"));

export default function WorkspaceInsights() {
  return (
    <WorkspaceShell activeTab="insights">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-white/40" />
          </div>
        }
      >
        <InsightsPage />
      </Suspense>
    </WorkspaceShell>
  );
}
