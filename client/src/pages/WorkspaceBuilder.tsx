/**
 * WorkspaceBuilder — workflow builder scoped to the active store workspace.
 */
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

const WorkflowBuilderPage = lazy(() => import("./WorkflowBuilder"));

export default function WorkspaceBuilder() {
  return (
    <WorkspaceShell activeTab="builder">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-white/40" />
          </div>
        }
      >
        <WorkflowBuilderPage />
      </Suspense>
    </WorkspaceShell>
  );
}
