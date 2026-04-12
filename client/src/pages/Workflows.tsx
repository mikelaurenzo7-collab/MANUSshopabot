import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import {
  Play, Search, Package, LayoutGrid, Store, ClipboardCheck, DollarSign,
  Truck, Target, Megaphone, Calendar, Globe, Mail, Image, FileText,
  Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, Pause,
  ChevronRight, Zap, Eye, X as XIcon, RotateCcw, ArrowRight,
  ShieldCheck, Sparkles, Link, TrendingUp, Users, Star, Filter,
} from "lucide-react";

const ICON_MAP: Record<string, any> = {
  Search, Package, LayoutGrid, Store, ClipboardCheck, DollarSign,
  Truck, Target, Megaphone, Calendar, Globe, Mail, Image, FileText,
  ShieldCheck, Sparkles, Link, TrendingUp, Users, Zap, Star, Filter,
};

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  pending: { color: "bg-zinc-500/20 text-zinc-400", icon: Clock, label: "Pending" },
  running: { color: "bg-blue-500/20 text-blue-400", icon: Loader2, label: "Running" },
  awaiting_approval: { color: "bg-amber-500/20 text-amber-400", icon: Pause, label: "Awaiting Approval" },
  completed: { color: "bg-emerald-500/20 text-emerald-400", icon: CheckCircle2, label: "Completed" },
  failed: { color: "bg-red-500/20 text-red-400", icon: XCircle, label: "Failed" },
  cancelled: { color: "bg-zinc-500/20 text-zinc-400", icon: XIcon, label: "Cancelled" },
  skipped: { color: "bg-zinc-500/20 text-zinc-400", icon: ArrowRight, label: "Skipped" },
};

const AGENT_COLORS: Record<string, string> = {
  architect: "from-violet-500/20 to-purple-500/20 border-violet-500/30",
  merchant: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30",
  hypeman: "from-orange-500/20 to-amber-500/20 border-orange-500/30",
};

const AGENT_NAMES: Record<string, string> = {
  architect: "Builder Bot",
  merchant: "Merchant Bot",
  hypeman: "Social Bot",
};

export default function Workflows() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("launch");
  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const [launchOpen, setLaunchOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);
  const [launchForm, setLaunchForm] = useState({
    agentType: "" as string,
    workflowType: "" as string,
    title: "",
    scope: "global" as string,
    storeId: undefined as number | undefined,
    input: {} as Record<string, any>,
    inputText: "",
  });

  const utils = trpc.useUtils();
  const { data: availableTypes } = trpc.workflows.availableTypes.useQuery();
  const { data: workflows, isLoading: workflowsLoading } = trpc.workflows.list.useQuery(
    selectedAgent !== "all" ? { agentType: selectedAgent as any } : undefined
  );
  const { data: activeWorkflows } = trpc.workflows.active.useQuery();
  const { data: counts } = trpc.workflows.counts.useQuery();
  const { data: pendingApprovals } = trpc.workflows.pendingApprovals.useQuery();
  const { data: stores } = trpc.stores.list.useQuery();

  const { data: workflowDetailRaw } = trpc.workflows.detail.useQuery(
    { workflowId: selectedWorkflowId! },
    { enabled: !!selectedWorkflowId }
  );
  const workflowDetail = workflowDetailRaw as { workflow: any; steps: any[] } | undefined;

  const launchMutation = trpc.workflows.launch.useMutation({
    onSuccess: (data) => {
      toast.success("Workflow launched!", { description: `Workflow #${data.workflowId} is now running.` });
      setLaunchOpen(false);
      setLaunchForm({ agentType: "", workflowType: "", title: "", scope: "global", storeId: undefined, input: {}, inputText: "" });
      utils.workflows.list.invalidate();
      utils.workflows.active.invalidate();
      utils.workflows.counts.invalidate();
    },
    onError: (err) => toast.error("Failed to launch workflow", { description: err.message }),
  });

  const reviewMutation = trpc.workflows.reviewStep.useMutation({
    onSuccess: () => {
      toast.success("Step reviewed");
      utils.workflows.pendingApprovals.invalidate();
      utils.workflows.list.invalidate();
      utils.workflows.active.invalidate();
      utils.workflows.detail.invalidate();
    },
    onError: (err) => toast.error("Review failed", { description: err.message }),
  });

  const cancelMutation = trpc.workflows.cancel.useMutation({
    onSuccess: () => {
      toast.success("Workflow cancelled");
      utils.workflows.list.invalidate();
      utils.workflows.active.invalidate();
      utils.workflows.counts.invalidate();
    },
    onError: (err) => toast.error("Cancel failed", { description: err.message }),
  });

  // Get all workflow types flattened
  const allTypes = useMemo(() => {
    if (!availableTypes) return [];
    return [
      ...availableTypes.architect.map(t => ({ ...t, agentType: "architect" as const })),
      ...availableTypes.merchant.map(t => ({ ...t, agentType: "merchant" as const })),
      ...availableTypes.hypeman.map(t => ({ ...t, agentType: "hypeman" as const })),
    ];
  }, [availableTypes]);

  const selectedType = allTypes.find(t => t.type === launchForm.workflowType && t.agentType === launchForm.agentType);

  function handleSelectWorkflowType(agentType: string, type: string) {
    const wfType = allTypes.find(t => t.type === type && t.agentType === agentType);
    setLaunchForm({
      agentType,
      workflowType: type,
      title: wfType?.title ?? type,
      scope: wfType?.scope ?? "global",
      storeId: undefined,
      input: {},
      inputText: "",
    });
    setLaunchOpen(true);
  }

  function handleLaunch() {
    if (!launchForm.agentType || !launchForm.workflowType) return;

    // Parse input text into structured input
    let inputData: Record<string, any> = { ...launchForm.input };
    if (launchForm.inputText.trim()) {
      // Use the text as the primary input parameter based on workflow type
      const keyMap: Record<string, string> = {
        niche_research: "keyword",
        product_sourcing: "niche",
        catalog_generation: "keyword",
        store_setup: "storeName",
        inventory_audit: "scope",
        pricing_optimization: "strategy",
        competitor_analysis: "niche",
        ad_campaign: "product",
        social_content: "brand",
        seo_audit: "domain",
        email_flow: "flowType",
        product_creative: "product",
        brand_content: "topic",
      };
      const key = keyMap[launchForm.workflowType] ?? "input";
      inputData[key] = launchForm.inputText;
    }

    launchMutation.mutate({
      agentType: launchForm.agentType as any,
      workflowType: launchForm.workflowType,
      title: `${launchForm.title}: ${launchForm.inputText || "Auto"}`,
      scope: launchForm.scope as any,
      storeId: launchForm.storeId,
      input: inputData,
    });
  }

  // Input label/placeholder based on workflow type
  const inputConfig: Record<string, { label: string; placeholder: string }> = {
    niche_research: { label: "Niche / Keyword", placeholder: "e.g., Minimalist Home Decor, Pet Accessories, Fitness Gear" },
    product_sourcing: { label: "Niche / Category", placeholder: "e.g., Sustainable Fashion, Tech Gadgets" },
    catalog_generation: { label: "Keyword / Theme", placeholder: "e.g., Bohemian Jewelry, Smart Home Devices" },
    store_setup: { label: "Store Name", placeholder: "e.g., Luxe Living Co., TechNest" },
    inventory_audit: { label: "Notes (optional)", placeholder: "Any specific concerns or focus areas" },
    pricing_optimization: { label: "Strategy / Target", placeholder: "e.g., 40% margin target, competitive pricing" },
    competitor_analysis: { label: "Niche / Market", placeholder: "e.g., Premium Skincare, Outdoor Gear" },
    ad_campaign: { label: "Product / Offer", placeholder: "e.g., Wireless Earbuds, Summer Sale 30% Off" },
    social_content: { label: "Brand / Topic", placeholder: "e.g., Our brand story, New collection launch" },
    seo_audit: { label: "Domain / Niche", placeholder: "e.g., mystore.com, Organic Supplements" },
    email_flow: { label: "Flow Type", placeholder: "e.g., welcome, abandoned_cart, win_back, post_purchase" },
    product_creative: { label: "Product Name", placeholder: "e.g., Bamboo Water Bottle, Leather Wallet" },
    brand_content: { label: "Topic / Theme", placeholder: "e.g., Our sustainability mission, Behind the scenes" },
  };

  const currentInputConfig = inputConfig[launchForm.workflowType] ?? { label: "Input", placeholder: "Describe what you need..." };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bot Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">Launch, monitor, and manage AI bot workflows across all your stores</p>
        </div>
        <div className="flex items-center gap-3">
          {counts && (
            <div className="flex items-center gap-2 text-xs">
              {Number(counts.running) > 0 && <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{Number(counts.running)} Running</Badge>}
              {Number(counts.awaiting) > 0 && <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30"><AlertTriangle className="w-3 h-3 mr-1" />{Number(counts.awaiting)} Awaiting</Badge>}
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />{Number(counts.completed)} Done</Badge>
            </div>
          )}
        </div>
      </div>

      {/* Pending Approvals Banner */}
      {pendingApprovals && pendingApprovals.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="font-medium text-amber-200">{pendingApprovals.length} Approval{pendingApprovals.length > 1 ? "s" : ""} Pending</p>
                  <p className="text-xs text-amber-400/70">Bot workflows are paused waiting for your review</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10" onClick={() => setActiveTab("approvals")}>
                Review Now <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900/50 border border-zinc-800">
          <TabsTrigger value="launch" className="data-[state=active]:bg-zinc-800">
            <Zap className="w-4 h-4 mr-2" />Launch
          </TabsTrigger>
          <TabsTrigger value="active" className="data-[state=active]:bg-zinc-800">
            <Play className="w-4 h-4 mr-2" />Active
            {activeWorkflows && activeWorkflows.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{activeWorkflows.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-zinc-800">
            <RotateCcw className="w-4 h-4 mr-2" />History
          </TabsTrigger>
          <TabsTrigger value="approvals" className="data-[state=active]:bg-zinc-800">
            <AlertTriangle className="w-4 h-4 mr-2" />Approvals
            {pendingApprovals && pendingApprovals.length > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">{pendingApprovals.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Launch Tab */}
        <TabsContent value="launch" className="space-y-6">
          {availableTypes && (["architect", "merchant", "hypeman"] as const).map(agent => (
            <div key={agent} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${agent === "architect" ? "bg-violet-400" : agent === "merchant" ? "bg-emerald-400" : "bg-orange-400"}`} />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{AGENT_NAMES[agent]}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {availableTypes[agent].map(wf => {
                  const IconComp = ICON_MAP[wf.icon] ?? Zap;
                  return (
                    <Card key={wf.type} className={`bg-gradient-to-br ${AGENT_COLORS[agent]} border cursor-pointer hover:scale-[1.02] transition-all duration-200`}
                      onClick={() => handleSelectWorkflowType(agent, wf.type)}>
                      <CardContent className="py-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-background/30 flex items-center justify-center shrink-0">
                            <IconComp className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{wf.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{wf.description}</p>
                            <Badge variant="outline" className="mt-2 text-[10px]">{wf.scope.replace("_", " ")}</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </TabsContent>

        {/* Active Tab */}
        <TabsContent value="active" className="space-y-4">
          {!activeWorkflows || activeWorkflows.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Zap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No active workflows</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Launch a workflow from the Launch tab to get started</p>
              </CardContent>
            </Card>
          ) : (
            activeWorkflows.map(wf => <WorkflowCard key={wf.id} workflow={wf} onView={() => { setSelectedWorkflowId(wf.id); setDetailOpen(true); }} onCancel={() => cancelMutation.mutate({ workflowId: wf.id })} />)
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger className="w-48 bg-zinc-900/50 border-zinc-800">
                <SelectValue placeholder="All Bots" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Bots</SelectItem>
                <SelectItem value="architect">Builder Bot</SelectItem>
                <SelectItem value="merchant">Merchant Bot</SelectItem>
                <SelectItem value="hypeman">Social Bot</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {workflowsLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : !workflows || workflows.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <RotateCcw className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No workflow history yet</p>
              </CardContent>
            </Card>
          ) : (
            workflows.map(wf => <WorkflowCard key={wf.id} workflow={wf} onView={() => { setSelectedWorkflowId(wf.id); setDetailOpen(true); }} />)
          )}
        </TabsContent>

        {/* Approvals Tab */}
        <TabsContent value="approvals" className="space-y-4">
          {!pendingApprovals || pendingApprovals.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No pending approvals</p>
                <p className="text-xs text-muted-foreground/60 mt-1">All agent workflows are running smoothly</p>
              </CardContent>
            </Card>
          ) : (
            pendingApprovals.map(({ step, workflow }) => (
              <Card key={step.id} className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={`text-xs ${workflow.agentType === "architect" ? "bg-violet-500/20 text-violet-300" : workflow.agentType === "merchant" ? "bg-emerald-500/20 text-emerald-300" : "bg-orange-500/20 text-orange-300"}`}>
                          {AGENT_NAMES[workflow.agentType]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Step {step.stepIndex + 1}</span>
                      </div>
                      <p className="font-medium">{step.title}</p>
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                      <p className="text-xs text-muted-foreground/60">Workflow: {workflow.title}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                        onClick={() => reviewMutation.mutate({ workflowId: workflow.id, stepId: step.id, approved: false, note: "Rejected by user" })}
                        disabled={reviewMutation.isPending}>
                        <XCircle className="w-4 h-4 mr-1" /> Reject
                      </Button>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => reviewMutation.mutate({ workflowId: workflow.id, stepId: step.id, approved: true })}
                        disabled={reviewMutation.isPending}>
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Launch Dialog */}
      <Dialog open={launchOpen} onOpenChange={setLaunchOpen}>
        <DialogContent className="sm:max-w-lg bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Launch Workflow
            </DialogTitle>
            <DialogDescription>
              {selectedType ? `${AGENT_NAMES[launchForm.agentType]} — ${selectedType.title}` : "Configure and launch an agent workflow"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {selectedType && (
              <div className={`p-3 rounded-lg bg-gradient-to-br ${AGENT_COLORS[launchForm.agentType]} border`}>
                <p className="text-sm">{selectedType.description}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>{currentInputConfig.label}</Label>
              <Input
                placeholder={currentInputConfig.placeholder}
                value={launchForm.inputText}
                onChange={e => setLaunchForm(f => ({ ...f, inputText: e.target.value }))}
                className="bg-zinc-900/50 border-zinc-800"
              />
            </div>

            {(selectedType?.scope === "specific_store" || selectedType?.scope === "all_stores") && stores && stores.length > 0 && (
              <div className="space-y-2">
                <Label>Target Store {selectedType.scope === "specific_store" ? "(required)" : "(optional)"}</Label>
                <Select value={launchForm.storeId?.toString() ?? "all"} onValueChange={v => setLaunchForm(f => ({ ...f, storeId: v === "all" ? undefined : Number(v) }))}>
                  <SelectTrigger className="bg-zinc-900/50 border-zinc-800">
                    <SelectValue placeholder="Select a store" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedType.scope === "all_stores" && <SelectItem value="all">All Connected Stores</SelectItem>}
                    {stores.map(s => (
                      <SelectItem key={s.id} value={s.id.toString()}>{s.name} ({s.platform})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLaunchOpen(false)}>Cancel</Button>
            <Button onClick={handleLaunch} disabled={launchMutation.isPending || !launchForm.inputText.trim()}>
              {launchMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Launch Workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Workflow Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl bg-zinc-950 border-zinc-800 max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Workflow Detail
            </DialogTitle>
          </DialogHeader>
          {workflowDetail ? (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{workflowDetail.workflow.title}</h3>
                    <p className="text-sm text-muted-foreground">{workflowDetail.workflow.description}</p>
                  </div>
                  <StatusBadge status={workflowDetail.workflow.status} />
                </div>

                <Separator />

                {/* Step Pipeline */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Pipeline Steps</h4>
                  {(workflowDetail.steps as Array<Record<string, any>>).map((step, i) => {
                    const config = STATUS_CONFIG[step.status] ?? STATUS_CONFIG.pending;
                    const StepIcon = config.icon;
                    const isActive = step.status === "running";
                    return (
                      <div key={step.id} className={`relative pl-8 pb-4 ${i < workflowDetail.steps.length - 1 ? "border-l border-zinc-800 ml-3" : "ml-3"}`}>
                        <div className={`absolute left-0 top-0 w-7 h-7 rounded-full flex items-center justify-center -translate-x-1/2 ${isActive ? "bg-blue-500/30 ring-2 ring-blue-500/50" : step.status === "completed" ? "bg-emerald-500/20" : step.status === "failed" ? "bg-red-500/20" : "bg-zinc-800"}`}>
                          <StepIcon className={`w-3.5 h-3.5 ${isActive ? "animate-spin text-blue-400" : step.status === "completed" ? "text-emerald-400" : step.status === "failed" ? "text-red-400" : "text-zinc-500"}`} />
                        </div>
                        <div className="ml-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Step {i + 1}</span>
                            <Badge variant="outline" className="text-[10px]">{step.stepType}</Badge>
                            <StatusBadge status={step.status} size="sm" />
                          </div>
                          <p className="font-medium text-sm mt-0.5">{step.title}</p>
                          {step.description && <p className="text-xs text-muted-foreground mt-0.5">{String(step.description)}</p>}
                          {typeof step.durationMs === "number" && step.durationMs > 0 && <p className="text-[10px] text-muted-foreground/50 mt-1">{(step.durationMs / 1000).toFixed(1)}s</p>}
                          {step.output != null && typeof step.output === "object" ? (
                            <details className="mt-2">
                              <summary className="text-xs text-primary cursor-pointer hover:underline">View Output</summary>
                              <div className="mt-2 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 text-xs overflow-auto max-h-64">
                                {(step.output as Record<string, unknown>)?.text ? (
                                  <Streamdown>{String((step.output as Record<string, unknown>).text)}</Streamdown>
                                ) : (step.output as Record<string, unknown>)?.imageUrl ? (
                                  <div>
                                    <img src={String((step.output as Record<string, unknown>).imageUrl)} alt="Generated" className="rounded-lg max-w-full" />
                                  </div>
                                ) : (
                                  <pre className="whitespace-pre-wrap">{JSON.stringify(step.output, null, 2)}</pre>
                                )}
                              </div>
                            </details>
                          ) : null}
                          {step.error && (
                            <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                              {String(step.error)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Workflow Output */}
                {workflowDetail.workflow.output && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Final Output</h4>
                      <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 text-sm overflow-auto max-h-64">
                        <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(workflowDetail.workflow.output, null, 2)}</pre>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function WorkflowCard({ workflow, onView, onCancel }: { workflow: any; onView: () => void; onCancel?: () => void }) {
  const isActive = workflow.status === "running" || workflow.status === "pending" || workflow.status === "awaiting_approval";
  return (
    <Card className={`${isActive ? "border-primary/30" : "border-zinc-800"} hover:border-zinc-700 transition-colors`}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`text-xs ${workflow.agentType === "architect" ? "bg-violet-500/20 text-violet-300" : workflow.agentType === "merchant" ? "bg-emerald-500/20 text-emerald-300" : "bg-orange-500/20 text-orange-300"}`}>
                {AGENT_NAMES[workflow.agentType]}
              </Badge>
              <Badge variant="outline" className="text-[10px]">{workflow.workflowType}</Badge>
              <StatusBadge status={workflow.status} />
            </div>
            <p className="font-medium truncate">{workflow.title}</p>
            {workflow.description && <p className="text-xs text-muted-foreground truncate">{workflow.description}</p>}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60 mt-1">
              <span>Steps: {Number(workflow.currentStepIndex) + (workflow.status === "completed" ? 0 : 1)}/{Number(workflow.totalSteps)}</span>
              <span>{new Date(workflow.createdAt).toLocaleString()}</span>
              {workflow.scope !== "global" && <span>Scope: {workflow.scope}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <Button size="sm" variant="outline" onClick={onView}>
              <Eye className="w-4 h-4 mr-1" /> View
            </Button>
            {isActive && onCancel && (
              <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={onCancel}>
                <XIcon className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        {/* Progress bar */}
        {isActive && (
          <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${Math.max(5, ((workflow.currentStepIndex) / workflow.totalSteps) * 100)}%` }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, size = "default" }: { status: string; size?: "default" | "sm" }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`${config.color} ${size === "sm" ? "text-[10px] py-0" : "text-xs"}`}>
      <Icon className={`w-3 h-3 mr-1 ${status === "running" ? "animate-spin" : ""}`} />
      {config.label}
    </Badge>
  );
}
