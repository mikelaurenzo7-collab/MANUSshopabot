/**
 * Gmail Bot Page
 * Email inbox management, auto-reply configuration, and email template management
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Mail className="w-8 h-8 text-blue-500" />
            Gmail Bot
          </h1>
          <p className="text-gray-400 mt-1">Manage emails, auto-replies, and templates</p>
        </div>
      </div>

      {/* Tabs */}
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
              <CardTitle>Unread Messages</CardTitle>
              <CardDescription>Your recent unread emails</CardDescription>
            </CardHeader>
            <CardContent>
              {inboxQuery.isLoading && <div className="text-center py-8 text-gray-400">Loading inbox...</div>}
              {inboxQuery.error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-red-400">Error loading inbox</p>
                    <p className="text-sm text-red-300">{inboxQuery.error.message}</p>
                  </div>
                </div>
              )}
              {inboxQuery.data?.messages && inboxQuery.data.messages.length === 0 && (
                <div className="text-center py-8 text-gray-400">No unread messages</div>
              )}
              <div className="space-y-3">
                {inboxQuery.data?.messages?.map((msg) => (
                  <div key={msg.id} className="border border-gray-700 rounded p-4 hover:bg-gray-900/50 transition">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-white">{msg.subject}</p>
                        <p className="text-sm text-gray-400 mt-1">From: {msg.from}</p>
                        <p className="text-sm text-gray-500 mt-2 line-clamp-2">{msg.body}</p>
                      </div>
                      <Badge variant="outline" className="ml-2 flex-shrink-0">
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
                <label className="block text-sm font-medium mb-2">To</label>
                <Input
                  type="email"
                  placeholder="recipient@example.com"
                  className="bg-gray-900 border-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Subject</label>
                <Input
                  placeholder="Email subject"
                  className="bg-gray-900 border-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Message</label>
                <Textarea
                  placeholder="Write your message here..."
                  rows={8}
                  className="bg-gray-900 border-gray-700"
                />
              </div>
              <Button className="w-full bg-blue-600 hover:bg-blue-700">
                <Send className="w-4 h-4 mr-2" />
                Send Email
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
              <div className="flex items-center justify-between p-4 bg-gray-900 rounded border border-gray-700">
                <div>
                  <p className="font-semibold">Enable Auto-Reply</p>
                  <p className="text-sm text-gray-400">Automatically respond to incoming emails</p>
                </div>
                <button
                  onClick={() => setAutoReplyEnabled(!autoReplyEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    autoReplyEnabled ? "bg-blue-600" : "bg-gray-700"
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
                      className="bg-gray-900 border-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Message</label>
                    <Textarea
                      value={autoReplyMessage}
                      onChange={(e) => setAutoReplyMessage(e.target.value)}
                      placeholder="Auto-reply message"
                      rows={6}
                      className="bg-gray-900 border-gray-700"
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
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {updateAutoReplyMutation.isPending ? "Saving..." : "Save Auto-Reply"}
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
                <div className="text-center py-8 text-gray-400">No templates available</div>
              )}
              <div className="grid grid-cols-1 gap-4">
                {templatesQuery.data?.map((template) => (
                  <div key={template.id} className="border border-gray-700 rounded p-4 hover:bg-gray-900/50 transition">
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
  );
}
