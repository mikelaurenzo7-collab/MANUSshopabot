import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { CountUp } from "@/components/CountUp";
import { getBrand } from "@/lib/platformBrand";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  Plus,
  Trash2,
  Edit,
  ChevronDown,
  Loader2,
  Sparkles,
  ScanLine,
} from "lucide-react";
import { ReceiptUploader } from "@/components/supplier/ReceiptUploader";
import { Link } from "wouter";

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
  const [expandedPoId, setExpandedPoId] = useState<number | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [editingPo, setEditingPo] = useState<any>(null);
  
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
  // Note: deletePO not yet implemented in backend

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
    <div className="space-y-3 p-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {storeList.length > 0 && (
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-muted-foreground" />
            <Select
              value={selectedStoreId || String(storeId || "")}
              onValueChange={(v) => setSelectedStoreId(v)}
            >
              <SelectTrigger className="w-[220px] h-9 text-sm">
                <SelectValue placeholder="Select store" />
              </SelectTrigger>
              <SelectContent>
                {storeList.map((s: any) => {
                  const brand = getBrand(s.platform);
                  return (
                    <SelectItem key={s.id} value={String(s.id)}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm leading-none">{brand.icon}</span>
                        <span>{s.name}</span>
                        <Badge variant="outline" className="text-[9px] ml-1">{brand.name}</Badge>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        )}
        {storeId && (
          <div className="flex items-center gap-2">
            {/* Scan receipt — Claude vision extracts line items into a draft PO. */}
            <Dialog open={scanDialogOpen} onOpenChange={setScanDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-violet-500/30 bg-violet-500/[0.06] hover:bg-violet-500/[0.12] text-violet-200 group"
                >
                  <ScanLine className="w-3 h-3 mr-1.5 group-hover:rotate-12 transition-transform" />
                  Scan receipt
                  <Sparkles className="w-2.5 h-2.5 ml-1.5 text-amber-300" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ScanLine className="w-4 h-4 text-violet-300" />
                    Scan supplier receipt
                  </DialogTitle>
                </DialogHeader>
                <ReceiptUploader
                  storeId={storeId}
                  onPOCreated={() => { setScanDialogOpen(false); pos.refetch(); }}
                  onClose={() => setScanDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-3 h-3 mr-1" />
                  New PO
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Purchase Order</DialogTitle>
                </DialogHeader>
                <CreatePOForm storeId={storeId} onSuccess={() => setCreateDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {storeId && pos.data && pos.data.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-border/25">
            <div className="flex items-center gap-2 mb-1">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Total POs</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              <CountUp value={totalPOs} />
            </p>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/15">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Pending Review</span>
            </div>
            <p className="text-lg font-bold text-amber-400">
              <CountUp value={draftCount} />
            </p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/15">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Total Value</span>
            </div>
            <p className="text-lg font-bold text-emerald-400">
              <CountUp value={totalValue / 100} prefix="$" decimals={2} />
            </p>
          </div>
        </div>
      )}

      {!storeId ? (
        <Card className="bento-card">
          <CardContent className="p-8 text-center max-w-md mx-auto">
            <div className="h-12 w-12 rounded-2xl mx-auto mb-4 bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.15)]">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <p className="font-semibold mb-1.5 text-foreground">Connect a store first</p>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Purchase orders are scoped to a store. Connect Shopify (or any supported platform) and the Merchant Bot will start drafting POs the moment it spots low inventory.
            </p>
            <Link href="/storefronts#integrations">
              <Button size="sm" className="bg-sky-600 hover:bg-sky-500">
                <Store className="w-3 h-3 mr-1.5" />
                Connect a store
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : !pos.data?.length ? (
        <Card className="bento-card">
          <CardContent className="p-8 text-center max-w-lg mx-auto">
            <div className="h-12 w-12 rounded-2xl mx-auto mb-4 bg-gradient-to-br from-sky-500/15 to-violet-500/10 border border-sky-500/25 flex items-center justify-center shadow-[0_0_20px_rgba(14,165,233,0.15)]">
              <Package className="w-5 h-5 text-sky-300" />
            </div>
            <p className="font-semibold mb-1.5 text-foreground">No purchase orders yet</p>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              The Merchant Bot drafts POs automatically when stock dips below threshold. You can also draft one manually or scan an existing supplier receipt.
            </p>
            {/* Three concrete next-actions instead of a dead-end */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
              <button
                onClick={() => setScanDialogOpen(true)}
                className="group p-3 rounded-lg bg-violet-500/[0.06] border border-violet-500/20 hover:border-violet-400/40 hover:bg-violet-500/[0.10] transition-all text-left"
              >
                <ScanLine className="w-4 h-4 text-violet-300 mb-1.5 group-hover:rotate-12 transition-transform" />
                <p className="text-xs font-semibold text-foreground mb-0.5">Scan a receipt</p>
                <p className="text-[10.5px] text-muted-foreground leading-tight">Drop a PDF or photo, Claude extracts line items.</p>
              </button>
              <button
                onClick={() => setCreateDialogOpen(true)}
                className="group p-3 rounded-lg bg-sky-500/[0.06] border border-sky-500/20 hover:border-sky-400/40 hover:bg-sky-500/[0.10] transition-all text-left"
              >
                <Plus className="w-4 h-4 text-sky-300 mb-1.5" />
                <p className="text-xs font-semibold text-foreground mb-0.5">Draft manually</p>
                <p className="text-[10.5px] text-muted-foreground leading-tight">Pick supplier + line items by hand.</p>
              </button>
              <Link href="/merchant">
                <div className="group p-3 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20 hover:border-emerald-400/40 hover:bg-emerald-500/[0.10] transition-all text-left h-full">
                  <Package className="w-4 h-4 text-emerald-300 mb-1.5" />
                  <p className="text-xs font-semibold text-foreground mb-0.5">Run inventory check</p>
                  <p className="text-[10.5px] text-muted-foreground leading-tight">Bot triggers POs for low-stock items.</p>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pos.data.map((po: any) => {
            const StatusIcon = statusIcon[po.status] || Clock;
            const isExpanded = expandedPoId === po.id;
            return (
              <Card key={po.id} className="bg-card border-white/[0.08] hover:border-border transition-all">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setExpandedPoId(isExpanded ? null : po.id)}
                      className="flex items-center gap-4 flex-1 text-left"
                    >
                      <div className="h-10 w-10 rounded-lg bg-white/[0.03] flex items-center justify-center">
                        <StatusIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-foreground">{po.poNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {po.supplierId ? `Supplier: ${po.supplierId}` : "No supplier assigned"}
                          {" · "}
                          <span className="text-foreground font-medium">${(po.totalCents / 100).toFixed(2)}</span>
                        </p>
                        {po.notes && (
                          <p className="text-xs text-white/40 italic mt-1">{po.notes}</p>
                        )}
                      </div>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={statusColor[po.status] || ""}>{po.status}</Badge>
                      {po.status === "draft" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingPo(po)}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                      )}
                      {po.status === "draft" && (
                        <Button
                          size="sm"
                          onClick={() => approveMutation.mutate({ poId: po.id })}
                          disabled={approveMutation.isPending}
                        >
                          <FileCheck className="w-3 h-3 mr-1" /> Approve
                        </Button>
                      )}
                      {po.status === "approved" && (
                        <Button
                          size="sm"
                          onClick={() => submitMutation.mutate({ poId: po.id })}
                          disabled={submitMutation.isPending}
                        >
                          <Truck className="w-3 h-3 mr-1" /> Submit
                        </Button>
                      )}
                      {po.status === "submitted" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fulfillMutation.mutate({ poId: po.id })}
                          disabled={fulfillMutation.isPending}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Received
                        </Button>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">Line Items ({po.lineItems?.length || 0})</p>
                      {po.lineItems && po.lineItems.length > 0 ? (
                        <div className="space-y-1">
                          {po.lineItems.map((item: any, idx: number) => (
                            <div key={idx} className="text-xs flex justify-between p-2 bg-white/[0.02] rounded">
                              <span>{item.description}</span>
                              <span className="text-foreground font-medium">{item.quantity} × ${(item.unitPriceCents / 100).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No line items</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreatePOForm({ storeId, onSuccess }: { storeId: number; onSuccess: () => void }) {
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const createMutation = trpc.supplier.createDraft.useMutation({
    onSuccess,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({
      storeId,
      supplierId: supplierId || undefined,
      notes,
      lineItems: [],
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Supplier ID (optional)</label>
        <Input
          placeholder="Enter supplier ID or name"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-sm font-medium">Notes</label>
        <Input
          placeholder="Internal notes or special instructions"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1"
        />
      </div>
      <Button type="submit" disabled={createMutation.isPending} className="w-full">
        {createMutation.isPending ? (
          <>
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Creating...
          </>
        ) : (
          "Create PO"
        )}
      </Button>
    </form>
  );
}
