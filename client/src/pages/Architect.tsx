import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Bot, Search, Loader2, Target, ShieldCheck, AlertTriangle,
  Lightbulb, Package, Plus, Store, Globe, Zap, ExternalLink,
  CheckCircle2, Trash2, Sparkles, X, BarChart3, FileText, Cpu
} from "lucide-react";
import { Streamdown } from "streamdown";

export default function Architect() {
  const [activeTab, setActiveTab] = useState("niche");
  const [keyword, setKeyword] = useState("");
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  
  const utils = trpc.useUtils();
  const { data: status } = trpc.dashboard.agentStatus.useQuery();
  const { data: history, isLoading: historyLoading } = trpc.dashboard.recentActivity.useQuery({ limit: 10 });
  const { data: reports, isLoading: reportsLoading } = trpc.reports.list.useQuery();
  
  const architectStatus = status?.agents?.architect || { status: 'idle', currentTask: null };

  const analyzeNicheMutation = trpc.workflows.launch.useMutation({
    onSuccess: () => {
      toast.success("INITIATING_NICHE_ANALYSIS");
      setKeyword("");
      utils.dashboard.agentStatus.invalidate();
      utils.reports.list.invalidate();
      utils.dashboard.recentActivity.invalidate();
    },
    onError: (err) => {
      toast.error(`ERR: ${err.message}`);
    }
  });

  const selectedReport = useMemo(() => {
    if (!selectedReportId || !reports) return null;
    return reports.find((r: any) => r.id === selectedReportId);
  }, [selectedReportId, reports]);

  const handleAnalyze = () => {
    if (!keyword.trim()) return;
    analyzeNicheMutation.mutate({
      workflowId: "analyze-niche",
      input: { keyword: keyword.trim() },
      sync: false
    });
  };

  return (
    <div className="flex h-full w-full relative bg-[#050505] overflow-hidden text-[#e2e8f0]">
      {/* Main Workspace */}
      <div className="flex-1 flex flex-col h-full border-r border-[#1e293b]">
        {/* Header Bar */}
        <div className="h-14 flex items-center px-6 border-b border-[#1e293b] justify-between bg-[#0a0a0a] shrink-0">
          <div className="flex items-center gap-3">
            <Bot className="text-sky-400 w-5 h-5" />
            <div>
              <h1 className="font-mono text-[11px] uppercase tracking-widest font-bold text-white">Builder Bot: Architect Module</h1>
              <p className="font-mono text-[9px] text-[#64748b]">Niche evaluation, brand generation, store scaffolding.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <span className="font-mono text-[9px] tracking-widest uppercase text-[#64748b]">Engine State:</span>
             <span className={`font-mono text-[10px] uppercase font-bold ${architectStatus.status === 'running' ? 'text-[#f59e0b]' : 'text-[#00ff41]'}`}>
               {architectStatus.status === 'running' ? 'PROCESSING' : 'STANDBY'}
             </span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#050505]">
          <div className="max-w-4xl mx-auto space-y-6">
            
            {/* Input Module */}
            <div className="border border-[#1e293b] bg-[#0a0a0a] p-5 relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-sky-400/50" />
              <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-white mb-3">Target Coordinate Input</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="ENTER NICHE KEYWORD (E.G., 'MODERN MINIMALIST LAMPS')"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="flex-1 bg-[#050505] border border-[#1e293b] rounded-none px-4 py-2 font-mono text-xs text-white uppercase placeholder:text-[#64748b] focus:outline-none focus:border-[#00ff41] transition-colors"
                  onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                />
                <button
                  onClick={handleAnalyze}
                  disabled={analyzeNicheMutation.isPending || !keyword.trim()}
                  className="bg-[#1e293b] hover:bg-sky-500/20 border border-[#1e293b] hover:border-sky-500 text-white font-mono text-[10px] uppercase tracking-widest px-6 py-2 transition-all flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {analyzeNicheMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin text-sky-400" /> : <Search className="w-3.5 h-3.5 mr-2 text-sky-400" />}
                  Execute Scan
                </button>
              </div>
            </div>

            {/* Report Ledger */}
            <div className="border border-[#1e293b] bg-[#0a0a0a]">
              <div className="border-b border-[#1e293b] px-4 py-3 flex justify-between items-center bg-[#050505]">
                <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-white">Intelligence Ledger: Niche Scans</h2>
                <Badge count={reports?.length || 0} />
              </div>
              
              <div className="p-0">
                {reportsLoading ? (
                  <div className="p-8 text-center text-[#64748b] font-mono text-[10px] uppercase">Awaiting Matrix Data...</div>
                ) : reports?.length === 0 ? (
                  <div className="p-8 text-center text-[#64748b] font-mono text-[10px] uppercase">Ledger Empty. Input coordinate to begin.</div>
                ) : (
                  <table className="w-full text-left font-mono text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#1e293b] bg-[#050505]">
                        <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-[#64748b] font-normal w-1/4">Coordinate</th>
                        <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-[#64748b] font-normal">Score</th>
                        <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-[#64748b] font-normal text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports?.map((r: any) => {
                        const data = r.report;
                        const isSelected = selectedReportId === r.id;
                        const cColor = !data ? "text-[#64748b]" : data.viabilityScore >= 70 ? "text-[#00ff41]" : data.viabilityScore >= 40 ? "text-[#f59e0b]" : "text-red-500";
                        return (
                          <tr 
                            key={r.id} 
                            onClick={() => setSelectedReportId(r.id)}
                            className={`border-b border-[#1e293b] cursor-pointer transition-colors ${isSelected ? 'bg-[#1e293b]/40 border-l border-l-[#00ff41]' : 'hover:bg-[#1e293b]/20'} relative`}
                          >
                           <td className="px-4 py-3 font-bold text-[#e2e8f0] uppercase truncate">
                             {r.keyword}
                           </td>
                           <td className={`px-4 py-3 ${cColor}`}>
                             {data ? `${data.viabilityScore}/100` : "PENDING"}
                           </td>
                           <td className="px-4 py-3 text-right text-[#64748b] text-[10px]">
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
      <aside className="w-[380px] shrink-0 bg-[#0a0a0a] flex flex-col z-20 box-border border-l border-[#1e293b]">
        <div className="h-14 flex items-center px-4 border-b border-[#1e293b] justify-between shrink-0 bg-[#050505]">
          <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-[#64748b]">
            Architect Inspector
          </span>
          <span className="flex items-center gap-2">
             <Cpu className="w-3.5 h-3.5 text-sky-400" />
          </span>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
           {!selectedReport ? (
             <div className="flex flex-col items-center justify-center text-center h-40 opacity-50">
                <Target className="w-6 h-6 text-[#64748b] mb-4" />
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#64748b]">Select a ledger row to view telemetry</p>
             </div>
           ) : !selectedReport.report ? (
             <div className="flex flex-col items-center justify-center h-40">
                <Loader2 className="w-5 h-5 text-sky-400 animate-spin mb-3" />
                <p className="font-mono text-[10px] uppercase text-sky-400">Processing Asset...</p>
             </div>
           ) : (
             <div className="space-y-6">
                <div>
                   <h2 className="font-mono text-sm uppercase text-white font-bold mb-1 border-b border-[#1e293b] pb-2">{selectedReport.keyword}</h2>
                   <div className="flex justify-between items-center mt-3">
                      <span className="font-mono text-[9px] text-[#64748b] tracking-widest uppercase">Viability Matrix</span>
                      <span className={`font-mono text-xl font-bold ${selectedReport.report.viabilityScore >= 70 ? 'text-[#00ff41]' : selectedReport.report.viabilityScore >= 40 ? 'text-[#f59e0b]' : 'text-red-500'}`}>
                         {selectedReport.report.viabilityScore}
                      </span>
                   </div>
                </div>

                <div className="space-y-2">
                   <InspectorRow label="Market Demand" value={`${selectedReport.report.marketDemandScore}/100`} />
                   <InspectorRow label="Competition" value={`${selectedReport.report.competitionScore}/100`} />
                   <InspectorRow label="Profit Margin" value={`${selectedReport.report.profitMarginScore}/100`} />
                </div>

                <div>
                   <p className="font-mono text-[9px] uppercase tracking-widest text-[#64748b] mb-2 border-b border-[#1e293b] pb-1">Strengths</p>
                   <ul className="space-y-1.5 mt-2">
                     {selectedReport.report.strengths.map((str: string, i: number) => (
                       <li key={i} className="flex gap-2 text-[10px] font-mono text-[#e2e8f0] opacity-80 leading-relaxed">
                         <span className="text-[#00ff41] mt-0.5">■</span> {str}
                       </li>
                     ))}
                   </ul>
                </div>

                <div>
                   <p className="font-mono text-[9px] uppercase tracking-widest text-[#64748b] mb-2 border-b border-[#1e293b] pb-1">Weaknesses</p>
                   <ul className="space-y-1.5 mt-2">
                     {selectedReport.report.weaknesses.map((wk: string, i: number) => (
                       <li key={i} className="flex gap-2 text-[10px] font-mono text-[#e2e8f0] opacity-80 leading-relaxed">
                         <span className="text-red-500 mt-0.5">■</span> {wk}
                       </li>
                     ))}
                   </ul>
                </div>

                <div className="pt-4 border-t border-[#1e293b]">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-[#64748b] mb-3">Recommended Actions</p>
                  <div className="flex flex-col gap-2">
                    <button className="w-full bg-[#050505] border border-[#1e293b] hover:border-[#00ff41] hover:text-[#00ff41] text-[#94a3b8] font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 transition-colors flex items-center justify-between group">
                       Generate Brand Pack <Sparkles className="w-3 h-3 group-hover:text-[#00ff41]" />
                    </button>
                    <button className="w-full bg-[#050505] border border-[#1e293b] hover:border-sky-400 hover:text-sky-400 text-[#94a3b8] font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 transition-colors flex items-center justify-between group">
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

function Badge({ count }: { count: number }) {
  return (
    <div className="bg-[#1e293b] text-[#e2e8f0] font-mono text-[9px] font-bold px-2 py-0.5 rounded-none">
      {count}
    </div>
  );
}

function InspectorRow({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex justify-between items-center border-b border-[#1e293b]/50 py-1.5">
      <span className="font-mono text-[10px] uppercase text-[#64748b]">{label}</span>
      <span className="font-mono text-[10px] font-bold text-[#e2e8f0]">{value}</span>
    </div>
  );
}
