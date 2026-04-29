/**
 * DailyBrief.tsx — the morning report.
 *
 * The single most important card on the Home dashboard: it answers
 * the question "what did the bots do while I was offline?" in one
 * glance. Pulls dashboard.dailyBrief and renders a three-column
 * spread (Builder · Merchant · Social) plus a commerce-velocity
 * footer with orders + revenue captured in the window.
 *
 * Auto-collapses to a single-line headline ("12 tasks · 7 orders ·
 * $1,243 in revenue overnight") when the user has acknowledged the
 * brief — sessionStorage flag, no server round-trip. Designed to
 * make the brand promise visible: every time the user opens the
 * app, they see the bots' overnight footprint immediately.
 */
import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { CountUp } from "@/components/CountUp";
import {
  Bot, Package, Megaphone, ChevronDown, ChevronRight, Sparkles,
  TrendingUp, ShoppingCart, ArrowUpRight, Sunrise,
} from "lucide-react";

type BotKey = "builder" | "merchant" | "social";

interface Highlight {
  id: number;
  title: string;
  taskType: string;
  storeId?: number | null;
  createdAt: string;
}

interface BotRollup {
  completedCount: number;
  failedCount: number;
  runningCount: number;
  highlights: Highlight[];
}

const BOT_META: Record<
  BotKey,
  { name: string; href: string; icon: typeof Bot; color: string; accent: string; rgb: string }
> = {
  builder: {
    name: "The Builder",
    href: "/architect",
    icon: Bot,
    color: "#38bdf8",
    accent: "#0ea5e9",
    rgb: "14, 165, 233",
  },
  merchant: {
    name: "The Merchant",
    href: "/merchant",
    icon: Package,
    color: "#22d3ee",
    accent: "#06b6d4",
    rgb: "6, 182, 212",
  },
  social: {
    name: "The Social Bot",
    href: "/social",
    icon: Megaphone,
    color: "#fb923c",
    accent: "#f97316",
    rgb: "249, 115, 22",
  },
};

const COLLAPSED_KEY = "shopabot:dailyBrief:collapsed";

export function DailyBrief() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(COLLAPSED_KEY) === "1";
  });

  const { data, isLoading } = trpc.dashboard.dailyBrief.useQuery(
    { hoursBack: 24 },
    { staleTime: 60_000 },
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const totalCompleted = data?.totalCompleted ?? 0;
  const ordersInWindow = data?.commerce?.orders ?? 0;
  const revenueInWindow = (data?.commerce?.revenueCents ?? 0) / 100;

  // Dawn copy — ride the time-of-day so the headline matches the user's
  // moment ("Good morning"/"Welcome back"/"Late night?"). Time-zone aware
  // because we use the client's hour, not the server's.
  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);

  // The brief is intentionally hidden when there's no data and we're
  // not loading — we don't want a hollow card on a fresh account.
  if (!isLoading && totalCompleted === 0 && ordersInWindow === 0) {
    return null;
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="daily-brief-collapsed group w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-sky-500/25 transition-all text-left"
      >
        <span className="inline-flex items-center gap-2.5 text-[12px] text-white/70">
          <Sunrise className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-semibold text-white/85">Daily brief:</span>
          <span className="text-white/65">
            <span className="text-emerald-300 font-semibold tabular-nums">{totalCompleted}</span> tasks ·{" "}
            <span className="text-emerald-300 font-semibold tabular-nums">{ordersInWindow}</span> orders ·{" "}
            <span className="text-emerald-300 font-semibold tabular-nums">${revenueInWindow.toFixed(0)}</span> in 24h
          </span>
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-white/40 group-hover:text-white/70 transition-colors" />
      </button>
    );
  }

  return (
    <div className="daily-brief">
      {/* Subtle drifting blooms in the corners */}
      <div className="daily-brief-bloom daily-brief-bloom--top" />
      <div className="daily-brief-bloom daily-brief-bloom--bottom" />

      {/* Header row — eyebrow tag + headline + collapse */}
      <div className="relative flex flex-wrap items-end justify-between gap-3 mb-5">
        <div className="min-w-0">
          <span className="daily-brief-eyebrow">
            <Sunrise className="w-3 h-3" />
            {greeting} · last 24h
          </span>
          <h2 className="text-xl md:text-2xl font-heading font-black tracking-tight text-white mt-2 leading-tight">
            {totalCompleted > 0 ? (
              <>
                Your bots completed{" "}
                <span className="text-sky-300 tabular-nums">
                  <CountUp value={totalCompleted} />
                </span>{" "}
                {totalCompleted === 1 ? "task" : "tasks"} while you were away.
              </>
            ) : (
              <>While you slept, the bots stood watch.</>
            )}
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-[12px]">
            {ordersInWindow > 0 && (
              <span className="inline-flex items-center gap-1.5 text-white/70">
                <ShoppingCart className="w-3 h-3 text-emerald-400" />
                <span className="text-white tabular-nums font-semibold">
                  <CountUp value={ordersInWindow} />
                </span>{" "}
                {ordersInWindow === 1 ? "order" : "orders"}
              </span>
            )}
            {revenueInWindow > 0 && (
              <span className="inline-flex items-center gap-1.5 text-white/70">
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                <span className="text-white tabular-nums font-semibold">
                  $<CountUp value={Math.round(revenueInWindow)} />
                </span>{" "}
                in revenue
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-white/55">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
              {data?.commerce?.activeStoreCount ?? 0} stores active
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-[10px] uppercase tracking-widest font-bold text-white/45 hover:text-white/85 transition-colors inline-flex items-center gap-1"
          aria-label="Collapse daily brief"
        >
          <ChevronRight className="w-3 h-3 rotate-90" />
          Collapse
        </button>
      </div>

      {/* Three columns — one per bot */}
      <div className="relative grid gap-3 sm:grid-cols-3">
        {(Object.keys(BOT_META) as BotKey[]).map((id) => {
          const meta = BOT_META[id];
          const rollup = (data?.[id] as BotRollup) ?? null;
          const Icon = meta.icon;
          const total = (rollup?.completedCount ?? 0) + (rollup?.runningCount ?? 0);
          return (
            <Link
              key={id}
              href={meta.href}
              className="daily-brief-card group"
              style={{
                ["--brief-color" as any]: meta.rgb,
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="inline-flex items-center gap-2.5 min-w-0">
                  <span
                    className="daily-brief-card-icon"
                    style={{
                      background: `linear-gradient(135deg, ${meta.color}30, ${meta.accent}10)`,
                      border: `1px solid ${meta.color}45`,
                      color: meta.color,
                      boxShadow: `0 6px 18px -8px ${meta.accent}80`,
                    }}
                  >
                    <Icon className="w-4 h-4" strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-white/45">
                      {meta.name}
                    </p>
                    <p className="text-base font-heading font-bold text-white leading-tight tabular-nums">
                      {rollup?.completedCount ?? 0}{" "}
                      <span className="text-[11px] font-medium text-white/55 normal-case tracking-normal">
                        completed
                      </span>
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-white/30 group-hover:text-white/85 transition-colors shrink-0" />
              </div>

              {rollup && rollup.highlights.length > 0 ? (
                <ul className="space-y-1 text-[11px] text-white/65">
                  {rollup.highlights.map((h) => (
                    <li key={h.id} className="flex items-start gap-1.5 truncate">
                      <Sparkles className="w-2.5 h-2.5 text-emerald-400 mt-[3px] shrink-0" />
                      <span className="truncate">{h.title}</span>
                    </li>
                  ))}
                </ul>
              ) : total === 0 ? (
                <p className="text-[11px] text-white/40 italic">Idle in window — no work surfaced.</p>
              ) : (
                <p className="text-[11px] text-white/55">
                  {rollup?.runningCount ?? 0} task{rollup?.runningCount === 1 ? "" : "s"} still running.
                </p>
              )}

              {(rollup?.failedCount ?? 0) > 0 && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-red-300 bg-red-500/10 border border-red-500/25 rounded-full px-2 py-0.5 font-medium">
                  ⓘ {rollup?.failedCount} failed — review queue
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function greetingForHour(hour: number): string {
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Welcome back";
  if (hour < 22) return "Good evening";
  return "Late night";
}
