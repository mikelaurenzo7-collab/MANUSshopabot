import React, { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useSearch } from "wouter";
import {
  Plug, ShoppingBag, Share2, CheckCircle2, AlertCircle, XCircle,
  ExternalLink, Trash2, RefreshCw, Plus, Shield, Loader2, Wifi, WifiOff,
  Database, Network, Zap
} from "lucide-react";

const PLATFORM_ICONS: Record<string, string> = {
  shopify: "🛍️", woocommerce: "🌐", amazon: "📦", etsy: "🧡",
  ebay: "🔨", tiktok_shop: "🎵", walmart: "🏪",
  meta: "📘", instagram: "📸", tiktok: "🎵", twitter: "🐦",
};

export default function IntegrationsPage() {
  const [connectTab, setConnectTab] = useState<"ecommerce" | "social">("ecommerce");
  const [selectedEntity, setSelectedEntity] = useState<any>(null);
  const [activeSubTab, setActiveSubTab] = useState<"connected" | "catalogue">("connected");

  // Queries
  const { data: ecommercePlatforms } = trpc.connectors.ecommercePlatforms.useQuery();
  const { data: socialPlatforms } = trpc.connectors.socialPlatforms.useQuery();
  const { data: credentials, refetch: refetchCreds } = trpc.connectors.listCredentials.useQuery();
  const { data: socialAccounts, refetch: refetchSocial } = trpc.connectors.listSocialAccounts.useQuery();
  const { data: summary } = trpc.connectors.connectionSummary.useQuery();

  // Search logic for redirects
  const searchString = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("connected") && params.get("account")) {
      toast.success(`${(params.get("name") || params.get("account"))?.toUpperCase()} CONNECTED SUCCESSFULLY`);
      history.replaceState(null, "", window.location.pathname);
    }
  }, [searchString]);

  // Mutations
  const disconnectCred = trpc.connectors.disconnectCredential.useMutation({
    onSuccess: () => { toast.success("AUTHORIZATION_REVOKED"); refetchCreds(); setSelectedEntity(null); },
    onError: (err) => toast.error(`ERR: ${err.message}`),
  });
  const disconnectSocial = trpc.connectors.disconnectSocialAccount.useMutation({
    onSuccess: () => { toast.success("AUTHORIZATION_REVOKED"); refetchSocial(); setSelectedEntity(null); },
    onError: (err) => toast.error(`ERR: ${err.message}`),
  });
  const checkHealth = trpc.connectors.checkCredentialHealth.useMutation({
    onSuccess: (data) => { toast.success(`LINK_STATUS_${data.status.toUpperCase()}`); refetchCreds(); },
    onError: (err) => toast.error(`ERR: ${err.message}`),
  });
  const generateOAuth = trpc.connectors.generateOAuthUrl.useMutation({
    onSuccess: (data) => { if (data.url) window.location.href = data.url; else toast.error(data.message); },
    onError: (err) => toast.error(`ERR: ${err.message}`),
  });
  const generateSocialOAuth = trpc.connectors.generateSocialOAuthUrl.useMutation({
    onSuccess: (data) => { if (data.url) window.location.href = data.url; else toast.error(data.message); },
    onError: (err) => toast.error(`ERR: ${err.message}`),
  });

  const connectedPlatformIds = useMemo(() => new Set((credentials || []).map((c: any) => c.platform)), [credentials]);
  const connectedSocialIds = useMemo(() => new Set((socialAccounts || []).map((s: any) => s.platform)), [socialAccounts]);

  const allConnected = useMemo(() => [
    ...(credentials || []).map((c: any) => ({ ...c, kind: "ecommerce" })),
    ...(socialAccounts || []).map((s: any) => ({ ...s, kind: "social" }))
  ], [credentials, socialAccounts]);

  const connectToPlatform = (platformId: string, kind: "ecommerce" | "social") => {
     if (kind === "ecommerce") {
        generateOAuth.mutate({ platformId });
     } else {
        generateSocialOAuth.mutate({ platformId });
     }
  };

  return (
    <div className="flex h-full w-full relative bg-[#050505] overflow-hidden text-[#e2e8f0]">
      {/* Main Workspace */}
      <div className="flex-1 flex flex-col h-full border-r border-[#1e293b]">
        {/* Header Bar */}
        <div className="h-14 flex items-center px-6 border-b border-[#1e293b] justify-between bg-[#0a0a0a] shrink-0">
          <div className="flex items-center gap-3">
            <Zap className="text-cyan-400 w-5 h-5" />
            <div>
              <h1 className="font-mono text-[11px] uppercase tracking-widest font-bold text-white">System Data: Integration Nodes</h1>
              <p className="font-mono text-[9px] text-[#64748b]">External APIs, authentication links, operational bridges.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <button onClick={() => { setActiveSubTab("connected"); setSelectedEntity(null); }} className={`font-mono text-[10px] uppercase font-bold tracking-widest pb-1 transition-colors border-b-2 ${activeSubTab === "connected" ? "border-cyan-400 text-white" : "border-transparent text-[#64748b] hover:text-white"}`}>ACTIVE_NODES</button>
             <button onClick={() => { setActiveSubTab("catalogue"); setSelectedEntity(null); }} className={`font-mono text-[10px] uppercase font-bold tracking-widest pb-1 transition-colors border-b-2 ${activeSubTab === "catalogue" ? "border-cyan-400 text-white" : "border-transparent text-[#64748b] hover:text-white"}`}>NODE_CATALOGUE</button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#050505]">
          <div className="max-w-4xl mx-auto space-y-6">

             {activeSubTab === "connected" ? (
               <div className="border border-[#1e293b] bg-[#0a0a0a]">
                 <div className="border-b border-[#1e293b] px-4 py-3 flex justify-between items-center bg-[#050505]">
                   <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-white flex items-center"><Network className="w-3 h-3 text-cyan-400 mr-2" /> Live Network Bridges</h2>
                   <span className="font-mono text-[9px] tracking-widest text-[#64748b]">{allConnected.length} SYSTEMS ACTIVE</span>
                 </div>
                 <div className="p-0 overflow-auto custom-scrollbar min-h-[400px]">
                   {!allConnected.length ? (
                     <div className="p-12 text-center text-[#64748b] font-mono text-[10px] uppercase tracking-widest border-b border-[#1e293b]/50">
                        NO_BRIDGES_DETECTED
                     </div>
                   ) : (
                     <table className="w-full text-left font-mono border-collapse">
                       <thead>
                         <tr className="border-b border-[#1e293b] bg-[#050505]">
                           <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-[#64748b] font-normal">Node Identity</th>
                           <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-[#64748b] font-normal text-center">Type</th>
                           <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-[#64748b] font-normal text-right">Link Status</th>
                         </tr>
                       </thead>
                       <tbody>
                         {allConnected.map((c: any) => {
                           const isSelected = selectedEntity?.id === c.id;
                           return (
                             <tr 
                               key={`${c.kind}-${c.id}`} 
                               onClick={() => setSelectedEntity(c)}
                               className={`border-b border-[#1e293b] cursor-pointer transition-colors ${isSelected ? 'bg-[#1e293b]/40 border-l border-l-cyan-400' : 'hover:bg-[#1e293b]/20'} relative`}
                             >
                              <td className="px-4 py-3 text-[10px] text-white flex items-center uppercase font-bold tracking-wider">
                                <span className="mr-3 text-[#1e293b] text-sm hidden sm:inline-block">{PLATFORM_ICONS[c.platform] || "🛜"}</span>
                                {c.storeName || c.accountName || c.name}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`text-[9px] uppercase tracking-widest px-2 py-0.5 border ${c.kind === 'ecommerce' ? 'border-[#00ff41]/30 text-[#00ff41]' : 'border-[#f59e0b]/30 text-[#f59e0b]'}`}>{c.kind}</span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {c.status === "active" ? (
                                  <span className="text-[#00ff41] font-bold text-[10px] uppercase tracking-widest flex items-center justify-end"><Wifi className="w-3 h-3 mr-1"/> SYNCED</span>
                                ) : (
                                  <span className="text-red-500 font-bold text-[10px] uppercase tracking-widest flex items-center justify-end"><WifiOff className="w-3 h-3 mr-1"/> ERR_DISCONNECT</span>
                                )}
                              </td>
                             </tr>
                           )
                         })}
                       </tbody>
                     </table>
                   )}
                 </div>
               </div>
             ) : (
               <div className="space-y-6">
                 {/* Connection Form Modes */}
                 <div className="flex items-center gap-2 border-b border-[#1e293b] pb-4">
                   <button onClick={() => setConnectTab("ecommerce")} className={`px-4 py-2 border font-mono text-[10px] uppercase tracking-widest transition-colors ${connectTab === "ecommerce" ? "border-cyan-400 text-cyan-400 bg-cyan-400/5" : "border-[#1e293b] text-[#64748b] bg-[#0a0a0a] hover:text-white"}`}>E-Commerce Matrices</button>
                   <button onClick={() => setConnectTab("social")} className={`px-4 py-2 border font-mono text-[10px] uppercase tracking-widest transition-colors ${connectTab === "social" ? "border-[#f59e0b] text-[#f59e0b] bg-[#f59e0b]/5" : "border-[#1e293b] text-[#64748b] bg-[#0a0a0a] hover:text-white"}`}>Social Networks</button>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                   {(connectTab === "ecommerce" ? ecommercePlatforms : socialPlatforms)?.map((platform: any) => {
                     const isConnected = connectTab === "ecommerce" ? connectedPlatformIds.has(platform.id) : connectedSocialIds.has(platform.id);
                     return (
                       <div key={platform.id} className="border border-[#1e293b] bg-[#0a0a0a] p-4 flex flex-col group relative">
                         {isConnected && <div className="absolute top-0 right-0 w-16 h-16 bg-[#00ff41]/5 rounded-bl-[100%] pointer-events-none"/>}
                         <div className="flex items-center justify-between mb-3">
                           <div className="flex items-center gap-2">
                             <span className="text-lg opacity-70 group-hover:opacity-100 transition-opacity">{PLATFORM_ICONS[platform.id] || "🛜"}</span>
                             <span className="font-mono text-xs uppercase text-white font-bold">{platform.name}</span>
                           </div>
                           {isConnected && <CheckCircle2 className="w-3 h-3 text-[#00ff41]" />}
                         </div>
                         <p className="font-mono text-[9px] text-[#64748b] mb-4 flex-1 line-clamp-2">{platform.description}</p>
                         
                         <button 
                           onClick={() => connectToPlatform(platform.id, connectTab)}
                           disabled={generateOAuth.isPending || generateSocialOAuth.isPending}
                           className="w-full bg-[#050505] border border-[#1e293b] hover:border-cyan-400 hover:text-cyan-400 text-white font-mono text-[10px] uppercase font-bold tracking-widest px-4 py-2 transition-colors flex items-center justify-center disabled:opacity-50"
                         >
                            {isConnected ? "INITIALIZE_DUPLICATE_NODE" : "AUTHORIZE_LINK"} <ExternalLink className="w-3 h-3 ml-2" />
                         </button>
                       </div>
                     )
                   })}
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
            Integration Inspector
          </span>
          <span className="flex items-center gap-2">
             <Shield className="w-3.5 h-3.5 text-cyan-400" />
          </span>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
           {!selectedEntity ? (
             <div className="flex flex-col items-center justify-center text-center h-40 opacity-50">
                <Database className="w-6 h-6 text-[#64748b] mb-4" />
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#64748b]">Awaiting active node selection</p>
             </div>
           ) : (
             <div className="space-y-6">
                <div>
                   <h2 className="font-mono text-sm uppercase text-white font-bold mb-1 border-b border-[#1e293b] pb-2 break-all">{selectedEntity.storeName || selectedEntity.accountName || selectedEntity.name}</h2>
                   <div className="flex justify-between items-center mt-3">
                      <span className="font-mono text-[9px] text-[#64748b] tracking-widest uppercase">Target Vector</span>
                      <span className="font-mono text-[10px] text-white uppercase font-bold">{selectedEntity.platform}</span>
                   </div>
                </div>

                <div className="space-y-2">
                   <InspectorRow label="Uplink Kind" value={selectedEntity.kind.toUpperCase()} />
                   <InspectorRow label="Node Key" value={`#${selectedEntity.id}`} valueColor="text-[#64748b]" />
                   <InspectorRow label="Health" value={selectedEntity.status.toUpperCase()} valueColor={selectedEntity.status === 'active' ? "text-[#00ff41]" : "text-red-500"} />
                   <InspectorRow label="Link Initiated" value={new Date(selectedEntity.createdAt).toLocaleString()} valueColor="text-[#64748b]" />
                </div>
                
                <div className="pt-4 border-t border-[#1e293b] space-y-2">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-[#64748b] mb-3">Security & Diagnostic Overrides</p>
                  {selectedEntity.kind === "ecommerce" && (
                    <button 
                       onClick={() => checkHealth.mutate({ credentialId: selectedEntity.id })}
                       disabled={checkHealth.isPending}
                       className="w-full bg-[#050505] border border-[#1e293b] hover:border-cyan-400 hover:text-cyan-400 text-[#94a3b8] disabled:opacity-50 font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 transition-colors flex items-center justify-between group"
                    >
                       DIAGNOSTIC_PING <RefreshCw className={`w-3 h-3 group-hover:text-cyan-400 ${checkHealth.isPending ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  <button 
                     onClick={() => selectedEntity.kind === "ecommerce" ? disconnectCred.mutate({ credentialId: selectedEntity.id }) : disconnectSocial.mutate({ accountId: selectedEntity.id })}
                     disabled={disconnectCred.isPending || disconnectSocial.isPending}
                     className="w-full bg-[#050505] border border-red-500/30 hover:border-red-500 hover:text-red-500 text-[#94a3b8] disabled:opacity-50 font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 transition-colors flex items-center justify-between group"
                  >
                     SEVER_CONNECTION <Trash2 className="w-3 h-3 group-hover:text-red-500" />
                  </button>
                </div>
             </div>
           )}
        </div>
      </aside>
    </div>
  );
}

function InspectorRow({ label, value, valueColor = "text-[#e2e8f0]" }: { label: string, value: string, valueColor?: string }) {
  return (
    <div className="flex justify-between items-center border-b border-[#1e293b]/50 py-1.5">
      <span className="font-mono text-[9px] uppercase text-[#64748b]">{label}</span>
      <span className={`font-mono text-[10px] font-bold ${valueColor} text-right max-w-[60%] truncate uppercase tracking-widest`}>{value}</span>
    </div>
  );
}
