/**
 * SendGrid email provider.
 *
 * Sends from the platform's verified sender address (`SENDGRID_FROM_EMAIL`)
 * — best for transactional emails (order confirmations, password resets,
 * abandoned-cart recovery) and marketing where Gmail's per-account daily
 * quota is too restrictive.
 *
 * The full `@sendgrid/mail` SDK isn't required — the v3 send API is a
 * single POST and we already have axios. Keeps the dependency surface
 * small.
 *
 * Configuration (env):
 *   SENDGRID_API_KEY        — required to enable
 *   SENDGRID_FROM_EMAIL     — verified sender address
 *   SENDGRID_FROM_NAME      — display name (default "Shop_a_Bot")
 *
 * If `SENDGRID_API_KEY` is unset, `isSendgridConfigured()` returns
 * false and the selector skips this provider.
 */
import axios from "axios";
import { ENV } from "../_core/env";
import {
  DeliveryFailedError,
  DeliveryResult,
  EmailMessage,
  EmailRecipient,
  NoDeliveryProviderError,
} from "./types";

const SENDGRID_ENDPOINT = "https://api.sendgrid.com/v3/mail/send";

export function isSendgridConfigured(): boolean {
  return !!ENV.sendgridApiKey && !!ENV.sendgridFromEmail;
}

function toSendgridRecipient(r: EmailRecipient) {
  return r.name ? { email: r.email, name: r.name } : { email: r.email };
}

export async function sendViaSendgrid(
  message: EmailMessage,
  options: {
    fromEmail?: string;
    fromName?: string;
    /**
     * Attached as `custom_args.campaignId` on the send so the SendGrid
     * Event Webhook can re-attribute delivered/open/click/bounce events
     * back to the campaign that originated them.
     */
    campaignId?: number;
  } = {},
): Promise<DeliveryResult> {
  if (!isSendgridConfigured()) {
    throw new NoDeliveryProviderError(
      "email",
      "SendGrid not configured — set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL.",
    );
  }

  if (!message.html && !message.text) {
    throw new DeliveryFailedError("sendgrid", "Message has neither html nor text body.");
  }

  const recipients = Array.isArray(message.to) ? message.to : [message.to];
  if (recipients.length === 0) {
    throw new DeliveryFailedError("sendgrid", "No recipients specified.");
  }

  const content: Array<{ type: string; value: string }> = [];
  if (message.text) content.push({ type: "text/plain", value: message.text });
  if (message.html) content.push({ type: "text/html", value: message.html });

  const payload: Record<string, unknown> = {
    personalizations: [
      {
        to: recipients.map(toSendgridRecipient),
      },
    ],
    from: {
      email: options.fromEmail ?? ENV.sendgridFromEmail,
      name: options.fromName ?? ENV.sendgridFromName,
    },
    subject: message.subject,
    content,
  };
  if (message.replyTo) {
    payload.reply_to = { email: message.replyTo };
  }
  if (message.categories?.length) {
    payload.categories = message.categories;
  }
  if (options.campaignId !== undefined) {
    payload.custom_args = { campaignId: String(options.campaignId) };
  }

  try {
    const res = await axios.post(SENDGRID_ENDPOINT, payload, {
      headers: {
        Authorization: `Bearer ${ENV.sendgridApiKey}`,
        "Content-Type": "application/json",
      },
      // SendGrid returns 202 Accepted with no body on success
      validateStatus: (status) => status === 202,
    });

    // SendGrid puts its message id in the X-Message-Id response header
    const providerMessageId =
      (res.headers["x-message-id"] as string | undefined) ?? `sendgrid:${Date.now()}`;

    return {
      providerMessageId,
      provider: "sendgrid",
      sentAt: new Date().toISOString(),
    };
  } catch (err: any) {
    const statusCode = err.response?.status;
    const providerMessage =
      err.response?.data?.errors?.[0]?.message ??
      err.message ??
      "Unknown SendGrid error";
    throw new DeliveryFailedError("sendgrid", providerMessage, statusCode);
  }
}
