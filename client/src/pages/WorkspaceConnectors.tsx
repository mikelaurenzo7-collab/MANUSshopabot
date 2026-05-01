/**
 * WorkspaceConnectors — per-store connectors view.
 *
 * Wraps the existing Storefronts shell (which already mounts the
 * Connections / Capabilities / Plugins / Supplier POs / Tools tabs)
 * inside the workspace chrome so each store gets its own connector
 * surface. The inner tab strip stays — it's the right grain for the
 * connector taxonomy.
 */
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

const StorefrontsPage = lazy(() => import("./Storefronts"));

export default function WorkspaceConnectors() {
  return (
    <WorkspaceShell activeTab="connectors">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-white/40" />
          </div>
        }
      >
        <StorefrontsPage />
      </Suspense>
    </WorkspaceShell>
  );
}
