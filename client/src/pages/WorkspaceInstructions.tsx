/**
 * WorkspaceInstructions — operator-editable bot instructions per store.
 *
 * Two surfaces here:
 *   1. **System prompt** — the canonical role description ("You are a
 *      Store Bot operating storeName, focused on …"). Updated rarely.
 *   2. **Custom instructions** — the operator's running notes for the
 *      bot ("Always reply in our brand voice", "Never approve >$500 ad
 *      spend without asking"). Updated often.
 *
 * Both fields persist via `botProfile.updateProfile`, the same mutation
 * used by Settings → Bot Settings. The shell scopes the agentType to
 * "architect" (the launch persona) since that's the canonical Store Bot
 * profile in the current schema.
 *
 * Saving is opt-in (explicit Save button) so a stray keystroke doesn't
 * commit unfinished thinking. The autonomy / approval-gate controls
 * are intentionally read-only here and link out to Settings → Bot
 * Settings, which owns those write controls.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { WorkspaceShell, useWorkspaceStore } from "@/components/workspace/WorkspaceShell";
import { Button } from "@/components/ui/button";
import { useWorkspacePersona } from "@/hooks/useWorkspacePersona";
import {
  ScrollText,
  Save,
  Loader2,
  ShieldCheck,
  Settings as SettingsIcon,
  Sparkles,
  Bot,
} from "lucide-react";

const SYSTEM_PROMPT_HINT =
  "Sets the bot's role + voice. Operators rarely change this — the default is tuned for e-commerce ops + growth.";
const CUSTOM_INSTRUCTIONS_HINT =
  "Your store's running rules for the bot — examples: 'Always sign emails as Aisha', 'Never approve ad spend > $500 without asking', 'Use UK English'. The bot reads this on every workflow.";

export default function WorkspaceInstructions() {
  const { storeId, store, brand } = useWorkspaceStore();
  const { persona, setPersona } = useWorkspacePersona(storeId);
  const [draftPersonaName, setDraftPersonaName] = useState(persona.name);
  const [draftPersonaEmoji, setDraftPersonaEmoji] = useState(persona.emoji);
  // Re-seed the draft when storeId changes (operator switched workspaces).
  useEffect(() => {
    setDraftPersonaName(persona.name);
    setDraftPersonaEmoji(persona.emoji);
  }, [storeId, persona.name, persona.emoji]);
  const personaDirty =
    draftPersonaName.trim() !== persona.name.trim() ||
    draftPersonaEmoji.trim() !== persona.emoji.trim();
  const onSavePersona = () => {
    setPersona({ name: draftPersonaName.trim(), emoji: draftPersonaEmoji.trim() });
    toast.success("Persona saved.");
  };

  const profileQuery = trpc.botProfile.getProfile.useQuery({ agentType: "architect" });
  const profile = profileQuery.data as {
    systemPrompt?: string | null;
    customInstructions?: string | null;
    autonomyLevel?: string | null;
    requiresApproval?: boolean | null;
  } | null;

  const [systemPrompt, setSystemPrompt] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [dirtySystem, setDirtySystem] = useState(false);
  const [dirtyCustom, setDirtyCustom] = useState(false);

  useEffect(() => {
    if (profile && !dirtySystem) setSystemPrompt(profile.systemPrompt ?? "");
  }, [profile, dirtySystem]);
  useEffect(() => {
    if (profile && !dirtyCustom) setCustomInstructions(profile.customInstructions ?? "");
  }, [profile, dirtyCustom]);

  const updateMutation = trpc.botProfile.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Instructions saved.");
      setDirtySystem(false);
      setDirtyCustom(false);
      void profileQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Could not save instructions.");
    },
  });

  const dirty = dirtySystem || dirtyCustom;

  const onSave = () => {
    if (!dirty) return;
    updateMutation.mutate({
      agentType: "architect",
      systemPrompt: dirtySystem ? systemPrompt : undefined,
      customInstructions: dirtyCustom ? customInstructions : undefined,
    });
  };

  const onReset = () => {
    setSystemPrompt(profile?.systemPrompt ?? "");
    setCustomInstructions(profile?.customInstructions ?? "");
    setDirtySystem(false);
    setDirtyCustom(false);
  };

  return (
    <WorkspaceShell activeTab="instructions">
      <div
        className="px-3 sm:px-4 md:px-6 py-4 sm:py-5 space-y-4 max-w-4xl"
        style={
          {
            "--brand": brand.color,
            "--brand-accent": brand.accent,
          } as React.CSSProperties
        }
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="flex items-center gap-2 text-[18px] font-heading font-bold text-white">
              <ScrollText className="w-4 h-4 text-sky-300" /> Instructions · {store?.name ?? "this store"}
            </h2>
            <p className="text-[12px] text-white/55 mt-0.5">
              The system prompt + running rules the Store Bot reads on every workflow in this store.
            </p>
          </div>
          {dirty && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
                className="h-8 text-[11px] text-white/55 hover:text-white"
              >
                Discard
              </Button>
              <Button
                size="sm"
                onClick={onSave}
                disabled={updateMutation.isPending}
                className="h-8 text-[11px] bg-sky-500 hover:bg-sky-400 text-white"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Save className="w-3 h-3 mr-1.5" /> Save changes
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* ── Bot persona — operator-facing personalization ──
            Each workspace's bot can have its own name + avatar emoji
            ("Brewbot", "🍺"). Stored locally per-store via
            `useWorkspacePersona`, surfaced in the shell header (small
            corner badge), the chat avatars, and the command palette.
            Optional — when unset, the workspace still uses the canonical
            "Store Bot" name + the platform glyph as the avatar. */}
        <section className="workspace-card">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="workspace-card-eyebrow">
              <Bot className="w-3 h-3" /> Bot persona
            </span>
            {personaDirty && (
              <Button
                size="sm"
                onClick={onSavePersona}
                className="h-7 text-[10px] bg-sky-500 hover:bg-sky-400 text-white"
              >
                <Save className="w-3 h-3 mr-1" /> Save persona
              </Button>
            )}
          </div>
          <p className="text-[11px] text-white/45 leading-relaxed mb-3">
            Give this workspace's Store Bot its own identity. Shows in chat avatars, the workspace
            mark, and the command palette. Optional — defaults to "Store Bot".
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex flex-col gap-1.5 min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/55">
                Avatar
              </span>
              <input
                type="text"
                value={draftPersonaEmoji}
                onChange={(e) => setDraftPersonaEmoji(e.target.value)}
                placeholder="🤖"
                maxLength={8}
                aria-label="Bot avatar emoji"
                className="w-16 h-10 text-center text-lg rounded-lg border border-white/[0.08] bg-page-canvas-elevated/60 focus:outline-none focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/15"
              />
            </label>
            <label className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/55">
                Name
              </span>
              <input
                type="text"
                value={draftPersonaName}
                onChange={(e) => setDraftPersonaName(e.target.value)}
                placeholder="Brewbot"
                maxLength={40}
                aria-label="Bot persona name"
                className="h-10 px-3 rounded-lg border border-white/[0.08] bg-page-canvas-elevated/60 text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/15"
              />
            </label>
          </div>
        </section>

        {/* System prompt */}
        <section className="workspace-card">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="workspace-card-eyebrow">
              <Sparkles className="w-3 h-3" /> System prompt
            </span>
            {profile?.systemPrompt && (
              <span className="text-[10px] font-mono text-white/35">
                {profile.systemPrompt.length} chars
              </span>
            )}
          </div>
          <p className="text-[11px] text-white/45 leading-relaxed mb-3">{SYSTEM_PROMPT_HINT}</p>
          <textarea
            value={systemPrompt}
            onChange={(e) => {
              setSystemPrompt(e.target.value);
              setDirtySystem(true);
            }}
            placeholder="You are an autonomous Store Bot operating an e-commerce business. Focus on long-term store health, margin protection, and operator trust…"
            rows={6}
            maxLength={5000}
            className="w-full rounded-lg border border-white/[0.08] bg-page-canvas-elevated/60 p-3 text-[12.5px] text-white/85 leading-relaxed font-mono placeholder:text-white/25 focus:outline-none focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/15 resize-y min-h-[120px]"
          />
        </section>

        {/* Custom instructions */}
        <section className="workspace-card">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="workspace-card-eyebrow">
              <ScrollText className="w-3 h-3" /> Running rules for this store
            </span>
            <span className="text-[10px] font-mono text-white/35">
              {customInstructions.length} / 5000
            </span>
          </div>
          <p className="text-[11px] text-white/45 leading-relaxed mb-3">{CUSTOM_INSTRUCTIONS_HINT}</p>
          <textarea
            value={customInstructions}
            onChange={(e) => {
              setCustomInstructions(e.target.value);
              setDirtyCustom(true);
            }}
            placeholder={`Examples:
- Always reply to customers in our brand voice (warm, witty, no exclamation points).
- Never approve ad spend over $500 without asking.
- Brand colors: #0EA5E9 (primary), #F97316 (accent). Keep ad creative in this palette.
- Do not source products under $10 retail — margins don't work for us.`}
            rows={10}
            maxLength={5000}
            className="w-full rounded-lg border border-white/[0.08] bg-page-canvas-elevated/60 p-3 text-[12.5px] text-white/85 leading-relaxed placeholder:text-white/25 focus:outline-none focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/15 resize-y min-h-[180px]"
          />
        </section>

        {/* Read-only autonomy summary + deep link */}
        <section
          className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4"
          aria-label="Bot autonomy"
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-amber-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="workspace-card-eyebrow">Autonomy + approval gates</p>
              <p className="text-[12px] text-white/65 mt-1 leading-relaxed">
                Current mode:{" "}
                <span className="text-white/90 font-semibold capitalize">
                  {(profile?.autonomyLevel ?? "supervised").replace(/_/g, " ")}
                </span>
                {profile?.requiresApproval ? " · approval required for high-stakes actions" : ""}
              </p>
              <Link
                href="/settings#bots"
                className="inline-flex items-center gap-1 mt-2 text-[11px] text-sky-300 hover:text-sky-200 transition-colors"
              >
                <SettingsIcon className="w-3 h-3" /> Change in Bot Settings
              </Link>
            </div>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
