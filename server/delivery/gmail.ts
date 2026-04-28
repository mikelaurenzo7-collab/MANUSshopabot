/**
 * Gmail email provider.
 *
 * Sends on behalf of a specific user using their connected Gmail OAuth
 * credentials (stored in `social_accounts` with platform = "gmail").
 * Best for personal-mode merchants who want sends to come from their
 * own address. Daily quota is 500/day (non-Workspace) — for higher
 * volume, prefer SendGrid.
 *
 * The send logic mirrors `routers/gmailBot.ts:sendEmail` so workflow
 * code and the gmail-bot UI both share one implementation. The router
 * delegates to this module.
 */
import axios from "axios";
import { getSocialAccountsByPlatform, getSocialAccountsByPlatformForOrg } from "../db";
import {
  DeliveryFailedError,
  DeliveryResult,
  EmailMessage,
  EmailRecipient,
  NoDeliveryProviderError,
} from "./types";

interface GmailCredentials {
  accessToken: string;
  email: string;
}

/**
 * Loads the Gmail OAuth credential for a sender context. Prefers
 * org-scoped lookup when `orgId` is set — that's the only way to
 * route a send through the *current org's* Gmail when a user belongs
 * to multiple orgs. Falls back to userId-scoped lookup for legacy
 * scheduler code that hasn't been migrated yet (single-org callers).
 */
async function loadGmailCredentials(args: {
  userId?: number;
  orgId?: number;
}): Promise<GmailCredentials> {
  let account;
  if (args.orgId !== undefined) {
    const accounts = await getSocialAccountsByPlatformForOrg(args.orgId, "gmail");
    account = accounts[0];
  } else if (args.userId !== undefined) {
    const accounts = await getSocialAccountsByPlatform(args.userId, "gmail");
    account = accounts[0];
  }
  if (!account || !account.accessToken) {
    throw new NoDeliveryProviderError(
      "email",
      "Gmail account not connected for this org. Connect via /integrations or use SendGrid for transactional sends.",
    );
  }
  return {
    accessToken: account.accessToken,
    email: account.accountName ?? "",
  };
}

function formatRecipient(r: EmailRecipient): string {
  return r.name ? `"${r.name.replace(/"/g, "")}" <${r.email}>` : r.email;
}

function formatRecipients(to: EmailMessage["to"]): string {
  if (Array.isArray(to)) return to.map(formatRecipient).join(", ");
  return formatRecipient(to);
}

/**
 * Build an RFC 2822 MIME message with both text + html parts when
 * available, so clients without HTML rendering still see the body.
 */
function buildMimeMessage(
  message: EmailMessage,
  fromHeader: string,
): string {
  const boundary = `=_shopabot_${Date.now().toString(36)}`;
  const headers = [
    `From: ${fromHeader}`,
    `To: ${formatRecipients(message.to)}`,
    `Subject: ${message.subject}`,
    "MIME-Version: 1.0",
  ];
  if (message.replyTo) headers.push(`Reply-To: ${message.replyTo}`);

  const hasHtml = !!message.html;
  const hasText = !!message.text;

  if (hasHtml && hasText) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    return [
      headers.join("\r\n"),
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      message.text,
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      message.html,
      "",
      `--${boundary}--`,
    ].join("\r\n");
  }

  // Single-part message
  const contentType = hasHtml ? "text/html" : "text/plain";
  const body = hasHtml ? message.html! : message.text ?? "";
  headers.push(`Content-Type: ${contentType}; charset="UTF-8"`);
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export async function sendViaGmail(
  message: EmailMessage,
  sender: { userId?: number; orgId?: number },
): Promise<DeliveryResult> {
  if (!message.html && !message.text) {
    throw new DeliveryFailedError("gmail", "Message has neither html nor text body.");
  }

  const credentials = await loadGmailCredentials(sender);
  const fromHeader = credentials.email
    ? `"${credentials.email}" <${credentials.email}>`
    : credentials.email;

  const raw = buildMimeMessage(message, fromHeader);
  const encoded = Buffer.from(raw).toString("base64url");

  try {
    const res = await axios({
      method: "POST",
      url: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      data: { raw: encoded },
    });
    return {
      providerMessageId: res.data?.id ?? `gmail:${Date.now()}`,
      provider: "gmail",
      sentAt: new Date().toISOString(),
    };
  } catch (err: any) {
    const statusCode = err.response?.status;
    const providerMessage =
      err.response?.data?.error?.message ?? err.message ?? "Unknown Gmail error";
    if (statusCode === 401) {
      throw new DeliveryFailedError(
        "gmail",
        "Gmail token expired — user needs to reconnect from /integrations.",
        401,
      );
    }
    throw new DeliveryFailedError("gmail", providerMessage, statusCode);
  }
}

/**
 * True if the given user/org has a connected Gmail account that we
 * could route a send through. Used by the provider selector. Pass
 * `orgId` when known — falls back to `userId` for legacy callers.
 */
export async function isGmailAvailable(args: {
  userId?: number;
  orgId?: number;
}): Promise<boolean> {
  try {
    if (args.orgId !== undefined) {
      const accounts = await getSocialAccountsByPlatformForOrg(args.orgId, "gmail");
      return !!accounts[0]?.accessToken;
    }
    if (args.userId !== undefined) {
      const accounts = await getSocialAccountsByPlatform(args.userId, "gmail");
      return !!accounts[0]?.accessToken;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * @deprecated Prefer `isGmailAvailable({ orgId })` so callers in the
 * multi-tenant world don't accidentally read another org's Gmail.
 */
export async function isGmailAvailableForUser(userId: number): Promise<boolean> {
  return isGmailAvailable({ userId });
}
