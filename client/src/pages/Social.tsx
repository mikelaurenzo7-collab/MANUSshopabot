import { useState, useMemo, useEffect } from "react";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Megaphone,
  Loader2,
  Zap,
  Image,
  Search,
  Mail,
  Share2,
  Sparkles,
  Copy,
  Star,
  Filter,
  MessageSquare,
  ThumbsUp,
  TrendingUp,
  X,
  Send,
  MailPlus,
  Clock,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

export default function SocialPage() {
  const isMobile = useIsMobile();
  const [selectedStore, setSelectedStore] = useState<string>("");
  const storeId = selectedStore ? Number(selectedStore) : undefined;

  const { data: status } = trpc.dashboard.agentStatus.useQuery();
  const socialStatus: any = status?.find?.((s: any) => s.agentType === 'social') || { status: 'idle' };

  return (
    <div className="flex h-full w-full relative bg-[#050505] overflow-hidden text-white flex-col md:flex-row">
      {/* Main Workspace */}
      <div className="flex-1 flex flex-col h-full md:border-r border-b md:border-b-0 border-white/[0.08]">
        {/* Header Bar */}
        <div className="h-12 md:h-14 flex items-center px-3 md:px-6 border-b border-white/[0.08] justify-between bg-black/40 shrink-0 gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="relative shrink-0">
              <Megaphone className="text-amber-400 w-4 md:w-5 h-4 md:h-5" />
              <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(249,115,22,0.8)]" />
            </div>
            <div className="min-w-0">
              <h1 className="font-heading text-xs md:text-sm font-bold text-white truncate tracking-tight">Social Bot</h1>
              <p className="font-mono text-[8px] md:text-[9px] text-muted-foreground hidden sm:block">Ads · posts · campaigns · email flows</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            <span className={`font-mono text-[9px] uppercase tracking-widest font-bold flex items-center gap-1.5 ${socialStatus.status === 'running' ? 'text-amber-400' : 'text-emerald-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${socialStatus.status === 'running' ? 'bg-amber-400 animate-pulse' : 'bg-amber-400'}`} />
              {socialStatus.status === 'running' ? 'RUNNING' : 'READY'}
            </span>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-amber-500/50 via-amber-500/10 to-transparent shrink-0" />

        <SocialContent
          isMobile={isMobile}
          storeId={storeId}
          selectedStore={selectedStore}
          setSelectedStore={setSelectedStore}
        />
      </div>
    </div>
  );
}

function SocialContent({
  isMobile,
  storeId,
  selectedStore,
  setSelectedStore,
}: {
  isMobile: boolean;
  storeId: number | undefined;
  selectedStore: string;
  setSelectedStore: (v: string) => void;
}) {
  const [adPrompt, setAdPrompt] = useState("");
  const [adPlatform, setAdPlatform] = useState("tiktok");
  const [imagePrompt, setImagePrompt] = useState("");
  const [seoTopic, setSeoTopic] = useState("");
  const [socialTopic, setSocialTopic] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("instagram");
  const [emailType, setEmailType] = useState("welcome");
  const [emailTopic, setEmailTopic] = useState("");

  // Gmail integration state
  const [gmailSubTab, setGmailSubTab] = useState<"campaigns" | "inbox" | "compose" | "auto-reply" | "templates">("campaigns");
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplySubject, setAutoReplySubject] = useState("");
  const [autoReplyMessage, setAutoReplyMessage] = useState("");
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  const { data: stores } = trpc.stores.list.useQuery();
  const { data: campaigns } = trpc.social.adCampaigns.useQuery({ storeId: storeId! }, { enabled: !!storeId });
  const { data: seoKeywords } = trpc.social.seoKeywords.useQuery({ storeId: storeId! }, { enabled: !!storeId });
  const { data: socialPosts } = trpc.social.socialPosts.useQuery({ storeId: storeId! }, { enabled: !!storeId });
  const { data: emailCampaigns } = trpc.social.emailCampaigns.useQuery({ storeId: storeId! }, { enabled: !!storeId });
  const utils = trpc.useUtils();

  const generateAd = trpc.social.generateAdCopy.useMutation({
    onSuccess: () => {
      toast.success("Ad copy generated!");
      utils.social.adCampaigns.invalidate();
      utils.dashboard.invalidate();
      setAdPrompt("");
    },
    onError: (err) => toast.error(err.message),
  });

  const generateImage = trpc.social.generateAdImage.useMutation({
    onSuccess: () => {
      toast.success("Image generated!");
      setImagePrompt("");
    },
    onError: (err) => toast.error(err.message),
  });

  const suggestSeo = trpc.social.suggestSeoKeywords.useMutation({
    onSuccess: () => {
      toast.success("SEO keywords generated!");
      utils.social.seoKeywords.invalidate();
      setSeoTopic("");
    },
    onError: (err) => toast.error(err.message),
  });

  const generateSocial = trpc.social.generateSocialPost.useMutation({
    onSuccess: () => {
      toast.success("Social post created!");
      utils.social.socialPosts.invalidate();
      setSocialTopic("");
    },
    onError: (err) => toast.error(err.message),
  });

  const generateEmail = trpc.social.generateEmailCampaign.useMutation({
    onSuccess: () => {
      toast.success("Email campaign created!");
      utils.social.emailCampaigns.invalidate();
      setEmailTopic("");
    },
    onError: (err) => toast.error(err.message),
  });

  const storeOptions = useMemo(() => stores ?? [], [stores]);

  // Gmail tRPC queries — only fetch when on email tab
  const inboxQuery = trpc.gmailBot.getInbox.useQuery(
    { query: "is:unread", maxResults: 20 },
    { enabled: gmailSubTab === "inbox" }
  );
  const autoReplyQuery = trpc.gmailBot.getAutoReply.useQuery(undefined, {
    enabled: gmailSubTab === "auto-reply",
  });
  const templatesQuery = trpc.gmailBot.getTemplates.useQuery(undefined, {
    enabled: gmailSubTab === "templates",
  });

  const sendEmailMutation = trpc.gmailBot.sendEmail.useMutation({
    onSuccess: () => {
      toast.success("Email sent!");
      setComposeTo(""); setComposeSubject(""); setComposeBody("");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateAutoReplyMutation = trpc.gmailBot.updateAutoReply.useMutation({
    onSuccess: () => { toast.success("Auto-reply saved"); autoReplyQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  // Sync auto-reply settings from query
  useEffect(() => {
    if (gmailSubTab === "auto-reply" && autoReplyQuery.data) {
      setAutoReplyEnabled(autoReplyQuery.data.enabled);
      setAutoReplySubject(autoReplyQuery.data.subject || "");
      setAutoReplyMessage(autoReplyQuery.data.message || "");
    }
  }, [autoReplyQuery.data, gmailSubTab]);

  // AI Tools state
  const [abTestResult, setAbTestResult] = useState<any>(null);
  const [smsResult, setSmsResult] = useState<any>(null);
  const [socialProofResult, setSocialProofResult] = useState<any>(null);
  const [abOriginalCopy, setAbOriginalCopy] = useState("");
  const [abCopyType, setAbCopyType] = useState<"headline" | "description" | "cta" | "email_subject" | "ad_copy">("headline");
  const [smsFlowType, setSmsFlowType] = useState<"abandoned_cart" | "browse_abandonment" | "winback" | "post_purchase_upsell" | "review_request">("abandoned_cart");
  const [proofProductName, setProofProductName] = useState("");
  const [proofType, setProofType] = useState<"testimonials" | "urgency_notifications" | "trust_badges" | "review_responses" | "ugc_prompts">("testimonials");

  // AI Tools mutations
  const abTestCopy = trpc.social.abTestCopyGenerator.useMutation({
    onSuccess: (data) => {
      setAbTestResult(data);
      toast.success("A/B test variants generated!");
    },
    onError: (err) => toast.error(`A/B test failed: ${err.message}`),
  });

  const smsRecovery = trpc.social.smsRecoveryFlow.useMutation({
    onSuccess: (data) => {
      setSmsResult(data);
      toast.success("SMS recovery flow created!");
    },
    onError: (err) => toast.error(`SMS flow failed: ${err.message}`),
  });

  const socialProof = trpc.social.socialProofGenerator.useMutation({
    onSuccess: (data) => {
      setSocialProofResult(data);
      toast.success("Social proof generated!");
    },
    onError: (err) => toast.error(`Social proof failed: ${err.message}`),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <div className="relative">
      {/* Ghost watermark */}
      <div className="ghost-watermark" aria-hidden="true">SOCIAL</div>
      {/* Light leaks */}
      <div className="light-leak-blue" style={{top: '5%', left: '10%'}} aria-hidden="true" />
      <div className="light-leak-purple" style={{top: '50%', right: '5%'}} aria-hidden="true" />
    <div className="space-y-6">
      {/* Store selector + tabs */}
      <div className="px-3 md:px-6 pt-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Active Source:</span>
          <Select value={selectedStore} onValueChange={setSelectedStore}>
            <SelectTrigger className="w-full sm:w-56 bg-[#050505] border-white/[0.08] text-white font-mono text-[10px] uppercase h-8 focus:ring-amber-400/20 focus:border-amber-400">
              <SelectValue placeholder="SELECT_TARGET_STORE" />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a0f] border-white/[0.08]">
              {storeOptions.map((s: any) => (
                <SelectItem key={s.id} value={String(s.id)} className="text-white font-mono text-[10px] uppercase focus:bg-amber-500/10 focus:text-amber-300">
                  {s.name} [{s.platform}]
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedStore ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="border border-white/[0.08] border-dashed rounded-xl p-12 flex flex-col items-center text-center max-w-sm">
            <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(249,115,22,0.1)]">
              <Megaphone className="h-7 w-7 text-amber-400/60" />
            </div>
            <p className="font-mono text-xs uppercase tracking-widest text-white/50 font-bold">No Store Selected</p>
            <p className="font-mono text-[9px] text-white/30 mt-2">Choose a store above to launch ads, generate creatives, and run campaigns.</p>
          </div>
        </div>
      ) : (
        <Tabs defaultValue="ads" className="space-y-4">
          <TabsList className="bg-white/[0.03] border border-white/[0.06] p-1 flex-wrap h-auto">
            <TabsTrigger value="ads" className="text-xs data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-300 data-[state=active]:border-amber-500/20 border border-transparent text-white/50">Ad Copy</TabsTrigger>
            <TabsTrigger value="images" className="text-xs data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-300 data-[state=active]:border-amber-500/20 border border-transparent text-white/50">Image Gen</TabsTrigger>
            <TabsTrigger value="seo" className="text-xs data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-300 data-[state=active]:border-amber-500/20 border border-transparent text-white/50">SEO</TabsTrigger>
            <TabsTrigger value="social" className="text-xs data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-300 data-[state=active]:border-amber-500/20 border border-transparent text-white/50">Social</TabsTrigger>
            <TabsTrigger value="email" className="text-xs data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-300 data-[state=active]:border-amber-500/20 border border-transparent text-white/50">Email</TabsTrigger>
            <TabsTrigger value="tools" className="text-xs data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-300 data-[state=active]:border-amber-500/20 border border-transparent text-white/50">AI Tools</TabsTrigger>
          </TabsList>

          {/* Ad Copy Tab */}
          <TabsContent value="ads" className="space-y-4">
            {/* Ad Copy Generator Card */}
            <div className="border border-white/[0.08] bg-black/40 p-4 md:p-5 relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-400/50" />
              <div className="flex items-center gap-2 mb-4 pl-2">
                <Zap className="h-4 w-4 text-amber-400" />
                <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-white/60">AI Ad Copy Generator</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pl-2">
                <div className="md:col-span-2">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-white/30 block mb-1.5">Product / Topic</span>
                  <Input
                    placeholder="e.g., Bamboo desk organizer set"
                    value={adPrompt}
                    onChange={(e) => setAdPrompt(e.target.value)}
                    className="bg-[#050505] border-white/[0.08] text-white font-mono text-xs h-8 focus:border-amber-400 focus:ring-amber-400/20"
                  />
                </div>
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-white/30 block mb-1.5">Platform</span>
                  <Select value={adPlatform} onValueChange={setAdPlatform}>
                    <SelectTrigger className="bg-[#050505] border-white/[0.08] text-white font-mono text-xs h-8 focus:ring-amber-400/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0a0a0f] border-white/[0.08]">
                      <SelectItem value="tiktok" className="text-white font-mono text-xs focus:bg-amber-500/10 focus:text-amber-300">TikTok</SelectItem>
                      <SelectItem value="meta" className="text-white font-mono text-xs focus:bg-amber-500/10 focus:text-amber-300">Meta / Facebook</SelectItem>
                      <SelectItem value="google" className="text-white font-mono text-xs focus:bg-amber-500/10 focus:text-amber-300">Google Ads</SelectItem>
                      <SelectItem value="instagram" className="text-white font-mono text-xs focus:bg-amber-500/10 focus:text-amber-300">Instagram</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs h-8"
                    onClick={() => generateAd.mutate({ storeId: storeId!, productName: adPrompt, platform: adPlatform as any })}
                    disabled={!adPrompt.trim() || generateAd.isPending}
                  >
                    {generateAd.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
                    GENERATE
                  </Button>
                </div>
              </div>
            </div>

            {campaigns && campaigns.length > 0 ? (
              <div className="space-y-3">
                {campaigns.map((c: any) => (
                  <Card key={c.id} className="bg-card border-white/[0.08] hover:border-sky-500/20 transition-all">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">{c.name}</h4>
                          <p className="text-xs text-muted-foreground capitalize">{c.platform} · {new Date(c.createdAt).toLocaleDateString()}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Copy ad copy" onClick={() => c.adCopy && copyToClipboard(typeof c.adCopy === "string" ? c.adCopy : JSON.stringify(c.adCopy))}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {c.adCopy && (
                        <div className="text-sm text-muted-foreground bg-white/[0.03] rounded-md p-3 mt-2 whitespace-pre-wrap">
                          {typeof c.adCopy === "string" ? c.adCopy : typeof c.adCopy === "object" && c.adCopy.headline ? (
                            <div className="space-y-2">
                              <p className="font-semibold text-foreground">{c.adCopy.headline}</p>
                              <p>{c.adCopy.body || c.adCopy.primaryText}</p>
                              {c.adCopy.callToAction && <p className="text-primary font-medium">{c.adCopy.callToAction}</p>}
                            </div>
                          ) : JSON.stringify(c.adCopy, null, 2)}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bento-card">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Sparkles className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-foreground">No Ad Campaigns Yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Use the form above to generate AI-powered ad copy for your products.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Image Generation Tab */}
          <TabsContent value="images" className="space-y-4">
            <Card className="bento-card">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Image className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">AI Image Generator</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Generate product listing images and ad creatives from text descriptions. No manual design work required.
                </p>
                <div className="space-y-3">
                  <Textarea
                    placeholder="Describe the image you want to generate, e.g., 'A minimalist product photo of a bamboo desk organizer on a clean white desk with natural lighting'"
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    className="bg-input/50 min-h-[80px]"
                  />
                  <Button
                    onClick={() => generateImage.mutate({ storeId: storeId!, productName: imagePrompt, description: imagePrompt })}
                    disabled={!imagePrompt.trim() || generateImage.isPending}
                  >
                    {generateImage.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Image className="h-4 w-4 mr-1" />}
                    Generate Image
                  </Button>
                </div>
                {generateImage.data && (
                  <div className="mt-4">
                    <img
                      src={(generateImage.data as any).imageUrl}
                      alt="Generated"
                      className="rounded-lg border border-white/[0.08] max-w-md"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SEO Tab */}
          <TabsContent value="seo" className="space-y-4">
            <Card className="bento-card">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Search className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">AI SEO Keywords</h3>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter a topic for SEO analysis..."
                    value={seoTopic}
                    onChange={(e) => setSeoTopic(e.target.value)}
                    className="bg-input/50"
                  />
                  <Button
                    onClick={() => suggestSeo.mutate({ storeId: storeId!, niche: seoTopic })}
                    disabled={!seoTopic.trim() || suggestSeo.isPending}
                    className="shrink-0"
                  >
                    {suggestSeo.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Search className="h-4 w-4 mr-1" />}
                    Analyze
                  </Button>
                </div>
              </CardContent>
            </Card>

            {seoKeywords && seoKeywords.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {seoKeywords.map((kw: any) => (
                  <Card key={kw.id} className="bento-card">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{kw.keyword}</span>
                        <div className="flex items-center gap-2">
                          {kw.difficulty && (
                            <Badge variant="outline" className="text-[10px]">
                              {kw.difficulty}
                            </Badge>
                          )}
                          {kw.searchVolume && (
                            <span className="text-xs text-muted-foreground">{kw.searchVolume} vol</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bento-card">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-foreground">No SEO Keywords Yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Enter a topic above to generate SEO-optimized keywords for your store.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Social Tab */}
          <TabsContent value="social" className="space-y-4">
            <Card className="bento-card">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Share2 className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">AI Social Post Generator</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <Input
                      placeholder="What should the post be about?"
                      value={socialTopic}
                      onChange={(e) => setSocialTopic(e.target.value)}
                      className="bg-input/50"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Select value={socialPlatform} onValueChange={setSocialPlatform}>
                      <SelectTrigger className="bg-input/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="twitter">Twitter/X</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() => generateSocial.mutate({ storeId: storeId!, topic: socialTopic, platform: socialPlatform as any })}
                      disabled={!socialTopic.trim() || generateSocial.isPending}
                      className="shrink-0"
                    >
                      {generateSocial.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {socialPosts && socialPosts.length > 0 ? (
              <div className="space-y-3">
                {socialPosts.map((p: any) => (
                  <Card key={p.id} className="bento-card">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <Badge variant="outline" className="text-[10px] capitalize">{p.platform}</Badge>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Copy post content" onClick={() => copyToClipboard(p.content || "")}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{p.content}</p>
                      {p.hashtags && (
                        <p className="text-xs text-primary mt-2">
                          {Array.isArray(p.hashtags) ? p.hashtags.join(" ") : p.hashtags}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bento-card">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Share2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-foreground">No Social Posts Yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Generate AI-powered posts tailored to your chosen platform above.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Email Tab */}
          <TabsContent value="email" className="space-y-4">
            {/* Gmail sub-navigation */}
            <div className="flex gap-1 flex-wrap">
              {(["campaigns", "inbox", "compose", "auto-reply", "templates"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setGmailSubTab(t)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    gmailSubTab === t
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {t === "campaigns" ? "AI Campaigns" : t === "auto-reply" ? "Auto-Reply" : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* AI Campaigns sub-tab (original email builder) */}
            {gmailSubTab === "campaigns" && (
              <>
                <Card className="bento-card">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Mail className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">AI Email Campaign Builder</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Campaign Type</Label>
                        <Select value={emailType} onValueChange={setEmailType}>
                          <SelectTrigger className="bg-input/50"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="welcome">Welcome Series</SelectItem>
                            <SelectItem value="abandoned_cart">Abandoned Cart</SelectItem>
                            <SelectItem value="promotion">Promotion</SelectItem>
                            <SelectItem value="win_back">Win-Back</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Topic / Product</Label>
                        <Input placeholder="e.g., Summer collection launch" value={emailTopic} onChange={(e) => setEmailTopic(e.target.value)} className="bg-input/50" />
                      </div>
                      <div className="flex items-end">
                        <Button className="w-full" onClick={() => generateEmail.mutate({ storeId: storeId!, campaignType: emailType as any, productName: emailTopic })} disabled={!emailTopic.trim() || generateEmail.isPending}>
                          {generateEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Mail className="h-4 w-4 mr-1" />}
                          Generate
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                {emailCampaigns && emailCampaigns.length > 0 ? (
                  <div className="space-y-3">
                    {emailCampaigns.map((ec: any) => (
                      <Card key={ec.id} className="bento-card">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="text-sm font-medium text-foreground">{ec.name}</h4>
                              <p className="text-xs text-muted-foreground capitalize">{ec.campaignType} · {new Date(ec.createdAt).toLocaleDateString()}</p>
                            </div>
                            <Badge variant="outline" className={`text-[10px] ${ec.status === "active" ? "border-emerald-400/30 text-emerald-400" : "border-border text-muted-foreground"}`}>{ec.status}</Badge>
                          </div>
                          {ec.subject && <p className="text-sm text-foreground font-medium mt-2">Subject: {ec.subject}</p>}
                          {ec.body && <div className="text-sm text-muted-foreground bg-white/[0.03] rounded-md p-3 mt-2 whitespace-pre-wrap max-h-40 overflow-y-auto">{ec.body}</div>}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="bento-card">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Mail className="h-10 w-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm font-medium text-foreground">No Email Campaigns Yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Create automated email sequences using the form above.</p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Inbox sub-tab */}
            {gmailSubTab === "inbox" && (
              <Card className="bento-card">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">Unread Messages</h3>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => inboxQuery.refetch()} disabled={inboxQuery.isFetching}>
                      <RefreshCw className={`h-3.5 w-3.5 ${inboxQuery.isFetching ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                  {inboxQuery.isLoading && <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
                  {inboxQuery.error && (
                    <div className="flex items-start gap-3 p-4 rounded-md bg-destructive/10 border border-destructive/20">
                      <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-destructive">Gmail not connected</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Connect your Gmail account in Integrations to use inbox features.</p>
                      </div>
                    </div>
                  )}
                  {!inboxQuery.isLoading && !inboxQuery.error && inboxQuery.data?.messages?.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <CheckCircle className="h-8 w-8 text-emerald-400/50 mb-2" />
                      <p className="text-sm text-muted-foreground">All caught up — no unread messages</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    {inboxQuery.data?.messages?.map((msg: any) => (
                      <div key={msg.id} className="p-3 rounded-md bg-white/[0.03] border border-white/[0.06] hover:border-primary/20 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{msg.subject}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">From: {msg.from}</p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{msg.body}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0">{msg.date}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Compose sub-tab */}
            {gmailSubTab === "compose" && (
              <Card className="bento-card">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Send className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Compose Email</h3>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">To</Label>
                      <Input type="email" placeholder="recipient@example.com" value={composeTo} onChange={(e) => setComposeTo(e.target.value)} className="bg-input/50" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Subject</Label>
                      <Input placeholder="Email subject" value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} className="bg-input/50" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Message</Label>
                      <Textarea placeholder="Write your message..." rows={7} value={composeBody} onChange={(e) => setComposeBody(e.target.value)} className="bg-input/50" />
                    </div>
                    <Button
                      className="w-full"
                      disabled={!composeTo.trim() || !composeSubject.trim() || !composeBody.trim() || sendEmailMutation.isPending}
                      onClick={() => sendEmailMutation.mutate({ to: composeTo, subject: composeSubject, body: composeBody })}
                    >
                      {sendEmailMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                      {sendEmailMutation.isPending ? "Sending..." : "Send Email"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Auto-Reply sub-tab */}
            {gmailSubTab === "auto-reply" && (
              <Card className="bento-card">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Auto-Reply Settings</h3>
                  </div>
                  {autoReplyQuery.isLoading && <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-md bg-white/[0.03] border border-white/[0.06]">
                      <div>
                        <p className="text-sm font-medium text-foreground">Enable Auto-Reply</p>
                        <p className="text-xs text-muted-foreground">Automatically respond to incoming emails</p>
                      </div>
                      <button
                        onClick={() => setAutoReplyEnabled(!autoReplyEnabled)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          autoReplyEnabled ? "bg-primary" : "bg-secondary"
                        }`}
                        aria-label="Toggle auto-reply"
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          autoReplyEnabled ? "translate-x-4" : "translate-x-0.5"
                        }`} />
                      </button>
                    </div>
                    {autoReplyEnabled && (
                      <>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1.5 block">Subject</Label>
                          <Input value={autoReplySubject} onChange={(e) => setAutoReplySubject(e.target.value)} placeholder="Auto-reply subject" className="bg-input/50" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1.5 block">Message</Label>
                          <Textarea value={autoReplyMessage} onChange={(e) => setAutoReplyMessage(e.target.value)} placeholder="Auto-reply message" rows={5} className="bg-input/50" />
                        </div>
                        <Button
                          className="w-full"
                          disabled={updateAutoReplyMutation.isPending}
                          onClick={() => updateAutoReplyMutation.mutate({ enabled: autoReplyEnabled, subject: autoReplySubject, message: autoReplyMessage })}
                        >
                          {updateAutoReplyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                          {updateAutoReplyMutation.isPending ? "Saving..." : "Save Settings"}
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Templates sub-tab */}
            {gmailSubTab === "templates" && (
              <Card className="bento-card">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <MailPlus className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Email Templates</h3>
                  </div>
                  {templatesQuery.isLoading && <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
                  {templatesQuery.data?.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <MailPlus className="h-8 w-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">No templates yet</p>
                    </div>
                  )}
                  <div className="space-y-3">
                    {templatesQuery.data?.map((t: any) => (
                      <div key={t.id} className="p-3 rounded-md bg-white/[0.03] border border-white/[0.06] hover:border-primary/20 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{t.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Subject: {t.subject}</p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.body}</p>
                          </div>
                          <Button variant="outline" size="sm" className="text-xs shrink-0" onClick={() => { setComposeSubject(t.subject); setComposeBody(t.body); setGmailSubTab("compose"); toast.success("Template loaded — go to Compose"); }}>
                            Use
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* AI Tools Tab */}
          <TabsContent value="tools" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Viral Trend Detector */}
              <Card className="bg-card border-white/[0.08] hover:border-orange-500/30 transition-all">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-lg bg-rose-500/15 flex items-center justify-center">
                      <Zap className="h-4.5 w-4.5 text-rose-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Viral Trend Detector</h3>
                      <p className="text-[11px] text-muted-foreground">Real-time trend scanning</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">Scan TikTok, Instagram, and Twitter for viral trends. Get hashtag strategies and ready-to-film content templates.</p>
                  <Button size="sm" className="w-full text-xs" onClick={() => toast.info("Trend detection runs via Workflows — go to Workflows tab to launch")}>
                    <Zap className="h-3 w-3 mr-1" /> Detect Trends (Workflow)
                  </Button>
                </CardContent>
              </Card>

              {/* A/B Test Copy Generator */}
              <Card className="bg-card border-white/[0.08] hover:border-orange-500/30 transition-all">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-lg bg-blue-500/15 flex items-center justify-center">
                      <Copy className="h-4.5 w-4.5 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">A/B Copy Generator</h3>
                      <p className="text-[11px] text-muted-foreground">Test psychological triggers</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">Generate copy variants for headlines, CTAs, and ads with testing plans and winner predictions.</p>
                  <div className="space-y-2">
                    <Input className="h-8 text-xs" placeholder="Original copy to test" value={abOriginalCopy} onChange={(e) => setAbOriginalCopy(e.target.value)} />
                    <Select value={abCopyType} onValueChange={(v) => setAbCopyType(v as any)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Copy type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="headline">Headline</SelectItem>
                        <SelectItem value="description">Description</SelectItem>
                        <SelectItem value="cta">CTA</SelectItem>
                        <SelectItem value="email_subject">Email Subject</SelectItem>
                        <SelectItem value="ad_copy">Ad Copy</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="w-full text-xs" disabled={!abOriginalCopy.trim() || abTestCopy.isPending} onClick={() => abTestCopy.mutate({ storeId: storeId!, originalCopy: abOriginalCopy, copyType: abCopyType, numberOfVariants: 5 })}>
                      {abTestCopy.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Copy className="h-3 w-3 mr-1" />}
                      {abTestCopy.isPending ? "Generating..." : "Generate Variants"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* SMS Recovery */}
              <Card className="bg-card border-white/[0.08] hover:border-orange-500/30 transition-all">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                      <MessageSquare className="h-4.5 w-4.5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">SMS Recovery Flows</h3>
                      <p className="text-[11px] text-muted-foreground">Automated SMS sequences</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">Generate compliant SMS flows for cart recovery, win-back, post-purchase upsells, and review requests.</p>
                  <div className="space-y-2">
                    <Select value={smsFlowType} onValueChange={(v) => setSmsFlowType(v as any)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Flow type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="abandoned_cart">Abandoned Cart</SelectItem>
                        <SelectItem value="browse_abandonment">Browse Abandonment</SelectItem>
                        <SelectItem value="winback">Win-Back</SelectItem>
                        <SelectItem value="post_purchase_upsell">Post-Purchase Upsell</SelectItem>
                        <SelectItem value="review_request">Review Request</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="w-full text-xs" disabled={smsRecovery.isPending} onClick={() => smsRecovery.mutate({ storeId: storeId!, flowType: smsFlowType })}>
                      {smsRecovery.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <MessageSquare className="h-3 w-3 mr-1" />}
                      {smsRecovery.isPending ? "Creating..." : "Create SMS Flow"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Social Proof Generator - inline since it's a Direct Action */}
            <Card className="bg-card border-white/[0.08] hover:border-orange-500/30 transition-all">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-9 w-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                    <ThumbsUp className="h-4.5 w-4.5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Social Proof Generator</h3>
                    <p className="text-[11px] text-muted-foreground">Testimonials, badges, UGC prompts</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Input className="h-8 text-xs" placeholder="Product name" value={proofProductName} onChange={(e) => setProofProductName(e.target.value)} />
                  <Select value={proofType} onValueChange={(v) => setProofType(v as any)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Proof type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="testimonials">Testimonials</SelectItem>
                      <SelectItem value="urgency_notifications">Urgency Notifications</SelectItem>
                      <SelectItem value="trust_badges">Trust Badges</SelectItem>
                      <SelectItem value="review_responses">Review Responses</SelectItem>
                      <SelectItem value="ugc_prompts">UGC Prompts</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="w-full text-xs" disabled={!proofProductName.trim() || socialProof.isPending} onClick={() => socialProof.mutate({ storeId: storeId!, productName: proofProductName, proofType })}>
                    {socialProof.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ThumbsUp className="h-3 w-3 mr-1" />}
                    {socialProof.isPending ? "Generating..." : "Generate Social Proof"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* AI Tools Results */}
            {abTestResult && (
              <Card className="bg-card border-white/[0.08] border-blue-500/30">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">A/B Test Variants</h3>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Dismiss" onClick={() => setAbTestResult(null)}><X className="h-3 w-3" /></Button>
                  </div>
                  {abTestResult.variants ? (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {abTestResult.variants.map((v: any, i: number) => (
                        <div key={i} className="p-3 rounded-md bg-white/[0.03]">
                          <div className="flex items-center justify-between mb-1">
                            <Badge variant="outline" className="text-[9px]">{v.variantLabel || `Variant ${i + 1}`}</Badge>
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(v.copy || v.text || '')}><Copy className="h-3 w-3" /></Button>
                          </div>
                          <p className="text-xs text-foreground">{v.copy || v.text}</p>
                          {v.psychologicalTrigger && <p className="text-[10px] text-muted-foreground mt-1">Trigger: {v.psychologicalTrigger}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{JSON.stringify(abTestResult).slice(0, 500)}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {smsResult && (
              <Card className="bg-card border-white/[0.08] border-emerald-500/30">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">SMS Recovery Flow</h3>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Dismiss" onClick={() => setSmsResult(null)}><X className="h-3 w-3" /></Button>
                  </div>
                  {smsResult.messages ? (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {smsResult.messages.map((m: any, i: number) => (
                        <div key={i} className="p-3 rounded-md bg-white/[0.03]">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-muted-foreground">{m.timing || m.delay || `Message ${i + 1}`}</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(m.text || m.content || '')}><Copy className="h-3 w-3" /></Button>
                          </div>
                          <p className="text-xs text-foreground">{m.text || m.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{JSON.stringify(smsResult).slice(0, 500)}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {socialProofResult && (
              <Card className="bg-card border-white/[0.08] border-amber-500/30">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">Social Proof Content</h3>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Dismiss" onClick={() => setSocialProofResult(null)}><X className="h-3 w-3" /></Button>
                  </div>
                  {socialProofResult.items ? (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {socialProofResult.items.map((item: any, i: number) => (
                        <div key={i} className="p-3 rounded-md bg-white/[0.03]">
                          <p className="text-xs text-foreground">{item.content || item.text || JSON.stringify(item)}</p>
                          <Button variant="ghost" size="sm" className="h-5 text-[10px] mt-1 p-0" onClick={() => copyToClipboard(item.content || item.text || JSON.stringify(item))}><Copy className="h-3 w-3 mr-1" />Copy</Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{JSON.stringify(socialProofResult).slice(0, 500)}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* New Workflow Capabilities */}
            <Card className="bento-card">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Social Bot Power Features</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-2 rounded-md bg-white/[0.03]">
                    <Zap className="h-4 w-4 text-rose-400" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Viral Trend Detector</p>
                      <p className="text-[11px] text-muted-foreground">Real-time trend scanning across TikTok, Instagram, and Twitter</p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px] border-rose-400/30 text-rose-400">Workflow</Badge>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-md bg-white/[0.03]">
                    <Star className="h-4 w-4 text-amber-400" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Influencer Outreach</p>
                      <p className="text-[11px] text-muted-foreground">Full influencer strategy with discovery, vetting, and outreach templates</p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px] border-amber-400/30 text-amber-400">Workflow</Badge>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-md bg-white/[0.03]">
                    <Filter className="h-4 w-4 text-blue-400" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Conversion Funnel CRO</p>
                      <p className="text-[11px] text-muted-foreground">Funnel leak analysis, A/B test roadmap, and checkout optimization</p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px] border-blue-400/30 text-blue-400">Workflow</Badge>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-md bg-white/[0.03]">
                    <ThumbsUp className="h-4 w-4 text-emerald-400" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Social Proof Generator</p>
                      <p className="text-[11px] text-muted-foreground">Testimonials, urgency notifications, trust badges, and UGC prompts</p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px] border-emerald-400/30 text-emerald-400">Direct Action</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
    </div>
  );
}
