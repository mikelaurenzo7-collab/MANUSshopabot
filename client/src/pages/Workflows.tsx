import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Workflow, Play, Search, Target, Megaphone, Loader2, CheckCircle2,
  XCircle, Pause, AlertTriangle, Cpu, SkipForward, ArrowRight, Zap, RotateCcw,
  Check
} from "lucide-react";
import { Streamdown } from "streamdown";

const STATUS_MAP: Record<string, { color: string, label: string }> = {
  pending: { color: "text-[#64748b]", label: "PENDING" },
  running: { color: "text-sky-400", label: "PROCESSING" },
  awaiting_approval: { color: "text-[#f59e0b]", label: "MANUAL_INTERVENTION_REQD" },
  completed: { color: "text-[#00ff41]", label: "COMPLETED" },
  failed: { color: "text-red-500", label: "ERR_FAILED" },
  cancelled: { color: "text-[#64748b]", label: "TERMINATED_BY_USER" },
  skipped: { color: "text-[#64748b]", label: "BYPASSED" },
};

export default function Workflows() {
  const [activeTab, setActiveTab] = useState<"active" | "history" | "approvals" | "launch">("active");
  const [selectedWfId, setSelectedWfId] = useState<number | null>(null);
  
  // Launch Form State
  const [launchForm, setLaunchForm] = useState({
    agentType: "",
    workflowType: "",
    title: "",
    scope: "global",
    storeId: undefined as number | undefined,
    inputText: "",
  });

  const utils = trpc.useUtils();
  const { data: availableTypes } = trpc.workflows.availableTypes.useQuery();
  const { data: workflows, isLoading: workflowsLoading } = trpc.workflows.list.useQuery();
  const { data: activeWorkflows } = trpc.workflows.active.useQuery();
  const { data: pendingApprovals } = trpc.workflows.pendingApprovals.useQuery();
  const { data: stores } = trpc.stores.list.useQuery();
  const { data: counts } = trpc.workflows.counts.useQuery();

  const { data: detailRaw } = trpc.workflows.detail.useQuery(
    { workflowId: selectedWfId! },
    { enabled: !!selectedWfId }
  );

  const launchMutation = trpc.workflows.launch.useMutation({
    onSuccess: () => {
      toast.success("WORKFLOW_COMMENCED");
      utils.workflows.list.invalidate();
      utils.workflows.active.invalidate();
      utils.workflows.counts.invalidate();
      setLaunchForm({ ...launchForm, inputText: "" });
      setActiveTab("active");
    },
    onError: (err) => toast.error(`ERR: ${err.message}`)
  });

  const reviewMutation = trpc.workflows.reviewStep.useMutation({
    onSuccess: () => {
      toast.success("APPROVAL_LOGGED");
      utils.workflows.pendingApprovals.invalidate();
      utils.workflows.list.invalidate();
      utils.workflows.active.invalidate();
      utils.workflows.detail.invalidate();
    },
    onError: (err) => toast.error(`ERR: ${err.message}`)
  });

  const cancelMutation = trpc.workflows.cancel.useMutation({
    onSuccess: () => {
      toast.success("WORKFLOW_TERMINATED");
      utils.workflows.list.invalidate();
      utils.workflows.active.invalidate();
      utils.workflows.counts.invalidate();
    },
    onError: (err) => toast.error(`ERR: ${err.message}`)
  });

  const retryMutation = trpc.workflows.retry.useMutation({
    onSuccess: () => {
      toast.success("WORKFLOW_RESTARTED");
      utils.workflows.list.invalidate();
      utils.workflows.active.invalidate();
      utils.workflows.counts.invalidate();
    },
    onError: (err) => toast.error(`ERR: ${err.message}`)
  });

  const handleLaunch = () => {
    if (!launchForm.agentType || !launchForm.workflowType) return;
    
    // Simplistic input passing based on inputText
    const keyMap: Record<string, string> = {
      niche_research: "keyword", product_sourcing: "niche", catalog_generation: "keyword",
      store_setup: "storeName", inventory_audit: "scope", pricing_optimization: "strategy",
      competitor_analysis: "niche", ad_campaign: "product", social_content: "brand",
      seo_audit: "domain", email_flow: "flowType", product_creative: "product", brand_content: "topic",
    };
    const key = keyMap[launchForm.workflowType] ?? "input";
    const inputData = launchForm.inputText.trim() ? { [key]: launchForm.inputText } : {};

    launchMutation.mutate({
      agentType: launchForm.agentType as any,
      workflowType: launchForm.workflowType,
      title: `${launchForm.title}`,
      scope: launchForm.scope as any,
      storeId: launchForm.storeId,
      input: inputData,
    });
  };

  const getTabCount = (tab: string) => {
    if (tab === "active") return activeWorkflows?.length || 0;
    if (tab === "history") return workflows?.length || 0;
    if (tab === "approvals") return pendingApprovals?.length || 0;
    return 0;
  };

  const currentList = activeTab === "active" ? activeWorkflows : activeTab === "history" ? workflows : null;

  return (
    <div className="flex h-full w-full relative bg-[#050505] overflow-hidden text-[#e2e8f0]">
      {/* Main Workspace */}
      <div className="flex-1 flex flex-col h-full border-r border-[#1e293b]">
        {/* Header Bar */}
        <div className="h-14 flex items-center px-6 border-b border-[#1e293b] justify-between bg-[#0a0a0a] shrink-0">
          <div className="flex items-center gap-3">
            <Workflow className="text-[#f59e0b] w-5 h-5" />
            <div>
              <h1 className="font-mono text-[11px] uppercase tracking-widest font-bold text-white">System Data: Workflow Engine</h1>
              <p className="font-mono text-[9px] text-[#64748b]">Central hub for multi-agent autonomous process execution.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             {["active", "history", "approvals", "launch"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`font-mono text-[10px] uppercase font-bold tracking-widest pb-1 transition-colors border-b-2 ${activeTab === tab ? "border-[#f59e0b] text-white" : "border-transparent text-[#64748b] hover:text-white"}`}
                >
                  {tab === "launch" ? "INITIALIZE" : `${tab} [${getTabCount(tab)}]`}
                </button>
             ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#050505]">
          <div className="max-w-5xl mx-auto">

            {activeTab === "launch" ? (
              <div className="space-y-6">
                 {/* Launch Configuration */}
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Architect Models */}
                    <div className="border border-[#1e293b] bg-[#0a0a0a] p-4 group hover:border-sky-500/30 transition-colors">
                       <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold text-sky-400 mb-3 flex items-center border-b border-[#1e293b] pb-2"><Cpu className="w-3 h-3 mr-2"/> Builder Bot Models</h3>
                       <div className="space-y-1">
                          {availableTypes?.architect.map(t => (
                             <button key={t.type} onClick={() => { setLaunchForm({...launchForm, agentType: "architect", workflowType: t.type, title: t.title, scope: t.scope}); setSelectedWfId(null); }} className={`w-full text-left px-3 py-2 font-mono text-[9px] uppercase tracking-wider transition-colors ${(launchForm.workflowType === t.type && launchForm.agentType === "architect") ? "bg-[#1e293b] text-white border-l-2 border-sky-400" : "text-[#64748b] hover:bg-[#1e293b]/50 hover:text-[#e2e8f0]"}`}>
                                {t.title}
                             </button>
                          ))}
                       </div>
                    </div>
                    {/* Merchant Models */}
                    <div className="border border-[#1e293b] bg-[#0a0a0a] p-4 group hover:border-[#00ff41]/30 transition-colors">
                       <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold text-[#00ff41] mb-3 flex items-center border-b border-[#1e293b] pb-2"><Target className="w-3 h-3 mr-2"/> Merchant Bot Models</h3>
                       <div className="space-y-1">
                          {availableTypes?.merchant.map(t => (
                             <button key={t.type} onClick={() => { setLaunchForm({...launchForm, agentType: "merchant", workflowType: t.type, title: t.title, scope: t.scope}); setSelectedWfId(null); }} className={`w-full text-left px-3 py-2 font-mono text-[9px] uppercase tracking-wider transition-colors ${(launchForm.workflowType === t.type && launchForm.agentType === "merchant") ? "bg-[#1e293b] text-white border-l-2 border-[#00ff41]" : "text-[#64748b] hover:bg-[#1e293b]/50 hover:text-[#e2e8f0]"}`}>
                                {t.title}
                             </button>
                          ))}
                       </div>
                    </div>
                    {/* Social Models */}
                    <div className="border border-[#1e293b] bg-[#0a0a0a] p-4 group hover:border-[#f59e0b]/30 transition-colors">
                       <h3 className="font-mono text-[10px] uppercase tracking-widest font-bold text-[#f59e0b] mb-3 flex items-center border-b border-[#1e293b] pb-2"><Megaphone className="w-3 h-3 mr-2"/> Social Bot Models</h3>
                       <div className="space-y-1">
                          {availableTypes?.social.map(t => (
                             <button key={t.type} onClick={() => { setLaunchForm({...launchForm, agentType: "social", workflowType: t.type, title: t.title, scope: t.scope}); setSelectedWfId(null); }} className={`w-full text-left px-3 py-2 font-mono text-[9px] uppercase tracking-wider transition-colors ${(launchForm.workflowType === t.type && launchForm.agentType === "social") ? "bg-[#1e293b] text-white border-l-2 border-[#f59e0b]" : "text-[#64748b] hover:bg-[#1e293b]/50 hover:text-[#e2e8f0]"}`}>
                                {t.title}
                             </button>
                          ))}
                       </div>
                    </div>
                 </div>
              </div>
            ) : activeTab === "approvals" ? (
              <div className="space-y-4">
                 {!pendingApprovals || pendingApprovals.length === 0 ? (
                   <div className="border border-[#1e293b] border-dashed p-12 text-center text-[#64748b] font-mono text-[10px] uppercase tracking-widest">
                     ALL_WORKFLOWS_OPERATING_AUTONOMOUSLY
                   </div>
                 ) : (
                   pendingApprovals.map(({ step, workflow }) => (
                     <div key={step.id} className="border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-4 relative">
                        <div className="absolute top-0 left-0 w-1 h-full bg-[#f59e0b]" />
                        <div className="flex items-center justify-between">
                           <div>
                              <p className="font-mono text-[9px] uppercase tracking-widest text-[#f59e0b] font-bold mb-1">REQ_APPROVAL: {workflow.title}</p>
                              <p className="font-mono text-xs text-white uppercase">{step.title}</p>
                              <p className="font-mono text-[10px] text-[#64748b] mt-1">{step.description}</p>
                           </div>
                           <div className="flex gap-2">
                              <button onClick={() => reviewMutation.mutate({ workflowId: workflow.id, stepId: step.id, approved: false, note: "Rejected" })} className="border border-red-500/50 hover:bg-red-500/10 text-red-500 font-mono text-[10px] px-4 py-2 flex items-center uppercase transition-colors"><XCircle className="w-3 h-3 mr-2" /> DENY</button>
                              <button onClick={() => reviewMutation.mutate({ workflowId: workflow.id, stepId: step.id, approved: true })} className="bg-[#00ff41]/10 border border-[#00ff41]/50 hover:bg-[#00ff41]/20 text-[#00ff41] font-mono text-[10px] px-4 py-2 flex items-center uppercase transition-colors"><Check className="w-3 h-3 mr-2" /> AUTH_EXECUTE</button>
                           </div>
                        </div>
                     </div>
                   ))
                 )}
              </div>
            ) : (
              <div className="border border-[#1e293b] bg-[#0a0a0a]">
                <div className="border-b border-[#1e293b] px-4 py-3 flex justify-between items-center bg-[#050505]">
                  <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-white flex items-center"><Zap className="w-3 h-3 text-[#f59e0b] mr-2" /> System Matrix: Workflows</h2>
                  <span className="font-mono text-[9px] tracking-widest text-[#64748b]">{currentList?.length || 0} RECORDS</span>
                </div>
                <div className="p-0 overflow-auto custom-scrollbar max-h-[60vh]">
                  {!currentList?.length ? (
                    <div className="p-12 text-center text-[#64748b] font-mono text-[10px] uppercase tracking-widest">
                       MATRIX_EMPTY_OR_PROCESSING
                    </div>
                  ) : (
                    <table className="w-full text-left font-mono border-collapse">
                      <thead>
                        <tr className="border-b border-[#1e293b] bg-[#050505]">
                          <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-[#64748b] font-normal w-1/3">Logic Sequence</th>
                          <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-[#64748b] font-normal">State</th>
                          <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-[#64748b] font-normal text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentList.map((wf: any) => {
                          const isSelected = selectedWfId === wf.id;
                          const stat = STATUS_MAP[wf.status] || STATUS_MAP.pending;
                          return (
                            <tr 
                              key={wf.id} 
                              onClick={() => setSelectedWfId(wf.id)}
                              className={`border-b border-[#1e293b] cursor-pointer transition-colors ${isSelected ? 'bg-[#1e293b]/40 border-l border-l-[#f59e0b]' : 'hover:bg-[#1e293b]/20'} relative`}
                            >
                             <td className="px-4 py-3 font-bold text-[#e2e8f0] text-[10px] uppercase">
                               {wf.title}
                             </td>
                             <td className={`px-4 py-3 text-[10px] ${stat.color} uppercase tracking-wider`}>{stat.label}</td>
                             <td className="px-4 py-3 text-right text-[#64748b] text-[10px] tracking-wider">
                               {new Date(wf.createdAt).toLocaleString()}
                             </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
            
          </div>
        </div>
      </div>

      {/* Metadata Inspector (Right Panel) */}
      <aside className="w-[400px] shrink-0 bg-[#0a0a0a] flex flex-col z-20 box-border border-l border-[#1e293b] overflow-hidden">
        <div className="h-14 flex items-center px-4 border-b border-[#1e293b] justify-between shrink-0 bg-[#050505]">
          <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-[#64748b]">
            {activeTab === "launch" && launchForm.workflowType ? "Model Configuration" : "System Inspector"}
          </span>
          <span className="flex items-center gap-2">
             <Cpu className="w-3.5 h-3.5 text-[#f59e0b]" />
          </span>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 flex flex-col">
           {activeTab === "launch" && launchForm.workflowType ? (
             <div className="flex-1 flex flex-col">
                <div className="mb-6">
                   <p className="font-mono text-[9px] uppercase tracking-widest text-[#f59e0b] font-bold">PRE-FLIGHT CHECK</p>
                   <h2 className="font-mono text-sm font-bold text-white uppercase mt-1">{launchForm.title}</h2>
                </div>
                
                <div className="space-y-4">
                   {launchForm.scope === "store" && (
                     <div>
                       <label className="font-mono text-[9px] uppercase text-[#64748b] tracking-widest block mb-1">Target Engine (Store)</label>
                       <select value={launchForm.storeId || ""} onChange={(e) => setLaunchForm({...launchForm, storeId: Number(e.target.value)})} className="w-full bg-[#050505] border border-[#1e293b] text-white font-mono text-xs p-2 focus:outline-none focus:border-[#f59e0b]">
                         <option value="">SELECT_TARGET_NODE</option>
                         {stores?.map((s: any) => <option key={s.id} value={s.id}>{s.name} [{s.platform}]</option>)}
                       </select>
                     </div>
                   )}

                   <div>
                     <label className="font-mono text-[9px] uppercase text-[#64748b] tracking-widest block mb-1">Sequence Input Coordinate / Variable</label>
                     <textarea
                       value={launchForm.inputText}
                       onChange={e => setLaunchForm({...launchForm, inputText: e.target.value})}
                       placeholder="OVERRIDE STARTING VARIABLES..."
                       className="w-full h-24 bg-[#050505] border border-[#1e293b] text-white font-mono text-[10px] p-3 focus:outline-none focus:border-[#f59e0b] resize-none"
                     />
                   </div>
                </div>

                <div className="mt-auto pt-6 border-t border-[#1e293b]">
                  <button 
                    onClick={handleLaunch}
                    disabled={launchMutation.isPending || (launchForm.scope === "store" && !launchForm.storeId)}
                    className="w-full bg-[#f59e0b]/10 border border-[#f59e0b]/30 hover:border-[#f59e0b] hover:bg-[#f59e0b]/20 text-[#f59e0b] font-mono text-[10px] uppercase font-bold tracking-widest px-4 py-3 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    {launchMutation.isPending ? "INITIALIZING..." : "EXECUTE SEQUENCE"}
                    <Play className="w-3.5 h-3.5 ml-2 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
             </div>
           ) : !selectedWfId || activeTab === "launch" ? (
             <div className="flex flex-col items-center justify-center text-center h-40 opacity-50 m-auto">
                <Target className="w-6 h-6 text-[#64748b] mb-4" />
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#64748b]">Select sequence logic to view</p>
             </div>
           ) : !detailRaw ? (
             <div className="flex flex-col items-center justify-center text-center h-40 m-auto">
                <Loader2 className="w-5 h-5 text-[#f59e0b] animate-spin mb-3" />
                <p className="font-mono text-[10px] uppercase text-[#f59e0b]">Retrieving Logs...</p>
             </div>
           ) : (
             <div className="space-y-6">
                <div>
                   <h2 className="font-mono text-sm uppercase text-white font-bold mb-1 border-b border-[#1e293b] pb-2 break-all">{detailRaw.workflow.title}</h2>
                   <div className="flex justify-between items-center mt-3">
                      <span className="font-mono text-[9px] text-[#64748b] tracking-widest uppercase">L_STATUS</span>
                      <span className={`font-mono text-[10px] font-bold ${STATUS_MAP[detailRaw.workflow.status]?.color || 'text-white'}`}>
                         {STATUS_MAP[detailRaw.workflow.status]?.label || detailRaw.workflow.status}
                      </span>
                   </div>
                </div>

                <div className="space-y-2">
                   <div className="flex justify-between items-center border-b border-[#1e293b]/50 py-1.5">
                     <span className="font-mono text-[9px] uppercase text-[#64748b]">Engine Logic</span>
                     <span className="font-mono text-[10px] uppercase text-white">{detailRaw.workflow.agentType}</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-[#1e293b]/50 py-1.5">
                     <span className="font-mono text-[9px] uppercase text-[#64748b]">Init TS</span>
                     <span className="font-mono text-[10px] text-white">{new Date(detailRaw.workflow.createdAt).toLocaleString()}</span>
                   </div>
                </div>

                {detailRaw.workflow.status === 'failed' && detailRaw.workflow.error && (
                   <div className="border border-red-500/30 bg-red-500/5 p-3">
                     <p className="font-mono text-[9px] font-bold text-red-500 uppercase mb-1 flex items-center"><AlertTriangle className="w-3 h-3 mr-1"/> TRACE_LOG</p>
                     <p className="font-mono text-[10px] text-red-400 break-words">{detailRaw.workflow.error}</p>
                   </div>
                )}
                
                <div>
                   <p className="font-mono text-[9px] uppercase tracking-widest text-[#64748b] font-bold mb-3 border-b border-[#1e293b] pb-2">Execution Steps</p>
                   <div className="space-y-3 relative pl-4 border-l border-[#1e293b] ml-1">
                      {detailRaw.steps.map((step: any, i: number) => {
                         const isDone = step.status === 'completed' || step.status === 'skipped';
                         const isErr = step.status === 'failed';
                         const isCurr = step.status === 'running' || step.status === 'awaiting_approval';
                         const pinColor = isDone ? 'bg-[#00ff41]' : isErr ? 'bg-red-500' : isCurr ? 'bg-[#f59e0b] shadow-[0_0_8px_#f59e0b]' : 'bg-[#1e293b]';
                         return (
                           <div key={step.id} className="relative">
                              <div className={`absolute -left-[21px] top-1.5 w-2 h-2 rounded-none ${pinColor}`} />
                              <p className={`font-mono text-[10px] uppercase font-bold mb-0.5 ${isDone ? 'text-white/70' : isErr ? 'text-red-500' : isCurr ? 'text-[#f59e0b]' : 'text-[#64748b]'}`}>
                                 [{i+1}] {step.title}
                              </p>
                              {step.status !== 'pending' && step.startedAt && (
                                 <p className="font-mono text-[9px] text-[#64748b]">TS: {new Date(step.startedAt).toLocaleTimeString()}</p>
                              )}
                           </div>
                         )
                      })}
                   </div>
                </div>

                <div className="pt-4 border-t border-[#1e293b] flex gap-2">
                  <button 
                     onClick={() => cancelMutation.mutate({ workflowId: selectedWfId })}
                     disabled={cancelMutation.isPending || detailRaw.workflow.status === 'completed' || detailRaw.workflow.status === 'failed' || detailRaw.workflow.status === 'cancelled'}
                     className="flex-1 bg-[#050505] border border-red-500/30 hover:border-red-500 text-red-500/70 hover:text-red-500 font-mono text-[10px] uppercase px-2 py-2 flex justify-center items-center disabled:opacity-30"
                  >
                     <XCircle className="w-3 h-3 mr-1"/> TERM
                  </button>
                  <button 
                     onClick={() => retryMutation.mutate({ workflowId: selectedWfId })}
                     disabled={retryMutation.isPending || (detailRaw.workflow.status !== 'failed' && detailRaw.workflow.status !== 'cancelled')}
                     className="flex-1 bg-[#050505] border border-[#f59e0b]/30 hover:border-[#f59e0b] text-[#f59e0b]/70 hover:text-[#f59e0b] font-mono text-[10px] uppercase px-2 py-2 flex justify-center items-center disabled:opacity-30"
                  >
                     <RotateCcw className="w-3 h-3 mr-1"/> REBOOT
                  </button>
                </div>
             </div>
           )}
        </div>
      </aside>
    </div>
  );
}
