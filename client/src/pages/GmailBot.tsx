/**
 * Gmail Bot — Email channel management.
 *
 * Rendered as the "Email Channel" tab inside Storefronts & Channels.
 * Legacy `/gmail-bot` deep links redirect to `/storefronts#email`.
 *
 * No top-level page header here — the parent Storefronts shell owns
 * the page chrome. This component renders only the inner tabs.
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Send, MailPlus, Clock, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";

export default function GmailBot() {
  const [selectedTab, setSelectedTab] = useState("inbox");
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplySubject, setAutoReplySubject] = useState("");
  const [autoReplyMessage, setAutoReplyMessage] = useState("");
  // Compose form state — fields were inert before this commit (no
  // onChange, no value, Send button had no onClick). Wired now.
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

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
      toast.success("Email sent");
      // Clear form on success so the same email can't be double-sent
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to send email");
    },
  });

  const handleSendCompose = () => {
    const to = composeTo.trim();
    const subject = composeSubject.trim();
    const body = composeBody.trim();
    if (!to || !subject || !body) {
      toast.error("Recipient, subject, and body are all required");
      return;
    }
    // Basic email shape check — server sanitizes properly, this is
    // just to short-circuit obvious typos before a round-trip.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      toast.error("That doesn't look like a valid email address");
      return;
    }
    sendEmailMutation.mutate({ to, subject, body, isHtml: false });
  };

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
    <div className="flex flex-col h-full min-h-0">
      <div className="space-y-3 overflow-y-auto flex-1 p-3">
      {/* Inner tabs — parent shell renders the page header */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        {/* Inbox Tab */}
        <TabsContent value="inbox" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Unread messages</CardTitle>
              <CardDescription>Your recent unread emails — pulled from the active org's connected Gmail.</CardDescription>
            </CardHeader>
            <CardContent>
              {inboxQuery.isLoading && (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded-lg bg-white/[0.03] animate-pulse" />
                  ))}
                </div>
              )}
              {inboxQuery.error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-red-400">Error loading inbox</p>
                    <p className="text-sm text-red-300">{inboxQuery.error.message}</p>
                  </div>
                </div>
              )}
              {!inboxQuery.isLoading && !inboxQuery.error &&
                inboxQuery.data?.messages && inboxQuery.data.messages.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <CheckCircle className="h-5 w-5 text-emerald-400/70" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Inbox zero</h3>
                  <p className="text-xs text-muted-foreground mt-1.5 max-w-sm">
                    No unread messages right now. New emails will appear here as they arrive.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                {inboxQuery.data?.messages?.map((msg) => (
                  <div
                    key={msg.id}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3.5 hover:border-cyan-400/25 hover:bg-white/[0.035] transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{msg.subject}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">From: {msg.from}</p>
                        <p className="text-xs text-white/55 mt-1.5 line-clamp-2 leading-relaxed">{msg.body}</p>
                      </div>
                      <Badge variant="outline" className="ml-2 shrink-0 text-[10px] border-white/10 text-white/55">
                        {msg.date}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compose Tab */}
        <TabsContent value="compose" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                Compose Email
              </CardTitle>
              <CardDescription>Send a new email to a customer</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">To</label>
                <Input
                  type="email"
                  placeholder="recipient@example.com"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  className="bg-input/50 border-white/[0.08]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">Subject</label>
                <Input
                  placeholder="Email subject"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="bg-input/50 border-white/[0.08]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">Message</label>
                <Textarea
                  placeholder="Write your message here…"
                  rows={8}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="bg-input/50 border-white/[0.08]"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleSendCompose}
                disabled={
                  sendEmailMutation.isPending ||
                  !composeTo.trim() ||
                  !composeSubject.trim() ||
                  !composeBody.trim()
                }
              >
                <Send className="w-4 h-4 mr-2" />
                {sendEmailMutation.isPending ? "Sending…" : "Send Email"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Auto-Reply Settings
              </CardTitle>
              <CardDescription>Configure automatic responses when you're away</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-lg border border-white/[0.06]">
                <div>
                  <p className="font-semibold">Enable Auto-Reply</p>
                  <p className="text-sm text-gray-400">Automatically respond to incoming emails</p>
                </div>
                <button
                  onClick={() => setAutoReplyEnabled(!autoReplyEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    autoReplyEnabled ? "bg-emerald-500" : "bg-white/[0.08]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                      autoReplyEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {autoReplyEnabled && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">Subject</label>
                    <Input
                      value={autoReplySubject}
                      onChange={(e) => setAutoReplySubject(e.target.value)}
                      placeholder="Auto-reply subject"
                      className="bg-input/50 border-white/[0.08]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Message</label>
                    <Textarea
                      value={autoReplyMessage}
                      onChange={(e) => setAutoReplyMessage(e.target.value)}
                      placeholder="Auto-reply message"
                      rows={6}
                      className="bg-input/50 border-white/[0.08]"
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
                    className="w-full"
                  >
                    {updateAutoReplyMutation.isPending ? "Saving…" : "Save auto-reply"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MailPlus className="w-5 h-5" />
                Email Templates
              </CardTitle>
              <CardDescription>Pre-built email templates for common scenarios</CardDescription>
            </CardHeader>
            <CardContent>
              {templatesQuery.isLoading && <div className="text-center py-8">Loading templates...</div>}
              {templatesQuery.data && templatesQuery.data.length === 0 && (
                <EmptyState
                  icon={<MailPlus className="w-5 h-5 text-white/40" />}
                  title="No templates yet"
                description="Save reusable email templates to speed up replies and abandoned-cart flows. Templates you create here are available to Store Bot growth mode too."
                />
              )}
              <div className="grid grid-cols-1 gap-4">
                {templatesQuery.data?.map((template) => (
                  <div key={template.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 hover:border-cyan-400/25 hover:bg-white/[0.035] transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-white">{template.name}</p>
                        <p className="text-sm text-gray-400 mt-1">Subject: {template.subject}</p>
                        <p className="text-sm text-gray-500 mt-2 line-clamp-2">{template.body}</p>
                      </div>
                      <Button variant="outline" size="sm" className="ml-2 flex-shrink-0">
                        Use Template
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
