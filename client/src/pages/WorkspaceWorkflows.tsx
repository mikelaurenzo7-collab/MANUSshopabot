/**
 * WorkspaceWorkflows — per-store workflows inside the workspace shell.
 *
 * The Workflows page already pulls the active store id out of context;
 * the shell wires URL → context for us so the existing component
 * automatically renders only this store's workflow rows.
 */
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

const WorkflowsPage = lazy(() => import("./Workflows"));

export default function WorkspaceWorkflows() {
  return (
    <WorkspaceShell activeTab="workflows">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-white/40" />
          </div>
        }
      >
        <WorkflowsPage />
      </Suspense>
    </WorkspaceShell>
  );
}
