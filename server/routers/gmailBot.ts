/**
 * Gmail Bot Router
 * Handles email management, auto-reply configuration, and template management
 * for customer communication and email marketing.
 */

import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSocialAccountsByPlatform } from "../db";
import { invokeLLM } from "../_core/llm";

// ─── Input Schemas ───────────────────────────────────────────────────────

const GetInboxInput = z.object({
  query: z.string().optional().describe("Gmail search query (e.g., 'is:unread')"),
  maxResults: z.number().int().min(1).max(100).default(10),
});

const SendEmailInput = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  isHtml: z.boolean().default(true),
});

const CreateAutoReplyInput = z.object({
  enabled: z.boolean(),
  subject: z.string().optional(),
  message: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
});

const CreateTemplateInput = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

// ─── Helper: Get Gmail Credentials ────────────────────────────────────────

async function getGmailCredentials(userId: number) {
  const accounts = await getSocialAccountsByPlatform(userId, "gmail");
  const account = accounts[0];

  if (!account || !account.accessToken) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Gmail account not connected. Please connect your Gmail account first.",
    });
  }

  return {
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
    accountId: account.accountId,
    email: account.accountName,
  };
}

// ─── Helper: Gmail API Fetch ──────────────────────────────────────────────

async function gmailFetch(
  path: string,
  credentials: Awaited<ReturnType<typeof getGmailCredentials>>,
  options?: { method?: string; body?: any }
) {
  const { default: axios } = await import("axios");
  const token = credentials.accessToken;

  try {
    const response = await axios({
      url: `https://gmail.googleapis.com/gmail/v1${path}`,
      method: (options?.method || "GET") as any,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: options?.body,
    });
    return response.data;
  } catch (err: any) {
    if (err.response?.status === 401) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Gmail token expired. Please reconnect your Gmail account.",
      });
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Gmail API error: ${err.response?.data?.error?.message || err.message}`,
    });
  }
}

// ─── Router ──────────────────────────────────────────────────────────────

export const gmailBotRouter = router({
  /**
   * Get inbox messages matching a query
   */
  getInbox: protectedProcedure
    .input(GetInboxInput)
    .query(async ({ ctx, input }) => {
      const credentials = await getGmailCredentials(ctx.user.id);
      const query = input.query || "is:unread";

      const data = await gmailFetch(
        `/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${input.maxResults}`,
        credentials
      );

      // Fetch full message details for each ID
      const messages = await Promise.all(
        (data.messages || []).map(async (msg: any) => {
          const fullMsg = await gmailFetch(`/users/me/messages/${msg.id}`, credentials);
          const headers = fullMsg.payload?.headers || [];
          const subject = headers.find((h: any) => h.name === "Subject")?.value || "(no subject)";
          const from = headers.find((h: any) => h.name === "From")?.value || "unknown";
          const date = headers.find((h: any) => h.name === "Date")?.value;

          // Extract body (simplified — doesn't handle multipart perfectly)
          let body = "";
          if (fullMsg.payload?.parts) {
            const textPart = fullMsg.payload.parts.find((p: any) => p.mimeType === "text/plain");
            if (textPart?.body?.data) {
              body = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
            }
          } else if (fullMsg.payload?.body?.data) {
            body = Buffer.from(fullMsg.payload.body.data, "base64url").toString("utf-8");
          }

          return {
            id: msg.id,
            threadId: msg.threadId,
            subject,
            from,
            date,
            body: body.substring(0, 500), // Preview only
            snippet: fullMsg.snippet,
          };
        })
      );

      return {
        messages,
        total: data.resultSizeEstimate || 0,
      };
    }),

  /**
   * Send an email
   */
  sendEmail: protectedProcedure
    .input(SendEmailInput)
    .mutation(async ({ ctx, input }) => {
      const credentials = await getGmailCredentials(ctx.user.id);

      // Build RFC 2822 MIME message
      const messageParts = [
        `To: ${input.to}`,
        `Subject: ${input.subject}`,
        "MIME-Version: 1.0",
        `Content-Type: text/${input.isHtml ? "html" : "plain"}; charset="UTF-8"`,
        "",
        input.body,
      ];
      const rawMessage = messageParts.join("\r\n");
      const encodedMessage = Buffer.from(rawMessage).toString("base64url");

      const result = await gmailFetch("/users/me/messages/send", credentials, {
        method: "POST",
        body: { raw: encodedMessage },
      });

      return {
        messageId: result.id,
        threadId: result.threadId,
        sent: true,
      };
    }),

  /**
   * Get auto-reply settings
   */
  getAutoReply: protectedProcedure.query(async ({ ctx }) => {
    const credentials = await getGmailCredentials(ctx.user.id);

    const data = await gmailFetch("/users/me/settings/autoReply", credentials);

    return {
      enabled: data.enableAutoReply || false,
      subject: data.autoReplySubject || "",
      message: data.autoReplyMessage || "",
      startTime: data.startTime ? new Date(parseInt(data.startTime) * 1000) : null,
      endTime: data.endTime ? new Date(parseInt(data.endTime) * 1000) : null,
    };
  }),

  /**
   * Update auto-reply settings
   */
  updateAutoReply: protectedProcedure
    .input(CreateAutoReplyInput)
    .mutation(async ({ ctx, input }) => {
      const credentials = await getGmailCredentials(ctx.user.id);

      const body: any = {
        enableAutoReply: input.enabled,
      };

      if (input.subject) body.autoReplySubject = input.subject;
      if (input.message) body.autoReplyMessage = input.message;
      if (input.startDate) body.startTime = Math.floor(input.startDate.getTime() / 1000);
      if (input.endDate) body.endTime = Math.floor(input.endDate.getTime() / 1000);

      await gmailFetch("/users/me/settings/autoReply", credentials, {
        method: "PUT",
        body,
      });

      return { success: true };
    }),

  /**
   * Generate email response using LLM
   */
  generateResponse: protectedProcedure
    .input(z.object({ emailBody: z.string(), tone: z.enum(["professional", "friendly", "formal"]).default("professional") }))
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an email assistant. Generate a concise, professional email response in a ${input.tone} tone.`,
          },
          {
            role: "user",
            content: `Original email:\n\n${input.emailBody}\n\nGenerate a response:`,
          },
        ],
      });

      const content = response.choices?.[0]?.message?.content || "";
      return { response: content };
    }),

  /**
   * Get email templates (stored in metadata or separate table in future)
   */
  getTemplates: protectedProcedure.query(async ({ ctx }) => {
    // For now, return hardcoded templates
    // In production, these would be stored in a templates table
    return [
      {
        id: "welcome",
        name: "Welcome Email",
        subject: "Welcome to our store!",
        body: "Thank you for signing up. We're excited to have you on board.",
      },
      {
        id: "abandoned_cart",
        name: "Abandoned Cart Recovery",
        subject: "You left something behind",
        body: "We noticed you left items in your cart. Complete your purchase to get 10% off!",
      },
      {
        id: "order_confirmation",
        name: "Order Confirmation",
        subject: "Your order has been confirmed",
        body: "Thank you for your order. Your order number is {{orderId}}. Track your shipment here: {{trackingUrl}}",
      },
    ];
  }),

  /**
   * Create a new email template
   */
  createTemplate: protectedProcedure
    .input(CreateTemplateInput)
    .mutation(async ({ input }) => {
      // In production, save to templates table
      // For now, just return the template
      return {
        id: `template_${Date.now()}`,
        ...input,
        createdAt: new Date(),
      };
    }),
});
