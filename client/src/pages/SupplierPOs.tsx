import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Package,
  Truck,
  FileCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Store,
  DollarSign,
  Hash,
} from "lucide-react";

const statusIcon: Record<string, any> = {
  draft: Clock,
  approved: FileCheck,
  submitted: Truck,
  fulfilled: CheckCircle2,
};

const statusColor: Record<string, string> = {
  draft: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  approved: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  submitted: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  fulfilled: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export default function SupplierPOs() {
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const stores = trpc.stores.list.useQuery();
  const storeId = selectedStoreId ? Number(selectedStoreId) : (stores.data as any)?.[0]?.id;

  const pos = trpc.supplier.listPOs.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );

  const approveMutation = trpc.supplier.approve.useMutation({
    onSuccess: () => pos.refetch(),
  });
  const submitMutation = trpc.supplier.submit.useMutation({
    onSuccess: () => pos.refetch(),
  });
  const fulfillMutation = trpc.supplier.markFulfilled.useMutation({
    onSuccess: () => pos.refetch(),
  });

  if (stores.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const storeList = (stores.data as any[]) || [];
  const totalPOs = pos.data?.length || 0;
  const draftCount = pos.data?.filter((p: any) => p.status === "draft").length || 0;
  const totalValue = pos.data?.reduce((sum: number, p: any) => sum + (p.totalCents || 0), 0) || 0;

  return (
    <div className="relative overflow-hidden page-enter">
      <div className="ghost-watermark" aria-hidden="true">PURCHASE ORDERS</div>
      <div className="light-leak-blue" style={{ top: '5%', left: '10%' }} aria-hidden="true" />
      <div className="light-leak-orange" style={{ top: '55%', right: '5%' }} aria-hidden="true" />

      <div className="space-y-6 p-6">
        <div className="page-header flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="micro-label mb-1">Merchant Bot</p>
            <h1 className="text-xl font-heading font-bold tracking-tight text-foreground flex items-center gap-2">
              <Package className="w-5 h-5 text-cyan-400" />
              Supplier Purchase Orders
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your Merchant Bot auto-drafts POs when inventory runs low. Review, approve, and submit.
            </p>
          </div>
          {storeList.length > 0 && (
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-muted-foreground" />
              <Select
                value={selectedStoreId || String(storeId || "")}
                onValueChange={(v) => setSelectedStoreId(v)}
              >
                <SelectTrigger className="w-[220px] h-9 text-sm bg-white/[0.04] border-white/[0.08]">
                  <SelectValue placeholder="Select store" />
                </SelectTrigger>
                <SelectContent>
                  {storeList.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      <div className="flex items-center gap-2">
                        <span>{s.name}</span>
                        <Badge variant="outline" className="text-[9px] ml-1">{s.platform}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {storeId && pos.data && pos.data.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bento-card relative overflow-hidden p-3">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <div className="flex items-center gap-2 mb-1">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Total POs</span>
              </div>
              <p className="text-lg font-bold text-foreground metric-number">{totalPOs}</p>
            </div>
            <div className="bento-card relative overflow-hidden p-3">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Pending Review</span>
              </div>
              <p className="text-lg font-bold text-amber-400 metric-number">{draftCount}</p>
            </div>
            <div className="bento-card relative overflow-hidden p-3">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Total Value</span>
              </div>
              <p className="text-lg font-bold text-emerald-400 metric-number">${(totalValue / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        )}

        {!storeId ? (
          <div className="glass-card p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-400/60" />
            </div>
            <p className="font-medium text-white mb-1">No Store Connected</p>
            <p className="text-sm text-muted-foreground">
              Connect a store in the Builder Bot to start managing purchase orders.
            </p>
          </div>
        ) : !pos.data?.length ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Package className="w-5 h-5 text-cyan-400/50" />
            </div>
            <p className="text-sm font-semibold text-foreground">No Purchase Orders Yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              When the Merchant Bot detects low inventory, it will automatically draft purchase orders here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pos.data.map((po: any) => {
              const StatusIcon = statusIcon[po.status] || Clock;
              return (
                <div key={po.id} className="glass-card relative overflow-hidden p-4 hover:border-cyan-400/20 transition-all">
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                        <StatusIcon className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-foreground">{po.poNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {po.supplierId ? `Supplier: ${po.supplierId}` : "No supplier assigned"}
                          {" · "}
                          <span className="text-foreground font-medium metric-number">${(po.totalCents / 100).toFixed(2)}</span>
                        </p>
                        {po.notes && (
                          <p className="text-xs text-white/40 italic mt-1">{po.notes}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={statusColor[po.status] || ""}>{po.status}</Badge>
                      {po.status === "draft" && (
                        <Button
                          size="sm"
                          onClick={() => approveMutation.mutate({ poId: po.id })}
                          disabled={approveMutation.isPending}
                          className="btn-glow h-7 text-xs"
                        >
                          <FileCheck className="w-3 h-3 mr-1" /> Approve
                        </Button>
                      )}
                      {po.status === "approved" && (
                        <Button
                          size="sm"
                          onClick={() => submitMutation.mutate({ poId: po.id })}
                          disabled={submitMutation.isPending}
                          className="h-7 text-xs"
                        >
                          <Truck className="w-3 h-3 mr-1" /> Submit to Supplier
                        </Button>
                      )}
                      {po.status === "submitted" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fulfillMutation.mutate({ poId: po.id })}
                          disabled={fulfillMutation.isPending}
                          className="h-7 text-xs border-white/10 text-white/60 hover:border-emerald-400/30 hover:text-emerald-400"
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Received
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
