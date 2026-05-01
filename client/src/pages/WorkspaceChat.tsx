/**
 * WorkspaceChat — per-store chat surface inside the workspace shell.
 *
 * Reuses the existing `<Chat />` page so all the work that's gone into
 * the chat experience (templates, voice input, results sheet, etc.)
 * keeps shipping. The shell wraps it with the platform-tinted header
 * + workspace sub-nav so the operator never loses context about which
 * store's bot they're talking to.
 *
 * The shell auto-syncs URL `:storeId` → `WorkspaceContext.activeStoreId`,
 * which the existing Chat page already reads to scope its workflow + chat
 * history. No changes to the Chat page itself.
 */
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { WorkspaceShell, useWorkspaceStore } from "@/components/workspace/WorkspaceShell";

const ChatPage = lazy(() => import("./Chat"));

export default function WorkspaceChat() {
  // Touch the hook so the URL :storeId is parsed and synced; the Chat
  // page itself reads `useWorkspace().activeStoreId` and the shell wires
  // those together.
  useWorkspaceStore();
  return (
    <WorkspaceShell activeTab="chat">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-white/40" />
          </div>
        }
      >
        <ChatPage />
      </Suspense>
    </WorkspaceShell>
  );
}
