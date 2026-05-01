import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { orgProcedure, protectedProcedure, router } from "../_core/trpc";
import { invokeLLM, parseLLMJson } from "../_core/llm";
import { generateImage } from "../_core/imageGeneration";
import { notifyOwner } from "../_core/notification";
import * as db from "../db";
import { publishSocialPost, scheduleSocialPost, launchAdCampaign, getCrossPlatformSocialAnalyticsByOrg } from "../engine/platformBridge";
import { getRenderedStoreContext } from "../utils/userContext";
import { sanitizeEmail, sanitizeMultiline, sanitizeText } from "../utils/sanitize";
import {
  sendEmail,
  sendSms,
  DeliveryFailedError,
  NoDeliveryProviderError,
  type EmailRecipient,
} from "../delivery";
import { requireStoreInOrg } from "../utils/authz";

export const socialRouter = router({
  // ─── Ad Copy Generation ───────────────────────────────────────────────
  generateAdCopy: orgProcedure
    .input(z.object({
      storeId: z.number(),
      productName: z.string(),
      productDescription: z.string().optional(),
      platform: z.enum([
        "tiktok", "meta", "instagram", "twitter", "pinterest", "google_ads",
        "email", "sms",
        // Sprint 27.5 expansion — ad-copy generator now serves the new
        // channels too, even though Outlook/Slack don't run paid ads
        // (the copy is reused as in-channel announcement text).
        "outlook", "slack", "youtube",
      ]).default("meta"),
      tone: z.string().default("engaging and persuasive"),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "social",
        taskType: "ad_copy",
        title: `Ad copy for "${input.productName}" on ${input.platform}`,
        description: `Generating ${input.platform} ad copy`,
        status: "running",
        storeId: input.storeId,
      });

      try {
        const storeContext = await getRenderedStoreContext(input.storeId);

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an expert e-commerce copywriter specializing in ${input.platform} ads. Generate compelling ad copy. ${storeContext ? "Use the store context to match the brand's voice, reference actual products, and target the right audience for this merchant's price tier." : ""} Return JSON with:
- headline: string (attention-grabbing headline, max 40 chars)
- primaryText: string (main ad body, 2-3 sentences)
- callToAction: string (CTA text)
- hashtags: array of strings (5-8 relevant hashtags)
- targetAudience: string (suggested audience description)
- hookVariations: array of 3 strings (alternative opening hooks)`
            },
            {
              role: "user",
              content: `${storeContext ? storeContext + "\n\n" : ""}Product: "${input.productName}"\nDescription: ${input.productDescription || "N/A"}\nPlatform: ${input.platform}\nTone: ${input.tone}`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "ad_copy",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  headline: { type: "string" },
                  primaryText: { type: "string" },
                  callToAction: { type: "string" },
                  hashtags: { type: "array", items: { type: "string" } },
                  targetAudience: { type: "string" },
                  hookVariations: { type: "array", items: { type: "string" } },
                },
                required: ["headline", "primaryText", "callToAction", "hashtags", "targetAudience", "hookVariations"],
                additionalProperties: false,
              },
            },
          },
        });

        const adCopy = parseLLMJson<any>(llmResult.choices[0].message.content, "social.generateAdCopy");

        const campaign = await db.createAdCampaign({
          storeId: input.storeId,
          name: `${input.platform} - ${input.productName}`,
          platform: input.platform,
          adCopy: JSON.stringify(adCopy),
          targetAudience: adCopy.targetAudience,
          status: "draft",
        });

        await db.updateAgentTask(task.id, { status: "completed", result: adCopy });

        return { id: campaign.id, adCopy };
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  // ─── AI Image Generation for Ads ──────────────────────────────────────
  generateAdImage: orgProcedure
    .input(z.object({
      storeId: z.number(),
      productName: z.string(),
      style: z.string().default("modern e-commerce product photography"),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "social",
        taskType: "image_generation",
        title: `Ad creative for "${input.productName}"`,
        description: "AI-generating product listing image",
        status: "running",
        storeId: input.storeId,
      });

      try {
        const prompt = `Professional e-commerce product image: ${input.productName}. Style: ${input.style}. ${input.description || "Clean white background, studio lighting, high quality product photography."}`;
        const { url } = await generateImage({ prompt });

        await db.updateAgentTask(task.id, {
          status: "completed",
          result: { imageUrl: url, prompt },
        });

        return { imageUrl: url, prompt };
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  // ─── SEO Keywords ─────────────────────────────────────────────────────
  suggestSeoKeywords: orgProcedure
    .input(z.object({
      storeId: z.number(),
      niche: z.string(),
      currentKeywords: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "social",
        taskType: "seo_keywords",
        title: `SEO keywords for "${input.niche}"`,
        description: "AI-generating SEO keyword suggestions",
        status: "running",
        storeId: input.storeId,
      });

      try {
        const storeContext = await getRenderedStoreContext(input.storeId);

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an SEO expert for e-commerce. Suggest high-value keywords. ${storeContext ? "Use the store context to prioritise keywords relevant to this merchant's actual products and price range." : ""} Return JSON with a "keywords" array. Each keyword object should have:
- keyword: string
- volume: number (estimated monthly search volume)
- difficulty: number (1-100 difficulty score)
- relevanceScore: number (1-100 relevance to the niche)
- intent: string (informational/transactional/navigational)`
            },
            {
              role: "user",
              content: `Niche: "${input.niche}"\nExisting keywords: ${input.currentKeywords?.join(", ") || "None"}\nGenerate 10 high-value SEO keywords.`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "seo_keywords",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  keywords: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        keyword: { type: "string" },
                        volume: { type: "number" },
                        difficulty: { type: "number" },
                        relevanceScore: { type: "number" },
                        intent: { type: "string" },
                      },
                      required: ["keyword", "volume", "difficulty", "relevanceScore", "intent"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["keywords"],
                additionalProperties: false,
              },
            },
          },
        });

        const result = parseLLMJson<any>(llmResult.choices[0].message.content, "social.suggestSeoKeywords");

        await db.createSeoKeywords(
          result.keywords.map((k: any) => ({
            storeId: input.storeId,
            keyword: k.keyword,
            volume: k.volume,
            difficulty: k.difficulty,
            relevanceScore: k.relevanceScore,
            status: "suggested" as const,
          }))
        );

        await db.updateAgentTask(task.id, { status: "completed", result });
        return result;
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  seoKeywords: orgProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      return db.getSeoKeywords(input.storeId);
    }),

  updateSeoKeyword: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["suggested", "active", "rejected"]),
    }))
    .mutation(async ({ input }) => {
      await db.updateSeoKeyword(input.id, { status: input.status });
      return { success: true };
    }),

  // ─── Social Media Posts ───────────────────────────────────────────────
  generateSocialPost: orgProcedure
    .input(z.object({
      storeId: z.number(),
      platform: z.enum([
        "tiktok", "instagram", "facebook", "meta", "twitter", "pinterest", "google_ads",
        // Sprint 27.5 — Slack drops + YouTube Shorts run through the
        // generic generateSocialPost surface (Outlook is email-shaped
        // and uses generateAdCopy / outlook_b2b_outreach instead).
        "slack", "youtube",
      ]),
      topic: z.string(),
      productName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "social",
        taskType: "social_post",
        title: `${input.platform} post about "${input.topic}"`,
        description: `Generating social media content for ${input.platform}`,
        status: "running",
        storeId: input.storeId,
      });

      try {
        const storeContext = await getRenderedStoreContext(input.storeId);

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a social media expert for e-commerce brands. Generate a ${input.platform} post. ${storeContext ? "Use the store context to craft authentic content that references the merchant's actual products and brand identity." : ""} Return JSON with:
- content: string (the post text, platform-appropriate length and style)
- hashtags: array of strings
- bestTimeToPost: string (suggested posting time)
- engagementTip: string (tip to boost engagement)`
            },
            {
              role: "user",
              content: `Platform: ${input.platform}\nTopic: ${input.topic}\nProduct: ${input.productName || "General brand content"}`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "social_post",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  content: { type: "string" },
                  hashtags: { type: "array", items: { type: "string" } },
                  bestTimeToPost: { type: "string" },
                  engagementTip: { type: "string" },
                },
                required: ["content", "hashtags", "bestTimeToPost", "engagementTip"],
                additionalProperties: false,
              },
            },
          },
        });

        const postData = parseLLMJson<any>(llmResult.choices[0].message.content, "social.generatePost");

        const post = await db.createSocialPost({
          storeId: input.storeId,
          platform: input.platform,
          content: postData.content + "\n\n" + postData.hashtags.map((h: string) => h.startsWith("#") ? h : `#${h}`).join(" "),
          status: "draft",
        });

        await db.updateAgentTask(task.id, { status: "completed", result: postData });
        return { id: post.id, ...postData };
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  socialPosts: orgProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      return db.getSocialPosts(input.storeId);
    }),

  // ─── Email Campaigns ──────────────────────────────────────────────────
  generateEmailCampaign: orgProcedure
    .input(z.object({
      storeId: z.number(),
      campaignType: z.enum(["welcome", "abandoned_cart", "promotional", "winback", "newsletter"]),
      productName: z.string().optional(),
      brandName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "social",
        taskType: "email_campaign",
        title: `${input.campaignType} email campaign`,
        description: `Generating ${input.campaignType} email flow`,
        status: "running",
        storeId: input.storeId,
      });

      try {
        const storeContext = await getRenderedStoreContext(input.storeId);

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an email marketing expert for e-commerce. Generate a ${input.campaignType} email campaign. ${storeContext ? "Use the store context to personalise copy with the merchant's brand name, top products, and price points." : ""} Return JSON with:
- subject: string (compelling subject line)
- preheader: string (email preheader text)
- body: string (full email body in HTML format, professional and clean)
- sendTiming: string (best time to send)
- expectedOpenRate: number (percentage estimate)
- expectedClickRate: number (percentage estimate)`
            },
            {
              role: "user",
              content: `Campaign type: ${input.campaignType}\nBrand: ${input.brandName || "Our Store"}\nProduct: ${input.productName || "General"}`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "email_campaign",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  subject: { type: "string" },
                  preheader: { type: "string" },
                  body: { type: "string" },
                  sendTiming: { type: "string" },
                  expectedOpenRate: { type: "number" },
                  expectedClickRate: { type: "number" },
                },
                required: ["subject", "preheader", "body", "sendTiming", "expectedOpenRate", "expectedClickRate"],
                additionalProperties: false,
              },
            },
          },
        });

        const emailData = parseLLMJson<any>(llmResult.choices[0].message.content, "social.generateEmail");

        const campaign = await db.createEmailCampaign({
          storeId: input.storeId,
          name: `${input.campaignType} - ${new Date().toLocaleDateString()}`,
          subject: emailData.subject,
          body: emailData.body,
          campaignType: input.campaignType,
          status: "draft",
        });

        await db.updateAgentTask(task.id, { status: "completed", result: emailData });
        return { id: campaign.id, ...emailData };
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  emailCampaigns: orgProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      return db.getEmailCampaigns(input.storeId);
    }),

  /**
   * Per-campaign delivery funnel — joins `email_campaigns` with the
   * SendGrid event stream (`email_delivery_events`) to compute the
   * sent → delivered → opened → clicked → bounced funnel surfaced on
   * the Insights page.
   */
  campaignFunnel: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ input }) => {
      const campaign = await db.getEmailCampaignById(input.campaignId);
      if (!campaign) {
        return null;
      }
      const counts = await db.getEmailCampaignEventCounts(input.campaignId);
      const recipients = campaign.recipientCount ?? 0;
      const delivered = counts.delivered ?? 0;
      const opens = counts.open ?? 0;
      const clicks = counts.click ?? 0;
      const bounces = counts.bounce ?? 0;
      const dropped = counts.dropped ?? 0;
      const unsubscribes = counts.unsubscribe ?? 0;
      // Open + click rates are computed against `delivered`, not
      // `sent`, which matches industry-standard conventions.
      const openRate = delivered > 0 ? Math.round((opens / delivered) * 1000) / 10 : 0;
      const clickRate = delivered > 0 ? Math.round((clicks / delivered) * 1000) / 10 : 0;
      const deliveryRate = recipients > 0 ? Math.round((delivered / recipients) * 1000) / 10 : 0;
      return {
        campaignId: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        status: campaign.status,
        sentAt: campaign.sentAt,
        recipients,
        funnel: {
          delivered,
          opens,
          clicks,
          bounces,
          dropped,
          unsubscribes,
        },
        rates: {
          delivery: deliveryRate,
          open: openRate,
          click: clickRate,
        },
      };
    }),

  /**
   * Actually deliver a previously-generated email campaign to a list of
   * recipients. The campaign is generated by `generateEmailCampaign`
   * (which saves a draft); this mutation does the send.
   *
   * Provider selection happens inside the delivery layer:
   *   • SendGrid if configured (preferred for marketing).
   *   • Gmail if the user has connected one.
   *   • UNAUTHORIZED otherwise — caller surfaces the message.
   *
   * On success, the campaign row is flipped to `sent` with the
   * provider message id captured in `recipientCount`.
   */
  sendEmailCampaign: protectedProcedure
    .input(
      z.object({
        campaignId: z.number(),
        recipients: z
          .array(
            z.object({
              email: z.string().email(),
              name: z.string().max(255).optional(),
            }),
          )
          .min(1)
          .max(1000),
        replyTo: z.string().email().optional(),
        /** Override the auto-selected provider (e.g. force Gmail for a personal-mode merchant). */
        provider: z.enum(["gmail", "sendgrid"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const campaign = await db.getEmailCampaignById(input.campaignId);
      if (!campaign) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found." });
      }
      if (!campaign.subject || !campaign.body) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Campaign has no subject or body — generate it first.",
        });
      }
      if (campaign.status === "sent") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Campaign already sent.",
        });
      }

      // Sanitize recipients defensively
      const cleanRecipients: EmailRecipient[] = [];
      for (const r of input.recipients) {
        const safe = sanitizeEmail(r.email);
        if (safe) cleanRecipients.push({ email: safe, ...(r.name ? { name: r.name } : {}) });
      }

      if (cleanRecipients.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No valid recipient addresses.",
        });
      }

      try {
        const result = await sendEmail(
          {
            to: cleanRecipients,
            subject: campaign.subject,
            html: campaign.body,
            replyTo: input.replyTo,
            categories: ["campaign", campaign.campaignType],
          },
          {
            provider: input.provider,
            userId: ctx.user.id,
            campaignId: campaign.id,
          },
        );

        await db.updateEmailCampaign(campaign.id, {
          status: "sent",
          sentAt: new Date(),
          recipientCount: cleanRecipients.length,
        });

        return {
          campaignId: campaign.id,
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          recipientCount: cleanRecipients.length,
          sentAt: result.sentAt,
        };
      } catch (err) {
        await db.updateEmailCampaign(campaign.id, { status: "failed" });
        if (err instanceof NoDeliveryProviderError) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: err.message });
        }
        if (err instanceof DeliveryFailedError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err.message,
          });
        }
        throw err;
      }
    }),

  /**
   * Send a single SMS via the configured Twilio account. Used by
   * recovery flows, transactional notifications, and one-off operator
   * messages from the Inbox.
   */
  sendSms: protectedProcedure
    .input(
      z.object({
        to: z.string().regex(/^\+[1-9]\d{6,14}$/, "Must be E.164 (e.g. +14155551234)"),
        body: z.string().min(1).max(1600),
        storeId: z.number().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const result = await sendSms({ to: input.to, body: sanitizeText(input.body, 1600) });
        if (input.storeId) {
          await db.createAgentTask({
            agentType: "social",
            taskType: "sms_sent",
            title: `SMS sent to ${input.to.slice(0, 5)}***${input.to.slice(-4)}`,
            description: `Provider: ${result.provider}, ID: ${result.providerMessageId}`,
            status: "completed",
            storeId: input.storeId,
          });
        }
        return result;
      } catch (err) {
        if (err instanceof NoDeliveryProviderError) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: err.message });
        }
        if (err instanceof DeliveryFailedError) {
          throw new TRPCError({
            code: err.statusCode === 400 ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
            message: err.message,
          });
        }
        throw err;
      }
    }),

  // ─── Ad Campaigns ─────────────────────────────────────────────────────
  adCampaigns: orgProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      return db.getAdCampaigns(input.storeId);
    }),

  updateAdCampaign: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["draft", "active", "paused", "completed"]).optional(),
      budgetCents: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateAdCampaign(id, data);
      return { success: true };
    }),

  // ─── Platform Bridge: Publish to Connected Social Accounts ──────────
  publishToSocial: protectedProcedure
    .input(z.object({
      socialAccountId: z.number(),
      storeId: z.number().optional(),
      content: z.string(),
      imageUrl: z.string().optional(),
      link: z.string().optional(),
      hashtags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const task = await db.createAgentTask({
        agentType: "social",
        taskType: "social_publish",
        title: `Publishing to social account #${input.socialAccountId}`,
        description: "Publishing content via platform adapter",
        status: "running",
        storeId: input.storeId ?? null,
      });

      try {
        const post = await publishSocialPost(
          input.socialAccountId,
          {
            content: sanitizeMultiline(input.content, 5000),
            imageUrl: input.imageUrl ? sanitizeText(input.imageUrl, 2048) : undefined,
            link: input.link ? sanitizeText(input.link, 2048) : undefined,
            hashtags: input.hashtags?.map((h) => sanitizeText(h, 100)),
          },
          input.storeId,
        );

        await db.updateAgentTask(task.id, { status: "completed", result: post });
        return post;
      } catch (error: any) {
        await db.updateAgentTask(task.id, { status: "failed", result: { error: error.message } });
        throw error;
      }
    }),

  scheduleToSocial: protectedProcedure
    .input(z.object({
      socialAccountId: z.number(),
      storeId: z.number().optional(),
      content: z.string(),
      imageUrl: z.string().optional(),
      link: z.string().optional(),
      hashtags: z.array(z.string()).optional(),
      scheduledAt: z.string(), // ISO date string
    }))
    .mutation(async ({ input }) => {
      const task = await db.createAgentTask({
        agentType: "social",
        taskType: "social_schedule",
        title: `Scheduling post on account #${input.socialAccountId}`,
        description: `Scheduled for ${input.scheduledAt}`,
        status: "running",
        storeId: input.storeId ?? null,
      });

      try {
        const post = await scheduleSocialPost(
          input.socialAccountId,
          {
            content: sanitizeMultiline(input.content, 5000),
            imageUrl: input.imageUrl ? sanitizeText(input.imageUrl, 2048) : undefined,
            link: input.link ? sanitizeText(input.link, 2048) : undefined,
            hashtags: input.hashtags?.map((h) => sanitizeText(h, 100)),
          },
          new Date(input.scheduledAt),
          input.storeId,
        );

        await db.updateAgentTask(task.id, { status: "completed", result: post });
        return post;
      } catch (error: any) {
        await db.updateAgentTask(task.id, { status: "failed", result: { error: error.message } });
        throw error;
      }
    }),

  launchCampaign: orgProcedure
    .input(z.object({
      socialAccountId: z.number(),
      storeId: z.number(),
      name: z.string(),
      objective: z.enum(["awareness", "traffic", "conversions", "sales"]),
      budgetCents: z.number(),
      dailyBudgetCents: z.number().optional(),
      adCopy: z.string(),
      imageUrl: z.string().optional(),
      targetUrl: z.string(),
      targeting: z.object({
        ageMin: z.number().optional(),
        ageMax: z.number().optional(),
        locations: z.array(z.string()).optional(),
        interests: z.array(z.string()).optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "social",
        taskType: "ad_launch",
        title: `Launching ad campaign: ${input.name}`,
        description: `${input.objective} campaign on account #${input.socialAccountId}`,
        status: "running",
        storeId: input.storeId,
      });

      try {
        const campaign = await launchAdCampaign(
          input.socialAccountId,
          {
            name: input.name,
            objective: input.objective,
            budgetCents: input.budgetCents,
            dailyBudgetCents: input.dailyBudgetCents,
            adCopy: input.adCopy,
            imageUrl: input.imageUrl,
            targetUrl: input.targetUrl,
            targeting: input.targeting,
          },
          input.storeId,
        );

        await db.updateAgentTask(task.id, { status: "completed", result: campaign });
        return campaign;
      } catch (error: any) {
        await db.updateAgentTask(task.id, { status: "failed", result: { error: error.message } });
        throw error;
      }
    }),

  crossPlatformAnalytics: orgProcedure
    .query(async ({ ctx }) => {
      // Org-scoped: aggregates only the active org's connected social
      // accounts. The legacy userId variant spanned every org the user
      // belonged to.
      return getCrossPlatformSocialAnalyticsByOrg(ctx.org.id);
    }),

  // ─── A/B Test Copy Generator ───────────────────────────────────────────
  abTestCopyGenerator: orgProcedure
    .input(z.object({
      storeId: z.number(),
      originalCopy: z.string(),
      copyType: z.enum(["headline", "description", "cta", "email_subject", "ad_copy"]),
      numberOfVariants: z.number().min(2).max(10).default(5),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "social",
        taskType: "ab_test_copy",
        title: `A/B test variants for ${input.copyType}`,
        description: `Generating ${input.numberOfVariants} copy variants for testing`,
        status: "running",
        storeId: input.storeId,
      });

      try {
        const storeContext = await getRenderedStoreContext(input.storeId);

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a conversion copywriter and A/B testing expert. Generate copy variants designed to test specific psychological triggers. ${storeContext ? "Use the store context to tailor variants to this merchant's audience and product positioning." : ""} Return JSON with:
- originalCopy: string
- variants: array of { variant (string), hypothesis (string), psychologicalTrigger (string), expectedLift (string), confidence (string) }
- testingPlan: object { sampleSize (string), duration (string), successMetric (string), statisticalSignificance (string) }
- winnerPrediction: object { variant (number), reasoning (string) }`
            },
            {
              role: "user",
              content: `Copy type: ${input.copyType}\nOriginal: "${input.originalCopy}"\nGenerate ${input.numberOfVariants} A/B test variants.`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "ab_test_copy",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  originalCopy: { type: "string" },
                  variants: { type: "array", items: { type: "object", properties: { variant: { type: "string" }, hypothesis: { type: "string" }, psychologicalTrigger: { type: "string" }, expectedLift: { type: "string" }, confidence: { type: "string" } }, required: ["variant", "hypothesis", "psychologicalTrigger", "expectedLift", "confidence"], additionalProperties: false } },
                  testingPlan: { type: "object", properties: { sampleSize: { type: "string" }, duration: { type: "string" }, successMetric: { type: "string" }, statisticalSignificance: { type: "string" } }, required: ["sampleSize", "duration", "successMetric", "statisticalSignificance"], additionalProperties: false },
                  winnerPrediction: { type: "object", properties: { variant: { type: "number" }, reasoning: { type: "string" } }, required: ["variant", "reasoning"], additionalProperties: false },
                },
                required: ["originalCopy", "variants", "testingPlan", "winnerPrediction"],
                additionalProperties: false,
              },
            },
          },
        });

        const result = parseLLMJson<any>(llmResult.choices[0].message.content, "social.abTestCopyGenerator");
        await db.updateAgentTask(task.id, { status: "completed", result });
        return result;
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  // ─── SMS Recovery Flow Generator ───────────────────────────────────────
  smsRecoveryFlow: orgProcedure
    .input(z.object({
      storeId: z.number(),
      flowType: z.enum(["abandoned_cart", "browse_abandonment", "winback", "post_purchase_upsell", "review_request"]),
      brandName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "social",
        taskType: "sms_recovery",
        title: `SMS ${input.flowType} flow`,
        description: `Generating automated SMS recovery sequence`,
        status: "running",
        storeId: input.storeId,
      });

      try {
        const storeContext = await getRenderedStoreContext(input.storeId);

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an SMS marketing expert for e-commerce. Generate compliant, high-converting SMS flows. All messages must be under 160 characters and include opt-out language. ${storeContext ? "Use the store context to personalise messages with the merchant's brand name and top products." : ""} Return JSON with:
- flowName: string
- messages: array of { messageNumber (number), timing (string), content (string), characterCount (number), includesLink (boolean), personalizations (array of strings) }
- complianceNotes: array of strings
- expectedMetrics: object { deliveryRate (string), clickRate (string), conversionRate (string), revenuePerMessage (string) }
- segmentation: string
- bestPractices: array of strings`
            },
            {
              role: "user",
              content: `Flow type: ${input.flowType}\nBrand: ${input.brandName || "Our Store"}\nGenerate a complete SMS automation flow.`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "sms_recovery",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  flowName: { type: "string" },
                  messages: { type: "array", items: { type: "object", properties: { messageNumber: { type: "number" }, timing: { type: "string" }, content: { type: "string" }, characterCount: { type: "number" }, includesLink: { type: "boolean" }, personalizations: { type: "array", items: { type: "string" } } }, required: ["messageNumber", "timing", "content", "characterCount", "includesLink", "personalizations"], additionalProperties: false } },
                  complianceNotes: { type: "array", items: { type: "string" } },
                  expectedMetrics: { type: "object", properties: { deliveryRate: { type: "string" }, clickRate: { type: "string" }, conversionRate: { type: "string" }, revenuePerMessage: { type: "string" } }, required: ["deliveryRate", "clickRate", "conversionRate", "revenuePerMessage"], additionalProperties: false },
                  segmentation: { type: "string" },
                  bestPractices: { type: "array", items: { type: "string" } },
                },
                required: ["flowName", "messages", "complianceNotes", "expectedMetrics", "segmentation", "bestPractices"],
                additionalProperties: false,
              },
            },
          },
        });

        const result = parseLLMJson<any>(llmResult.choices[0].message.content, "social.smsRecoveryFlow");
        await db.updateAgentTask(task.id, { status: "completed", result });
        return result;
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),

  // ─── Social Proof Generator ────────────────────────────────────────────
  socialProofGenerator: orgProcedure
    .input(z.object({
      storeId: z.number(),
      productName: z.string(),
      proofType: z.enum(["testimonials", "urgency_notifications", "trust_badges", "review_responses", "ugc_prompts"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStoreInOrg(input.storeId, ctx.org.id);
      const task = await db.createAgentTask({
        agentType: "social",
        taskType: "social_proof",
        title: `${input.proofType} for "${input.productName}"`,
        description: `Generating social proof content`,
        status: "running",
        storeId: input.storeId,
      });

      try {
        const storeContext = await getRenderedStoreContext(input.storeId);

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a social proof and conversion optimization expert. Generate authentic-feeling social proof elements. ${storeContext ? "Use the store context to make proof elements feel specific to this merchant's brand and product line." : ""} Return JSON with:
- proofType: string
- elements: array of { content (string), placement (string), trigger (string), format (string) }
- implementationGuide: string
- psychologyBehind: string
- expectedConversionLift: string
- warnings: array of strings (ethical considerations)`
            },
            {
              role: "user",
              content: `Product: "${input.productName}"\nProof type: ${input.proofType}\nGenerate social proof elements.`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "social_proof",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  proofType: { type: "string" },
                  elements: { type: "array", items: { type: "object", properties: { content: { type: "string" }, placement: { type: "string" }, trigger: { type: "string" }, format: { type: "string" } }, required: ["content", "placement", "trigger", "format"], additionalProperties: false } },
                  implementationGuide: { type: "string" },
                  psychologyBehind: { type: "string" },
                  expectedConversionLift: { type: "string" },
                  warnings: { type: "array", items: { type: "string" } },
                },
                required: ["proofType", "elements", "implementationGuide", "psychologyBehind", "expectedConversionLift", "warnings"],
                additionalProperties: false,
              },
            },
          },
        });

        const result = parseLLMJson<any>(llmResult.choices[0].message.content, "social.socialProofGenerator");
        await db.updateAgentTask(task.id, { status: "completed", result });
        return result;
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw error;
      }
    }),
});
