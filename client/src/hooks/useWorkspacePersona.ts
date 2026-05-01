/**
 * Per-store bot persona — UI-level personalization for a workspace's
 * Store Bot identity (name + emoji avatar).
 *
 * Why localStorage and not a server column: extending the bot_profiles
 * schema would require a Drizzle migration, which complicates MANUS
 * sync. The persona here is UI flair (the name shows in chat bubble
 * avatars, the workspace shell, and the command palette) — it doesn't
 * change the bot's behavior. When operators want the bot to USE the
 * persona name in its replies, we can promote this to a server field
 * with a back-compat fallback.
 *
 * Storage shape:
 *   localStorage["workspace_persona:<storeId>"] = JSON.stringify({
 *     name: "Brewbot",
 *     emoji: "🍺",
 *   });
 *
 * Returns sensible defaults so every consumer can render unconditionally.
 */
import { useCallback, useEffect, useState } from "react";

export interface WorkspacePersona {
  /** Display name (e.g. "Brewbot"). Empty string when unset. */
  name: string;
  /** Single emoji avatar (e.g. "🍺"). Empty string when unset. */
  emoji: string;
}

const STORAGE_PREFIX = "workspace_persona:";

function storageKey(storeId: number | null | undefined): string | null {
  if (!storeId) return null;
  return `${STORAGE_PREFIX}${storeId}`;
}

function readPersona(storeId: number | null | undefined): WorkspacePersona {
  const key = storageKey(storeId);
  if (!key || typeof window === "undefined") return { name: "", emoji: "" };
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { name: "", emoji: "" };
    const parsed = JSON.parse(raw) as Partial<WorkspacePersona>;
    return {
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 40) : "",
      emoji: typeof parsed.emoji === "string" ? parsed.emoji.slice(0, 8) : "",
    };
  } catch {
    return { name: "", emoji: "" };
  }
}

function writePersona(storeId: number | null | undefined, value: WorkspacePersona): void {
  const key = storageKey(storeId);
  if (!key || typeof window === "undefined") return;
  try {
    if (!value.name && !value.emoji) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(
      key,
      JSON.stringify({
        name: value.name.slice(0, 40),
        emoji: value.emoji.slice(0, 8),
      }),
    );
  } catch {
    /* quota / privacy mode — best-effort */
  }
}

/**
 * React hook returning `{ persona, setPersona }` for the given store.
 *
 * Re-reads on storeId change so the same hook can be reused across
 * workspaces without remounting. `setPersona` persists to localStorage
 * and notifies other tabs via a synthetic `storage` event so a Mac
 * with two windows on the same workspace stays in sync.
 */
export function useWorkspacePersona(storeId: number | null | undefined): {
  persona: WorkspacePersona;
  setPersona: (next: WorkspacePersona) => void;
} {
  const [persona, setPersonaState] = useState<WorkspacePersona>(() => readPersona(storeId));

  useEffect(() => {
    setPersonaState(readPersona(storeId));
  }, [storeId]);

  // Cross-tab sync — the storage event fires in OTHER tabs when this
  // tab writes, so two windows on the same workspace stay aligned.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !e.key.startsWith(STORAGE_PREFIX)) return;
      const key = storageKey(storeId);
      if (e.key !== key) return;
      setPersonaState(readPersona(storeId));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storeId]);

  const setPersona = useCallback(
    (next: WorkspacePersona) => {
      writePersona(storeId, next);
      setPersonaState(next);
    },
    [storeId],
  );

  return { persona, setPersona };
}

/**
 * Resolve the operator-visible bot name for a workspace.
 * Falls back to the canonical "Store Bot" when nothing's set.
 */
export function resolvePersonaName(persona: WorkspacePersona): string {
  return persona.name.trim() || "Store Bot";
}

/**
 * Resolve the bot avatar emoji. Falls back to "🤖" so consumers can
 * always render an avatar regardless of personalization state.
 */
export function resolvePersonaEmoji(persona: WorkspacePersona): string {
  return persona.emoji.trim() || "🤖";
}
