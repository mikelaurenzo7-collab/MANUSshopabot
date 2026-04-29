/**
 * WorkspaceContext — active store/workspace shared across the dashboard.
 *
 * Pages can opt into the active store ID to scope queries; the
 * sidebar surfaces it as a switcher pill. Persisted in localStorage so
 * the choice survives reloads.
 *
 * On mount we validate the persisted ID against the real store list so
 * stale IDs (from deleted stores) never cause "Store not found" errors.
 */

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

const STORAGE_KEY = "shop_a_bot_active_store_id";

interface WorkspaceContextValue {
  activeStoreId: number | null;
  setActiveStoreId: (id: number | null) => void;
  /** True while we're still validating the persisted ID against real stores */
  isValidating: boolean;
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
  const [isValidating, setIsValidating] = useState(true);

  // Fetch the real store list to validate the persisted ID
  const { data: stores } = trpc.stores.list.useQuery(undefined, {
    staleTime: 30_000,
    retry: false,
  });

  // Once stores are loaded, validate and auto-correct the active store ID
  useEffect(() => {
    if (stores === undefined) return; // still loading

    setIsValidating(false);

    if (stores.length === 0) {
      // No stores at all — clear any stale ID
      setActiveStoreIdState(null);
      return;
    }

    const validIds = new Set(stores.map((s) => s.id));

    if (activeStoreId !== null && validIds.has(activeStoreId)) {
      // Current ID is valid — keep it
      return;
    }

    // Persisted ID is stale or null — auto-select the first store
    setActiveStoreIdState(stores[0].id);
  }, [stores]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to localStorage whenever the active ID changes
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
    <WorkspaceContext.Provider value={{ activeStoreId, setActiveStoreId, isValidating }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    // Fall back to a no-op when used outside a provider (e.g. in tests),
    // so consumers don't need to wrap every render.
    return { activeStoreId: null, setActiveStoreId: () => {}, isValidating: false };
  }
  return ctx;
}
