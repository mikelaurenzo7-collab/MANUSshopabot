/**
 * WorkspaceContext — active store/workspace shared across the dashboard.
 *
 * Pages can opt into the active store ID to scope queries; the
 * sidebar surfaces it as a switcher pill. Persisted in localStorage so
 * the choice survives reloads.
 */

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "shop_a_bot_active_store_id";

interface WorkspaceContextValue {
  activeStoreId: number | null;
  setActiveStoreId: (id: number | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

function readInitial(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeStoreId, setActiveStoreIdState] = useState<number | null>(readInitial);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (activeStoreId == null) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, String(activeStoreId));
      }
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  }, [activeStoreId]);

  const setActiveStoreId = useCallback((id: number | null) => {
    setActiveStoreIdState(id);
  }, []);

  return (
    <WorkspaceContext.Provider value={{ activeStoreId, setActiveStoreId }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    // Fall back to a no-op when used outside a provider (e.g. in tests),
    // so consumers don't need to wrap every render.
    return { activeStoreId: null, setActiveStoreId: () => {} };
  }
  return ctx;
}
