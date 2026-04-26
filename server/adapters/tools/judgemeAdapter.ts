/**
 * Judge.me adapter — Private API token + shop domain.
 * Token from Judge.me → Settings → General → Private API Token.
 *
 * Used by: Merchant bot (review insights, low-rating triage) and
 * Social bot (user-generated content for posts).
 */

import type {
  ToolConnectorAdapter,
  ToolCredentials,
  ToolHealthCheck,
  ReviewsCapabilities,
  BotDomain,
  ToolCategory,
} from "./types";
import { TOOL_ADAPTER_HTTP_TIMEOUT_MS } from "./types";

const JUDGEME_API = "https://judge.me/api/v1";

export class JudgeMeAdapter implements ToolConnectorAdapter, ReviewsCapabilities {
  readonly tool = "judgeme";
  readonly toolName = "Judge.me";
  readonly category: ToolCategory = "reviews";
  readonly bots: ReadonlyArray<BotDomain> = ["merchant", "social"];
  readonly capabilities = [
    "Pull recent product reviews and ratings",
    "Triage low-star reviews with auto-replies",
    "Surface UGC for the Social bot to repost",
    "Spot product-quality drops before they hurt sales",
  ] as const;

  private params(credentials: ToolCredentials, extra: Record<string, any> = {}) {
    return {
      api_token: credentials.apiKey || "",
      shop_domain: credentials.accountHost || credentials.metadata?.shopDomain || "",
      ...extra,
    };
  }

  async verifyConnection(credentials: ToolCredentials): Promise<ToolHealthCheck> {
    return this.healthCheck(credentials);
  }

  async healthCheck(credentials: ToolCredentials): Promise<ToolHealthCheck> {
    const start = Date.now();
    if (!credentials.apiKey || !(credentials.accountHost || credentials.metadata?.shopDomain)) {
      return { healthy: false, message: "Missing API token or shop domain", latencyMs: 0 };
    }
    try {
      const { default: axios } = await import("axios");
      const res = await axios.get(`${JUDGEME_API}/reviews/count`, {
        params: this.params(credentials),
        timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
      });
      const total = res.data?.count ?? 0;
      return {
        healthy: true,
        message: "Connected",
        latencyMs: Date.now() - start,
        accountLabel: `Judge.me · ${total} reviews`,
      };
    } catch (err: any) {
      return {
        healthy: false,
        message: err.response?.data?.message || err.message || "Health check failed",
        latencyMs: Date.now() - start,
      };
    }
  }

  async listReviews(credentials: ToolCredentials, params?: { limit?: number; minRating?: number }) {
    const { default: axios } = await import("axios");
    const res = await axios.get(`${JUDGEME_API}/reviews`, {
      params: this.params(credentials, { per_page: params?.limit || 50, rating: params?.minRating }),
      timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
    });
    return (res.data?.reviews || []).map((r: any) => ({
      id: r.id,
      rating: r.rating,
      body: r.body || "",
      reviewerName: r.reviewer?.name,
      productId: r.product_external_id ? String(r.product_external_id) : undefined,
    }));
  }

  async replyToReview(credentials: ToolCredentials, reviewId: number, body: string) {
    const { default: axios } = await import("axios");
    const res = await axios.post(
      `${JUDGEME_API}/reviews/${reviewId}/reply`,
      { body },
      {
        params: this.params(credentials),
        timeout: TOOL_ADAPTER_HTTP_TIMEOUT_MS,
      },
    );
    return { id: res.data?.reply?.id || reviewId };
  }
}
