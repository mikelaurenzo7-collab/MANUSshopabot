/**
 * BotOperatingAcross — small but high-leverage strip that shows every
 * platform the bot is currently driving on the active org. Sits at the
 * top of the Architect / Merchant / Social pages so the operator can
 * see, at a glance, where the bot's reach extends without scrolling.
 *
 * Reads `connectors.connectionSummary` and `connectors.listCredentials`
 * + `listSocialAccounts` (already cached by other surfaces) and renders
 * a row of brand-colored chips. Connected platforms get a pulsing live
 * dot, disconnected platforms aren't shown — this is a celebration
 * surface, not a sales pitch.
 *
 * The strip is intentionally narrow (single row, 28px chips) so it
 * doesn't compete with the bot's primary controls. The brand pulse +
 * brand-colored ring give it weight without taking real estate.
 */
import { trpc } from "@/lib/trpc";
import { getBrand } from "@/lib/platformBrand";
import { Link } from "wouter";
import { Plus, Sparkles } from "lucide-react";

type BotId = "architect" | "merchant" | "social";

const BOT_ACCENT: Record<BotId, { ring: string; text: string }> = {
  architect: { ring: "rgba(14, 165, 233, 0.3)", text: "text-sky-300" },
  merchant: { ring: "rgba(34, 211, 238, 0.3)", text: "text-cyan-300" },
  social: { ring: "rgba(251, 146, 60, 0.3)", text: "text-orange-300" },
};

export function BotOperatingAcross({ botId }: { botId: BotId }) {
  const { data: stores } = trpc.stores.list.useQuery();
  const { data: socialAccounts } = trpc.connectors.listSocialAccounts.useQuery();

  const accent = BOT_ACCENT[botId];

  // Architect + Merchant care about commerce surfaces; Social cares about
  // social channels. The bots all drive everything in the engine, but
  // the strip optimizes for the dominant surface so the chips stay
  // legible at a glance.
  const ecomChips = (stores ?? []).map((s: any) => {
    const brand = getBrand(s.platform);
    return { id: `store-${s.id}`, brand, label: s.name, type: "store" as const };
  });
  const socialChips = (socialAccounts ?? []).map((a: any) => {
    const brand = getBrand(a.platform);
    return {
      id: `social-${a.id}`,
      brand,
      label: a.accountName || brand.name,
      type: "social" as const,
    };
  });

  const chips =
    botId === "social" ? [...socialChips, ...ecomChips] : [...ecomChips, ...socialChips];

  if (chips.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02]">
        <div className="flex items-center gap-2 text-xs text-white/55">
          <Sparkles className={`w-3.5 h-3.5 ${accent.text}`} />
          <span>Bot is on standby — connect a platform to give it a stage.</span>
        </div>
        <Link
          href="/storefronts#integrations"
          className={`inline-flex items-center gap-1 text-[11px] font-semibold ${accent.text} hover:opacity-80 transition-opacity`}
        >
          <Plus className="w-3 h-3" /> Connect
        </Link>
      </div>
    );
  }

  return (
    <div
      className="relative flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden"
      style={{ boxShadow: `inset 0 0 0 1px ${accent.ring}` }}
    >
      <span className={`text-[10px] uppercase tracking-widest font-bold ${accent.text} shrink-0`}>
        Operating across
      </span>
      <span className="text-[10px] font-mono text-white/55 shrink-0">
        {chips.length} surface{chips.length === 1 ? "" : "s"}
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {chips.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-[11px] text-white/85 shrink-0 transition-colors hover:bg-white/[0.07]"
            style={{ boxShadow: `0 0 0 1px ${c.brand.color}30 inset` }}
            title={`${c.brand.name} · ${c.brand.tagline}`}
          >
            <span className="text-sm leading-none">{c.brand.icon}</span>
            <span className="truncate max-w-[100px]">{c.label}</span>
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: c.brand.color,
                boxShadow: `0 0 6px ${c.brand.color}`,
                animation: "tile-status-pulse 1.8s ease-out infinite",
              }}
            />
          </span>
        ))}
      </div>
      <Link
        href="/storefronts#integrations"
        className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold ${accent.text} hover:opacity-80 transition-opacity`}
      >
        <Plus className="w-3 h-3" /> Add
      </Link>
    </div>
  );
}
