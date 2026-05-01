/**
 * QueryErrorBanner — single-bar surface for "one or more page queries
 * failed". Shell pages embed multiple `useQuery` calls in parallel; the
 * audit pass found 96% of pages render empty cards on backend blip.
 *
 * Drop this at the top of a page body and pass any number of query
 * objects (`{ isError, refetch }`). The banner only mounts when at
 * least one of them is errored, and the Retry button refetches all
 * failed queries in one click — no full page reload required.
 *
 * Usage:
 *   <QueryErrorBanner queries={[storesQuery, ordersQuery]} />
 */
import type { ReactNode } from "react";

interface QueryLike {
  isError: boolean;
  refetch: () => unknown;
}

export function QueryErrorBanner({
  queries,
  label = "Page data unavailable",
  fallback,
}: {
  queries: QueryLike[];
  /** Eyebrow text shown on the left of the bar. */
  label?: string;
  /** Optional override message (defaults to "<n> sections failed to load"). */
  fallback?: ReactNode;
}) {
  const failed = queries.filter((q) => q.isError);
  if (failed.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-500/25 bg-red-500/[0.05] px-4 py-3 flex items-center gap-3"
    >
      <span className="text-[11px] font-bold uppercase tracking-widest text-red-400 shrink-0">
        {label}
      </span>
      <span className="text-[11px] text-white/60 truncate flex-1">
        {fallback ??
          (failed.length === 1
            ? "One section failed to load. Check your connection or retry."
            : `${failed.length} sections failed to load. Check your connection or retry.`)}
      </span>
      <button
        type="button"
        onClick={() => failed.forEach((q) => q.refetch())}
        className="shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/60 hover:border-sky-500/30 hover:text-sky-300 transition-all"
      >
        Retry
      </button>
    </div>
  );
}
