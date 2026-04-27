/**
 * OrgContext — active organization for the authenticated session.
 *
 * Backed by localStorage so the user's choice survives reloads and is
 * read synchronously by the tRPC link (so it can attach the
 * `X-Org-Id` header on the very first request after a hard refresh).
 *
 * The context fetches the user's orgs and self-heals if the persisted
 * id is invalid (e.g., the user lost membership). When the active org
 * changes, react-query is fully invalidated so all org-scoped data
 * refetches under the new tenant.
 */

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";

const STORAGE_KEY = "shop_a_bot_active_org_id";

export type OrgRole = "owner" | "admin" | "member";

export interface OrgSummary {
  id: number;
  name: string;
  slug: string;
  kind: "personal" | "team";
  role: OrgRole;
}

interface OrgContextValue {
  /** All orgs the user is a member of. Empty before the first fetch. */
  orgs: OrgSummary[];
  /** The currently active org, or null while loading. */
  activeOrg: OrgSummary | null;
  /** Switch to a different org. Verifies membership server-side. */
  setActiveOrg: (orgId: number) => Promise<void>;
  /** Create a new "team" org and switch into it. */
  createOrg: (name: string) => Promise<OrgSummary>;
  /** True while the orgs list is loading or being switched. */
  loading: boolean;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

/**
 * Read the persisted active org id synchronously. Used by the tRPC
 * httpBatchLink fetcher in `main.tsx` to attach `X-Org-Id` on every
 * request without going through React state.
 */
export function readActiveOrgIdFromStorage(): number | null {
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

function writeActiveOrgIdToStorage(orgId: number | null) {
  if (typeof window === "undefined") return;
  try {
    if (orgId == null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, String(orgId));
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  const [persistedId, setPersistedId] = useState<number | null>(readActiveOrgIdFromStorage);
  const [switching, setSwitching] = useState(false);

  const orgsQuery = trpc.orgs.list.useQuery(undefined, {
    // Only run when the user is authenticated; the server will throw
    // otherwise. We use refetchOnMount so a fresh login picks up new
    // memberships without a full reload.
    refetchOnMount: true,
    retry: false,
  });

  const setActiveMutation = trpc.orgs.setActive.useMutation();
  const createMutation = trpc.orgs.create.useMutation();

  const orgs: OrgSummary[] = useMemo(() => {
    if (!orgsQuery.data) return [];
    return orgsQuery.data.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      kind: o.kind,
      role: o.role,
    }));
  }, [orgsQuery.data]);

  // Self-heal: if the persisted id isn't in the user's memberships,
  // pick the first available org instead.
  useEffect(() => {
    if (orgs.length === 0) return;
    const valid = persistedId != null && orgs.some((o) => o.id === persistedId);
    if (!valid) {
      const fallback = orgs[0]!;
      setPersistedId(fallback.id);
      writeActiveOrgIdToStorage(fallback.id);
    }
  }, [orgs, persistedId]);

  const activeOrg = useMemo(() => {
    if (!persistedId) return orgs[0] ?? null;
    return orgs.find((o) => o.id === persistedId) ?? orgs[0] ?? null;
  }, [orgs, persistedId]);

  const setActiveOrg = useCallback(
    async (orgId: number) => {
      if (orgId === persistedId) return;
      setSwitching(true);
      try {
        // Persist locally FIRST so any in-flight or follow-up request
        // attaches the new X-Org-Id.
        writeActiveOrgIdToStorage(orgId);
        setPersistedId(orgId);
        // Tell the server about the switch so currentOrgId sticks
        // across browsers / devices.
        await setActiveMutation.mutateAsync({ orgId });
        // Wipe ALL react-query cache — every org-scoped query needs to
        // refetch under the new tenant. Cheaper than tracking which
        // queries are org-scoped.
        await queryClient.invalidateQueries();
        await utils.orgs.list.invalidate();
      } catch (err) {
        // Roll back local state if the server rejected the switch
        const previousValid = orgs.find((o) => o.id === persistedId);
        writeActiveOrgIdToStorage(previousValid?.id ?? null);
        setPersistedId(previousValid?.id ?? null);
        throw err;
      } finally {
        setSwitching(false);
      }
    },
    [persistedId, setActiveMutation, queryClient, utils, orgs],
  );

  const createOrg = useCallback(
    async (name: string): Promise<OrgSummary> => {
      const created = await createMutation.mutateAsync({ name });
      writeActiveOrgIdToStorage(created.id);
      setPersistedId(created.id);
      await utils.orgs.list.invalidate();
      await queryClient.invalidateQueries();
      return {
        id: created.id,
        name: created.name,
        slug: created.slug,
        kind: created.kind,
        role: "owner",
      };
    },
    [createMutation, utils, queryClient],
  );

  const value: OrgContextValue = {
    orgs,
    activeOrg,
    setActiveOrg,
    createOrg,
    loading: orgsQuery.isLoading || switching,
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    // Fall back to a no-op outside a provider (e.g. tests).
    return {
      orgs: [],
      activeOrg: null,
      setActiveOrg: async () => {},
      createOrg: async () => {
        throw new Error("OrgProvider not mounted");
      },
      loading: false,
    };
  }
  return ctx;
}
