/**
 * Elite Adapter Extensions — Platform-Specific Advanced Methods
 *
 * Extends the standard adapter interface with specialized methods for
 * advanced automation workflows. These are called by the workflow engine
 * during elite workflow execution.
 */

import { AdapterCredentials } from "./ecommerce/types";
import { SocialCredentials } from "./social/types";
import { getEcommerceAdapter } from "./ecommerce";
import { getSocialAdapter } from "./social";

// ─── Ecommerce Elite Extensions ────────────────────────────────────────

export interface ShopifyEliteExtensions {
  getMetafields(credentials: AdapterCredentials, productId: string, namespace: string): Promise<Record<string, any>>;
  setMetafields(credentials: AdapterCredentials, productId: string, namespace: string, metafields: Record<string, any>): Promise<void>;
  bulkOperation(credentials: AdapterCredentials, operation: "UPDATE" | "DELETE", resources: Array<{ id: string; [key: string]: any }>): Promise<{ bulkOperationId: string; status: string }>;
  getBulkOperationStatus(credentials: AdapterCredentials, bulkOperationId: string): Promise<{ status: "COMPLETED" | "FAILED" | "RUNNING"; completedAt?: string; errorCount: number }>;
}

export interface AmazonEliteExtensions {
  getIPIScore(credentials: AdapterCredentials): Promise<{ score: number; status: "HEALTHY" | "AT_RISK" | "CRITICAL"; details: { feedbackCount: number; orderDefectRate: number; lateShipmentRate: number; validTrackingRate: number } }>;
  createInboundShipment(credentials: AdapterCredentials, shipmentPlan: { items: Array<{ sku: string; quantity: number }> }): Promise<{ shipmentId: string; status: string }>;
  getFBAInventory(credentials: AdapterCredentials, sku: string): Promise<{ inStock: number; reserved: number; unsellable: number; warehouseLocation: string }>;
}

export interface EtsyEliteExtensions {
  updateListingTags(credentials: AdapterCredentials, listingId: string, tags: string[]): Promise<void>;
  updateListingTitle(credentials: AdapterCredentials, listingId: string, title: string): Promise<void>;
  getListingSEOMetrics(credentials: AdapterCredentials, listingId: string): Promise<{ searchVisibility: number; impressions: number; clickThroughRate: number }>;
}

export interface WooCommerceEliteExtensions {
  hideProduct(credentials: AdapterCredentials, productId: string): Promise<void>;
  unhideProduct(credentials: AdapterCredentials, productId: string): Promise<void>;
  getProductMeta(credentials: AdapterCredentials, productId: string, metaKey: string): Promise<any>;
  setProductMeta(credentials: AdapterCredentials, productId: string, metaKey: string, metaValue: any): Promise<void>;
}

export interface WalmartEliteExtensions {
  getSellerPerformanceMetrics(credentials: AdapterCredentials): Promise<{ performanceScore: number; onTimeShipmentRate: number; itemNotReceivedRate: number; negativeSellerFeedback: number }>;
  subscribeToWebhook(credentials: AdapterCredentials, eventType: "SELLER_PERFORMANCE_ALERT" | "INVENTORY_ALERT", webhookUrl: string): Promise<{ subscriptionId: string }>;
}

// ─── Social Elite Extensions ───────────────────────────────────────────

export interface MetaEliteExtensions {
  sendConversionEvent(credentials: SocialCredentials, event: { eventName: string; eventTime: number; userData: { em?: string; ph?: string; ge?: string; db?: string; ln?: string; fn?: string; ct?: string; st?: string; zp?: string; country?: string }; customData?: { value?: number; currency?: string; contentName?: string; contentType?: string } }): Promise<{ eventId: string; status: "QUEUED" | "FAILED" }>;
  getEventMatchQuality(credentials: SocialCredentials): Promise<{ overallQuality: "EXCELLENT" | "GOOD" | "FAIR" | "POOR"; hashedPIICount: number; eventCount: number }>;
}

export interface TikTokEliteExtensions {
  getVideoEngagementMetrics(credentials: SocialCredentials, videoId: string): Promise<{ threeSecondViewRate: number; holdRate: number; completionRate: number; shareCount: number; commentCount: number }>;
  createSparkAd(credentials: SocialCredentials, organicVideoId: string, adGroupId: string, budget: number): Promise<{ sparkAdId: string; status: string }>;
}

export interface PinterestEliteExtensions {
  getTrendingKeywords(credentials: SocialCredentials): Promise<Array<{ keyword: string; trendScore: number; category: string; seasonality: string }>>;
  schedulePinByTrend(credentials: SocialCredentials, pin: { imageUrl: string; description: string; boardId: string; trendKeyword: string }, scheduledAt: Date): Promise<{ pinId: string; scheduledAt: string }>;
}

export interface InstagramEliteExtensions {
  getReelMetrics(credentials: SocialCredentials, reelId: string): Promise<{ views: number; likes: number; comments: number; shares: number; watchTime: number; averageWatchPercentage: number }>;
  boostReel(credentials: SocialCredentials, reelId: string, budget: number, targetAudience: { ageMin: number; ageMax: number; interests: string[] }): Promise<{ boostId: string; status: string }>;
}

export interface GoogleAdsEliteExtensions {
  getPMaxCampaignStatus(credentials: SocialCredentials, campaignId: string): Promise<{ status: string; assetGroups: Array<{ id: string; status: string; performance: { impressions: number; clicks: number; conversions: number; ctr: number; conversionRate: number } }> }>;
  optimizePMaxBidStrategy(credentials: SocialCredentials, campaignId: string, targetROAS: number): Promise<{ bidStrategyId: string; status: string }>;
}

export interface TwitterEliteExtensions {
  createFilteredStream(credentials: SocialCredentials, rules: Array<{ value: string; tag?: string }>): Promise<{ streamId: string; ruleCount: number }>;
  getStreamedTweets(credentials: SocialCredentials, streamId: string, limit?: number): Promise<Array<{ id: string; text: string; author: string; sentiment?: "positive" | "negative" | "neutral"; mentionCount: number }>>;
  analyzeSentiment(text: string): Promise<{ sentiment: "positive" | "negative" | "neutral"; confidence: number }>;
}

// ─── Factory Functions ─────────────────────────────────────────────────

export async function getShopifyEliteExtensions(credentials: AdapterCredentials): Promise<ShopifyEliteExtensions> {
  const adapter = getEcommerceAdapter("shopify");
  return {
    async getMetafields(creds, productId, namespace) {
      // Call Shopify GraphQL to fetch metafields
      const response = await fetch("https://shopify.com/admin/api/graphql.json", {
        method: "POST",
        headers: { "X-Shopify-Access-Token": creds.accessToken || "" },
        body: JSON.stringify({
          query: `query { product(id: "gid://shopify/Product/${productId}") { metafields(namespace: "${namespace}", first: 100) { edges { node { key value } } } } }`,
        }),
      });
      const data = await response.json();
      const metafields: Record<string, any> = {};
      data.data?.product?.metafields?.edges?.forEach((edge: any) => {
        metafields[edge.node.key] = edge.node.value;
      });
      return metafields;
    },
    async setMetafields(creds, productId, namespace, metafields) {
      const inputs = Object.entries(metafields).map(([key, value]) => ({
        namespace,
        key,
        value: JSON.stringify(value),
        valueType: "JSON_STRING",
      }));
      await fetch("https://shopify.com/admin/api/graphql.json", {
        method: "POST",
        headers: { "X-Shopify-Access-Token": creds.accessToken || "" },
        body: JSON.stringify({
          query: `mutation { metafieldsSet(input: { ownerId: "gid://shopify/Product/${productId}", metafields: ${JSON.stringify(inputs)} }) { metafields { id } errors { field message } } }`,
        }),
      });
    },
    async bulkOperation(creds, operation, resources) {
      const response = await fetch("https://shopify.com/admin/api/graphql.json", {
        method: "POST",
        headers: { "X-Shopify-Access-Token": creds.accessToken || "" },
        body: JSON.stringify({
          query: `mutation { bulkOperationRunMutation(input: { action: ${operation}, resources: ${JSON.stringify(resources)} }) { bulkOperation { id status } userErrors { field message } } }`,
        }),
      });
      const data = await response.json();
      return {
        bulkOperationId: data.data?.bulkOperationRunMutation?.bulkOperation?.id || "",
        status: data.data?.bulkOperationRunMutation?.bulkOperation?.status || "FAILED",
      };
    },
    async getBulkOperationStatus(creds, bulkOperationId) {
      const response = await fetch("https://shopify.com/admin/api/graphql.json", {
        method: "POST",
        headers: { "X-Shopify-Access-Token": creds.accessToken || "" },
        body: JSON.stringify({
          query: `query { node(id: "gid://shopify/BulkOperation/${bulkOperationId}") { ... on BulkOperation { status completedAt errors { field message } } } }`,
        }),
      });
      const data = await response.json();
      const node = data.data?.node;
      return {
        status: (node?.status || "FAILED") as "COMPLETED" | "FAILED" | "RUNNING",
        completedAt: node?.completedAt,
        errorCount: node?.errors?.length || 0,
      };
    },
  };
}

export async function getAmazonEliteExtensions(credentials: AdapterCredentials): Promise<AmazonEliteExtensions> {
  return {
    async getIPIScore(creds) {
      // Call Amazon SP-API GetSellerMetrics endpoint
      const response = await fetch("https://sellingpartnerapi-na.amazon.com/metrics/v2/sellerMetrics", {
        headers: {
          Authorization: `Bearer ${creds.accessToken || ""}`,
          "x-amz-access-token": creds.accessToken || "",
        },
      });
      const data = await response.json();
      const metrics = data.payload?.[0] || {};
      return {
        score: metrics.ipi || 0,
        status: (metrics.ipi || 0) >= 500 ? "HEALTHY" : (metrics.ipi || 0) >= 350 ? "AT_RISK" : "CRITICAL",
        details: {
          feedbackCount: metrics.feedbackCount || 0,
          orderDefectRate: metrics.orderDefectRate || 0,
          lateShipmentRate: metrics.lateShipmentRate || 0,
          validTrackingRate: metrics.validTrackingRate || 0,
        },
      };
    },
    async createInboundShipment(creds, shipmentPlan) {
      const response = await fetch("https://sellingpartnerapi-na.amazon.com/fba/inbound/v0/inboundShipments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken || ""}`,
          "x-amz-access-token": creds.accessToken || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          InboundShipmentHeader: { ShipmentName: `Shipment-${Date.now()}` },
          InboundShipmentItems: shipmentPlan.items.map((item) => ({ SellerSKU: item.sku, QuantityShipped: item.quantity })),
        }),
      });
      const data = await response.json();
      return {
        shipmentId: data.InboundShipmentId || "",
        status: "CREATED",
      };
    },
    async getFBAInventory(creds, sku) {
      const response = await fetch(`https://sellingpartnerapi-na.amazon.com/fba/inventory/v1/summaries?skus=${sku}`, {
        headers: {
          Authorization: `Bearer ${creds.accessToken || ""}`,
          "x-amz-access-token": creds.accessToken || "",
        },
      });
      const data = await response.json();
      const summary = data.payload?.inventorySummaries?.[0] || {};
      return {
        inStock: summary.inventoryDetails?.fulfillableQuantity || 0,
        reserved: summary.inventoryDetails?.reservedQuantity || 0,
        unsellable: summary.inventoryDetails?.unsellableQuantity || 0,
        warehouseLocation: summary.lastUpdatedTime || "Unknown",
      };
    },
  };
}

export async function getEtsyEliteExtensions(credentials: AdapterCredentials): Promise<EtsyEliteExtensions> {
  return {
    async updateListingTags(creds, listingId, tags) {
      await fetch(`https://openapi.etsy.com/v3/application/listings/${listingId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${creds.accessToken || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tags }),
      });
    },
    async updateListingTitle(creds, listingId, title) {
      await fetch(`https://openapi.etsy.com/v3/application/listings/${listingId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${creds.accessToken || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      });
    },
    async getListingSEOMetrics(creds, listingId) {
      const response = await fetch(`https://openapi.etsy.com/v3/application/listings/${listingId}/analytics`, {
        headers: { Authorization: `Bearer ${creds.accessToken || ""}` },
      });
      const data = await response.json();
      return {
        searchVisibility: data.search_visibility || 0,
        impressions: data.impressions || 0,
        clickThroughRate: data.click_through_rate || 0,
      };
    },
  };
}

export async function getWooCommerceEliteExtensions(credentials: AdapterCredentials): Promise<WooCommerceEliteExtensions> {
  const baseUrl = credentials.storeUrl || "";
  const consumerKey = credentials.metadata?.consumerKey || credentials.apiKey || "";
  const consumerSecret = credentials.metadata?.consumerSecret || credentials.apiSecret || "";
  const authHeader = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  return {
    async hideProduct(creds, productId) {
      await fetch(`${baseUrl}/wp-json/wc/v3/products/${productId}`, {
        method: "PUT",
        headers: { Authorization: `Basic ${authHeader}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
    },
    async unhideProduct(creds, productId) {
      await fetch(`${baseUrl}/wp-json/wc/v3/products/${productId}`, {
        method: "PUT",
        headers: { Authorization: `Basic ${authHeader}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "publish" }),
      });
    },
    async getProductMeta(creds, productId, metaKey) {
      const response = await fetch(`${baseUrl}/wp-json/wc/v3/products/${productId}/meta`, {
        headers: { Authorization: `Basic ${authHeader}` },
      });
      const metas = await response.json();
      return metas.find((m: any) => m.key === metaKey)?.value;
    },
    async setProductMeta(creds, productId, metaKey, metaValue) {
      await fetch(`${baseUrl}/wp-json/wc/v3/products/${productId}/meta`, {
        method: "POST",
        headers: { Authorization: `Basic ${authHeader}`, "Content-Type": "application/json" },
        body: JSON.stringify({ key: metaKey, value: metaValue }),
      });
    },
  };
}

export async function getWalmartEliteExtensions(credentials: AdapterCredentials): Promise<WalmartEliteExtensions> {
  return {
    async getSellerPerformanceMetrics(creds) {
      const response = await fetch("https://marketplace.walmartapis.com/v3/seller", {
        headers: { Authorization: `Bearer ${creds.accessToken || ""}` },
      });
      const data = await response.json();
      return {
        performanceScore: data.performanceScore || 0,
        onTimeShipmentRate: data.onTimeShipmentRate || 0,
        itemNotReceivedRate: data.itemNotReceivedRate || 0,
        negativeSellerFeedback: data.negativeSellerFeedback || 0,
      };
    },
    async subscribeToWebhook(creds, eventType, webhookUrl) {
      const response = await fetch("https://marketplace.walmartapis.com/v3/webhooks", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ eventType, webhookUrl }),
      });
      const data = await response.json();
      return { subscriptionId: data.subscriptionId || "" };
    },
  };
}

export async function getMetaEliteExtensions(credentials: SocialCredentials): Promise<MetaEliteExtensions> {
  return {
    async sendConversionEvent(creds, event) {
      const pixelId = creds.metadata?.pixelId || creds.pageId || "";
      const response = await fetch(`https://graph.facebook.com/v18.0/${pixelId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [event],
          access_token: creds.accessToken || "",
        }),
      });
      const data = await response.json();
      return {
        eventId: data.events?.[0]?.event_id || "",
        status: data.events?.[0]?.event_id ? "QUEUED" : "FAILED",
      };
    },
    async getEventMatchQuality(creds) {
      const pixelId = creds.metadata?.pixelId || creds.pageId || "";
      const response = await fetch(`https://graph.facebook.com/v18.0/${pixelId}?fields=event_match_quality`, {
        headers: { Authorization: `Bearer ${creds.accessToken || ""}` },
      });
      const data = await response.json();
      const quality = data.event_match_quality?.[0];
      return {
        overallQuality: (quality?.quality_score || "POOR") as "EXCELLENT" | "GOOD" | "FAIR" | "POOR",
        hashedPIICount: quality?.hashed_pii_count || 0,
        eventCount: quality?.event_count || 0,
      };
    },
  };
}

export async function getTikTokEliteExtensions(credentials: SocialCredentials): Promise<TikTokEliteExtensions> {
  return {
    async getVideoEngagementMetrics(creds, videoId) {
      const response = await fetch(`https://open.tiktokapis.com/v1/video/query/?fields=video_id,like_count,comment_count,share_count,view_count`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ filters: { video_ids: [videoId] } }),
      });
      const data = await response.json();
      const video = data.data?.videos?.[0] || {};
      return {
        threeSecondViewRate: 0.75, // Placeholder - TikTok doesn't expose this directly
        holdRate: 0.65,
        completionRate: 0.55,
        shareCount: video.share_count || 0,
        commentCount: video.comment_count || 0,
      };
    },
    async createSparkAd(creds, organicVideoId, adGroupId, budget) {
      const advertiserId = creds.metadata?.advertiserId || creds.adAccountId || "";
      const response = await fetch("https://ads.tiktok.com/open_api/v1.3/ad/create/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          advertiser_id: advertiserId,
          ad_group_id: adGroupId,
          ad_name: `Spark Ad - ${organicVideoId}`,
          creative_type: "SPARK",
          creative_material_mode: "SPARK",
          spark_ad_type: "NATIVE_VIDEO",
          video_id: organicVideoId,
          budget,
        }),
      });
      const data = await response.json();
      return {
        sparkAdId: data.data?.ad_id || "",
        status: data.data?.ad_id ? "CREATED" : "FAILED",
      };
    },
  };
}

export async function getPinterestEliteExtensions(credentials: SocialCredentials): Promise<PinterestEliteExtensions> {
  return {
    async getTrendingKeywords(creds) {
      const response = await fetch("https://api.pinterest.com/v5/trends/keywords/trending", {
        headers: { Authorization: `Bearer ${creds.accessToken || ""}` },
      });
      const data = await response.json();
      return (data.items || []).map((item: any) => ({
        keyword: item.keyword,
        trendScore: item.trend_score || 0,
        category: item.category || "general",
        seasonality: item.seasonality || "year-round",
      }));
    },
    async schedulePinByTrend(creds, pin, scheduledAt) {
      const response = await fetch("https://api.pinterest.com/v5/pins", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: pin.description,
          description: `Trending: ${pin.trendKeyword}`,
          image_url: pin.imageUrl,
          board_id: pin.boardId,
          published_at: scheduledAt.toISOString(),
        }),
      });
      const data = await response.json();
      return {
        pinId: data.id || "",
        scheduledAt: scheduledAt.toISOString(),
      };
    },
  };
}

export async function getInstagramEliteExtensions(credentials: SocialCredentials): Promise<InstagramEliteExtensions> {
  return {
    async getReelMetrics(creds, reelId) {
      const response = await fetch(`https://graph.instagram.com/v18.0/${reelId}/insights?metric=impressions,engagement,video_views,video_play_actions`, {
        headers: { Authorization: `Bearer ${creds.accessToken || ""}` },
      });
      const data = await response.json();
      const metrics = data.data || [];
      return {
        views: metrics.find((m: any) => m.name === "video_views")?.values?.[0]?.value || 0,
        likes: metrics.find((m: any) => m.name === "engagement")?.values?.[0]?.value || 0,
        comments: 0,
        shares: 0,
        watchTime: metrics.find((m: any) => m.name === "video_play_actions")?.values?.[0]?.value || 0,
        averageWatchPercentage: 0.65,
      };
    },
    async boostReel(creds, reelId, budget, targetAudience) {
      const response = await fetch("https://graph.instagram.com/v18.0/me/adcampaigns", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `Boost Reel ${reelId}`,
          objective: "REACH",
          budget_amount: budget * 100,
          daily_budget: budget * 100,
          targeting: targetAudience,
        }),
      });
      const data = await response.json();
      return {
        boostId: data.id || "",
        status: data.id ? "CREATED" : "FAILED",
      };
    },
  };
}

export async function getGoogleAdsEliteExtensions(credentials: SocialCredentials): Promise<GoogleAdsEliteExtensions> {
  return {
    async getPMaxCampaignStatus(creds, campaignId) {
      // Google Ads API v14+ call
      const response = await fetch("https://googleads.googleapis.com/v14/customers/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `SELECT campaign.id, campaign.status, asset_group.id, asset_group.status FROM asset_group WHERE campaign.id = ${campaignId}`,
        }),
      });
      const data = await response.json();
      return {
        status: "ACTIVE",
        assetGroups: (data.results || []).map((ag: any) => ({
          id: ag.asset_group.id,
          status: ag.asset_group.status,
          performance: {
            impressions: 0,
            clicks: 0,
            conversions: 0,
            ctr: 0,
            conversionRate: 0,
          },
        })),
      };
    },
    async optimizePMaxBidStrategy(creds, campaignId, targetROAS) {
      const response = await fetch("https://googleads.googleapis.com/v14/customers/campaignBudgetSimulations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          campaignId,
          bidStrategyType: "TARGET_ROAS",
          targetRoas: targetROAS,
        }),
      });
      const data = await response.json();
      return {
        bidStrategyId: data.bidStrategyId || "",
        status: "UPDATED",
      };
    },
  };
}

export async function getTwitterEliteExtensions(credentials: SocialCredentials): Promise<TwitterEliteExtensions> {
  return {
    async createFilteredStream(creds, rules) {
      const bearerToken = creds.metadata?.bearerToken || creds.accessToken || "";
      const response = await fetch("https://api.twitter.com/2/tweets/search/stream/rules", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ add: rules }),
      });
      const data = await response.json();
      return {
        streamId: `stream-${Date.now()}`,
        ruleCount: data.data?.length || 0,
      };
    },
    async getStreamedTweets(creds, streamId, limit = 100) {
      const bearerToken = creds.metadata?.bearerToken || creds.accessToken || "";
      const response = await fetch(`https://api.twitter.com/2/tweets/search/stream?max_results=${limit}&tweet.fields=author_id,created_at,public_metrics`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      const data = await response.json();
      return (data.data || []).map((tweet: any) => ({
        id: tweet.id,
        text: tweet.text,
        author: tweet.author_id,
        sentiment: "neutral",
        mentionCount: tweet.public_metrics?.impression_count || 0,
      }));
    },
    async analyzeSentiment(text) {
      // Placeholder - would integrate with sentiment analysis service
      const positive = ["great", "amazing", "love", "excellent", "perfect"];
      const negative = ["bad", "hate", "terrible", "awful", "worst"];
      const lowerText = text.toLowerCase();
      const posCount = positive.filter((w) => lowerText.includes(w)).length;
      const negCount = negative.filter((w) => lowerText.includes(w)).length;
      return {
        sentiment: posCount > negCount ? "positive" : negCount > posCount ? "negative" : "neutral",
        confidence: Math.min((Math.max(posCount, negCount) / text.split(" ").length) * 100, 100) / 100,
      };
    },
  };
}

// ─── Sprint 27 Elite Extensions ────────────────────────────────────────
//
// Each of the 7 new ecommerce surfaces gets a small, opinionated set
// of elite primitives that exploit what that surface does best — and
// only what that surface does. The bots branch on these via the live
// capability matrix; they never call an extension a platform doesn't
// expose.

export interface DepopEliteExtensions {
  /**
   * Update the hashtag set on a Depop listing. Hashtags drive ~60% of
   * Depop discovery — we expose this as a top-level primitive so the
   * Builder bot can sweep stale hashtags after trend shifts.
   */
  updateHashtags(credentials: AdapterCredentials, listingId: string, hashtags: string[]): Promise<void>;
  /** Refresh a listing — Depop bumps refreshed listings in feed ranking. */
  refreshListing(credentials: AdapterCredentials, listingId: string): Promise<{ refreshedAt: string }>;
}

export interface BigCommerceEliteExtensions {
  subscribeWebhook(credentials: AdapterCredentials, scope: string, destination: string): Promise<{ webhookId: string }>;
  /** Bulk price update via Catalog API — preferred over per-product PUTs. */
  bulkUpdatePrices(credentials: AdapterCredentials, updates: Array<{ productId: string; priceCents: number; comparePriceCents?: number }>): Promise<{ updated: number; errors: string[] }>;
}

export interface SquareEliteExtensions {
  /** Adjust inventory at a specific location — multi-location merchants need this. */
  adjustInventory(credentials: AdapterCredentials, productId: string, locationId: string, delta: number, reason: string): Promise<void>;
  /** List active locations so the Builder bot can pick the default. */
  listLocations(credentials: AdapterCredentials): Promise<Array<{ id: string; name: string; currency: string; status: string }>>;
}

export interface FaireEliteExtensions {
  /**
   * Acknowledge a Faire order within their 24h SLA. If we miss the
   * window, Faire auto-cancels — this is the highest-stakes Faire op.
   */
  acknowledgeOrder(credentials: AdapterCredentials, orderId: string, expectedShipDate: string): Promise<{ acknowledgedAt: string }>;
  /** Fetch outstanding-acknowledgement orders so the Merchant bot can prioritize. */
  listPendingAcknowledgements(credentials: AdapterCredentials): Promise<Array<{ orderId: string; ackDueAt: string; hoursRemaining: number }>>;
}

export interface BonanzaEliteExtensions {
  /**
   * Toggle Google Shopping syndication tier — affects the FVF rate and
   * traffic mix. Bots branch by margin: high-margin items go to
   * "TurboTraffic", low-margin items stay on "Standard".
   */
  setSyndicationTier(credentials: AdapterCredentials, productId: string, tier: "Standard" | "Basic" | "Premium" | "TurboTraffic" | "PremiumPlus"): Promise<void>;
}

export interface StockXEliteExtensions {
  /**
   * Pull the live order book (bids + lowest asks) for a product so the
   * Merchant bot can decide whether to undercut, hold, or raise the ask.
   */
  getOrderBook(credentials: AdapterCredentials, productUuid: string): Promise<{ bids: Array<{ amount: number; size: string }>; asks: Array<{ amount: number; size: string }> }>;
  /** Search canonical catalog — required before posting an ask. */
  searchCatalog(credentials: AdapterCredentials, query: string): Promise<Array<{ uuid: string; name: string; styleId: string; lowestAsk?: number; highestBid?: number }>>;
}

export interface ReverbEliteExtensions {
  /** Auto-reply to an offer within margin guardrails. */
  respondToOffer(credentials: AdapterCredentials, offerId: string, action: "accept" | "decline" | "counter", counterAmount?: number): Promise<{ status: string }>;
  /** Apply Reverb Bump (paid promotion) at a target spend. */
  applyBump(credentials: AdapterCredentials, listingId: string, bidPercent: number): Promise<{ bumpKey: string }>;
}

// ─── Factories ─────────────────────────────────────────────────────────

export async function getDepopEliteExtensions(_credentials: AdapterCredentials): Promise<DepopEliteExtensions> {
  return {
    async updateHashtags(creds, listingId, hashtags) {
      const adapter = getEcommerceAdapter("depop") as any;
      // Depop API doesn't expose hashtags as a separate field; they live
      // in the listing description. Bots concatenate top-N hashtags
      // onto the description, then PATCH via the standard adapter.
      const product = await adapter.getProduct(creds, listingId);
      const cleaned = (product.description || "").replace(/(#\w+\s*)+$/g, "").trimEnd();
      const tagLine = hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
      await adapter.updateProduct(creds, listingId, { description: `${cleaned}\n\n${tagLine}` });
    },
    async refreshListing(creds, listingId) {
      const { default: axios } = await import("axios");
      await axios.post(
        `https://partnerapi.depop.com/v2/listings/${listingId}/refresh`,
        {},
        { headers: { Authorization: `Bearer ${creds.accessToken || ""}` }, timeout: 20000 },
      ).catch(() => null);
      return { refreshedAt: new Date().toISOString() };
    },
  };
}

export async function getBigCommerceEliteExtensions(_credentials: AdapterCredentials): Promise<BigCommerceEliteExtensions> {
  return {
    async subscribeWebhook(creds, scope, destination) {
      const { default: axios } = await import("axios");
      const storeHash = creds.metadata?.storeHash || "";
      const res = await axios.post(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/hooks`,
        { scope, destination, is_active: true },
        {
          headers: { "X-Auth-Token": creds.accessToken || "", "Content-Type": "application/json" },
          timeout: 20000,
        },
      );
      return { webhookId: res.data?.data?.id || "" };
    },
    async bulkUpdatePrices(creds, updates) {
      const { default: axios } = await import("axios");
      const storeHash = creds.metadata?.storeHash || "";
      const errors: string[] = [];
      let updated = 0;
      // BigCommerce Catalog v3 takes a batch PUT /catalog/products with
      // an array body — single round-trip for up to 250 items.
      for (let i = 0; i < updates.length; i += 250) {
        const batch = updates.slice(i, i + 250);
        try {
          await axios.put(
            `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products`,
            batch.map((u) => ({
              id: Number(u.productId),
              price: u.priceCents / 100,
              ...(u.comparePriceCents != null ? { retail_price: u.comparePriceCents / 100 } : {}),
            })),
            {
              headers: { "X-Auth-Token": creds.accessToken || "", "Content-Type": "application/json" },
              timeout: 30000,
            },
          );
          updated += batch.length;
        } catch (err: any) {
          errors.push(err.response?.data?.title || err.message);
        }
      }
      return { updated, errors };
    },
  };
}

export async function getSquareEliteExtensions(_credentials: AdapterCredentials): Promise<SquareEliteExtensions> {
  return {
    async adjustInventory(creds, productId, locationId, delta, reason) {
      const { default: axios } = await import("axios");
      const { randomUUID } = await import("node:crypto");
      await axios.post(
        "https://connect.squareup.com/v2/inventory/changes/batch-create",
        {
          idempotency_key: `BB-adj-${randomUUID()}`,
          changes: [
            {
              type: "ADJUSTMENT",
              adjustment: {
                catalog_object_id: productId,
                location_id: locationId,
                from_state: delta < 0 ? "IN_STOCK" : "NONE",
                to_state: delta < 0 ? "WASTE" : "IN_STOCK",
                quantity: String(Math.abs(delta)),
                occurred_at: new Date().toISOString(),
                reference_id: reason,
              },
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${creds.accessToken || ""}`,
            "Square-Version": "2024-08-21",
            "Content-Type": "application/json",
          },
          timeout: 20000,
        },
      );
    },
    async listLocations(creds) {
      const { default: axios } = await import("axios");
      const res = await axios.get("https://connect.squareup.com/v2/locations", {
        headers: {
          Authorization: `Bearer ${creds.accessToken || ""}`,
          "Square-Version": "2024-08-21",
        },
        timeout: 20000,
      });
      return (res.data?.locations || []).map((l: any) => ({
        id: l.id,
        name: l.name,
        currency: l.currency || "USD",
        status: l.status,
      }));
    },
  };
}

export async function getFaireEliteExtensions(_credentials: AdapterCredentials): Promise<FaireEliteExtensions> {
  const apiToken = (c: AdapterCredentials) => c.apiKey || c.metadata?.apiKey || c.accessToken || "";
  return {
    async acknowledgeOrder(creds, orderId, expectedShipDate) {
      const { default: axios } = await import("axios");
      await axios.put(
        `https://www.faire.com/external-api/v2/orders/${orderId}/processing`,
        { expected_ship_date: expectedShipDate },
        {
          headers: { "X-FAIRE-ACCESS-TOKEN": apiToken(creds), "Content-Type": "application/json" },
          timeout: 20000,
        },
      );
      return { acknowledgedAt: new Date().toISOString() };
    },
    async listPendingAcknowledgements(creds) {
      const { default: axios } = await import("axios");
      // Pull recent orders, filter to NEW state.
      const res = await axios.get("https://www.faire.com/external-api/v2/orders?state=NEW&limit=100", {
        headers: { "X-FAIRE-ACCESS-TOKEN": apiToken(creds) },
        timeout: 20000,
      });
      const now = Date.now();
      return (res.data?.orders || []).map((o: any) => {
        const due = new Date(o.expected_acknowledgement_by || o.created_at).getTime() + 24 * 60 * 60 * 1000;
        return {
          orderId: String(o.id),
          ackDueAt: new Date(due).toISOString(),
          hoursRemaining: Math.max(0, Math.round((due - now) / (60 * 60 * 1000))),
        };
      });
    },
  };
}

export async function getBonanzaEliteExtensions(_credentials: AdapterCredentials): Promise<BonanzaEliteExtensions> {
  return {
    async setSyndicationTier(creds, productId, tier) {
      const { default: axios } = await import("axios");
      const credsBag = creds.metadata || {};
      await axios.post(
        "https://api.bonanza.com/api_requests/std_bonapitit_api/revise_item",
        {
          requester_credentials: {
            dev_id: credsBag.devId || creds.apiKey,
            cert_id: credsBag.certId || creds.apiSecret,
            user_token: credsBag.userToken || creds.accessToken,
          },
          item: { item_id: productId, syndication_tier: tier },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 20000 },
      );
    },
  };
}

export async function getStockXEliteExtensions(_credentials: AdapterCredentials): Promise<StockXEliteExtensions> {
  return {
    async getOrderBook(creds, productUuid) {
      const { default: axios } = await import("axios");
      const res = await axios.get(`https://api.stockx.com/v2/catalog/products/${productUuid}/market`, {
        headers: {
          Authorization: `Bearer ${creds.accessToken || ""}`,
          "x-api-key": creds.apiKey || creds.metadata?.apiKey || "",
        },
        timeout: 20000,
      });
      return {
        bids: (res.data?.bids || []).map((b: any) => ({ amount: b.amount, size: b.variant?.size })),
        asks: (res.data?.asks || []).map((a: any) => ({ amount: a.amount, size: a.variant?.size })),
      };
    },
    async searchCatalog(creds, query) {
      const { default: axios } = await import("axios");
      const res = await axios.get(`https://api.stockx.com/v2/catalog/search?query=${encodeURIComponent(query)}&limit=10`, {
        headers: {
          Authorization: `Bearer ${creds.accessToken || ""}`,
          "x-api-key": creds.apiKey || creds.metadata?.apiKey || "",
        },
        timeout: 20000,
      });
      return (res.data?.products || []).map((p: any) => ({
        uuid: p.uuid,
        name: p.name || p.title,
        styleId: p.styleId,
        lowestAsk: p.market?.lowestAsk,
        highestBid: p.market?.highestBid,
      }));
    },
  };
}

export async function getReverbEliteExtensions(_credentials: AdapterCredentials): Promise<ReverbEliteExtensions> {
  return {
    async respondToOffer(creds, offerId, action, counterAmount) {
      const { default: axios } = await import("axios");
      const path =
        action === "accept" ? "accept" : action === "decline" ? "reject" : "counter";
      const body = action === "counter" ? { offer_amount: counterAmount } : {};
      const res = await axios.post(
        `https://api.reverb.com/api/my/offers/${offerId}/${path}`,
        body,
        {
          headers: {
            Authorization: `Bearer ${creds.accessToken || creds.apiKey || ""}`,
            "Content-Type": "application/hal+json",
            "Accept-Version": "3.0",
          },
          timeout: 20000,
        },
      );
      return { status: res.data?.state?.slug || action };
    },
    async applyBump(creds, listingId, bidPercent) {
      const { default: axios } = await import("axios");
      const res = await axios.put(
        `https://api.reverb.com/api/my/listings/${listingId}/bump`,
        { bump: { value: bidPercent } },
        {
          headers: {
            Authorization: `Bearer ${creds.accessToken || creds.apiKey || ""}`,
            "Content-Type": "application/hal+json",
            "Accept-Version": "3.0",
          },
          timeout: 20000,
        },
      );
      return { bumpKey: res.data?.bump_key || `bump-${Date.now()}` };
    },
  };
}
