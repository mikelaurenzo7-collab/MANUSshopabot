import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Bot, Search, Loader2, Target, ShieldCheck, AlertTriangle,
  Lightbulb, Package, Plus, Store, Globe, Zap, ExternalLink,
  CheckCircle2, Trash2, Sparkles, X, BarChart3, FileText, Cpu,
  ImageIcon, Wand2
} from "lucide-react";
import { Streamdown } from "streamdown";

export default function Architect() {
  const [activeTab, setActiveTab] = useState("niche");
  const [keyword, setKeyword] = useState("");
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const utils = trpc.useUtils();
  const { data: status } = trpc.dashboard.agentStatus.useQuery();
  const { data: history, isLoading: historyLoading } = trpc.dashboard.recentActivity.useQuery({ limit: 10 });
  const { data: reports, isLoading: reportsLoading } = trpc.architect.nicheReports.useQuery();
  
  const architectStatus: any = (status as any[])?.find?.((s: any) => s.agentType === 'architect') || { status: 'idle', currentTask: null };

  const analyzeNicheMutation = trpc.workflows.launch.useMutation({
    onSuccess: () => {
      toast.success("INITIATING_NICHE_ANALYSIS");
      setKeyword("");
      setError(null);
      utils.dashboard.agentStatus.invalidate();
      utils.workflows.list?.invalidate?.();
      utils.dashboard.recentActivity.invalidate();
    },
    onError: (err) => {
      const isSubscriptionGate = err.message.includes("upgrade") || err.message.includes("paid plan");
      if (isSubscriptionGate) {
        setError("Upgrade required to launch bot workflows. Choose a plan to continue.");
        toast.error("Upgrade required to launch bot workflows.");
      } else {
        setError(err.message);
        toast.error(err.message || "Failed to launch workflow");
      }
    }
  });

  const selectedReport = useMemo(() => {
    if (!selectedReportId || !reports) return null;
    return reports.find((r: any) => r.id === selectedReportId);
  }, [selectedReportId, reports]);

  const handleAnalyze = () => {
    if (!keyword.trim()) return;
    analyzeNicheMutation.mutate({
      agentType: "architect",
      workflowType: "niche_research",
      title: `Niche Research: ${keyword.trim()}`,
      scope: "global",
      input: { keyword: keyword.trim() },
    });
  };

  return (
    <div className="flex h-full w-full relative bg-[#050505] overflow-hidden text-white flex-col md:flex-row">
      {/* Main Workspace */}
      <div className="flex-1 flex flex-col h-full md:border-r border-b md:border-b-0 border-white/[0.08]">
        {/* Header Bar */}
        <div className="h-12 md:h-14 flex items-center px-3 md:px-6 border-b border-white/[0.08] justify-between bg-black/40 shrink-0 gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="relative shrink-0">
              <Bot className="text-sky-400 w-4 md:w-5 h-4 md:h-5" />
              <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(14,165,233,0.8)]" />
            </div>
            <div className="min-w-0">
              <h1 className="font-heading text-xs md:text-sm font-bold text-white truncate tracking-tight">Builder Bot</h1>
              <p className="font-mono text-[8px] md:text-[9px] text-muted-foreground hidden sm:block">Niche evaluation · brand generation · store scaffolding</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            <span className={`font-mono text-[9px] uppercase tracking-widest font-bold flex items-center gap-1.5 ${architectStatus.status === 'running' ? 'text-amber-400' : 'text-emerald-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${architectStatus.status === 'running' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
              {architectStatus.status === 'running' ? 'RUNNING' : 'READY'}
            </span>
          </div>
        </div>
        {/* Accent gradient line under header */}
        <div className="h-px bg-gradient-to-r from-sky-500/50 via-sky-500/10 to-transparent shrink-0" />

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-6 bg-[#050505]">
          <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
            
            {/* Error Banner */}
            {error && (
              <div className="flex items-start gap-2 md:gap-3 p-3 md:p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-4 md:w-5 h-4 md:h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[9px] md:text-[10px] uppercase tracking-widest font-bold text-red-500 mb-2 break-words">{error}</p>
                  {error.includes("Upgrade") && (
                    <a href="/pricing" className="inline-flex items-center gap-1 md:gap-2 text-[8px] md:text-[9px] font-mono uppercase tracking-widest text-sky-400 hover:text-sky-300 transition-colors">
                      View Plans <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <button onClick={() => setError(null)} className="text-red-500 hover:text-red-400 transition-colors mt-0.5 shrink-0">
                  <X className="w-3 md:w-4 h-3 md:h-4" />
                </button>
              </div>
            )}
            
            {/* Input Module */}
            <div className="border border-white/[0.08] bg-black/40 p-5 relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-sky-400/50" />
              <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-white mb-3">Target Coordinate Input</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="ENTER NICHE KEYWORD (E.G., 'MODERN MINIMALIST LAMPS')"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="flex-1 bg-[#050505] border border-white/[0.08] rounded-none px-4 py-2 font-mono text-xs text-white uppercase placeholder:text-muted-foreground focus:outline-none focus:border-[#00ff41] transition-colors"
                  onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                />
                <button
                  onClick={handleAnalyze}
                  disabled={analyzeNicheMutation.isPending || !keyword.trim()}
                  className="bg-white/[0.06] hover:bg-sky-500/20 border border-white/[0.08] hover:border-sky-500 text-white font-mono text-[10px] uppercase tracking-widest px-6 py-2 transition-all flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {analyzeNicheMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin text-sky-400" /> : <Search className="w-3.5 h-3.5 mr-2 text-sky-400" />}
                  Execute Scan
                </button>
              </div>
            </div>

            {/* Image Optimizer Module */}
            <ImageOptimizerPanel />

            {/* Report Ledger */}
            <div className="border border-white/[0.08] bg-black/40">
              <div className="border-b border-white/[0.08] px-4 py-3 flex justify-between items-center bg-[#050505]">
                <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-white">Intelligence Ledger: Niche Scans</h2>
                <Badge count={reports?.length || 0} />
              </div>
              
              <div className="p-0">
                {reportsLoading ? (
                  <div className="p-8 text-center text-muted-foreground font-mono text-[10px] uppercase">Awaiting Matrix Data...</div>
                ) : reports?.length === 0 ? (
                  <div className="p-12 text-center">
                    <Lightbulb className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-bold">No Niches Analyzed Yet</p>
                    <p className="font-mono text-[9px] text-muted-foreground mt-2 opacity-70">Enter a niche keyword above to begin market research and viability analysis.</p>
                  </div>
                ) : (
                  <table className="w-full text-left font-mono text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.08] bg-[#050505]">
                        <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-muted-foreground font-normal w-1/4">Coordinate</th>
                        <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-muted-foreground font-normal">Score</th>
                        <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-muted-foreground font-normal text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports?.map((r: any) => {
                        const data = r.report;
                        const isSelected = selectedReportId === r.id;
                        const cColor = !data ? "text-muted-foreground" : data.viabilityScore >= 70 ? "text-emerald-400" : data.viabilityScore >= 40 ? "text-amber-400" : "text-red-500";
                        return (
                          <tr 
                            key={r.id} 
                            onClick={() => setSelectedReportId(r.id)}
                            className={`border-b border-white/[0.08] cursor-pointer transition-colors ${isSelected ? 'bg-white/[0.024] border-l border-l-emerald-400' : 'hover:bg-white/[0.012]'} relative`}
                          >
                           <td className="px-4 py-3 font-bold text-white uppercase truncate">
                             {r.keyword}
                           </td>
                           <td className={`px-4 py-3 ${cColor}`}>
                             {data ? `${data.viabilityScore}/100` : "PENDING"}
                           </td>
                           <td className="px-4 py-3 text-right text-muted-foreground text-[10px]">
                             {new Date(r.createdAt).toLocaleString()}
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
        </div>
      </div>

      {/* Metadata Inspector (Right Panel) */}
      <aside className="w-[380px] shrink-0 bg-black/40 flex flex-col z-20 box-border border-l border-white/[0.08]">
        <div className="h-14 flex items-center px-4 border-b border-white/[0.08] justify-between shrink-0 bg-[#050505]">
          <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
            Architect Inspector
          </span>
          <span className="flex items-center gap-2">
             <Cpu className="w-3.5 h-3.5 text-sky-400" />
          </span>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
           {!selectedReport ? (
             <div className="flex flex-col items-center justify-center text-center min-h-[300px]">
                <div className="h-14 w-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(14,165,233,0.1)]">
                  <Target className="w-7 h-7 text-sky-400/60" />
                </div>
                <p className="font-mono text-xs uppercase tracking-widest text-white/50 font-bold">No Report Selected</p>
                <p className="font-mono text-[9px] text-white/30 mt-2 max-w-[200px]">Select a niche report from the ledger to view full telemetry.</p>
             </div>
           ) : !selectedReport.report ? (
             <div className="flex flex-col items-center justify-center h-40">
                <Loader2 className="w-5 h-5 text-sky-400 animate-spin mb-3" />
                <p className="font-mono text-[10px] uppercase text-sky-400">Processing Asset...</p>
             </div>
           ) : (
             <div className="space-y-6">
                <div>
                   <h2 className="font-mono text-sm uppercase text-white font-bold mb-1 border-b border-white/[0.08] pb-2">{selectedReport.keyword}</h2>
                   <div className="flex justify-between items-center mt-3">
                      <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">Viability Matrix</span>
                      <span className={`font-mono text-xl font-bold ${(selectedReport.report as any).viabilityScore >= 70 ? 'text-emerald-400' : (selectedReport.report as any).viabilityScore >= 40 ? 'text-amber-400' : 'text-red-500'}`}>
                         {(selectedReport.report as any).viabilityScore}
                      </span>
                   </div>
                </div>

                <div className="space-y-2">
                   <InspectorRow label="Market Demand" value={`${(selectedReport.report as any).marketDemandScore}/100`} />
                   <InspectorRow label="Competition" value={`${(selectedReport.report as any).competitionScore}/100`} />
                   <InspectorRow label="Profit Margin" value={`${(selectedReport.report as any).profitMarginScore}/100`} />
                </div>

                <div>
                   <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-2 border-b border-white/[0.08] pb-1">Strengths</p>
                   <ul className="space-y-1.5 mt-2">
                     {(selectedReport.report as any).strengths?.map((str: string, i: number) => (
                       <li key={i} className="flex gap-2 text-[10px] font-mono text-white opacity-80 leading-relaxed">
                         <span className="text-emerald-400 mt-0.5">■</span> {str}
                       </li>
                     ))}
                   </ul>
                </div>

                <div>
                   <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-2 border-b border-white/[0.08] pb-1">Weaknesses</p>
                   <ul className="space-y-1.5 mt-2">
                     {(selectedReport.report as any).weaknesses?.map((wk: string, i: number) => (
                       <li key={i} className="flex gap-2 text-[10px] font-mono text-white opacity-80 leading-relaxed">
                         <span className="text-red-500 mt-0.5">■</span> {wk}
                       </li>
                     ))}
                   </ul>
                </div>

                <div className="pt-4 border-t border-white/[0.08]">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-3">Recommended Actions</p>
                  <div className="flex flex-col gap-2">
                    <button className="w-full bg-[#050505] border border-white/[0.08] hover:border-[#00ff41] hover:text-emerald-400 text-[#94a3b8] font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 transition-colors flex items-center justify-between group">
                       Generate Brand Pack <Sparkles className="w-3 h-3 group-hover:text-emerald-400" />
                    </button>
                    <button className="w-full bg-[#050505] border border-white/[0.08] hover:border-sky-400 hover:text-sky-400 text-[#94a3b8] font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 transition-colors flex items-center justify-between group">
                       Initialize Drop Store <Store className="w-3 h-3 group-hover:text-sky-400" />
                    </button>
                  </div>
                </div>
             </div>
           )}
        </div>
      </aside>
    </div>
  );
}

function ImageOptimizerPanel() {
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [optimizeResult, setOptimizeResult] = useState<{ succeeded: number; failed: number; results: any[] } | null>(null);
  const { data: stores } = trpc.stores.list.useQuery();
  const storeList = (stores as any[]) || [];

  // Load products for the selected store (lazy — only when a store is picked)
  const { data: products } = trpc.stores.products.useQuery(
    { storeId: Number(selectedStoreId), status: "all" },
    { enabled: !!selectedStoreId }
  );
  const productIds = ((products as any[]) || []).map((p: any) => p.id).slice(0, 50);

  const optimizeMutation = trpc.architect.optimizeProductImages.useMutation({
    onSuccess: (data: any) => {
      setOptimizeResult(data);
      toast.success(`Optimized ${data.succeeded}/${data.results.length} product images`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Image optimization failed");
    },
  });

  const handleOptimize = () => {
    if (!selectedStoreId) { toast.error("Select a store first"); return; }
    if (!productIds.length) { toast.error("No products found in this store"); return; }
    setOptimizeResult(null);
    optimizeMutation.mutate({ storeId: Number(selectedStoreId), productIds });
  };

  return (
    <div className="border border-white/[0.08] bg-black/40 p-5 relative">
      <div className="absolute top-0 left-0 w-1 h-full bg-violet-400/50" />
      <div className="flex items-center gap-2 mb-3">
        <ImageIcon className="w-4 h-4 text-violet-400" />
        <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-white">Bulk Image Optimizer</h2>
      </div>
      <p className="font-mono text-[9px] text-muted-foreground mb-4 leading-relaxed">Fetches all product images for a store and generates AI-optimized variants (thumbnail, card, hero). Runs in the background — up to 50 products per batch.</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={selectedStoreId}
          onChange={(e) => setSelectedStoreId(e.target.value)}
          className="flex-1 bg-[#050505] border border-white/[0.08] text-white font-mono text-xs px-3 py-2 focus:outline-none focus:border-violet-400 transition-colors"
        >
          <option value="">SELECT STORE TARGET</option>
          {storeList.map((s: any) => (
            <option key={s.id} value={s.id}>{s.name} ({s.platform})</option>
          ))}
        </select>
        <button
          onClick={handleOptimize}
          disabled={optimizeMutation.isPending || !selectedStoreId}
          className="bg-white/[0.06] hover:bg-violet-500/20 border border-white/[0.08] hover:border-violet-400 text-white font-mono text-[10px] uppercase tracking-widest px-6 py-2 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {optimizeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" /> : <Wand2 className="w-3.5 h-3.5 text-violet-400" />}
          {optimizeMutation.isPending ? "Optimizing..." : "Run Optimizer"}
        </button>
      </div>
      {optimizeMutation.isPending && (
        <div className="mt-4">
          <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full bg-violet-500 animate-pulse" style={{ width: "60%" }} />
          </div>
          <p className="font-mono text-[9px] text-violet-400 mt-2 uppercase tracking-widest">Processing product images...</p>
        </div>
      )}
      {optimizeResult && (
        <div className="mt-4 flex items-center gap-4 p-3 bg-violet-500/8 border border-violet-500/20 rounded">
          <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0" />
          <div className="font-mono text-[10px] text-white">
            <span className="text-violet-400 font-bold">{optimizeResult.succeeded}</span> optimized &middot;
            <span className="text-red-400 font-bold ml-2">{optimizeResult.failed}</span> failed &middot;
            <span className="text-muted-foreground ml-2">{optimizeResult.results.length} total</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <div className="bg-white/[0.06] text-white font-mono text-[9px] font-bold px-2 py-0.5 rounded-none">
      {count}
    </div>
  );
}

function InspectorRow({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex justify-between items-center border-b border-white/[0.04] py-1.5">
      <span className="font-mono text-[10px] uppercase text-muted-foreground">{label}</span>
      <span className="font-mono text-[10px] font-bold text-white">{value}</span>
    </div>
  );
}
