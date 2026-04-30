import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Bot,
  Package,
  Megaphone,
  Filter,
  RefreshCw,
  Sparkles,
  Store,
  ArrowRight,
} from "lucide-react";

const agentIcons: Record<string, any> = {
  architect: Bot,
  merchant: Package,
  social: Megaphone,
};
const agentColors: Record<string, string> = {
  architect: "text-sky-400",
  merchant: "text-cyan-400",
  social: "text-amber-400",
};
const agentNames: Record<string, string> = {
  architect: "Launch mode",
  merchant: "Operator mode",
  social: "Growth mode",
};

const PAGE_SIZE = 20;

export default function ActivityPage() {
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [reviewNote, setReviewNote] = useState<Record<number, string>>({});
  const [page, setPage] = useState(0);

  // Reset page when filter changes
  const handleFilterChange = (val: string) => {
    setAgentFilter(val);
    setPage(0);
  };

  // Fetch one extra row so we can detect whether a *next* page exists
  // without an extra round-trip. `tasks` is sliced to PAGE_SIZE for display.
  const { data: rawTasks, isLoading: tasksLoading, error: tasksError } = trpc.activity.list.useQuery({
    agentType: agentFilter === "all" ? undefined : (agentFilter as "architect" | "merchant" | "social"),
    limit: PAGE_SIZE + 1,
    offset: page * PAGE_SIZE,
  }, { refetchInterval: 30_000 });
  const hasNextPage = (rawTasks?.length ?? 0) > PAGE_SIZE;
  const tasks = rawTasks?.slice(0, PAGE_SIZE);
  const { data: pendingApprovals, isLoading: approvalsLoading } = trpc.approvals.pending.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: allApprovals } = trpc.approvals.all.useQuery({ limit: 50 });
  const utils = trpc.useUtils();

  const reviewApproval = trpc.approvals.review.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`Decision ${vars.status}!`);
      utils.approvals.pending.invalidate();
      utils.approvals.all.invalidate();
      utils.dashboard.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const statusIcons: Record<string, any> = {
    completed: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
    running: <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />,
    failed: <XCircle className="h-4 w-4 text-destructive" />,
    pending: <Clock className="h-4 w-4 text-muted-foreground" />,
  };

  return (
    <div className="relative">
      {/* Ghost watermark */}
      <div className="ghost-watermark" aria-hidden="true">ACTIVITY</div>
      {/* Light leaks */}
      <div className="light-leak-blue" style={{top: '5%', left: '10%'}} aria-hidden="true" />
      <div className="light-leak-cyan" style={{top: '50%', right: '5%'}} aria-hidden="true" />
    <div className="space-y-3">
      <Tabs defaultValue="activity" className="space-y-3">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
          <TabsTrigger value="approvals" className="relative">
            Approval Queue
            {pendingApprovals && pendingApprovals.length > 0 && (
              <Badge className="ml-1.5 h-5 min-w-5 px-1 text-[10px] bg-amber-500 text-white border-0">
                {pendingApprovals.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Decision History</TabsTrigger>
        </TabsList>

        {/* Activity Log Tab */}
        <TabsContent value="activity" className="space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={agentFilter} onValueChange={handleFilterChange}>
              <SelectTrigger className="w-48 bg-input/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All workflows</SelectItem>
                <SelectItem value="architect">Launch mode</SelectItem>
                <SelectItem value="merchant">Operator mode</SelectItem>
                <SelectItem value="social">Growth mode</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Error state with retry */}
          {tasksError && (
            <Card className="bg-red-500/5 border-red-500/20">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-400">Failed to load activity</p>
                  <p className="text-xs text-red-400/70 mt-1">{tasksError.message}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10"
                  onClick={() => utils.activity.list.invalidate()}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {tasksLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Card key={i} className="bento-card">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-4 w-4 rounded-full bg-white/5" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : tasks && tasks.length > 0 ? (
            <div className="space-y-2">
              {tasks.map((task: any) => {
                const AgentIcon = agentIcons[task.agentType] || Activity;
                return (
                  <Card key={task.id} className="bg-card border-white/[0.08] hover:border-sky-400/25 hover:bg-white/[0.025] transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">{statusIcons[task.status] || statusIcons.pending}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <AgentIcon className={`h-3.5 w-3.5 ${agentColors[task.agentType]}`} />
                            <span className={`text-xs font-medium ${agentColors[task.agentType]}`}>
                              {agentNames[task.agentType]}
                            </span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {new Date(task.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <h4 className="text-sm font-medium text-foreground">{task.title}</h4>
                          {task.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${
                            task.status === "completed"
                              ? "border-emerald-400/30 text-emerald-400"
                              : task.status === "running"
                                ? "border-amber-400/30 text-amber-400"
                                : task.status === "failed"
                                  ? "border-destructive/30 text-destructive"
                                  : "border-border text-muted-foreground"
                          }`}
                        >
                          {task.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="bento-card">
              <CardContent className="flex flex-col items-center py-12 px-6">
                <div className="h-14 w-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(56,189,248,0.15)]">
                  <Activity className="h-6 w-6 text-sky-400" />
                </div>
                <p className="text-sm font-medium text-foreground">No bot activity yet</p>
                <p className="text-xs text-muted-foreground mt-1 text-center max-w-md">
                  Activity flows in here once your bots run a workflow, push a listing, or post to a channel.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-5 w-full max-w-2xl">
                   <Link href="/chat">
                    <Button variant="outline" className="w-full justify-start h-auto py-2.5 px-3 border-white/10 hover:border-sky-400/30 hover:bg-sky-500/5">
                      <Bot className="h-4 w-4 text-sky-400 shrink-0 mr-2" />
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-xs font-medium text-foreground">Launch a workflow</div>
                        <div className="text-[10px] text-muted-foreground truncate">Launch mode · niche research</div>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
                    </Button>
                  </Link>
                  <Link href="/storefronts">
                    <Button variant="outline" className="w-full justify-start h-auto py-2.5 px-3 border-white/10 hover:border-cyan-400/30 hover:bg-cyan-500/5">
                      <Store className="h-4 w-4 text-cyan-400 shrink-0 mr-2" />
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-xs font-medium text-foreground">Connect a store</div>
                        <div className="text-[10px] text-muted-foreground truncate">Shopify, Amazon, Etsy &amp; more</div>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
                    </Button>
                  </Link>
                  <Link href="/chat">
                    <Button variant="outline" className="w-full justify-start h-auto py-2.5 px-3 border-white/10 hover:border-amber-400/30 hover:bg-amber-500/5">
                      <Sparkles className="h-4 w-4 text-amber-400 shrink-0 mr-2" />
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-xs font-medium text-foreground">Run an inventory check</div>
                        <div className="text-[10px] text-muted-foreground truncate">Operator mode · low-stock scan</div>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pagination */}
          {tasks && tasks.length > 0 && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {page + 1}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNextPage}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Approval Queue Tab */}
        <TabsContent value="approvals" className="space-y-4">
          {approvalsLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Card key={i} className="bento-card">
                  <CardContent className="p-5 space-y-3">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : pendingApprovals && pendingApprovals.length > 0 ? (
            <div className="space-y-3">
              {pendingApprovals.map((item: any) => (
                <Card key={item.id} className="bg-card border-amber-400/20 hover:border-amber-400/30 transition-all">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="h-4 w-4 text-amber-400" />
                          <Badge variant="outline" className={`text-[10px] ${item.impact === "critical" ? "border-destructive/30 text-destructive" : "border-amber-400/30 text-amber-400"}`}>
                            {item.impact} impact
                          </Badge>
                        </div>
                        <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                          {agentNames[item.agentType]} · {item.actionType?.replace(/_/g, " ")}
                        </p>
                      </div>
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mb-3">{item.description}</p>
                    )}
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Add a review note (optional)..."
                        value={reviewNote[item.id] || ""}
                        onChange={(e) => setReviewNote((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        className="bg-input/50 min-h-[60px] text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() =>
                            reviewApproval.mutate({
                              id: item.id,
                              status: "approved",
                              reviewNote: reviewNote[item.id] || undefined,
                            })
                          }
                          disabled={reviewApproval.isPending}
                        >
                          <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/30 text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            reviewApproval.mutate({
                              id: item.id,
                              status: "rejected",
                              reviewNote: reviewNote[item.id] || undefined,
                            })
                          }
                          disabled={reviewApproval.isPending}
                        >
                          <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bento-card">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <CheckCircle2 className="h-10 w-10 text-emerald-400/30 mb-3" />
                <p className="text-sm text-muted-foreground">No pending approvals</p>
                <p className="text-xs text-white/30 mt-1">All bot decisions are up to date</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Decision History Tab */}
        <TabsContent value="history" className="space-y-4">
          {allApprovals && allApprovals.length > 0 ? (
            <div className="space-y-2">
              {allApprovals.map((item: any) => (
                <Card key={item.id} className="bento-card hover:border-violet-400/25 hover:bg-white/[0.025] transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-foreground">{item.title}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {agentNames[item.agentType]} · {new Date(item.createdAt).toLocaleDateString()}
                          {item.reviewedAt && ` · Reviewed ${new Date(item.reviewedAt).toLocaleDateString()}`}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          item.status === "approved"
                            ? "border-emerald-400/30 text-emerald-400"
                            : item.status === "rejected"
                              ? "border-destructive/30 text-destructive"
                              : "border-amber-400/30 text-amber-400"
                        }`}
                      >
                        {item.status}
                      </Badge>
                    </div>
                    {item.reviewNote && (
                      <p className="text-xs text-muted-foreground mt-2 italic">"{item.reviewNote}"</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bento-card">
              <CardContent className="flex flex-col items-center py-12 px-6">
                <div className="h-14 w-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(139,92,246,0.15)]">
                  <Activity className="h-6 w-6 text-violet-400" />
                </div>
                <p className="text-sm font-medium text-foreground">No decisions yet</p>
                <p className="text-xs text-muted-foreground mt-1 text-center max-w-md">
                  Once a bot escalates a high-impact action — a price change, a bulk PO, a campaign launch — every approve/reject lands here.
                </p>
                <div className="flex gap-2 mt-5">
                  <Link href="/settings#agents">
                    <Button variant="outline" size="sm" className="border-white/10 hover:border-violet-400/30 hover:bg-violet-500/5">
                      <Filter className="h-3.5 w-3.5 mr-1.5 text-violet-400" />
                      Tune approval thresholds
                    </Button>
                  </Link>
                  <Link href="/architect">
                    <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      Launch a workflow
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </div>
  );
}
