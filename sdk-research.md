# ShopBot — SDK Research: All Platform Connectors

## E-Commerce Platform SDKs

| Platform | NPM Package | Type | Auth Method | Notes |
|----------|------------|------|-------------|-------|
| Shopify | `@shopify/shopify-api` | Official SDK | OAuth 2.0 (Partner App) | Already identified. Full Admin API access. |
| WooCommerce | `@woocommerce/woocommerce-rest-api` | Official SDK | REST API Keys (Consumer Key + Secret) | Axios-based. Supports CJS + ESM. |
| Amazon | `amazon-sp-api` | Community (battle-tested) | SP-API OAuth (Login with Amazon) | Handles token refresh, all SP-API endpoints. |
| Etsy | `node-etsy-client` or direct REST | Community / Direct REST | OAuth 2.0 (PKCE) | Etsy Open API v3. Also `@profplum700/etsy-v3-api-client`. |
| eBay | `ebay-api` | Community (comprehensive) | OAuth 2.0 (Auth Code Grant) | Supports both Traditional XML + RESTful APIs. |
| TikTok Shop | `@bilalyasin1616/tiktok-shop-api` | Community | OAuth (TikTok Shop Open Platform) | TikTok also has official Node.js SDK (limited rollout). |
| Walmart | `@whitebox-co/walmart-marketplace-api` | Community (typed) | Client ID + Client Secret | Fully typed TypeScript. |

## Social Media Platform SDKs

| Platform | NPM Package | Type | Auth Method | Capabilities |
|----------|------------|------|-------------|-------------|
| Meta/Facebook | `facebook-nodejs-business-sdk` | Official (Meta) | OAuth 2.0 (Facebook Login) | Ads API, Pages API, Marketing API |
| Instagram Business | Same as Meta (`facebook-nodejs-business-sdk`) | Official (Meta) | OAuth 2.0 (via Facebook) | Instagram Graph API (posts, stories, insights) |
| TikTok (Ads/Content) | `tiktok-business-api-sdk` (GitHub: tiktok/tiktok-business-api-sdk) | Official (TikTok) | OAuth 2.0 | TikTok for Business APIs (ads, content) |
| Twitter/X | `twitter-api-v2` | Community (best-in-class) | OAuth 2.0 (PKCE) + OAuth 1.0a | Full v2 API coverage, strongly typed |
| Pinterest | `pinterest-sdk` (OpenAPI-generated) or direct REST | Community / Direct REST | OAuth 2.0 | Pins, Boards, Ads, Analytics |
| Google Ads | `google-ads-api` | Community (unofficial) | OAuth 2.0 (Google) | Full Google Ads API, REST + Protocol Buffers |
| LinkedIn | `linkedin-api-client` | Official (LinkedIn) | OAuth 2.0 | Marketing API, Posts, Company Pages |

## Utility Libraries

| Package | Purpose | Notes |
|---------|---------|-------|
| `node-cron` | Scheduled agent tasks | GNU crontab syntax, pure JS |
| `cron` | Alternative scheduler | More robust, also popular |

## Architecture Decision: Unified Adapter Pattern

Each SDK wraps a different API surface. Our agents need a **unified interface** so they don't care which platform they're talking to.

### E-Commerce Adapter Interface
```typescript
interface EcommercePlatformAdapter {
  // Products
  listProducts(storeId: string, params?: ListParams): Promise<Product[]>
  getProduct(storeId: string, productId: string): Promise<Product>
  createProduct(storeId: string, product: CreateProductInput): Promise<Product>
  updateProduct(storeId: string, productId: string, updates: UpdateProductInput): Promise<Product>
  
  // Orders
  listOrders(storeId: string, params?: ListParams): Promise<Order[]>
  getOrder(storeId: string, orderId: string): Promise<Order>
  fulfillOrder(storeId: string, orderId: string, fulfillment: FulfillmentInput): Promise<void>
  
  // Inventory
  getInventory(storeId: string, productId: string): Promise<InventoryLevel>
  updateInventory(storeId: string, productId: string, quantity: number): Promise<void>
  
  // Store Info
  getStoreInfo(storeId: string): Promise<StoreInfo>
}
```

### Social Media Adapter Interface
```typescript
interface SocialPlatformAdapter {
  // Content
  createPost(accountId: string, content: PostInput): Promise<Post>
  schedulePost(accountId: string, content: PostInput, scheduledAt: Date): Promise<ScheduledPost>
  deletePost(accountId: string, postId: string): Promise<void>
  
  // Ads
  createAdCampaign(accountId: string, campaign: AdCampaignInput): Promise<AdCampaign>
  getAdPerformance(accountId: string, campaignId: string): Promise<AdMetrics>
  
  // Analytics
  getAccountAnalytics(accountId: string, dateRange: DateRange): Promise<SocialAnalytics>
  getPostAnalytics(accountId: string, postId: string): Promise<PostAnalytics>
}
```
