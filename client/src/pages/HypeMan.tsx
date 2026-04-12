import { useState, useMemo } from "react";
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
} from "lucide-react";

export default function HypeManPage() {
  const [selectedStore, setSelectedStore] = useState<string>("");
  const storeId = selectedStore ? Number(selectedStore) : undefined;
  const [adPrompt, setAdPrompt] = useState("");
  const [adPlatform, setAdPlatform] = useState("tiktok");
  const [imagePrompt, setImagePrompt] = useState("");
  const [seoTopic, setSeoTopic] = useState("");
  const [socialTopic, setSocialTopic] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("instagram");
  const [emailType, setEmailType] = useState("welcome");
  const [emailTopic, setEmailTopic] = useState("");

  const { data: stores } = trpc.stores.list.useQuery();
  const { data: campaigns } = trpc.hypeman.adCampaigns.useQuery({ storeId: storeId! }, { enabled: !!storeId });
  const { data: seoKeywords } = trpc.hypeman.seoKeywords.useQuery({ storeId: storeId! }, { enabled: !!storeId });
  const { data: socialPosts } = trpc.hypeman.socialPosts.useQuery({ storeId: storeId! }, { enabled: !!storeId });
  const { data: emailCampaigns } = trpc.hypeman.emailCampaigns.useQuery({ storeId: storeId! }, { enabled: !!storeId });
  const utils = trpc.useUtils();

  const generateAd = trpc.hypeman.generateAdCopy.useMutation({
    onSuccess: () => {
      toast.success("Ad copy generated!");
      utils.hypeman.adCampaigns.invalidate();
      utils.dashboard.invalidate();
      setAdPrompt("");
    },
    onError: (err) => toast.error(err.message),
  });

  const generateImage = trpc.hypeman.generateAdImage.useMutation({
    onSuccess: () => {
      toast.success("Image generated!");
      setImagePrompt("");
    },
    onError: (err) => toast.error(err.message),
  });

  const suggestSeo = trpc.hypeman.suggestSeoKeywords.useMutation({
    onSuccess: () => {
      toast.success("SEO keywords generated!");
      utils.hypeman.seoKeywords.invalidate();
      setSeoTopic("");
    },
    onError: (err) => toast.error(err.message),
  });

  const generateSocial = trpc.hypeman.generateSocialPost.useMutation({
    onSuccess: () => {
      toast.success("Social post created!");
      utils.hypeman.socialPosts.invalidate();
      setSocialTopic("");
    },
    onError: (err) => toast.error(err.message),
  });

  const generateEmail = trpc.hypeman.generateEmailCampaign.useMutation({
    onSuccess: () => {
      toast.success("Email campaign created!");
      utils.hypeman.emailCampaigns.invalidate();
      setEmailTopic("");
    },
    onError: (err) => toast.error(err.message),
  });

  const storeOptions = useMemo(() => stores ?? [], [stores]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <Megaphone className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">The Hype-Man Bot</h1>
            <p className="text-sm text-muted-foreground">Ad copy, social media, SEO, and email campaigns</p>
          </div>
        </div>
        <Select value={selectedStore} onValueChange={setSelectedStore}>
          <SelectTrigger className="w-48 bg-input/50">
            <SelectValue placeholder="Select store" />
          </SelectTrigger>
          <SelectContent>
            {storeOptions.map((s: any) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedStore ? (
        <Card className="bg-card border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Megaphone className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Select a store to start marketing</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="ads" className="space-y-4">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="ads">Ad Copy</TabsTrigger>
            <TabsTrigger value="images">Image Gen</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
            <TabsTrigger value="social">Social</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="tools">AI Tools</TabsTrigger>
          </TabsList>

          {/* Ad Copy Tab */}
          <TabsContent value="ads" className="space-y-4">
            <Card className="bg-card border-border/50">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">AI Ad Copy Generator</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="md:col-span-2">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Product / Topic</Label>
                    <Input
                      placeholder="e.g., Bamboo desk organizer set"
                      value={adPrompt}
                      onChange={(e) => setAdPrompt(e.target.value)}
                      className="bg-input/50"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Platform</Label>
                    <Select value={adPlatform} onValueChange={setAdPlatform}>
                      <SelectTrigger className="bg-input/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="meta">Meta / Facebook</SelectItem>
                        <SelectItem value="google">Google Ads</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      className="w-full"
                      onClick={() => generateAd.mutate({ storeId: storeId!, productName: adPrompt, platform: adPlatform as any })}
                      disabled={!adPrompt.trim() || generateAd.isPending}
                    >
                      {generateAd.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
                      Generate
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {campaigns && campaigns.length > 0 ? (
              <div className="space-y-3">
                {campaigns.map((c: any) => (
                  <Card key={c.id} className="bg-card border-border/50 hover:border-primary/20 transition-all">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">{c.name}</h4>
                          <p className="text-xs text-muted-foreground capitalize">{c.platform} · {new Date(c.createdAt).toLocaleDateString()}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => c.adCopy && copyToClipboard(typeof c.adCopy === "string" ? c.adCopy : JSON.stringify(c.adCopy))}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {c.adCopy && (
                        <div className="text-sm text-muted-foreground bg-secondary/30 rounded-md p-3 mt-2 whitespace-pre-wrap">
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
              <Card className="bg-card border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Sparkles className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No ad campaigns yet</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Image Generation Tab */}
          <TabsContent value="images" className="space-y-4">
            <Card className="bg-card border-border/50">
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
                      className="rounded-lg border border-border/50 max-w-md"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SEO Tab */}
          <TabsContent value="seo" className="space-y-4">
            <Card className="bg-card border-border/50">
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
                  <Card key={kw.id} className="bg-card border-border/50">
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
              <Card className="bg-card border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No SEO keywords yet</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Social Tab */}
          <TabsContent value="social" className="space-y-4">
            <Card className="bg-card border-border/50">
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
                  <Card key={p.id} className="bg-card border-border/50">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <Badge variant="outline" className="text-[10px] capitalize">{p.platform}</Badge>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(p.content || "")}>
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
              <Card className="bg-card border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Share2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No social posts yet</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Email Tab */}
          <TabsContent value="email" className="space-y-4">
            <Card className="bg-card border-border/50">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">AI Email Campaign Builder</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Campaign Type</Label>
                    <Select value={emailType} onValueChange={setEmailType}>
                      <SelectTrigger className="bg-input/50">
                        <SelectValue />
                      </SelectTrigger>
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
                    <Input
                      placeholder="e.g., Summer collection launch"
                      value={emailTopic}
                      onChange={(e) => setEmailTopic(e.target.value)}
                      className="bg-input/50"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      className="w-full"
                      onClick={() => generateEmail.mutate({ storeId: storeId!, campaignType: emailType as any, productName: emailTopic })}
                      disabled={!emailTopic.trim() || generateEmail.isPending}
                    >
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
                  <Card key={ec.id} className="bg-card border-border/50">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">{ec.name}</h4>
                          <p className="text-xs text-muted-foreground capitalize">{ec.campaignType} · {new Date(ec.createdAt).toLocaleDateString()}</p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${ec.status === "active" ? "border-emerald-400/30 text-emerald-400" : "border-border text-muted-foreground"}`}>
                          {ec.status}
                        </Badge>
                      </div>
                      {ec.subject && <p className="text-sm text-foreground font-medium mt-2">Subject: {ec.subject}</p>}
                      {ec.body && (
                        <div className="text-sm text-muted-foreground bg-secondary/30 rounded-md p-3 mt-2 whitespace-pre-wrap max-h-40 overflow-y-auto">
                          {ec.body}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-card border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Mail className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No email campaigns yet</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* AI Tools Tab */}
          <TabsContent value="tools" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Viral Trend Detector */}
              <Card className="bg-card border-border/50 hover:border-orange-500/30 transition-all">
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
                  <Button size="sm" className="w-full text-xs" onClick={() => toast.info("Launch via Workflows for full trend detection")}>
                    <Zap className="h-3 w-3 mr-1" /> Detect Trends
                  </Button>
                </CardContent>
              </Card>

              {/* A/B Test Copy Generator */}
              <Card className="bg-card border-border/50 hover:border-orange-500/30 transition-all">
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
                  <Button size="sm" className="w-full text-xs" onClick={() => toast.info("Feature coming soon — direct A/B test generation")}>
                    <Copy className="h-3 w-3 mr-1" /> Generate Variants
                  </Button>
                </CardContent>
              </Card>

              {/* SMS Recovery */}
              <Card className="bg-card border-border/50 hover:border-orange-500/30 transition-all">
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
                  <Button size="sm" className="w-full text-xs" onClick={() => toast.info("Feature coming soon — direct SMS flow generation")}>
                    <MessageSquare className="h-3 w-3 mr-1" /> Create SMS Flow
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* New Workflow Capabilities */}
            <Card className="bg-card border-border/50">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">New Hype-Man Capabilities</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-2 rounded-md bg-secondary/30">
                    <Zap className="h-4 w-4 text-rose-400" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Viral Trend Detector</p>
                      <p className="text-[11px] text-muted-foreground">Real-time trend scanning across TikTok, Instagram, and Twitter</p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px] border-rose-400/30 text-rose-400">Workflow</Badge>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-md bg-secondary/30">
                    <Star className="h-4 w-4 text-amber-400" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Influencer Outreach</p>
                      <p className="text-[11px] text-muted-foreground">Full influencer strategy with discovery, vetting, and outreach templates</p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px] border-amber-400/30 text-amber-400">Workflow</Badge>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-md bg-secondary/30">
                    <Filter className="h-4 w-4 text-blue-400" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Conversion Funnel CRO</p>
                      <p className="text-[11px] text-muted-foreground">Funnel leak analysis, A/B test roadmap, and checkout optimization</p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px] border-blue-400/30 text-blue-400">Workflow</Badge>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-md bg-secondary/30">
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
  );
}
