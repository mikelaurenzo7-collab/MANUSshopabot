/**
 * Approvals.tsx — Workflow Approval Queue
 *
 * Shows all pending workflow decisions that require human sign-off.
 * Admins can approve or reject each item with an optional review note.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HaloEmptyState } from "@/components/HaloEmptyState";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Bot,
  Package,
  Megaphone,
  AlertTriangle,
  ArrowRight,
  GitBranch,
  ShieldCheck,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AGENT_ICON: Record<string, React.ElementType> = {
  architect: Bot,
  merchant: Package,
  social: Megaphone,
};

const AGENT_COLOR: Record<string, string> = {
  architect: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  merchant: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  social: "text-pink-400 bg-pink-500/10 border-pink-500/20",
};

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pending:  { label: "Pending",  className: "bg-amber-500/10 text-amber-400 border-amber-500/30",   icon: Clock },
  approved: { label: "Approved", className: "bg-green-500/10 text-green-400 border-green-500/30",   icon: CheckCircle2 },
  rejected: { label: "Rejected", className: "bg-red-500/10 text-red-400 border-red-500/30",         icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function AgentBadge({ agentType }: { agentType: string }) {
  const Icon = AGENT_ICON[agentType] ?? Bot;
  const cls = AGENT_COLOR[agentType] ?? AGENT_COLOR.architect;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      <Icon className="h-3 w-3" />
      {agentType}
    </span>
  );
}

// ─── Review Dialog ────────────────────────────────────────────────────────────

interface ReviewDialogProps {
  approval: any;
  decision: "approved" | "rejected";
  open: boolean;
  onClose: () => void;
  onConfirm: (id: number, status: "approved" | "rejected", note: string) => void;
  isPending: boolean;
}

function ReviewDialog({ approval, decision, open, onClose, onConfirm, isPending }: ReviewDialogProps) {
  const [note, setNote] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-focus the textarea when the dialog opens. Radix UI's default focus
  // lands on the close button which is correct for accessibility but feels
  // sluggish for a power-user review flow — explicit focus moves typists
  // straight into the note field.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  function handleConfirm() {
    if (!approval || isPending) return;
    onConfirm(approval.id, decision, note);
    setNote("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setNote(""); } }}>
      <DialogContent className="bg-surface-overlay border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {decision === "approved" ? (
              <CheckCircle2 className="h-4 w-4 text-green-400" />
            ) : (
              <XCircle className="h-4 w-4 text-red-400" />
            )}
            {decision === "approved" ? "Approve" : "Reject"} Decision
          </DialogTitle>
          <DialogDescription className="text-white/50">
            {approval?.title ?? ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div>
            <label className="text-xs text-slate-400 mb-1 block flex items-center justify-between">
              <span>Review note (optional)</span>
              <span className="text-[10px] text-white/30">
                ⌘/Ctrl + Enter to confirm
              </span>
            </label>
            <Textarea
              ref={textareaRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              placeholder="Add context for this decision…"
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 min-h-[80px] resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 mt-2">
          <Button variant="ghost" onClick={() => { onClose(); setNote(""); }} className="text-white/60" disabled={isPending}>
            Cancel
          </Button>
          <Button
            className={decision === "approved"
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-red-600 hover:bg-red-700 text-white"
            }
            disabled={isPending}
            onClick={handleConfirm}
          >
            {decision === "approved" ? "Approve" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Approval Card ────────────────────────────────────────────────────────────

function ApprovalCard({
  approval,
  onAction,
  isPending,
}: {
  approval: any;
  onAction: (id: number, decision: "approved" | "rejected") => void;
  isPending: boolean;
}) {
  const createdAt = new Date(approval.createdAt).toLocaleString();
  const showActions = approval.status === "pending";

  return (
    <div className="card-hover rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:border-white/10 hover:bg-white/[0.04]">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            {approval.agentType && <AgentBadge agentType={approval.agentType} />}
            <StatusBadge status={approval.status} />
            {approval.workflowType && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 text-white/40 border border-white/10">
                {approval.workflowType}
              </span>
            )}
            {/* Autonomous-workflow marker — when the gate came from one of the
                three autonomous workflows, operators see the lineage at a
                glance. Helps especially for autonomous_repricer's policy-
                gated >25% moves: the operator knows the bot's rationale lives
                on the workflow detail's audit trail. */}
            {approval.workflowType && (approval.workflowType.startsWith("autonomous_")) && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-300 bg-emerald-500/[0.08] border border-emerald-500/30 rounded px-1.5 py-0.5"
                title="This approval came from an autonomous workflow. The bot's full reasoning trail lives on the workflow detail page."
              >
                <span aria-hidden="true">🛠</span>
                Auto · audit available
              </span>
            )}
          </div>

          {/* Title + description */}
          <div>
            <h3 className="font-semibold text-sm text-white">{approval.title}</h3>
            {approval.description && (
              <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{approval.description}</p>
            )}
          </div>

          {/* Review note */}
          {approval.reviewNote && (
            <p className="text-xs text-slate-500 italic">Note: {approval.reviewNote}</p>
          )}

          <p className="text-xs text-slate-600">{createdAt}</p>
        </div>

        {showActions && (
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="border-green-500/30 text-green-400 hover:bg-green-500/10 h-8 px-3"
              onClick={() => onAction(approval.id, "approved")}
              disabled={isPending}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 h-8 px-3"
              onClick={() => onAction(approval.id, "rejected")}
              disabled={isPending}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Reject
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Approvals() {
  const utils = trpc.useUtils();

  const pendingQuery = trpc.approvals.pending.useQuery(undefined, { refetchInterval: 15_000 });
  const allQuery = trpc.approvals.all.useQuery({ limit: 100 });

  const reviewMutation = trpc.approvals.review.useMutation({
    onSuccess: () => {
      toast.success("Decision recorded");
      utils.approvals.pending.invalidate();
      utils.approvals.all.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to record decision");
    },
  });

  const [dialogState, setDialogState] = useState<{
    approval: any;
    decision: "approved" | "rejected";
  } | null>(null);

  function handleAction(id: number, decision: "approved" | "rejected") {
    const approval = (allQuery.data ?? []).find((a: any) => a.id === id)
      ?? (pendingQuery.data ?? []).find((a: any) => a.id === id);
    setDialogState({ approval, decision });
  }

  function handleConfirm(id: number, status: "approved" | "rejected", note: string) {
    reviewMutation.mutate({ id, status, reviewNote: note || undefined });
    setDialogState(null);
  }

  const pending = pendingQuery.data ?? [];
  const all = allQuery.data ?? [];
  const reviewed = all.filter((a: any) => a.status !== "pending");

  return (
    <div className="page-enter p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div />
        {pending.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-300">
              {pending.length} pending
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="pending" className="data-[state=active]:bg-white/10">
            Pending
            {pending.length > 0 && (
              <span className="ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center shrink-0">
                {pending.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-white/10">
            History
          </TabsTrigger>
        </TabsList>

        {/* Pending Tab */}
        <TabsContent value="pending" className="mt-4">
          {pendingQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl bg-white/5" />)}
            </div>
          ) : pending.length === 0 ? (
            // "All clear" — quiet celebration. Single emerald CTA
            // routes the operator at the activity feed so they can
            // verify their bots are actually working.
            <HaloEmptyState
              tone="emerald"
              icon={ShieldCheck}
              title="All clear — your bots are humming"
              description="No decisions need your sign-off right now. Anything the bots did autonomously is logged in the activity feed — check it any time to make sure they're on track."
              ctas={[{ label: "View bot activity", href: "/inbox#activity", icon: GitBranch }]}
            />
          ) : (
            <div className="space-y-3">
              {pending.map((a: any) => (
                <ApprovalCard
                  key={a.id}
                  approval={a}
                  onAction={handleAction}
                  isPending={reviewMutation.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          {allQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl bg-white/5" />)}
            </div>
          ) : reviewed.length === 0 ? (
            // Quiet history-empty state — violet halo signals the
            // contemplative "audit trail" framing. No CTA: the
            // history fills itself once approvals start happening.
            <HaloEmptyState
              tone="violet"
              icon={Clock}
              title="No approval history yet"
              description="Reviewed decisions land here. Once a bot escalates an action and you approve or reject it, the audit trail starts here."
            />
          ) : (
            <div className="space-y-3">
              {reviewed.map((a: any) => (
                <ApprovalCard
                  key={a.id}
                  approval={a}
                  onAction={handleAction}
                  isPending={reviewMutation.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      {dialogState && (
        <ReviewDialog
          approval={dialogState.approval}
          decision={dialogState.decision}
          open={!!dialogState}
          onClose={() => setDialogState(null)}
          onConfirm={handleConfirm}
          isPending={reviewMutation.isPending}
        />
      )}
    </div>
  );
}
