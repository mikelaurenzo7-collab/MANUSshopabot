/**
 * /status — public platform health dashboard.
 *
 * Polls `health.platformStatus` (no auth) every 30s and renders a
 * StatusPage-style summary. Aggregate-only — never leaks customer
 * data, never includes counts that could fingerprint individual
 * tenants.
 *
 * Linked from the Landing footer alongside Privacy/Terms/Docs.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandName } from "@/components/BrandName";

const OVERALL_LABEL: Record<string, { text: string; color: string; Icon: typeof CheckCircle2 }> = {
  operational: { text: "All systems operational", color: "text-emerald-300", Icon: CheckCircle2 },
  degraded: { text: "Some services degraded", color: "text-amber-300", Icon: AlertTriangle },
  outage: { text: "Major outage detected", color: "text-red-300", Icon: XCircle },
};

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return `${d}d ${h}h`;
}

export default function StatusPage() {
  const statusQuery = trpc.health.platformStatus.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const overall = statusQuery.data?.overall ?? "operational";
  const overallCopy = OVERALL_LABEL[overall] ?? OVERALL_LABEL.operational;
  const lastChecked = useMemo(() => {
    if (!statusQuery.data?.checkedAt) return null;
    try {
      return new Date(statusQuery.data.checkedAt).toLocaleString();
    } catch {
      return null;
    }
  }, [statusQuery.data?.checkedAt]);

  return (
    <div className="min-h-screen w-full bg-surface-base text-white relative overflow-hidden grain">
      <div className="aurora-mesh" aria-hidden="true" />
      <div className="absolute inset-0 grid-bg-dense opacity-30 pointer-events-none" />
      <div className="light-leak-blue absolute -top-32 left-1/3 opacity-50" />

      <div className="relative max-w-3xl mx-auto px-6 py-16 page-enter">
        <Link
          href="/landing"
          className="inline-flex items-center gap-2 text-sm text-white/55 hover:text-sky-300 transition-colors mb-10"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to <BrandName size="sm" />
        </Link>

        {/* Overall status banner */}
        <div
          className={`bento-card spotlight-card p-6 mb-6 ${
            overall === "outage"
              ? "border-red-500/30"
              : overall === "degraded"
                ? "border-amber-500/30"
                : "border-emerald-500/25"
          }`}
        >
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                overall === "outage"
                  ? "bg-red-500/12 border border-red-500/30"
                  : overall === "degraded"
                    ? "bg-amber-500/12 border border-amber-500/30"
                    : "bg-emerald-500/12 border border-emerald-500/30"
              }`}
            >
              <overallCopy.Icon className={`w-6 h-6 ${overallCopy.color}`} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="eyebrow mb-1">Platform Status</span>
              <h1 className={`mt-2 text-2xl md:text-3xl font-heading font-black tracking-tight ${overallCopy.color}`}>
                {overallCopy.text}
              </h1>
              {lastChecked && (
                <p className="text-xs text-white/60 mt-1.5 font-mono">
                  Updated {lastChecked}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void statusQuery.refetch()}
              disabled={statusQuery.isFetching}
              className="shrink-0 w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/55 hover:text-white hover:border-sky-400/30 transition-all disabled:opacity-50"
              aria-label="Refresh status"
            >
              {statusQuery.isFetching ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Per-service rows */}
        <div className="bento-card p-5">
          <span className="eyebrow mb-2">Services</span>
          {statusQuery.isLoading && (
            <div className="flex items-center gap-2 text-white/45 text-sm py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading platform status…
            </div>
          )}

          {statusQuery.error && (
            <div className="flex items-center gap-2 text-red-400 text-sm py-3 px-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] mt-3">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{statusQuery.error.message ?? "Couldn't load status."}</span>
            </div>
          )}

          {statusQuery.data && (
            <div className="mt-3 space-y-2">
              {statusQuery.data.services.map((s: any) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02]"
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      s.healthy ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.6)]"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">{s.label}</div>
                    <div className="text-[11px] text-white/60 font-mono truncate">{s.detail}</div>
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-widest ${
                      s.healthy ? "text-emerald-300" : "text-red-300"
                    }`}
                  >
                    {s.healthy ? "Operational" : "Down"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {statusQuery.data?.uptimeSeconds !== undefined && (
          <div className="text-center mt-6 text-xs text-white/60 font-mono">
            Server uptime: {formatUptime(statusQuery.data.uptimeSeconds)}
          </div>
        )}

        <div className="mt-10 text-center">
          <Button asChild variant="outline" className="border-white/10 text-white/75 hover:border-sky-400/30 hover:text-white">
            <Link href="/landing">Back to home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
