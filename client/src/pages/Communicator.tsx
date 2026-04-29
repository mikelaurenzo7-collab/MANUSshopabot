/**
 * Communicator.tsx — 4th main bot for email management.
 *
 * Unified interface for Gmail + Outlook email channels.
 * Handles inbox management, email composition, and campaign sends.
 * Uses the same ambient styling as Architect/Merchant/Social.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Mail, Search, Loader2, AlertTriangle, Send, Plus, X,
  CheckCircle2, Trash2, Sparkles, ExternalLink, RefreshCw,
  Clock, User, FileText, Inbox, Settings
} from "lucide-react";
import { Streamdown } from "streamdown";
import { getBrand } from "@/lib/platformBrand";
import { BotOperatingAcross } from "@/components/BotOperatingAcross";
import { PulseStream } from "@/components/PulseStream";
import { ActiveBotWorkflows } from "@/components/ActiveBotWorkflows";
import { BotRecentWins } from "@/components/BotRecentWins";
import { BotCookbookSpotlight } from "@/components/BotCookbookSpotlight";

export default function CommunicatorPage() {
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"inbox" | "compose" | "campaigns">("inbox");
  const [composeRecipient, setComposeRecipient] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  const utils = trpc.useUtils();
  const { data: status } = trpc.dashboard.agentStatus.useQuery();
  const { data: history } = trpc.dashboard.recentActivity.useQuery({ limit: 10 });

  // Get email credentials and inbox
  const { data: gmailInbox, isLoading: gmailLoading } = trpc.gmailBot.getInbox.useQuery(
    { query: "is:unread", maxResults: 20 },
    { enabled: true }
  );

  const communicatorStatus: any = (status as any[])?.find?.((s: any) => s.agentType === 'social') || { status: 'idle' };

  const sendEmailMutation = trpc.gmailBot.sendEmail.useMutation({
    onSuccess: () => {
      toast.success("Email sent successfully");
      setComposeRecipient("");
      setComposeSubject("");
      setComposeBody("");
      setActiveTab("inbox");
      utils.gmailBot.getInbox.invalidate();
    },
    onError: (err) => {
      setError(err.message);
      toast.error(err.message || "Failed to send email");
    }
  });

  const handleSendEmail = () => {
    if (!composeRecipient.trim() || !composeSubject.trim() || !composeBody.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    sendEmailMutation.mutate({
      to: composeRecipient,
      subject: composeSubject,
      body: composeBody,
    });
  };

  const selectedEmail = useMemo(() => {
    if (!selectedEmailId || !gmailInbox?.messages) return null;
    return gmailInbox.messages.find((e: any) => e.id === selectedEmailId);
  }, [selectedEmailId, gmailInbox]);

  // Esc closes the email detail view
  useEffect(() => {
    if (!selectedEmailId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setSelectedEmailId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedEmailId]);

  return (
    <div className="flex h-full w-full relative bg-[#050505] text-white flex-col min-h-0">
      {/* Ambient background */}
      <div className="bot-page-ambient bot-page-ambient--social" aria-hidden="true">
        <div className="bot-page-ambient-grid" />
        <div className="bot-page-ambient-orb bot-page-ambient-orb--top" />
        <div className="bot-page-ambient-orb bot-page-ambient-orb--bottom" />
      </div>

      {/* Header */}
      <div className="relative z-10 border-b border-white/[0.08] bg-gradient-to-b from-white/[0.02] to-transparent px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <Mail className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Communicator</h1>
              <p className="text-xs text-white/40">Gmail + Outlook email management</p>
            </div>
          </div>
          <PulseStream
            status={communicatorStatus.status === 'running' ? 'running' : 'ready'}
            color="#f87171"
            label="Communicator pulse"
          />
          <span className={`bot-page-header-status ${communicatorStatus.status === 'running' ? 'bot-page-header-status--running' : 'bot-page-header-status--ready'}`}>
            <span className="bot-page-header-status-dot" />
            {communicatorStatus.status === 'running' ? 'Running' : 'Ready'}
          </span>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-6 bg-[#050505]">
        <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">

          {/* Operating across */}
          <BotOperatingAcross botId="social" />

          {/* Active workflows */}
          <ActiveBotWorkflows agentType="social" />

          {/* Spotlight */}
          <BotCookbookSpotlight agentType="social" />

          {/* Recent wins */}
          <BotRecentWins agentType="social" />

          {/* Error Banner */}
          {error && (
            <div className="flex items-start gap-2 md:gap-3 p-3 md:p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 md:w-5 h-4 md:h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[9px] md:text-[10px] uppercase tracking-widest font-bold text-red-500 mb-2 break-words">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-red-500 hover:text-red-400 transition-colors mt-0.5 shrink-0">
                <X className="w-3 md:w-4 h-3 md:h-4" />
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="border border-white/[0.08] bg-black/40 rounded-lg overflow-hidden">
            <div className="flex border-b border-white/[0.08] bg-[#050505]">
              {[
                { id: "inbox", label: "Inbox", icon: Inbox },
                { id: "compose", label: "Compose", icon: Mail },
                { id: "campaigns", label: "Campaigns", icon: Sparkles },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 px-4 py-3 font-mono text-[10px] uppercase tracking-widest font-bold transition-colors flex items-center justify-center gap-2 ${
                    activeTab === tab.id
                      ? "text-rose-400 bg-rose-500/10 border-b-2 border-rose-400"
                      : "text-white/40 hover:text-white/70"
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-4">
              {/* Inbox Tab */}
              {activeTab === "inbox" && (
                <div className="space-y-3">
                  {gmailLoading ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Loading inbox...
                    </div>
                  ) : gmailInbox?.messages && gmailInbox.messages.length > 0 ? (
                    gmailInbox.messages.map((email: any) => (
                      <div
                        key={email.id}
                        onClick={() => setSelectedEmailId(email.id)}
                        className="p-3 border border-white/[0.08] rounded-lg bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-white truncate">{email.from}</p>
                            <p className="text-sm text-white/70 truncate">{email.subject}</p>
                            <p className="text-xs text-white/40 mt-1 line-clamp-2">{email.body}</p>
                          </div>
                          <span className="text-xs text-white/40 shrink-0">{email.date}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="font-mono text-[10px] uppercase">No unread emails</p>
                    </div>
                  )}
                </div>
              )}

              {/* Compose Tab */}
              {activeTab === "compose" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-white/60 mb-2">To</label>
                    <input
                      type="email"
                      placeholder="recipient@example.com"
                      value={composeRecipient}
                      onChange={(e) => setComposeRecipient(e.target.value)}
                      className="w-full bg-[#050505] border border-white/[0.08] rounded px-3 py-2 text-white placeholder:text-white/30 focus:border-rose-400/50 focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-white/60 mb-2">Subject</label>
                    <input
                      type="text"
                      placeholder="Email subject"
                      value={composeSubject}
                      onChange={(e) => setComposeSubject(e.target.value)}
                      className="w-full bg-[#050505] border border-white/[0.08] rounded px-3 py-2 text-white placeholder:text-white/30 focus:border-rose-400/50 focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-white/60 mb-2">Body</label>
                    <textarea
                      placeholder="Email content"
                      value={composeBody}
                      onChange={(e) => setComposeBody(e.target.value)}
                      rows={6}
                      className="w-full bg-[#050505] border border-white/[0.08] rounded px-3 py-2 text-white placeholder:text-white/30 focus:border-rose-400/50 focus:outline-none transition-colors resize-none"
                    />
                  </div>
                  <button
                    onClick={handleSendEmail}
                    disabled={sendEmailMutation.isPending}
                    className="w-full bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 hover:border-rose-400/50 text-rose-300 font-mono text-[10px] uppercase tracking-widest px-4 py-2 rounded transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {sendEmailMutation.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        Send Email
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Campaigns Tab */}
              {activeTab === "campaigns" && (
                <div className="text-center py-8 text-muted-foreground">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="font-mono text-[10px] uppercase">Campaign management coming soon</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Email Detail Slide-over */}
      {selectedEmail && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedEmailId(null)} />
          <div className="relative w-full md:w-96 h-screen md:h-auto md:rounded-lg bg-[#050505] border border-white/[0.08] flex flex-col max-h-screen md:max-h-[80vh]">
            <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
              <h3 className="font-semibold text-white truncate">{selectedEmail.subject}</h3>
              <button onClick={() => setSelectedEmailId(null)} className="text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div>
                <p className="text-xs text-white/40 uppercase tracking-widest font-mono">From</p>
                <p className="text-sm text-white">{selectedEmail.from}</p>
              </div>
              <div>
                <p className="text-xs text-white/40 uppercase tracking-widest font-mono">Date</p>
                <p className="text-sm text-white">{selectedEmail.date}</p>
              </div>
              <div>
                <p className="text-xs text-white/40 uppercase tracking-widest font-mono">Message</p>
                <p className="text-sm text-white/80 whitespace-pre-wrap">{selectedEmail.body}</p>
              </div>
            </div>
            <div className="p-4 border-t border-white/[0.08] flex gap-2">
              <button className="flex-1 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white font-mono text-[10px] uppercase tracking-widest px-3 py-2 rounded transition-colors">
                Reply
              </button>
              <button className="flex-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 font-mono text-[10px] uppercase tracking-widest px-3 py-2 rounded transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
