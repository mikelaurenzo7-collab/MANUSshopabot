/**
 * ConnectionStatusBanner — Shows connected social accounts and ecommerce platforms
 * Displays as a compact banner with platform icons and connection status
 */
import { useAllConnectionStatus } from "@/hooks/useConnectionStatus";
import { getBrand } from "@/lib/platformBrand";
import { CheckCircle2, AlertCircle } from "lucide-react";

export function ConnectionStatusBanner() {
  const allConnections = useAllConnectionStatus();

  if (Object.keys(allConnections).length === 0) {
    return null;
  }

  const connections = Object.values(allConnections);

  return (
    <div className="px-3 md:px-5 py-2 bg-white/[0.02] border-b border-white/[0.06]">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">Connected:</span>
        {connections.map((conn) => {
          const brand = getBrand(conn.platform);
          return (
            <div
              key={conn.platform}
              className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.12] transition-colors"
            >
              <span className="text-sm leading-none">{brand.icon}</span>
              <span className="text-[11px] text-white/80 font-medium">{brand.name}</span>
              {conn.accountName && (
                <span className="text-[10px] text-white/50">({conn.accountName})</span>
              )}
              <CheckCircle2 className="w-3 h-3 text-emerald-400/70 ml-1" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ConnectionStatusIndicator({ platform }: { platform: string }) {
  const connection = useAllConnectionStatus()[platform];

  if (!connection?.isConnected) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20">
        <AlertCircle className="w-3 h-3 text-red-400" />
        <span className="text-[10px] font-medium text-red-300">Not Connected</span>
      </div>
    );
  }

  const brand = getBrand(platform);
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
      <span className="text-sm leading-none">{brand.icon}</span>
      <span className="text-[10px] font-medium text-emerald-300">Connected</span>
      {connection.accountName && (
        <span className="text-[10px] text-emerald-300/70">({connection.accountName})</span>
      )}
    </div>
  );
}
