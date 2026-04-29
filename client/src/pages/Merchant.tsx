import React, { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Package, Loader2, AlertTriangle, DollarSign, TrendingUp, ShoppingCart, 
  Truck, Zap, RotateCcw, Activity, Store, Cpu, Layers
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getBrand } from "@/lib/platformBrand";
import { BotOperatingAcross } from "@/components/BotOperatingAcross";
import { PulseStream } from "@/components/PulseStream";

export default function MerchantPage() {
  const isMobile = useIsMobile();
  const [selectedStore, setSelectedStore] = useState<string>("");
  const storeId = selectedStore ? Number(selectedStore) : undefined;
  const [selectedEntity, setSelectedEntity] = useState<any>(null);
  const [entityType, setEntityType] = useState<"product" | "order" | null>(null);

  const { data: stores, isLoading: storesLoading } = trpc.stores.list.useQuery();
  const { data: products, isLoading: productsLoading } = trpc.merchant.products.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );
  const { data: orders, isLoading: ordersLoading } = trpc.merchant.orders.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );
  const { data: lowStock } = trpc.merchant.lowStockAlerts.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId }
  );

  const utils = trpc.useUtils();
  const { data: status } = trpc.dashboard.agentStatus.useQuery();
  const merchantStatus: any = status?.find?.((s: any) => s.agentType === 'merchant') || { status: 'idle' };

  const autoFulfill = trpc.merchant.autoFulfill.useMutation({
    onSuccess: () => {
      toast.success("ORDER_FULFILLED");
      utils.merchant.orders.invalidate();
    },
    onError: (err) => {
      toast.error(`ERR: ${err.message}`);
    }
  });

  const handleEntitySelect = (type: "product" | "order", entity: any) => {
    setEntityType(type);
    setSelectedEntity(entity);
  };

  // Esc closes the inspector slide-over (skipped while typing into a form).
  useEffect(() => {
    if (!selectedEntity) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      setSelectedEntity(null);
      setEntityType(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedEntity]);

  return (
    <div className="flex h-full w-full relative bg-[#050505] overflow-hidden text-white flex-col">
      <div className="bot-page-ambient bot-page-ambient--merchant" aria-hidden="true">
        <div className="bot-page-ambient-grid" />
        <div className="bot-page-ambient-orb bot-page-ambient-orb--top" />
        <div className="bot-page-ambient-orb bot-page-ambient-orb--bottom" />
      </div>
      <div className="flex-1 flex flex-col h-full relative z-10">
        <div className="bot-page-header bot-page-header--merchant">
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            <div className="bot-page-header-glyph bot-page-header-glyph--merchant">
              <Package className="w-5 h-5" strokeWidth={2.2} />
              <span className="bot-page-header-glyph-pulse" />
            </div>
            <div className="min-w-0">
              <div className="bot-page-header-eyebrow">
                <span className="bot-page-header-eyebrow-dot" />
                Merchant · The Operator
              </div>
              <h1 className="font-heading text-base md:text-lg font-black tracking-tight text-white truncate leading-tight">
                Run my store while I sleep.
              </h1>
              <p className="text-[11px] text-white/55 hidden sm:block leading-tight mt-0.5">
                Inventory sync · auto-fulfillment · pricing matrices
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <PulseStream
              status={merchantStatus.status === 'running' ? 'running' : 'ready'}
              color="#22d3ee"
              label="Merchant bot pulse"
            />
            <span className={`bot-page-header-status ${merchantStatus.status === 'running' ? 'bot-page-header-status--running' : 'bot-page-header-status--ready'}`}>
              <span className="bot-page-header-status-dot" />
              {merchantStatus.status === 'running' ? 'Running' : 'Ready'}
            </span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-6 bg-[#050505]">
          <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">

            {/* Operating-across strip — every commerce + social surface
                Merchant is currently driving. */}
            <BotOperatingAcross botId="merchant" />

            {/* Store Triage Selector */}
            <div className="border border-white/[0.08] bg-black/40 p-3 md:p-4 relative flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
              <div className="absolute top-0 left-0 w-1 h-full bg-cyan-400/50" />
              <div className="flex items-center gap-4 w-full pl-2">
                <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-muted-foreground shrink-0">Active Source:</span>
                <div className="flex-1 max-w-[300px] relative">
                  <Select
                    value={selectedStore}
                    onValueChange={(val) => {
                      setSelectedStore(val);
                      setSelectedEntity(null);
                      setEntityType(null);
                    }}
                    disabled={storesLoading}
                  >
                    <SelectTrigger className="w-full bg-[#050505] border-white/[0.08] text-white font-mono text-[10px] uppercase h-8 focus:ring-cyan-400/20 focus:border-cyan-400">
                      <SelectValue placeholder={storesLoading ? "LOADING_STORES..." : "SELECT_TARGET_STORE"} />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0a0a0f] border-white/[0.08]">
                      {stores?.map((s: any) => {
                        const brand = getBrand(s.platform);
                        return (
                          <SelectItem
                            key={s.id}
                            value={String(s.id)}
                            className="text-white font-mono text-[10px] uppercase focus:bg-cyan-500/10 focus:text-cyan-300"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-sm leading-none">{brand.icon}</span>
                              {s.name} <span className="text-white/40">[{brand.name}]</span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                
                {lowStock && lowStock.length > 0 && (
                  <div className="ml-auto flex items-center bg-red-500/10 border border-red-500/30 px-3 py-1">
                    <AlertTriangle className="w-3 h-3 text-red-500 mr-2" />
                    <span className="font-mono text-[10px] font-bold text-red-500 uppercase">{lowStock.length} INVENTORY WARNINGS</span>
                  </div>
                )}
              </div>
            </div>

            {!storeId ? (
              <div className="border border-white/[0.08] border-dashed p-12 flex flex-col items-center justify-center text-center">
                <Store className="w-8 h-8 text-muted-foreground/40 mb-4" />
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground font-bold">No Store Selected</p>
                <p className="font-mono text-[9px] text-muted-foreground mt-2 opacity-70">Choose a store from the dropdown above to view inventory and order data.</p>
              </div>
            ) : (
               <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'} gap-6`}>
                 
                 {/* Product DB */}
                 <div className="border border-white/[0.08] bg-black/40 flex flex-col min-h-[400px]">
                    <div className="border-b border-white/[0.08] px-4 py-3 flex justify-between items-center bg-[#050505]">
                      <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-white flex items-center"><Layers className="w-3 h-3 text-cyan-400 mr-2" /> Data: Products</h2>
                      <Badge count={products?.length || 0} />
                    </div>
                    <div className="flex-1 p-0 overflow-auto custom-scrollbar">
                      {productsLoading ? (
                        <div className="p-6 space-y-2">
                          <div className="flex items-center gap-2 text-muted-foreground font-mono text-[10px] uppercase tracking-widest mb-3">
                            <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                            Loading product matrix…
                          </div>
                          {[0, 1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-2 border-b border-white/[0.04]">
                              <div className="h-3 w-1/2 rounded bg-white/[0.04] animate-pulse" />
                              <div className="h-3 w-12 rounded bg-white/[0.03] animate-pulse" />
                              <div className="h-3 w-14 ml-auto rounded bg-white/[0.04] animate-pulse" />
                            </div>
                          ))}
                        </div>
                      ) : !products?.length ? (
                        <div className="p-8 text-center">
                          <Package className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-bold">No Products</p>
                          <p className="font-mono text-[9px] text-muted-foreground mt-1 opacity-70">Products will appear here once synced from your store.</p>
                        </div>
                      ) : (
                        <table className="w-full text-left font-mono border-collapse">
                          <thead>
                            <tr className="border-b border-white/[0.08] bg-[#050505]">
                              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-muted-foreground font-normal w-1/2">Product Title</th>
                              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-muted-foreground font-normal">Stock</th>
                              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-muted-foreground font-normal text-right">Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {products.map((p: any) => {
                              const isSelected = selectedEntity?.id === p.id && entityType === "product";
                              const stockColor = p.stockQuantity && p.stockQuantity < 5 ? "text-red-500 font-bold" : "text-emerald-400";
                              return (
                                <tr 
                                  key={p.id} 
                                  onClick={() => handleEntitySelect("product", p)}
                                  className={`border-b border-white/[0.08] cursor-pointer transition-colors ${isSelected ? 'bg-white/[0.04] border-l border-l-cyan-400' : 'hover:bg-white/[0.025]'} relative`}
                                >
                                 <td className="px-4 py-2 font-bold text-white text-[10px] uppercase truncate max-w-[150px]">
                                   {p.title}
                                 </td>
                                 <td className={`px-4 py-2 text-[10px] ${stockColor}`}>{p.stockQuantity ?? "N/A"}</td>
                                 <td className="px-4 py-2 text-right text-emerald-400 text-[10px] tracking-wider">
                                   ${((p.price ?? 0) / 100).toFixed(2)}
                                 </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                 </div>

                 {/* Order Stream */}
                 <div className="border border-white/[0.08] bg-black/40 flex flex-col min-h-[400px]">
                    <div className="border-b border-white/[0.08] px-4 py-3 flex justify-between items-center bg-[#050505]">
                      <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-white flex items-center"><Activity className="w-3 h-3 text-amber-400 mr-2" /> Stream: Orders</h2>
                      <Badge count={orders?.length || 0} />
                    </div>
                    <div className="flex-1 p-0 overflow-auto custom-scrollbar">
                      {ordersLoading ? (
                        <div className="p-6 space-y-2">
                          <div className="flex items-center gap-2 text-muted-foreground font-mono text-[10px] uppercase tracking-widest mb-3">
                            <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                            Streaming order data…
                          </div>
                          {[0, 1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-2 border-b border-white/[0.04]">
                              <div className="h-3 w-1/3 rounded bg-white/[0.04] animate-pulse" />
                              <div className="h-3 w-16 rounded bg-white/[0.03] animate-pulse" />
                              <div className="h-3 w-14 ml-auto rounded bg-white/[0.04] animate-pulse" />
                            </div>
                          ))}
                        </div>
                      ) : !orders?.length ? (
                        <div className="p-8 text-center">
                          <ShoppingCart className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-bold">No Orders</p>
                          <p className="font-mono text-[9px] text-muted-foreground mt-1 opacity-70">Orders will appear here as they arrive from your store.</p>
                        </div>
                      ) : (
                        <table className="w-full text-left font-mono border-collapse">
                          <thead>
                            <tr className="border-b border-white/[0.08] bg-[#050505]">
                              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-muted-foreground font-normal w-1/3">Order ID</th>
                              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-muted-foreground font-normal">Status</th>
                              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-muted-foreground font-normal text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orders.map((o: any) => {
                              const isSelected = selectedEntity?.id === o.id && entityType === "order";
                              const sCol = o.financialStatus === "paid" ? "text-emerald-400" : "text-amber-400";
                              return (
                                <tr 
                                  key={o.id} 
                                  onClick={() => handleEntitySelect("order", o)}
                                  className={`border-b border-white/[0.08] cursor-pointer transition-colors ${isSelected ? 'bg-white/[0.04] border-l border-l-amber-400' : 'hover:bg-white/[0.025]'} relative`}
                                >
                                 <td className="px-4 py-2 font-bold text-white text-[10px] uppercase truncate max-w-[120px]">
                                   #{o.externalId || o.id}
                                 </td>
                                 <td className={`px-4 py-2 text-[9px] uppercase tracking-widest ${sCol}`}>{o.financialStatus}</td>
                                 <td className="px-4 py-2 text-right text-emerald-400 text-[10px] tracking-wider">
                                   ${((o.totalAmount ?? 0) / 100).toFixed(2)}
                                 </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                 </div>

               </div>
            )}
            
          </div>
        </div>
      </div>

      {/* Metadata Inspector — slide-over */}
      {selectedEntity && (
        <button
          type="button"
          onClick={() => { setSelectedEntity(null); setEntityType(null); }}
          className="absolute inset-0 z-20 bg-black/30 backdrop-blur-[2px] cursor-default"
          aria-label="Close inspector"
        />
      )}
      <aside
        className={`absolute top-0 right-0 h-full w-[360px] bg-black/95 flex flex-col z-30 border-l border-white/[0.08] transition-transform duration-300 ease-out ${
          selectedEntity ? "translate-x-0 shadow-[-12px_0_36px_rgba(0,0,0,0.6)]" : "translate-x-full pointer-events-none"
        }`}
        aria-hidden={!selectedEntity}
      >
        <div className="h-12 flex items-center px-4 border-b border-white/[0.08] justify-between shrink-0 bg-[#050505]">
          <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
            <Cpu className="w-3 h-3 text-cyan-400" />
            Merchant Inspector
          </span>
          <button
            type="button"
            onClick={() => { setSelectedEntity(null); setEntityType(null); }}
            className="w-6 h-6 rounded text-white/40 hover:text-white/85 hover:bg-white/[0.06] flex items-center justify-center transition-colors"
            aria-label="Close inspector"
          >
            <span aria-hidden="true" className="text-base leading-none">×</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
           {!selectedEntity ? null : entityType === "product" ? (
             <div className="space-y-6">
                <div>
                   <h2 className="font-mono text-sm uppercase text-white font-bold mb-1 border-b border-white/[0.08] pb-2 break-all">{selectedEntity.title}</h2>
                   <div className="flex justify-between items-center mt-3">
                      <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">Drizzle ID</span>
                      <span className="font-mono text-[10px] text-white">[{selectedEntity.id}]</span>
                   </div>
                </div>

                <div className="space-y-2">
                   <InspectorRow label="Platform ID" value={`${selectedEntity.externalId || 'N/A'}`} />
                   <InspectorRow label="Vendor" value={`${selectedEntity.vendor || 'UNKNOWN'}`} />
                   <InspectorRow label="Stock Vol" value={`${selectedEntity.stockQuantity ?? '0'}`} 
                     valueColor={selectedEntity.stockQuantity < 5 ? "text-red-500" : "text-emerald-400"} />
                   <InspectorRow label="Unit Price" value={`$${((selectedEntity.price ?? 0) / 100).toFixed(2)}`} valueColor="text-white" />
                   <InspectorRow label="Competitor Avg" value={`$${((selectedEntity.competitorPrice ?? 0) / 100).toFixed(2)}`} valueColor="text-muted-foreground" />
                   <InspectorRow label="AI Sync State" value={selectedEntity.synced ? "OK" : "PENDING"} valueColor={selectedEntity.synced ? "text-emerald-400" : "text-amber-400"} />
                </div>
                
                <div className="pt-4 border-t border-white/[0.08]">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-3">Linked Actions</p>
                  <button className="w-full bg-[#050505] border border-white/[0.08] hover:border-cyan-400 hover:text-cyan-400 text-slate-400 font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 transition-colors flex items-center justify-between group">
                     Force DB Sync <RotateCcw className="w-3 h-3 group-hover:text-cyan-400" />
                  </button>
                </div>
             </div>
           ) : (
             <div className="space-y-6">
                <div>
                   <h2 className="font-mono text-sm uppercase text-white font-bold mb-1 border-b border-white/[0.08] pb-2">ORDER #{selectedEntity.externalId || selectedEntity.id}</h2>
                   <div className="flex justify-between items-center mt-3">
                      <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">Transaction Net</span>
                      <span className="font-mono text-xl font-bold text-emerald-400">
                         ${((selectedEntity.totalAmount ?? 0) / 100).toFixed(2)}
                      </span>
                   </div>
                </div>

                <div className="space-y-2">
                   <InspectorRow label="Customer Target" value={selectedEntity.customerEmail || 'N/A'} />
                   <InspectorRow label="Fulfillment Stage" value={selectedEntity.fulfillmentStatus?.toUpperCase() || 'UNFULFILLED'} 
                     valueColor={selectedEntity.fulfillmentStatus === 'fulfilled' ? "text-emerald-400" : "text-amber-400"} />
                   <InspectorRow label="Financial Stage" value={selectedEntity.financialStatus?.toUpperCase() || 'PENDING'} 
                     valueColor={selectedEntity.financialStatus === 'paid' ? "text-emerald-400" : "text-amber-400"} />
                   <InspectorRow label="Creation Timestamp" value={new Date(selectedEntity.createdAt).toLocaleString()} valueColor="text-muted-foreground" />
                </div>
                
                <div className="pt-4 border-t border-white/[0.08]">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-3">Processing Overrides</p>
                  <button 
                    onClick={() => autoFulfill.mutate({ orderId: selectedEntity.id, storeId: storeId! })}
                    disabled={autoFulfill.isPending || selectedEntity.fulfillmentStatus === 'fulfilled'}
                    className="w-full bg-[#050505] border border-white/[0.08] hover:border-amber-400 hover:text-amber-400 disabled:opacity-50 disabled:border-white/[0.08] disabled:text-muted-foreground text-slate-400 font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 transition-colors flex items-center justify-between group"
                  >
                     {autoFulfill.isPending ? "PROCESSING..." : "Override & Fulfill"} <Truck className="w-3 h-3 group-hover:text-amber-400" />
                  </button>
                </div>
             </div>
           )}
        </div>
      </aside>
    </div>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <div className="bg-white/[0.06] border border-white/[0.08] text-white/70 font-mono text-[9px] font-bold px-2 py-0.5 rounded-md">
      {count}
    </div>
  );
}

function InspectorRow({ label, value, valueColor = "text-white" }: { label: string, value: string, valueColor?: string }) {
  return (
    <div className="flex justify-between items-center border-b border-white/[0.04] py-1.5">
      <span className="font-mono text-[10px] uppercase text-muted-foreground">{label}</span>
      <span className={`font-mono text-[10px] font-bold ${valueColor} text-right max-w-[60%] truncate`}>{value}</span>
    </div>
  );
}
