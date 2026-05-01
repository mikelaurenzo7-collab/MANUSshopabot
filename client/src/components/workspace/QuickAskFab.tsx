/**
 * QuickAskFab — floating "ask the bot" pill that follows the operator
 * across every workspace surface.
 *
 * The product idea: when you're inside a store's workspace and a thought
 * crosses your mind ("hey, how are my abandoned-cart numbers?"), you
 * shouldn't have to navigate to chat first. The FAB is a persistent
 * pill in the bottom-right that expands into a small prompt input;
 * pressing Enter or clicking Send routes to the workspace's chat with
 * the prompt pre-filled (sessionStorage `cp-prefill`, the same
 * mechanism the CommandPalette already uses).
 *
 * Hidden when the operator is already on the chat tab — the surface is
 * the chat input itself there, no need for the duplicate.
 *
 * Honors keyboard: `/` from anywhere outside an input opens the FAB
 * with focus, mirroring GitHub's search UX.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Sparkles, X, ArrowRight } from "lucide-react";
import {
  useWorkspacePersona,
  resolvePersonaName,
  resolvePersonaEmoji,
} from "@/hooks/useWorkspacePersona";

interface QuickAskFabProps {
  storeId: number | null;
}

export function QuickAskFab({ storeId }: QuickAskFabProps) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { persona } = useWorkspacePersona(storeId);
  const personaName = resolvePersonaName(persona);
  const personaEmoji = resolvePersonaEmoji(persona);

  // Global "/" shortcut to open the FAB with focus — mirrors GitHub's
  // search UX. Only fires outside of inputs/textareas/contenteditable
  // so typing in any field is unaffected.
  useEffect(() => {
    if (!storeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [storeId]);

  // Auto-focus the textarea when opening so the operator can type
  // immediately. Use a microtask delay so the popover is mounted first.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Esc closes the popover from anywhere when it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || !storeId) return;
    // Reuse the existing prefill bus that Chat.tsx already drains on
    // mount via sessionStorage["cp-prefill"]. No new wiring needed.
    sessionStorage.setItem("cp-prefill", trimmed);
    setOpen(false);
    setValue("");
    setLocation(`/store/${storeId}/chat`);
  };

  if (!storeId) return null;

  return (
    <>
      {/* Floating trigger pill — anchored bottom-right, lifted above the
          mobile bottom nav (~64px + safe-area) so it never overlaps
          system chrome on phones. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Ask ${personaName} something quickly`}
          aria-keyshortcuts="/"
          className="fixed z-30 bottom-[calc(76px+env(safe-area-inset-bottom))] right-3 sm:bottom-4 sm:right-5 inline-flex items-center gap-2 rounded-full px-3.5 py-2 border border-sky-400/30 bg-gradient-to-r from-sky-500/15 to-cyan-500/10 backdrop-blur-md shadow-[0_8px_28px_-8px_rgba(14,165,233,0.45)] hover:from-sky-500/25 hover:to-cyan-500/15 hover:border-sky-300/45 hover:translate-y-[-1px] transition-all group"
        >
          <span className="text-base leading-none" aria-hidden="true">
            {personaEmoji}
          </span>
          <span className="text-[12px] font-semibold text-sky-100 hidden sm:inline">
            Ask {personaName}
          </span>
          <span className="hidden sm:inline-flex items-center justify-center text-[9px] font-mono font-bold tracking-widest text-sky-200/65 border border-sky-300/30 rounded px-1 py-0.5">
            /
          </span>
        </button>
      )}

      {/* Popover — small inline panel with a textarea + submit. */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Quick ask ${personaName}`}
          className="fixed z-40 bottom-[calc(76px+env(safe-area-inset-bottom))] right-3 sm:bottom-4 sm:right-5 w-[min(360px,calc(100vw-1.5rem))] rounded-xl border border-white/[0.10] bg-[#0a0a0f]/98 shadow-[0_24px_64px_rgba(0,0,0,0.6)] backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200"
        >
          <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-base leading-none shrink-0" aria-hidden="true">
                {personaEmoji}
              </span>
              <p className="text-[12px] font-semibold text-white/85 truncate">
                Ask {personaName}
              </p>
              <Sparkles className="w-3 h-3 text-sky-300 shrink-0" />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close quick ask"
              className="w-6 h-6 rounded text-white/55 hover:text-white/90 hover:bg-white/[0.06] flex items-center justify-center transition-colors"
              data-tap-compact="true"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={`Ask ${personaName}…  (Enter to send, Shift+Enter for newline)`}
            rows={3}
            maxLength={2000}
            aria-label={`Prompt for ${personaName}`}
            className="w-full bg-transparent border-0 px-3 py-2 text-[13px] text-white/90 placeholder:text-white/35 focus:outline-none resize-none"
          />
          <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1 border-t border-white/[0.05]">
            <span className="text-[10px] font-mono text-white/35">
              {value.length} / 2000
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={!value.trim()}
              className="inline-flex items-center gap-1.5 rounded-md border border-sky-400/35 bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold text-sky-100 hover:bg-sky-500/25 hover:border-sky-300/55 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Send <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
