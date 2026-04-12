import { useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Play,
  Pause,
  XCircle,
  RefreshCw,
  GitBranch,
  Activity,
} from "lucide-react";

const statusColors: Record<string, string> = {
  running: "#6366f1",
  completed: "#10b981",
  pending_approval: "#f59e0b",
  failed: "#ef4444",
  rejected: "#dc2626",
  idle: "#94a3b8",
  active: "#6366f1",
};

export default function OrchestratorGraph() {
  const liveState = trpc.workflowGraph.liveState.useQuery(undefined, {
    refetchInterval: 3000,
  });
  const pauseTask = trpc.workflowGraph.pauseTask.useMutation();
  const resumeTask = trpc.workflowGraph.resumeTask.useMutation();
  const cancelTask = trpc.workflowGraph.cancelTask.useMutation();
  const overrideHistory = trpc.workflowGraph.overrideHistory.useQuery();

  const nodes: Node[] = useMemo(() => {
    if (!liveState.data) return [];
    return liveState.data.nodes.map((n: any) => ({
      ...n,
      style: {
        background: n.type === "botNode"
          ? (n.data.status === "active" ? "#eef2ff" : "#f8fafc")
          : "#ffffff",
        border: `2px solid ${statusColors[n.data.status] || "#e2e8f0"}`,
        borderRadius: 12,
        padding: 12,
        fontSize: 12,
        minWidth: 140,
      },
    }));
  }, [liveState.data]);

  const edges: Edge[] = useMemo(() => {
    if (!liveState.data) return [];
    return liveState.data.edges;
  }, [liveState.data]);

  const handlePause = useCallback((taskId: number) => {
    pauseTask.mutate({ taskId, reason: "Paused from Orchestrator Graph" });
  }, [pauseTask]);

  const handleResume = useCallback((taskId: number) => {
    resumeTask.mutate({ taskId, reason: "Resumed from Orchestrator Graph" });
  }, [resumeTask]);

  const handleCancel = useCallback((taskId: number) => {
    cancelTask.mutate({ taskId, reason: "Cancelled from Orchestrator Graph" });
  }, [cancelTask]);

  if (liveState.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[500px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-indigo-500" />
            Orchestrator — Live Node Graph
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Watch your bots pass intelligence in real-time. Pause or override any decision.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => liveState.refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* ReactFlow Canvas */}
      <Card>
        <CardContent className="p-0">
          <div style={{ height: 500 }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              fitView
              attributionPosition="bottom-left"
            >
              <Background color="#e2e8f0" gap={16} />
              <Controls />
              <MiniMap
                nodeStrokeColor={(n: any) => statusColors[n.data?.status] || "#e2e8f0"}
                nodeColor={(n: any) => n.type === "botNode" ? "#eef2ff" : "#fff"}
              />
            </ReactFlow>
          </div>
        </CardContent>
      </Card>

      {/* Active Tasks with Override Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" /> Active Tasks — Override Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          {nodes.filter(n => n.type === "taskNode").length === 0 ? (
            <p className="text-sm text-muted-foreground">No active tasks right now. Your bots are standing by.</p>
          ) : (
            <div className="space-y-2">
              {nodes.filter(n => n.type === "taskNode").map(n => (
                <div key={n.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant={n.data.status === "running" ? "default" : "secondary"}>
                      {n.data.status}
                    </Badge>
                    <span className="text-sm font-medium">{n.data.label}</span>
                    <span className="text-xs text-muted-foreground">{n.data.agentType}</span>
                  </div>
                  {n.data.canOverride && (
                    <div className="flex gap-1">
                      {n.data.status === "running" && (
                        <Button size="sm" variant="outline" onClick={() => handlePause(n.data.taskId)}>
                          <Pause className="w-3 h-3 mr-1" /> Pause
                        </Button>
                      )}
                      {n.data.status === "pending_approval" && (
                        <Button size="sm" variant="outline" onClick={() => handleResume(n.data.taskId)}>
                          <Play className="w-3 h-3 mr-1" /> Resume
                        </Button>
                      )}
                      <Button size="sm" variant="destructive" onClick={() => handleCancel(n.data.taskId)}>
                        <XCircle className="w-3 h-3 mr-1" /> Cancel
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Override Audit Trail */}
      <Card>
        <CardHeader>
          <CardTitle>Override History (Audit Trail)</CardTitle>
        </CardHeader>
        <CardContent>
          {!overrideHistory.data?.length ? (
            <p className="text-sm text-muted-foreground">No overrides recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {overrideHistory.data.slice(0, 15).map((o: any) => (
                <div key={o.id} className="flex justify-between items-center p-2 border rounded text-sm">
                  <div>
                    <Badge variant="outline">{o.actionTaken}</Badge>
                    <span className="ml-2">Task #{o.agentTaskId}</span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {o.reason || "No reason provided"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
