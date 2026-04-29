import React, { useEffect, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Bot, Search, Loader2, ShieldCheck, AlertTriangle,
  Lightbulb, Package, Plus, Store, Globe, Zap, ExternalLink,
  CheckCircle2, Trash2, Sparkles, X, BarChart3, FileText, Cpu,
  ImageIcon, Wand2, Camera, Copy, Upload, Tag
} from "lucide-react";
import { Streamdown } from "streamdown";
import { getBrand } from "@/lib/platformBrand";
import { BotOperatingAcross } from "@/components/BotOperatingAcross";

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

  // Esc closes the inspector slide-over (skipped while typing into a form).
  useEffect(() => {
    if (!selectedReportId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      setSelectedReportId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedReportId]);

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
    <div className="flex h-full w-full relative bg-[#050505] overflow-hidden text-white flex-col">
      {/* Main Workspace — full width; inspector is a slide-over */}
      <div className="flex-1 flex flex-col h-full">
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

            {/* Operating-across strip — surfaces every connected platform
                so the operator sees where Builder's reach extends. */}
            <BotOperatingAcross botId="architect" />

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
            <div className="border border-white/[0.08] bg-black/40 p-4 relative">
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

            {/* Vision-driven listing generator */}
            <VisionListingPanel />

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

      {/* Metadata Inspector — slide-over, opens on row click */}
      {selectedReport && (
        <button
          type="button"
          onClick={() => setSelectedReportId(null)}
          className="absolute inset-0 z-20 bg-black/30 backdrop-blur-[2px] cursor-default"
          aria-label="Close inspector"
        />
      )}
      <aside
        className={`absolute top-0 right-0 h-full w-[360px] bg-black/95 flex flex-col z-30 border-l border-white/[0.08] transition-transform duration-300 ease-out ${
          selectedReport ? "translate-x-0 shadow-[-12px_0_36px_rgba(0,0,0,0.6)]" : "translate-x-full pointer-events-none"
        }`}
        aria-hidden={!selectedReport}
      >
        <div className="h-12 flex items-center px-4 border-b border-white/[0.08] justify-between shrink-0 bg-[#050505]">
          <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
            <Cpu className="w-3 h-3 text-sky-400" />
            Architect Inspector
          </span>
          <button
            type="button"
            onClick={() => setSelectedReportId(null)}
            className="w-6 h-6 rounded text-white/40 hover:text-white/85 hover:bg-white/[0.06] flex items-center justify-center transition-colors"
            aria-label="Close inspector"
          >
            <span aria-hidden="true" className="text-base leading-none">×</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
           {!selectedReport ? null : !selectedReport.report ? (
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

type VisionListing = {
  title: string;
  description: string;
  bulletPoints: string[];
  seoKeywords: string[];
  suggestedPriceRange: { minCents: number; maxCents: number; currency: string };
  imageAltText: string;
  tags: string[];
  categoryBreadcrumb: string;
  materialOrComposition?: string | null;
  estimatedConversionAngle: string;
};

function VisionListingPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [niche, setNiche] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [priceTier, setPriceTier] = useState<"" | "budget" | "mid" | "premium" | "luxury">("");
  const [tone, setTone] = useState("");
  const [storeId, setStoreId] = useState<string>("");
  const [listing, setListing] = useState<VisionListing | null>(null);

  const { data: stores } = trpc.stores.list.useQuery();
  const storeList = (stores as any[]) || [];

  const generateMutation = trpc.architect.generateListingFromImage.useMutation({
    onSuccess: (data: any) => {
      setListing(data.listing as VisionListing);
      toast.success("LISTING_GENERATED");
    },
    onError: (err: any) => {
      toast.error(err.message || "Listing generation failed");
    },
  });

  const saveDraftMutation = trpc.architect.saveListingAsDraftProduct.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Draft saved · ${data.sku} @ $${(data.priceCents / 100).toFixed(2)}`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Save failed");
    },
  });

  const handleFile = (f: File | null) => {
    if (!f) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Image exceeds 10MB limit");
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setListing(null);
  };

  const handleGenerate = async () => {
    if (!file) {
      toast.error("Pick a product image first");
      return;
    }
    const buf = await file.arrayBuffer();
    // base64-encode in chunks to dodge call-stack overflow on big images
    const bytes = new Uint8Array(buf);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
    }
    const bytesBase64 = btoa(bin);

    generateMutation.mutate({
      filename: file.name,
      bytesBase64,
      mimeType: file.type as "image/png" | "image/jpeg" | "image/webp",
      storeId: storeId ? Number(storeId) : undefined,
      niche: niche.trim() || undefined,
      targetAudience: targetAudience.trim() || undefined,
      priceTier: priceTier || undefined,
      tone: tone.trim() || undefined,
    });
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Clipboard unavailable"),
    );
  };

  const fmt = (cents: number, ccy: string) =>
    `${ccy} ${(cents / 100).toFixed(2)}`;

  return (
    <div className="border border-white/[0.08] bg-black/40 p-4 relative">
      <div className="absolute top-0 left-0 w-1 h-full bg-fuchsia-400/50" />
      <div className="flex items-center gap-2 mb-3">
        <Camera className="w-4 h-4 text-fuchsia-400" />
        <h2 className="font-mono text-[10px] uppercase tracking-widest font-bold text-white">Vision Listing Generator</h2>
        <span className="ml-auto font-mono text-[8px] uppercase tracking-widest text-fuchsia-400/70">Claude Vision</span>
      </div>
      <p className="font-mono text-[9px] text-muted-foreground mb-4 leading-relaxed">
        Drop a product photo. Claude examines the image and returns SEO-optimized title, description, bullets, keywords, alt text, tags, and a suggested price range — ready to paste into any storefront.
      </p>

      {!file ? (
        <label
          className="flex flex-col items-center justify-center gap-2 border border-dashed border-white/[0.12] hover:border-fuchsia-400/50 hover:bg-fuchsia-500/[0.03] cursor-pointer py-10 transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files?.[0] ?? null);
          }}
        >
          <Upload className="w-5 h-5 text-fuchsia-400/70" />
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/70">Drop image · or click to browse</p>
          <p className="font-mono text-[9px] text-muted-foreground">PNG · JPEG · WebP · ≤10MB</p>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </label>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-4">
          {previewUrl && (
            <img src={previewUrl} alt="Preview" className="w-full h-auto rounded border border-white/[0.08] object-cover aspect-square" />
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-white truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => handleFile(null)}
                className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:text-red-400 transition-colors"
              >
                Reset
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="bg-[#050505] border border-white/[0.08] text-white font-mono text-[10px] px-2 py-1.5 focus:outline-none focus:border-fuchsia-400 transition-colors"
              >
                <option value="">No store context</option>
                {storeList.map((s: any) => (
                  <option key={s.id} value={s.id}>{getBrand(s.platform).icon} {s.name} ({getBrand(s.platform).name})</option>
                ))}
              </select>
              <select
                value={priceTier}
                onChange={(e) => setPriceTier(e.target.value as any)}
                className="bg-[#050505] border border-white/[0.08] text-white font-mono text-[10px] px-2 py-1.5 focus:outline-none focus:border-fuchsia-400 transition-colors"
              >
                <option value="">Any price tier</option>
                <option value="budget">Budget</option>
                <option value="mid">Mid</option>
                <option value="premium">Premium</option>
                <option value="luxury">Luxury</option>
              </select>
              <input
                type="text"
                placeholder="Niche / category"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="bg-[#050505] border border-white/[0.08] text-white font-mono text-[10px] px-2 py-1.5 focus:outline-none focus:border-fuchsia-400 transition-colors"
              />
              <input
                type="text"
                placeholder="Target audience"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="bg-[#050505] border border-white/[0.08] text-white font-mono text-[10px] px-2 py-1.5 focus:outline-none focus:border-fuchsia-400 transition-colors"
              />
              <input
                type="text"
                placeholder="Brand tone (e.g., warm, clinical)"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="sm:col-span-2 bg-[#050505] border border-white/[0.08] text-white font-mono text-[10px] px-2 py-1.5 focus:outline-none focus:border-fuchsia-400 transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generateMutation.isPending || !file}
              className="w-full bg-white/[0.06] hover:bg-fuchsia-500/20 border border-white/[0.08] hover:border-fuchsia-400 text-white font-mono text-[10px] uppercase tracking-widest px-4 py-2 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin text-fuchsia-400" /> : <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />}
              {generateMutation.isPending ? "Reading image…" : "Generate Listing"}
            </button>
          </div>
        </div>
      )}

      {listing && (
        <div className="mt-4 space-y-3">
          <ListingField label="Title" value={listing.title} onCopy={() => copy(listing.title, "Title")} />
          <ListingField label="Description" value={listing.description} onCopy={() => copy(listing.description, "Description")} multiline />
          <div>
            <ListingLabel label="Bullets" onCopy={() => copy(listing.bulletPoints.map((b) => `• ${b}`).join("\n"), "Bullets")} />
            <ul className="space-y-1 bg-[#050505] border border-white/[0.08] p-3">
              {listing.bulletPoints.map((b, i) => (
                <li key={i} className="font-mono text-[10px] text-white/85 leading-relaxed flex gap-2">
                  <span className="text-fuchsia-400 mt-0.5">▸</span> {b}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <ListingLabel label="SEO Keywords" onCopy={() => copy(listing.seoKeywords.join(", "), "Keywords")} />
            <div className="flex flex-wrap gap-1.5 bg-[#050505] border border-white/[0.08] p-3">
              {listing.seoKeywords.map((k, i) => (
                <span key={i} className="font-mono text-[9px] text-fuchsia-300/80 bg-fuchsia-500/[0.06] border border-fuchsia-500/20 px-1.5 py-0.5">
                  {k}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-[#050505] border border-white/[0.08] p-3">
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Suggested Price</p>
              <p className="font-mono text-sm font-bold text-emerald-400">
                {fmt(listing.suggestedPriceRange.minCents, listing.suggestedPriceRange.currency)}
                <span className="text-white/40 mx-1.5">→</span>
                {fmt(listing.suggestedPriceRange.maxCents, listing.suggestedPriceRange.currency)}
              </p>
            </div>
            <div className="bg-[#050505] border border-white/[0.08] p-3">
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Category</p>
              <p className="font-mono text-[10px] text-white/85">{listing.categoryBreadcrumb || "—"}</p>
            </div>
          </div>
          <ListingField label="Image Alt Text" value={listing.imageAltText} onCopy={() => copy(listing.imageAltText, "Alt text")} />
          <div>
            <ListingLabel label="Tags" onCopy={() => copy(listing.tags.join(", "), "Tags")} />
            <div className="flex flex-wrap gap-1.5 bg-[#050505] border border-white/[0.08] p-3">
              {listing.tags.map((t, i) => (
                <span key={i} className="font-mono text-[9px] text-white/70 bg-white/[0.04] border border-white/[0.08] px-1.5 py-0.5 flex items-center gap-1">
                  <Tag className="w-2.5 h-2.5 text-fuchsia-400/60" /> {t}
                </span>
              ))}
            </div>
          </div>
          {listing.estimatedConversionAngle && (
            <div className="bg-fuchsia-500/[0.04] border border-fuchsia-500/20 p-3">
              <p className="font-mono text-[9px] uppercase tracking-widest text-fuchsia-300 mb-1">Conversion Angle</p>
              <p className="font-mono text-[10px] text-white/85 leading-relaxed">{listing.estimatedConversionAngle}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 items-center justify-between p-3 bg-emerald-500/[0.04] border border-emerald-500/20">
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-widest text-emerald-300 mb-0.5">Persist this listing</p>
              <p className="font-mono text-[10px] text-white/70 leading-relaxed">
                {storeId
                  ? "Saves as a draft product on the selected store. Review and publish from the store editor."
                  : "Pick a store above to enable save-as-draft."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!storeId) {
                  toast.error("Select a store before saving");
                  return;
                }
                saveDraftMutation.mutate({
                  storeId: Number(storeId),
                  listing,
                });
              }}
              disabled={!storeId || saveDraftMutation.isPending}
              className="bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 hover:border-emerald-400 text-emerald-300 font-mono text-[10px] uppercase tracking-widest px-4 py-2 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {saveDraftMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              {saveDraftMutation.isPending ? "Saving…" : "Save as draft product"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ListingLabel({ label, onCopy }: { label: string; onCopy: () => void }) {
  return (
    <div className="flex items-center justify-between mb-1">
      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <button
        type="button"
        onClick={onCopy}
        className="font-mono text-[9px] uppercase tracking-widest text-fuchsia-400/70 hover:text-fuchsia-400 transition-colors flex items-center gap-1"
      >
        <Copy className="w-2.5 h-2.5" /> Copy
      </button>
    </div>
  );
}

function ListingField({ label, value, onCopy, multiline }: { label: string; value: string; onCopy: () => void; multiline?: boolean }) {
  return (
    <div>
      <ListingLabel label={label} onCopy={onCopy} />
      <div className={`bg-[#050505] border border-white/[0.08] p-3 font-mono text-[10px] text-white/85 leading-relaxed ${multiline ? "whitespace-pre-wrap" : ""}`}>
        {value || "—"}
      </div>
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
    <div className="border border-white/[0.08] bg-black/40 p-4 relative">
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
            <option key={s.id} value={s.id}>{getBrand(s.platform).icon} {s.name} ({getBrand(s.platform).name})</option>
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
