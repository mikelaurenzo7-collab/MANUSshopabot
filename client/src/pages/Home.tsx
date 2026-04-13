import React, { useMemo, useState, useCallback, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  Edge,
  Node,
  useNodesState,
  useEdgesState,
  Position,
  MarkerType,
  Handle,
  ConnectionLineType
} from "reactflow";
import "reactflow/dist/style.css";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2, Database, Zap, Cpu, Bot, Activity, Box, ShoppingCart, Globe, Workflow } from "lucide-react";

// Customized Node Types for our Foundry aesthetic
const CustomNode = ({ data, isConnectable }: any) => {
  return (
    <div className={`px-4 py-3 bg-[#0a0a0a] border ${data.selected ? 'border-[#00ff41]' : 'border-[#1e293b]'} rounded-none shadow-2xl min-w-[200px] flex items-center gap-3 relative`}>
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} className="w-1 h-3 rounded-none bg-[#1e293b] border-none -ml-px" />
      <div className={`w-8 h-8 rounded-none border border-[#1e293b] flex items-center justify-center shrink-0 ${data.accent || 'bg-[#1e293b]/20'}`}>
        {data.icon}
      </div>
      <div className="flex flex-col">
        <span className="text-[9px] uppercase tracking-widest text-[#64748b] font-bold">{data.label}</span>
        <span className="font-mono text-xs text-white uppercase mt-0.5">{data.value || "AWAITING_DATA"}</span>
      </div>
      {data.status === 'active' && (
        <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-[#f59e0b] rounded-none animate-pulse" />
      )}
      {data.status === 'ok' && (
        <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-[#00ff41] rounded-none" />
      )}
      {data.status === 'error' && (
        <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-none animate-pulse" />
      )}
      <Handle type="source" position={Position.Right} isConnectable={isConnectable} className="w-1 h-3 rounded-none bg-[#1e293b] border-none -mr-px" />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

export default function Home() {
  const { user } = useAuth();
  const [selectedNode, setSelectedNode] = useState<any>(null);

  // Preserve all backend hooks! 
  const { data: metrics, isLoading: metricsLoading } = trpc.dashboard.metrics.useQuery({}, { refetchInterval: 30000 });
  const { data: agentStatus } = trpc.dashboard.agentStatus.useQuery(undefined, { refetchInterval: 15000 });
  const { data: recentActivity } = trpc.dashboard.recentActivity.useQuery({ limit: 10 }, { refetchInterval: 20000 });
  const { data: connSummary } = trpc.connectors.connectionSummary.useQuery();
  const { data: intel } = trpc.dashboard.crossStoreIntelligence.useQuery();
  const { data: stores } = trpc.stores.list.useQuery();

  // Create initial nodes and edges based on data
  const initialNodes: Node[] = [
    {
      id: "root",
      type: "custom",
      position: { x: 50, y: 350 },
      data: {
        label: "Drizzle / TiDB Root",
        value: "SYSTEM_ONLINE",
        icon: <Database className="w-4 h-4 text-[#00ff41]" />,
        status: "ok",
        details: { Host: "AWS us-east-1", "Memory Usage": "3.4 GB", "Connection Pool": "Active" }
      }
    },
    {
      id: "workflows",
      type: "custom",
      position: { x: 400, y: 150 },
      data: {
        label: "Workflow Engine",
        value: "PROCESSING",
        icon: <Workflow className="w-4 h-4 text-[#f59e0b]" />,
        status: "active",
        details: { "Active Workflows": agentStatus?.running || 0, "Completed": agentStatus?.completed || 0 }
      }
    },
    {
      id: "sharp",
      type: "custom",
      position: { x: 800, y: 150 },
      data: {
        label: "Sharp Image Optimizer",
        value: "PIPELINE_ACTIVE",
        icon: <Zap className="w-4 h-4 text-[#00ff41]" />,
        status: "ok",
        details: { "Format": "WebP", "Compression": "Quality 80", "Transformations": "Resize/Crop" }
      }
    },
    {
      id: "connectors",
      type: "custom",
      position: { x: 400, y: 350 },
      data: {
        label: "Integrations & API",
        value: `${(connSummary?.stores || 0) + (connSummary?.socialAccounts || 0)} CONNECTED`,
        icon: <Globe className="w-4 h-4 text-cyan-400" />,
        status: "ok",
        details: { "Stores Linked": connSummary?.stores || 0, "Social Linked": connSummary?.socialAccounts || 0 }
      }
    },
    {
      id: "metrics",
      type: "custom",
      position: { x: 400, y: 550 },
      data: {
        label: "System Revenue",
        value: `$${((metrics?.totalRevenue ?? 0) / 100).toFixed(2)}`,
        icon: <Activity className="w-4 h-4 text-emerald-400" />,
        status: "ok",
        details: { "Total Orders": metrics?.totalOrders || 0, "Active Products": metrics?.activeProducts || 0 }
      }
    },
    {
      id: "bot_architect",
      type: "custom",
      position: { x: 800, y: 350 },
      data: {
        label: "Builder Bot",
        value: "AUTONOMOUS",
        icon: <Bot className="w-4 h-4 text-sky-400" />,
        status: "active",
        details: { "Role": "Architect", "Status": "Listening for Signals" }
      }
    },
  ];

  const initialEdges: Edge[] = [
    { id: "e1", source: "root", target: "workflows", animated: true, style: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '5,5' } },
    { id: "e2", source: "workflows", target: "sharp", animated: true, style: { stroke: '#00ff41', strokeWidth: 1.5, strokeDasharray: '5,5' } },
    { id: "e3", source: "root", target: "connectors", type: 'step', style: { stroke: '#1e293b', strokeWidth: 1.5 } },
    { id: "e4", source: "root", target: "metrics", type: 'step', style: { stroke: '#1e293b', strokeWidth: 1.5 } },
    { id: "e5", source: "connectors", target: "bot_architect", animated: true, style: { stroke: '#1e293b', strokeWidth: 1.5 } },
  ];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when data loads
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === "metrics") {
          n.data = { ...n.data, value: `$${((metrics?.totalRevenue ?? 0) / 100).toFixed(2)}`, details: { "Total Orders": metrics?.totalOrders || 0, "Active Products": metrics?.activeProducts || 0 } };
        }
        if (n.id === "workflows") {
          n.data = { ...n.data, details: { "Active Tasks": agentStatus?.running || 0, "Completed": agentStatus?.completed || 0 } };
        }
        if (n.id === "connectors") {
          n.data = { ...n.data, value: `${(connSummary?.stores || 0) + (connSummary?.socialAccounts || 0)} CONNECTED` };
        }
        return n;
      })
    );
  }, [metrics, agentStatus, connSummary, setNodes]);

  const onNodeClick = useCallback((_, node) => {
    setSelectedNode(node);
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, selected: n.id === node.id },
      }))
    );
  }, [setNodes]);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, selected: false } })));
  }, [setNodes]);

  return (
    <div className="flex h-full w-full relative bg-[#050505] overflow-hidden">
      {/* Canvas */}
      <div className="flex-1 h-full relative">
        {metricsLoading && (
          <div className="absolute top-4 left-4 z-10 flex items-center justify-center p-3 bg-[#1e293b]/20 border border-[#1e293b]">
            <Loader2 className="w-4 h-4 animate-spin text-[#00ff41] mr-2" />
            <span className="font-mono text-[10px] text-[#00ff41] uppercase tracking-widest">Awaiting Telemetry...</span>
          </div>
        )}
        
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          connectionLineType={ConnectionLineType.Step}
          proOptions={{ hideAttribution: true }}
          fitView
          minZoom={0.5}
          maxZoom={2}
          className="bg-[#050505]"
        >
          <Background color="#1e293b" gap={32} size={1} />
          <Controls 
            className="!bg-[#0a0a0a] !border-[#1e293b] !rounded-none !shadow-none [&>button]:!border-b-[#1e293b] [&>button]:!bg-[#0a0a0a] [&>button>svg]:!fill-[#e2e8f0]" 
            position="bottom-left" 
            showInteractive={false} 
          />
        </ReactFlow>
      </div>

      {/* Metadata Inspector (Right Panel) */}
      <aside className="w-[320px] h-full shrink-0 border-l border-[#1e293b] bg-[#0a0a0a] flex flex-col z-20 box-border">
        <div className="h-14 flex items-center px-4 border-b border-[#1e293b] justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-[#64748b]">
            Inspector Panel
          </span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-none animate-pulse bg-[#00ff41]" />
            <span className="font-mono text-[9px] text-[#00ff41]">UPLINK_OK</span>
          </span>
        </div>

        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
          {selectedNode ? (
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-none border border-[#1e293b] flex items-center justify-center shrink-0`}>
                  {selectedNode.data.icon}
                </div>
                <div>
                  <p className="font-mono text-xs uppercase text-white font-bold mb-1">{selectedNode.data.label}</p>
                  <p className="font-mono text-[10px] text-[#00ff41]">{selectedNode.data.value}</p>
                </div>
              </div>

              <div>
                <p className="text-[9px] uppercase tracking-widest text-[#64748b] font-bold mb-3 border-b border-[#1e293b]/50 pb-2">
                  Node Properties
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-mono text-[10px] text-white/50">ID</span>
                    <span className="font-mono text-[10px] text-white">{selectedNode.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-mono text-[10px] text-white/50">TYPE</span>
                    <span className="font-mono text-[10px] text-white uppercase">{selectedNode.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-mono text-[10px] text-white/50">COORD_X</span>
                    <span className="font-mono text-[10px] text-white">{selectedNode.position.x.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-mono text-[10px] text-white/50">COORD_Y</span>
                    <span className="font-mono text-[10px] text-white">{selectedNode.position.y.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {selectedNode.data.details && (
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-[#64748b] font-bold mb-3 border-b border-[#1e293b]/50 pb-2">
                    Live Telemetry
                  </p>
                  <div className="space-y-2">
                    {Object.entries(selectedNode.data.details).map(([key, val]) => (
                      <div key={key} className="flex justify-between items-center group">
                        <span className="font-mono text-[10px] text-white/50 uppercase">{key}</span>
                        <span className="font-mono text-[10px] text-[#00ff41] text-right">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <Box className="w-8 h-8 text-[#1e293b] border border-[#1e293b] p-1 mb-4" />
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#64748b]">No Node Selected</p>
              <p className="font-mono text-[9px] text-[#64748b]/50 mt-2 max-w-[200px]">Click a canvas entity to inspect its underlying data structures and telemetry.</p>
            </div>
          )}
        </div>

        {/* Global Recent Activity in Inspector Footer */}
        {recentActivity && recentActivity.length > 0 && !selectedNode && (
          <div className="mt-auto border-t border-[#1e293b] p-4 bg-[#0a0a0a]">
            <p className="text-[9px] uppercase tracking-widest text-[#64748b] font-bold mb-3">System Log</p>
            <div className="space-y-2">
              {recentActivity.slice(0, 3).map((act: any) => (
                <div key={act.id} className="flex items-center gap-2">
                  <div className={`w-1 h-1 rounded-none ${act.status === 'completed' ? 'bg-[#00ff41]' : act.status === 'failed' ? 'bg-red-500' : 'bg-[#f59e0b]'}`} />
                  <span className="font-mono text-[9px] text-white/70 truncate">{act.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
