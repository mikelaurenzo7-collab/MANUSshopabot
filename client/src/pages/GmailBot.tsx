/**
 * Gmail Bot Page
 * Email inbox management, auto-reply configuration, and email template management
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Mail, Send, MailPlus, Clock, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function GmailBot() {
  const [selectedTab, setSelectedTab] = useState("inbox");
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplySubject, setAutoReplySubject] = useState("");
  const [autoReplyMessage, setAutoReplyMessage] = useState("");

  // Queries
  const inboxQuery = trpc.gmailBot.getInbox.useQuery(
    { query: "is:unread", maxResults: 20 },
    { enabled: selectedTab === "inbox" }
  );

  const autoReplyQuery = trpc.gmailBot.getAutoReply.useQuery(undefined, {
    enabled: selectedTab === "settings",
  });

  const templatesQuery = trpc.gmailBot.getTemplates.useQuery(undefined, {
    enabled: selectedTab === "templates",
  });

  // Mutations
  const sendEmailMutation = trpc.gmailBot.sendEmail.useMutation({
    onSuccess: () => {
      toast.success("Email sent successfully");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to send email");
    },
  });

  const updateAutoReplyMutation = trpc.gmailBot.updateAutoReply.useMutation({
    onSuccess: () => {
      toast.success("Auto-reply updated");
      autoReplyQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update auto-reply");
    },
  });

  const generateResponseMutation = trpc.gmailBot.generateResponse.useMutation({
    onSuccess: (data) => {
      toast.success("Response generated");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to generate response");
    },
  });

  // Load auto-reply settings when tab changes
  useEffect(() => {
    if (selectedTab === "settings" && autoReplyQuery.data) {
      setAutoReplyEnabled(autoReplyQuery.data.enabled);
      setAutoReplySubject(autoReplyQuery.data.subject || "");
      setAutoReplyMessage(autoReplyQuery.data.message || "");
    }
  }, [autoReplyQuery.data, selectedTab]);

  return (
    <div className="relative overflow-hidden page-enter">
      {/* Ambient background */}
      <div className="ghost-watermark" aria-hidden="true">GMAIL</div>
      <div className="light-leak-blue" style={{ top: '5%', left: '10%' }} aria-hidden="true" />
      <div className="light-leak-orange" style={{ top: '60%', right: '5%' }} aria-hidden="true" />

      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="page-header">
          <p className="micro-label mb-1">Email Operations</p>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shadow-[0_0_12px_rgba(14,165,233,0.12)]">
              <Mail className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h1 className="text-xl font-heading font-bold tracking-tight text-foreground">Gmail Bot</h1>
              <p className="text-sm text-muted-foreground">Manage emails, auto-replies, and templates</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-1 h-auto gap-1">
            <TabsTrigger value="inbox" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 rounded-lg text-xs px-3 py-1.5">
              <Mail className="w-3.5 h-3.5 mr-1.5" />Inbox
            </TabsTrigger>
            <TabsTrigger value="compose" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 rounded-lg text-xs px-3 py-1.5">
              <Send className="w-3.5 h-3.5 mr-1.5" />Compose
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 rounded-lg text-xs px-3 py-1.5">
              <Clock className="w-3.5 h-3.5 mr-1.5" />Settings
            </TabsTrigger>
            <TabsTrigger value="templates" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 rounded-lg text-xs px-3 py-1.5">
              <MailPlus className="w-3.5 h-3.5 mr-1.5" />Templates
            </TabsTrigger>
          </TabsList>

          {/* Inbox Tab */}
          <TabsContent value="inbox" className="space-y-4 mt-4">
            <div className="glass-card relative overflow-hidden p-5">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">Unread Messages</p>
              {inboxQuery.isLoading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse mb-3" />
                  <p className="text-sm text-muted-foreground">Loading inbox...</p>
                </div>
              )}
              {inboxQuery.error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-red-400">Error loading inbox</p>
                    <p className="text-sm text-red-300">{inboxQuery.error.message}</p>
                  </div>
                </div>
              )}
              {inboxQuery.data?.messages && inboxQuery.data.messages.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <Mail className="w-5 h-5 text-sky-400/50" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">No unread messages</p>
                  <p className="text-xs text-muted-foreground mt-1">Your inbox is all clear</p>
                </div>
              )}
              <div className="space-y-2">
                {inboxQuery.data?.messages?.map((msg) => (
                  <div key={msg.id} className="glass-subtle relative overflow-hidden p-4 hover:border-sky-400/20 transition-all">
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/20 to-transparent" />
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-white truncate">{msg.subject}</p>
                        <p className="text-xs text-muted-foreground mt-1">From: {msg.from}</p>
                        <p className="text-xs text-white/40 mt-1.5 line-clamp-2">{msg.body}</p>
                      </div>
                      <Badge variant="outline" className="ml-3 shrink-0 text-[10px] border-white/10 text-muted-foreground">
                        {msg.date}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Compose Tab */}
          <TabsContent value="compose" className="space-y-4 mt-4">
            <div className="glass-card relative overflow-hidden p-5">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent" />
              <div className="flex items-center gap-2 mb-5">
                <div className="h-8 w-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                  <Send className="w-4 h-4 text-sky-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Compose Email</p>
                  <p className="text-xs text-muted-foreground">Send a new email to a customer</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">To</label>
                  <Input
                    type="email"
                    placeholder="recipient@example.com"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-sky-500/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Subject</label>
                  <Input
                    placeholder="Email subject"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-sky-500/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Message</label>
                  <Textarea
                    placeholder="Write your message here..."
                    rows={8}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-sky-500/40 resize-none"
                  />
                </div>
                <Button className="w-full btn-glow">
                  <Send className="w-4 h-4 mr-2" />
                  Send Email
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4 mt-4">
            <div className="glass-card relative overflow-hidden p-5">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
              <div className="flex items-center gap-2 mb-5">
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Auto-Reply Settings</p>
                  <p className="text-xs text-muted-foreground">Configure automatic responses when you're away</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-white/[0.03] rounded-xl border border-white/[0.06]">
                  <div>
                    <p className="text-sm font-semibold text-white">Enable Auto-Reply</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Automatically respond to incoming emails</p>
                  </div>
                  <button
                    onClick={() => setAutoReplyEnabled(!autoReplyEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      autoReplyEnabled ? "bg-sky-500" : "bg-white/10"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        autoReplyEnabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {autoReplyEnabled && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Subject</label>
                      <Input
                        value={autoReplySubject}
                        onChange={(e) => setAutoReplySubject(e.target.value)}
                        placeholder="Auto-reply subject"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-sky-500/40"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Message</label>
                      <Textarea
                        value={autoReplyMessage}
                        onChange={(e) => setAutoReplyMessage(e.target.value)}
                        placeholder="Auto-reply message"
                        rows={6}
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-sky-500/40 resize-none"
                      />
                    </div>
                    <Button
                      onClick={() =>
                        updateAutoReplyMutation.mutate({
                          enabled: autoReplyEnabled,
                          subject: autoReplySubject,
                          message: autoReplyMessage,
                        })
                      }
                      disabled={updateAutoReplyMutation.isPending}
                      className="w-full btn-glow"
                    >
                      {updateAutoReplyMutation.isPending ? "Saving..." : "Save Auto-Reply"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4 mt-4">
            <div className="glass-card relative overflow-hidden p-5">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent" />
              <div className="flex items-center gap-2 mb-5">
                <div className="h-8 w-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                  <MailPlus className="w-4 h-4 text-sky-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Email Templates</p>
                  <p className="text-xs text-muted-foreground">Pre-built templates for common scenarios</p>
                </div>
              </div>
              {templatesQuery.isLoading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse mb-3" />
                  <p className="text-sm text-muted-foreground">Loading templates...</p>
                </div>
              )}
              {templatesQuery.data && templatesQuery.data.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <MailPlus className="w-5 h-5 text-sky-400/50" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">No templates available</p>
                  <p className="text-xs text-muted-foreground mt-1">Email templates will appear here</p>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3">
                {templatesQuery.data?.map((template) => (
                  <div key={template.id} className="glass-subtle relative overflow-hidden p-4 hover:border-sky-400/20 transition-all">
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/20 to-transparent" />
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-white">{template.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">Subject: {template.subject}</p>
                        <p className="text-xs text-white/40 mt-1.5 line-clamp-2">{template.body}</p>
                      </div>
                      <Button variant="outline" size="sm" className="ml-3 shrink-0 border-white/10 text-white/60 hover:border-sky-400/30 hover:text-sky-400">
                        Use Template
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
