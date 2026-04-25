import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  TrendingUp,
  TrendingDown,
  Target,
  DollarSign,
  BarChart3,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Play,
  Trophy,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

export default function ProfitBot() {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedPick, setSelectedPick] = useState<any>(null);
  const [resultDialog, setResultDialog] = useState<{
    taskId: number;
    title: string;
  } | null>(null);

  const record = trpc.profitBot.getRecord.useQuery();
  const history = trpc.profitBot.getHistory.useQuery({ limit: 20 });
  const runAnalysis = trpc.profitBot.runAnalysis.useMutation({
    onSuccess: (data) => {
      setIsRunning(false);
      record.refetch();
      history.refetch();
      if (data.hasPick) {
        toast.success(`Pick found: ${data.pick.title} (${data.pick.confidence}% confidence)`);
      } else {
        toast.info("No play today — nothing met the 75% confidence bar.");
      }
    },
    onError: (err) => {
      setIsRunning(false);
      toast.error(err.message);
    },
  });

  const updateResult = trpc.profitBot.updatePickResult.useMutation({
    onSuccess: () => {
      setResultDialog(null);
      record.refetch();
      history.refetch();
      toast.success("Pick result updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleRunAnalysis = () => {
    setIsRunning(true);
    runAnalysis.mutate({});
  };

  const r = record.data;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-400" />
            Profit Bot
          </h1>
          <p className="text-sm text-[#64748b] mt-1 font-mono">
            Sharp Edge Hunting — Sports, Crypto, Stocks
          </p>
        </div>
        <Button
          onClick={handleRunAnalysis}
          disabled={isRunning}
          className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 hover:text-emerald-300 font-mono text-sm h-10 px-6"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Run Analysis
            </>
          )}
        </Button>
      </div>

      {/* Record Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard
          label="Total Picks"
          value={r?.totalPicks ?? 0}
          icon={<Target className="w-4 h-4" />}
          color="sky"
          loading={record.isLoading}
        />
        <StatCard
          label="Win Rate"
          value={r?.winRate ?? "N/A"}
          suffix={r?.winRate !== "N/A" ? "%" : ""}
          icon={<Trophy className="w-4 h-4" />}
          color="amber"
          loading={record.isLoading}
        />
        <StatCard
          label="Wins"
          value={r?.wins ?? 0}
          icon={<CheckCircle className="w-4 h-4" />}
          color="emerald"
          loading={record.isLoading}
        />
        <StatCard
          label="Losses"
          value={r?.losses ?? 0}
          icon={<XCircle className="w-4 h-4" />}
          color="red"
          loading={record.isLoading}
        />
        <StatCard
          label="Running P/L"
          value={r ? `$${(r.totalPL >= 0 ? "+" : "")}${r.totalPL.toFixed(2)}` : "$0.00"}
          icon={r && r.totalPL >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          color={r && r.totalPL >= 0 ? "emerald" : "red"}
          loading={record.isLoading}
        />
        <StatCard
          label="ROI"
          value={r?.roi ?? "N/A"}
          suffix={r?.roi !== "N/A" ? "%" : ""}
          icon={<BarChart3 className="w-4 h-4" />}
          color="purple"
          loading={record.isLoading}
        />
      </div>

      {/* Category Breakdown */}
      {r?.byCategory && Object.keys(r.byCategory).length > 0 && (
        <Card className="bg-[#0f1117] border-[#1e293b]">
          <CardContent className="p-4">
            <h3 className="text-sm font-mono text-[#64748b] uppercase tracking-wider mb-3">
              Category Breakdown
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(r.byCategory).map(([cat, stats]) => (
                <div
                  key={cat}
                  className="p-3 rounded-md bg-[#1e293b]/30 border border-[#1e293b]/50"
                >
                  <div className="text-xs font-mono text-[#64748b] uppercase mb-1">
                    {cat}
                  </div>
                  <div className="text-sm text-white font-medium">
                    {stats.wins}W-{stats.losses}L
                  </div>
                  <div
                    className={`text-xs font-mono ${
                      stats.pl >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {stats.pl >= 0 ? "+" : ""}${stats.pl.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Latest Pick */}
      {history.data && history.data.length > 0 && history.data[0]?.result && (
        <LatestPickCard
          pick={history.data[0]}
          onViewDetails={() => setSelectedPick(history.data![0])}
          onUpdateResult={(taskId, title) => setResultDialog({ taskId, title })}
        />
      )}

      {/* Pick History */}
      <Card className="bg-[#0f1117] border-[#1e293b]">
        <CardContent className="p-4">
          <h3 className="text-sm font-mono text-[#64748b] uppercase tracking-wider mb-4">
            Pick History
          </h3>
          {history.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 bg-[#1e293b]/50" />
              ))}
            </div>
          ) : history.data && history.data.length > 0 ? (
            <div className="space-y-2">
              {history.data.map((pick: any) => (
                <PickRow
                  key={pick.id}
                  pick={pick}
                  onViewDetails={() => setSelectedPick(pick)}
                  onUpdateResult={(taskId, title) =>
                    setResultDialog({ taskId, title })
                  }
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Zap className="w-10 h-10 text-[#1e293b] mx-auto mb-3" />
              <p className="text-sm text-[#64748b]">
                No picks yet. Run your first analysis to get started.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pick Detail Dialog */}
      <Dialog
        open={!!selectedPick}
        onOpenChange={() => setSelectedPick(null)}
      >
        <DialogContent className="bg-[#0f1117] border-[#1e293b] text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {selectedPick?.result?.pick?.title || "Analysis Details"}
            </DialogTitle>
            <DialogDescription className="text-[#64748b]">
              {selectedPick?.result?.date}
            </DialogDescription>
          </DialogHeader>
          {selectedPick?.result && (
            <PickDetail result={selectedPick.result} />
          )}
        </DialogContent>
      </Dialog>

      {/* Update Result Dialog */}
      <Dialog
        open={!!resultDialog}
        onOpenChange={() => setResultDialog(null)}
      >
        <DialogContent className="bg-[#0f1117] border-[#1e293b] text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Update Pick Result</DialogTitle>
            <DialogDescription className="text-[#64748b]">
              {resultDialog?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => {
                  if (!resultDialog) return;
                  const wager = 30; // default, could be smarter
                  updateResult.mutate({
                    taskId: resultDialog.taskId,
                    result: "win",
                    profitLoss: wager * 0.91, // -110 odds payout
                  });
                }}
                className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 h-12"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                WIN
              </Button>
              <Button
                onClick={() => {
                  if (!resultDialog) return;
                  const wager = 30;
                  updateResult.mutate({
                    taskId: resultDialog.taskId,
                    result: "loss",
                    profitLoss: -wager,
                  });
                }}
                className="bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 h-12"
              >
                <XCircle className="w-4 h-4 mr-2" />
                LOSS
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  icon,
  color,
  loading,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  icon: React.ReactNode;
  color: string;
  loading?: boolean;
}) {
  const colorMap: Record<string, string> = {
    sky: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  };
  const c = colorMap[color] || colorMap.sky;

  return (
    <Card className={`bg-[#0f1117] border-[#1e293b]`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className={`p-1.5 rounded-md border ${c}`}>{icon}</div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#64748b]">
            {label}
          </span>
        </div>
        {loading ? (
          <Skeleton className="h-6 w-16 bg-[#1e293b]/50" />
        ) : (
          <div className="text-lg font-bold text-white font-mono">
            {value}
            {suffix && <span className="text-sm text-[#64748b]">{suffix}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LatestPickCard({
  pick,
  onViewDetails,
  onUpdateResult,
}: {
  pick: any;
  onViewDetails: () => void;
  onUpdateResult: (taskId: number, title: string) => void;
}) {
  const r = pick.result;
  if (!r) return null;

  const isPending = !r.pick?.result || r.pick.result === "pending";

  return (
    <Card className="bg-gradient-to-br from-[#0f1117] to-[#0a1628] border-emerald-500/20">
      <CardContent className="p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-mono uppercase tracking-wider text-emerald-400">
            Latest Analysis — {r.date}
          </span>
        </div>

        {r.hasPick ? (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">{r.pick.title}</h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge
                    variant="outline"
                    className="border-sky-500/30 text-sky-400 text-xs"
                  >
                    {r.pick.category}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-[#1e293b] text-[#94a3b8] text-xs"
                  >
                    {r.pick.betType}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 text-amber-400 text-xs"
                  >
                    {r.pick.odds}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-400 font-mono">
                    {r.pick.confidence}%
                  </div>
                  <div className="text-[10px] text-[#64748b] uppercase">
                    Confidence
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-white font-mono">
                    ${r.pick.wager}
                  </div>
                  <div className="text-[10px] text-[#64748b] uppercase">
                    Wager
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-md bg-[#1e293b]/30 border border-[#1e293b]/50">
              <div className="text-xs font-mono text-emerald-400 mb-1">
                EDGE
              </div>
              <p className="text-sm text-[#94a3b8]">{r.pick.edge}</p>
            </div>

            <div className="p-3 rounded-md bg-[#1e293b]/30 border border-[#1e293b]/50">
              <div className="text-xs font-mono text-amber-400 mb-1">
                KEY RISK
              </div>
              <p className="text-sm text-[#94a3b8]">{r.pick.keyRisk}</p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={onViewDetails}
                variant="outline"
                size="sm"
                className="border-[#1e293b] text-[#94a3b8] hover:text-white text-xs"
              >
                Full Analysis
              </Button>
              {isPending && (
                <Button
                  onClick={() =>
                    onUpdateResult(pick.id, r.pick.title)
                  }
                  variant="outline"
                  size="sm"
                  className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs"
                >
                  Log Result
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <AlertTriangle className="w-8 h-8 text-amber-400/50 mx-auto mb-2" />
            <p className="text-sm text-[#94a3b8]">
              No play today — nothing met the 75% confidence bar.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PickRow({
  pick,
  onViewDetails,
  onUpdateResult,
}: {
  pick: any;
  onViewDetails: () => void;
  onUpdateResult: (taskId: number, title: string) => void;
}) {
  const r = pick.result;
  if (!r) return null;

  const isPending =
    r.hasPick && (!r.pick?.result || r.pick.result === "pending");
  const isWin = r.pick?.result === "win";
  const isLoss = r.pick?.result === "loss";

  return (
    <div
      className="flex items-center justify-between p-3 rounded-md bg-[#1e293b]/20 border border-[#1e293b]/30 hover:border-[#1e293b]/60 transition-colors cursor-pointer"
      onClick={onViewDetails}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${
            !r.hasPick
              ? "bg-[#64748b]"
              : isWin
              ? "bg-emerald-400"
              : isLoss
              ? "bg-red-400"
              : "bg-amber-400"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white truncate">
            {r.hasPick ? r.pick.title : "No play"}
          </div>
          <div className="text-[10px] text-[#64748b] font-mono">
            {r.date}{" "}
            {r.hasPick && (
              <>
                • {r.pick.category} • {r.pick.confidence}%
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {r.hasPick && (
          <>
            <span className="text-xs font-mono text-[#64748b]">
              ${r.pick.wager}
            </span>
            {isWin && (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                +${r.pick.profitLoss?.toFixed(2)}
              </Badge>
            )}
            {isLoss && (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
                -${Math.abs(r.pick.profitLoss || 0).toFixed(2)}
              </Badge>
            )}
            {isPending && (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateResult(pick.id, r.pick.title);
                }}
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[10px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
              >
                <Clock className="w-3 h-3 mr-1" />
                Log
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PickDetail({ result }: { result: any }) {
  const r = result;
  return (
    <div className="space-y-4">
      {/* Market Summary */}
      <div>
        <h4 className="text-xs font-mono text-[#64748b] uppercase tracking-wider mb-2">
          Market Summary
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            { label: "Sports", value: r.marketSummary?.sports },
            { label: "Crypto", value: r.marketSummary?.crypto },
            { label: "Stocks", value: r.marketSummary?.stocks },
            {
              label: "Prediction Markets",
              value: r.marketSummary?.predictionMarkets,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="p-2 rounded bg-[#1e293b]/30 border border-[#1e293b]/50"
            >
              <div className="text-[10px] font-mono text-sky-400 mb-0.5">
                {item.label}
              </div>
              <p className="text-xs text-[#94a3b8]">{item.value || "N/A"}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Layer Analysis */}
      {r.layerAnalysis && (
        <div>
          <h4 className="text-xs font-mono text-[#64748b] uppercase tracking-wider mb-2">
            Analysis Layers
          </h4>
          <div className="space-y-2">
            {[
              {
                label: "Layer 1: Data Collection",
                value: r.layerAnalysis.dataCollection,
              },
              {
                label: "Layer 2: Situational Analysis",
                value: r.layerAnalysis.situationalAnalysis,
              },
              {
                label: "Layer 3: Value Identification",
                value: r.layerAnalysis.valueIdentification,
              },
              {
                label: "Layer 4: Bet Selection",
                value: r.layerAnalysis.betSelection,
              },
            ].map((layer) => (
              <div
                key={layer.label}
                className="p-2 rounded bg-[#1e293b]/30 border border-[#1e293b]/50"
              >
                <div className="text-[10px] font-mono text-emerald-400 mb-0.5">
                  {layer.label}
                </div>
                <p className="text-xs text-[#94a3b8]">{layer.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pick Details */}
      {r.hasPick && r.pick && (
        <div>
          <h4 className="text-xs font-mono text-[#64748b] uppercase tracking-wider mb-2">
            Pick Details
          </h4>
          <div className="p-3 rounded bg-[#1e293b]/30 border border-emerald-500/20">
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div>
                <span className="text-[#64748b]">Category:</span>{" "}
                <span className="text-white">{r.pick.category}</span>
              </div>
              <div>
                <span className="text-[#64748b]">Sport:</span>{" "}
                <span className="text-white">{r.pick.sport}</span>
              </div>
              <div>
                <span className="text-[#64748b]">Bet Type:</span>{" "}
                <span className="text-white">{r.pick.betType}</span>
              </div>
              <div>
                <span className="text-[#64748b]">Odds:</span>{" "}
                <span className="text-white">{r.pick.odds}</span>
              </div>
              <div>
                <span className="text-[#64748b]">Confidence:</span>{" "}
                <span className="text-emerald-400">{r.pick.confidence}%</span>
              </div>
              <div>
                <span className="text-[#64748b]">Wager:</span>{" "}
                <span className="text-white">${r.pick.wager}</span>
              </div>
              <div>
                <span className="text-[#64748b]">Timeframe:</span>{" "}
                <span className="text-white">{r.pick.timeframe}</span>
              </div>
              <div>
                <span className="text-[#64748b]">Stop Loss:</span>{" "}
                <span className="text-white">{r.pick.stopLoss}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-[10px] font-mono text-emerald-400 mb-0.5">
                  Reasoning
                </div>
                <p className="text-xs text-[#94a3b8]">{r.pick.reasoning}</p>
              </div>
              <div>
                <div className="text-[10px] font-mono text-sky-400 mb-0.5">
                  Edge
                </div>
                <p className="text-xs text-[#94a3b8]">{r.pick.edge}</p>
              </div>
              <div>
                <div className="text-[10px] font-mono text-amber-400 mb-0.5">
                  Key Risk
                </div>
                <p className="text-xs text-[#94a3b8]">{r.pick.keyRisk}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Performance Review */}
      {r.performanceReview && r.performanceReview.length > 0 && (
        <div>
          <h4 className="text-xs font-mono text-[#64748b] uppercase tracking-wider mb-2">
            Performance Review
          </h4>
          <div className="p-3 rounded bg-[#1e293b]/30 border border-purple-500/20">
            <p className="text-xs text-[#94a3b8]">{r.performanceReview}</p>
          </div>
        </div>
      )}
    </div>
  );
}
