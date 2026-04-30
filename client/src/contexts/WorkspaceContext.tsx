/**
 * WorkspaceContext — active workspace shared across the dashboard.
 *
 * Now workspace-aware: each store has its own workspace with isolated
 * chat, memory, settings, and integrations. Pages can opt into the active
 * workspace ID to scope queries. Persisted in localStorage so the choice
 * survives reloads.
 *
 * On mount we validate the persisted ID against the real workspace list so
 * stale IDs (from deleted workspaces) never cause errors.
 */

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

const STORAGE_KEY = "shop_a_bot_active_workspace_id";
// Keep legacy key for backwards compat during migration
const LEGACY_STORE_KEY = "shop_a_bot_active_store_id";

interface WorkspaceContextValue {
  /** Active workspace ID */
  activeWorkspaceId: number | null;
  setActiveWorkspaceId: (id: number | null) => void;
  /** Legacy: active store ID (derived from workspace.storeId) */
  activeStoreId: number | null;
  setActiveStoreId: (id: number | null) => void;
  /** True while we're still validating the persisted ID against real workspaces */
  isValidating: boolean;
  /** Currently active workspace object */
  activeWorkspace: any | null;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

function readInitial(): number | null {
  if (typeof window === "undefined") return null;
  try {
    // Try new workspace key first
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    // Fall back to legacy store key
    const legacyRaw = window.localStorage.getItem(LEGACY_STORE_KEY);
    if (legacyRaw) {
      const n = Number(legacyRaw);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<number | null>(readInitial);
  const [isValidating, setIsValidating] = useState(true);

  // Fetch the real workspace list to validate the persisted ID
  const { data: workspaces } = trpc.workspaces.list.useQuery(undefined, {
    staleTime: 30_000,
    retry: false,
  });

  // Once workspaces are loaded, validate and auto-correct the active workspace ID
  useEffect(() => {
    if (workspaces === undefined) return; // still loading

    setIsValidating(false);

    if (workspaces.length === 0) {
      // No workspaces at all — clear any stale ID
      setActiveWorkspaceIdState(null);
      return;
    }

    const validIds = new Set(workspaces.map((w) => w.id));

    if (activeWorkspaceId !== null && validIds.has(activeWorkspaceId)) {
      // Current ID is valid — keep it
      return;
    }

    // Persisted ID is stale or null — auto-select the first workspace
    setActiveWorkspaceIdState(workspaces[0].id);
  }, [workspaces]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to localStorage whenever the active ID changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (activeWorkspaceId == null) {
        window.localStorage.removeItem(STORAGE_KEY);
        // Clean up legacy key too
        window.localStorage.removeItem(LEGACY_STORE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, String(activeWorkspaceId));
      }
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  }, [activeWorkspaceId]);

  const setActiveWorkspaceId = useCallback((id: number | null) => {
    setActiveWorkspaceIdState(id);
  }, []);

  // Legacy support: setActiveStoreId finds the workspace for that store
  const setActiveStoreId = useCallback((storeId: number | null) => {
    if (!workspaces || storeId === null) {
      setActiveWorkspaceIdState(null);
      return;
    }
    const workspace = workspaces.find(w => w.storeId === storeId);
    if (workspace) {
      setActiveWorkspaceIdState(workspace.id);
    }
  }, [workspaces]);

  // Derive activeStoreId and activeWorkspace from activeWorkspaceId
  const activeWorkspace = workspaces?.find(w => w.id === activeWorkspaceId) ?? null;
  const activeStoreId = activeWorkspace?.storeId ?? null;

  return (
    <WorkspaceContext.Provider value={{ 
      activeWorkspaceId, 
      setActiveWorkspaceId,
      activeStoreId,
      setActiveStoreId,
      isValidating,
      activeWorkspace,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    // Fall back to a no-op when used outside a provider (e.g. in tests),
    // so consumers don't need to wrap every render.
    return { 
      activeWorkspaceId: null, 
      setActiveWorkspaceId: () => {},
      activeStoreId: null, 
      setActiveStoreId: () => {}, 
      isValidating: false,
      activeWorkspace: null,
    };
  }
  return ctx;
}
