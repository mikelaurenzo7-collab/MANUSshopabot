import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Package, Loader2, AlertTriangle, DollarSign, TrendingUp, ShoppingCart, 
  Truck, Zap, RotateCcw, Activity, Store, Cpu, Layers
} from "lucide-react";

export default function MerchantPage() {
  const [selectedStore, setSelectedStore] = useState<string>("");
  const storeId = selectedStore ? Number(selectedStore) : undefined;
  const [selectedEntity, setSelectedEntity] = useState<any>(null);
  const [entityType, setEntityType] = useState<"product" | "order" | null>(null);

  const { data: stores } = trpc.stores.list.useQuery();
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
  const merchantStatus = status?.agents?.merchant || { status: 'idle' };

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

  return (
    <div className="flex h-full w-full relative bg-[#050505] overflow-hidden text-[#e2e8f0]">
      {/* Main Workspace */}
      <div className="flex-1 flex flex-col h-full border-r border-[#1e293b]">
        {/* Header Bar */}
        <div className="h-14 flex items-center px-6 border-b border-[#1e293b] justify-between bg-[#0a0a0a] shrink-0">
          <div className="flex items-center gap-3">
            <Package className="text-cyan-400 w-5 h-5" />
            <div>
              <h1 className="font-mono text-[11px] uppercase tracking-widest font-bold text-white">Merchant Bot: Operations Module</h1>
              <p className="font-mono text-[9px] text-[#64748b]">Inventory sync, auto-fulfillment, pricing matrices.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <span className="font-mono text-[9px] tracking-widest uppercase text-[#64748b]">Engine State:</span>
             <span className={`font-mono text-[10px] uppercase font-bold ${merchantStatus.status === 'running' ? 'text-[#f59e0b]' : 'text-[#00ff41]'}`}>
               {merchantStatus.status === 'running' ? 'PROCESSING' : 'STANDBY'}
             </span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#050505]">
          <div className="max-w-5xl mx-auto space-y-6">
            
            {/* Store Triage Selector */}
            <div className="border border-[#1e293b] bg-[#0a0a0a] p-4 relative flex items-center justify-between">
              <div className="absolute top-0 left-0 w-1 h-full bg-cyan-400/50" />
              <div className="flex items-center gap-4 w-full pl-2">
                <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-[#64748b] shrink-0">Active Source:</span>
                <select
                  value={selectedStore}
                  onChange={(e) => {
                    setSelectedStore(e.target.value);
                    setSelectedEntity(null);
                    setEntityType(null);
                  }}
                  className="bg-[#050505] border border-[#1e293b] text-white font-mono text-[10px] uppercase px-3 py-1.5 focus:outline-none focus:border-cyan-400 flex-1 max-w-[300px]"
                >
                  <option value="">SELECT_TARGET_STORE</option>
                  {stores?.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name} [{s.platform}]</option>
                  ))}
                </select>
                
                {lowStock && lowStock.length > 0 && (
                  <div className="ml-auto flex items-center bg-red-500/10 border border-red-500/30 px-3 py-1">
                    <AlertTriangle className="w-3 h-3 text-red-500 mr-2" />
                    <span className="font-mono text-[10px] font-bold text-red-500 uppercase">{lowStock.length} INVENTORY WARNINGS</span>
                  </div>
                )}
              </div>
            </div>

            {!storeId ? (
              <div className="border border-[#1e293b] border-dashed p-12 flex flex-col items-center justify-center text-center opacity-50">
                <Store className="w-8 h-8 text-[#64748b] mb-4" />
                <p className="font-mono text-xs uppercase tracking-widest text-[#64748b]">Awaiting Target Source Configuration</p>
                <p className="font-mono text-[9px] text-[#64748b] mt-2">Connect to a synchronized data stream to visualize inventory matrices.</p>
              </div>
            ) : (
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 
                 {/* Product DB */}
                 <div className="border border-[#1e293b] bg-[#0a0a0a] flex flex-col min-h-[400px]">
                    <div className="border-b border-[#1e293b] px-4 py-3 flex justify-between items-center bg-[#050505]">
                      <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-white flex items-center"><Layers className="w-3 h-3 text-cyan-400 mr-2" /> Data: Products</h2>
                      <Badge count={products?.length || 0} />
                    </div>
                    <div className="flex-1 p-0 overflow-auto custom-scrollbar">
                      {productsLoading ? (
                        <div className="p-8 text-center text-[#64748b] font-mono text-[10px] uppercase">Awaiting Matrix Data...</div>
                      ) : !products?.length ? (
                        <div className="p-8 text-center text-[#64748b] font-mono text-[10px] uppercase">Entity List Empty</div>
                      ) : (
                        <table className="w-full text-left font-mono border-collapse">
                          <thead>
                            <tr className="border-b border-[#1e293b] bg-[#050505]">
                              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-[#64748b] font-normal w-1/2">Product Title</th>
                              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-[#64748b] font-normal">Stock</th>
                              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-[#64748b] font-normal text-right">Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {products.map((p: any) => {
                              const isSelected = selectedEntity?.id === p.id && entityType === "product";
                              const stockColor = p.stockQuantity && p.stockQuantity < 5 ? "text-red-500 font-bold" : "text-[#00ff41]";
                              return (
                                <tr 
                                  key={p.id} 
                                  onClick={() => handleEntitySelect("product", p)}
                                  className={`border-b border-[#1e293b] cursor-pointer transition-colors ${isSelected ? 'bg-[#1e293b]/40 border-l border-l-cyan-400' : 'hover:bg-[#1e293b]/20'} relative`}
                                >
                                 <td className="px-4 py-2 font-bold text-[#e2e8f0] text-[10px] uppercase truncate max-w-[150px]">
                                   {p.title}
                                 </td>
                                 <td className={`px-4 py-2 text-[10px] ${stockColor}`}>{p.stockQuantity ?? "N/A"}</td>
                                 <td className="px-4 py-2 text-right text-[#00ff41] text-[10px] tracking-wider">
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
                 <div className="border border-[#1e293b] bg-[#0a0a0a] flex flex-col min-h-[400px]">
                    <div className="border-b border-[#1e293b] px-4 py-3 flex justify-between items-center bg-[#050505]">
                      <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-white flex items-center"><Activity className="w-3 h-3 text-[#f59e0b] mr-2" /> Stream: Orders</h2>
                      <Badge count={orders?.length || 0} />
                    </div>
                    <div className="flex-1 p-0 overflow-auto custom-scrollbar">
                      {ordersLoading ? (
                        <div className="p-8 text-center text-[#64748b] font-mono text-[10px] uppercase">Awaiting Matrix Data...</div>
                      ) : !orders?.length ? (
                        <div className="p-8 text-center text-[#64748b] font-mono text-[10px] uppercase">Stream Empty</div>
                      ) : (
                        <table className="w-full text-left font-mono border-collapse">
                          <thead>
                            <tr className="border-b border-[#1e293b] bg-[#050505]">
                              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-[#64748b] font-normal w-1/3">Order ID</th>
                              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-[#64748b] font-normal">Status</th>
                              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-[#64748b] font-normal text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orders.map((o: any) => {
                              const isSelected = selectedEntity?.id === o.id && entityType === "order";
                              const sCol = o.financialStatus === "paid" ? "text-[#00ff41]" : "text-[#f59e0b]";
                              return (
                                <tr 
                                  key={o.id} 
                                  onClick={() => handleEntitySelect("order", o)}
                                  className={`border-b border-[#1e293b] cursor-pointer transition-colors ${isSelected ? 'bg-[#1e293b]/40 border-l border-l-[#f59e0b]' : 'hover:bg-[#1e293b]/20'} relative`}
                                >
                                 <td className="px-4 py-2 font-bold text-[#e2e8f0] text-[10px] uppercase truncate max-w-[120px]">
                                   #{o.externalId || o.id}
                                 </td>
                                 <td className={`px-4 py-2 text-[9px] uppercase tracking-widest ${sCol}`}>{o.financialStatus}</td>
                                 <td className="px-4 py-2 text-right text-[#00ff41] text-[10px] tracking-wider">
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

      {/* Metadata Inspector (Right Panel) */}
      <aside className="w-[380px] shrink-0 bg-[#0a0a0a] flex flex-col z-20 box-border border-l border-[#1e293b]">
        <div className="h-14 flex items-center px-4 border-b border-[#1e293b] justify-between shrink-0 bg-[#050505]">
          <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-[#64748b]">
            Merchant Inspector
          </span>
          <span className="flex items-center gap-2">
             <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          </span>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
           {!selectedEntity ? (
             <div className="flex flex-col items-center justify-center text-center h-40 opacity-50">
                <Target className="w-6 h-6 text-[#64748b] mb-4" />
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#64748b]">Select an entity stream to view telemetry</p>
             </div>
           ) : entityType === "product" ? (
             <div className="space-y-6">
                <div>
                   <h2 className="font-mono text-sm uppercase text-white font-bold mb-1 border-b border-[#1e293b] pb-2 break-all">{selectedEntity.title}</h2>
                   <div className="flex justify-between items-center mt-3">
                      <span className="font-mono text-[9px] text-[#64748b] tracking-widest uppercase">Drizzle ID</span>
                      <span className="font-mono text-[10px] text-white">[{selectedEntity.id}]</span>
                   </div>
                </div>

                <div className="space-y-2">
                   <InspectorRow label="Platform ID" value={`${selectedEntity.externalId || 'N/A'}`} />
                   <InspectorRow label="Vendor" value={`${selectedEntity.vendor || 'UNKNOWN'}`} />
                   <InspectorRow label="Stock Vol" value={`${selectedEntity.stockQuantity ?? '0'}`} 
                     valueColor={selectedEntity.stockQuantity < 5 ? "text-red-500" : "text-[#00ff41]"} />
                   <InspectorRow label="Unit Price" value={`$${((selectedEntity.price ?? 0) / 100).toFixed(2)}`} valueColor="text-white" />
                   <InspectorRow label="Competitor Avg" value={`$${((selectedEntity.competitorPrice ?? 0) / 100).toFixed(2)}`} valueColor="text-[#64748b]" />
                   <InspectorRow label="AI Sync State" value={selectedEntity.synced ? "OK" : "PENDING"} valueColor={selectedEntity.synced ? "text-[#00ff41]" : "text-[#f59e0b]"} />
                </div>
                
                <div className="pt-4 border-t border-[#1e293b]">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-[#64748b] mb-3">Linked Actions</p>
                  <button className="w-full bg-[#050505] border border-[#1e293b] hover:border-cyan-400 hover:text-cyan-400 text-[#94a3b8] font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 transition-colors flex items-center justify-between group">
                     Force DB Sync <RotateCcw className="w-3 h-3 group-hover:text-cyan-400" />
                  </button>
                </div>
             </div>
           ) : (
             <div className="space-y-6">
                <div>
                   <h2 className="font-mono text-sm uppercase text-white font-bold mb-1 border-b border-[#1e293b] pb-2">ORDER #{selectedEntity.externalId || selectedEntity.id}</h2>
                   <div className="flex justify-between items-center mt-3">
                      <span className="font-mono text-[9px] text-[#64748b] tracking-widest uppercase">Transaction Net</span>
                      <span className="font-mono text-xl font-bold text-[#00ff41]">
                         ${((selectedEntity.totalAmount ?? 0) / 100).toFixed(2)}
                      </span>
                   </div>
                </div>

                <div className="space-y-2">
                   <InspectorRow label="Customer Target" value={selectedEntity.customerEmail || 'N/A'} />
                   <InspectorRow label="Fulfillment Stage" value={selectedEntity.fulfillmentStatus?.toUpperCase() || 'UNFULFILLED'} 
                     valueColor={selectedEntity.fulfillmentStatus === 'fulfilled' ? "text-[#00ff41]" : "text-[#f59e0b]"} />
                   <InspectorRow label="Financial Stage" value={selectedEntity.financialStatus?.toUpperCase() || 'PENDING'} 
                     valueColor={selectedEntity.financialStatus === 'paid' ? "text-[#00ff41]" : "text-[#f59e0b]"} />
                   <InspectorRow label="Creation Timestamp" value={new Date(selectedEntity.createdAt).toLocaleString()} valueColor="text-[#64748b]" />
                </div>
                
                <div className="pt-4 border-t border-[#1e293b]">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-[#64748b] mb-3">Processing Overrides</p>
                  <button 
                    onClick={() => autoFulfill.mutate({ orderId: selectedEntity.id })}
                    disabled={autoFulfill.isPending || selectedEntity.fulfillmentStatus === 'fulfilled'}
                    className="w-full bg-[#050505] border border-[#1e293b] hover:border-[#f59e0b] hover:text-[#f59e0b] disabled:opacity-50 disabled:border-[#1e293b] disabled:text-[#64748b] text-[#94a3b8] font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 transition-colors flex items-center justify-between group"
                  >
                     {autoFulfill.isPending ? "PROCESSING..." : "Override & Fulfill"} <Truck className="w-3 h-3 group-hover:text-[#f59e0b]" />
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
    <div className="bg-[#1e293b] text-[#e2e8f0] font-mono text-[9px] font-bold px-2 py-0.5 rounded-none">
      {count}
    </div>
  );
}

function InspectorRow({ label, value, valueColor = "text-[#e2e8f0]" }: { label: string, value: string, valueColor?: string }) {
  return (
    <div className="flex justify-between items-center border-b border-[#1e293b]/50 py-1.5">
      <span className="font-mono text-[10px] uppercase text-[#64748b]">{label}</span>
      <span className={`font-mono text-[10px] font-bold ${valueColor} text-right max-w-[60%] truncate`}>{value}</span>
    </div>
  );
}
