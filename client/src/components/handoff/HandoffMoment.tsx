/**
 * HandoffMoment — the Builder→Merchant celebration.
 *
 * The most emotional UI surface in the product. Shown once per store, when
 * the Builder has finished its job and the Merchant takes over. Treats the
 * moment with care: no small print, no upsell, no friction. Just an honest
 * beat that says "you graduated".
 */

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Bot, Package, ArrowRight, CheckCircle2, Sparkles, X, KeyRound, Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HANDOFF_NARRATIVE } from "@shared/bots";

interface HandoffMomentProps {
  storeId: number;
  storeName: string;
  /** Called after the user acknowledges the handoff, with the new stage. */
  onComplete?: () => void;
  /** Called if the user chooses to stay in builder mode. */
  onDefer?: () => void;
}

export function HandoffMoment({ storeId, storeName, onComplete, onDefer }: HandoffMomentProps) {
  const [closing, setClosing] = useState(false);
  const [enter, setEnter] = useState(false);
  const utils = trpc.useUtils();

  useEffect(() => {
    // Trigger the entrance animation a tick after mount so transitions fire.
    const t = window.setTimeout(() => setEnter(true), 20);
    return () => window.clearTimeout(t);
  }, []);

  const acknowledge = trpc.lifecycle.acknowledgeHandoff.useMutation({
    onSuccess: async () => {
      toast.success("The Merchant has the keys.", {
        description: `${storeName} is now in operating mode.`,
        icon: <Package className="w-4 h-4" />,
      });
      await Promise.all([
        utils.lifecycle.get.invalidate({ storeId }),
        utils.lifecycle.listAll.invalidate(),
        utils.dashboard.invalidate?.(),
        utils.stores.list.invalidate?.(),
      ].filter(Boolean));
      handleClose(() => onComplete?.());
    },
    onError: (err) => toast.error(err.message),
  });

  const handleClose = (after?: () => void) => {
    setClosing(true);
    window.setTimeout(() => after?.(), 250);
  };

  const accept = () => acknowledge.mutate({ storeId });
  const defer = () => handleClose(() => onDefer?.());

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-title"
      className={`
        fixed inset-0 z-[80] flex items-center justify-center px-4
        transition-opacity duration-300
        ${closing || !enter ? "opacity-0" : "opacity-100"}
      `}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={defer}
        aria-hidden
      />

      {/* Aurora glow behind the card */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[640px] rounded-full bg-sky-500/15 blur-[120px]" />
        <div className="absolute top-1/3 right-1/4 w-[420px] h-[420px] rounded-full bg-cyan-400/15 blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[420px] h-[420px] rounded-full bg-violet-500/10 blur-[120px]" />
      </div>

      {/* Card */}
      <div
        className={`
          relative w-full max-w-2xl
          rounded-3xl border border-white/[0.08]
          bg-gradient-to-b from-[#0b0d12]/95 to-[#050608]/95
          shadow-[0_30px_120px_-20px_rgba(56,189,248,0.45)]
          overflow-hidden
          transition-all duration-500
          ${closing ? "scale-95 opacity-0" : enter ? "scale-100 opacity-100" : "scale-95 opacity-0"}
        `}
      >
        {/* Top gradient rule */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/60 to-transparent" />

        {/* Close */}
        <button
          onClick={defer}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8 sm:p-10">
          {/* Eyebrow */}
          <div className="flex items-center gap-2 mb-5">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-400 bg-sky-500/10 border border-sky-400/20 px-2.5 py-1 rounded-full">
              <Sparkles className="w-2.5 h-2.5" />
              {HANDOFF_NARRATIVE.eyebrow}
            </span>
            <span className="text-xs text-white/35">{storeName}</span>
          </div>

          {/* Title */}
          <h2 id="handoff-title" className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-[1.05]">
            {HANDOFF_NARRATIVE.title}
          </h2>
          <p className="mt-2 text-2xl sm:text-3xl font-black tracking-tight bg-gradient-to-r from-sky-300 to-cyan-300 bg-clip-text text-transparent leading-[1.1]">
            {HANDOFF_NARRATIVE.subtitle}
          </p>

          {/* Body */}
          <p className="mt-5 text-sm sm:text-base text-white/60 leading-relaxed max-w-xl">
            {HANDOFF_NARRATIVE.body}
          </p>

          {/* The handover visualization */}
          <div className="mt-8 grid sm:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
            <BotPanel
              tone="dim"
              icon={<Bot className="w-5 h-5 text-sky-400" />}
              title="The Builder"
              subtitle="Setup complete"
              accent="sky"
              footerLabel="Stays on call for"
              items={HANDOFF_NARRATIVE.builderRemains}
            />
            <div className="hidden sm:flex flex-col items-center justify-center gap-2 px-2">
              <KeyRound className="w-5 h-5 text-amber-300/80 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" />
              <ArrowRight className="w-4 h-4 text-white/30" />
            </div>
            <BotPanel
              tone="bright"
              icon={<Package className="w-5 h-5 text-cyan-300" />}
              title="The Merchant"
              subtitle="Taking the wheel"
              accent="cyan"
              footerLabel="Takes over"
              items={HANDOFF_NARRATIVE.merchantTakesOver}
            />
          </div>

          {/* Social Bot side note */}
          <div className="mt-5 flex items-center gap-2 text-xs text-white/45">
            <Megaphone className="w-3.5 h-3.5 text-orange-400/80" />
            <span>And the Social Bot starts pulling demand the moment you accept.</span>
          </div>

          {/* CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row gap-2">
            <Button
              onClick={accept}
              disabled={acknowledge.isPending}
              className="flex-1 h-11 text-sm font-semibold bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white shadow-lg shadow-sky-500/30"
            >
              {acknowledge.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Handing over the keys…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  {HANDOFF_NARRATIVE.primaryCta}
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
            <Button
              onClick={defer}
              variant="ghost"
              className="flex-1 sm:flex-none h-11 text-sm text-white/60 hover:text-white hover:bg-white/[0.06]"
            >
              {HANDOFF_NARRATIVE.secondaryCta}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BotPanel({
  tone,
  icon,
  title,
  subtitle,
  accent,
  footerLabel,
  items,
}: {
  tone: "dim" | "bright";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: "sky" | "cyan";
  footerLabel: string;
  items: ReadonlyArray<string>;
}) {
  const accentBorder = accent === "sky" ? "border-sky-500/30" : "border-cyan-400/30";
  const accentGlow = accent === "sky" ? "shadow-sky-500/10" : "shadow-cyan-500/10";
  const dim = tone === "dim";
  return (
    <div
      className={`
        relative rounded-2xl border ${accentBorder} bg-white/[0.03] p-4
        ${dim ? "" : `shadow-lg ${accentGlow}`}
      `}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center ${dim ? "opacity-70" : ""}`}>
          {icon}
        </div>
        <div>
          <div className={`text-sm font-bold ${dim ? "text-white/70" : "text-white"}`}>{title}</div>
          <div className={`text-[11px] ${dim ? "text-white/35" : "text-cyan-300/80"}`}>{subtitle}</div>
        </div>
      </div>
      <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">{footerLabel}</p>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it} className={`flex items-center gap-2 text-xs ${dim ? "text-white/55" : "text-white/80"}`}>
            <CheckCircle2 className={`w-3 h-3 ${dim ? "text-white/30" : "text-emerald-400"}`} />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Compact lifecycle pill — used in dashboard headers and bot pages so users
 * always know which phase they're in.
 */
export function LifecycleBadge({
  stage,
  className = "",
}: {
  stage: "building" | "transitioning" | "operating";
  className?: string;
}) {
  const cfg = useMemo(() => {
    switch (stage) {
      case "building":
        return { label: "Building", color: "text-sky-400", border: "border-sky-500/30", bg: "bg-sky-500/10", icon: Bot };
      case "transitioning":
        return { label: "Launch Day", color: "text-amber-300", border: "border-amber-400/30", bg: "bg-amber-400/10", icon: KeyRound };
      case "operating":
        return { label: "Operating", color: "text-cyan-300", border: "border-cyan-400/30", bg: "bg-cyan-400/10", icon: Package };
    }
  }, [stage]);
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${cfg.border} ${cfg.bg} ${cfg.color} ${className}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}
