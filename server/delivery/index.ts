/**
 * Outbound delivery layer — the one place anything in the codebase
 * calls when it needs to send an email or SMS.
 *
 * Provider selection (email):
 *   1. If `options.provider` is explicit, use it.
 *   2. SendGrid if configured (best for transactional / bulk — no
 *      per-user OAuth, higher daily limits, predictable from-address).
 *   3. Gmail if the user has connected a Gmail account.
 *   4. NoDeliveryProviderError.
 *
 * Provider selection (SMS):
 *   1. If `options.provider` is explicit, use it.
 *   2. Twilio if configured.
 *   3. NoDeliveryProviderError.
 *
 * The point of this module is that callers (workflow code, social
 * router, recovery flows) write `await sendEmail({ to, subject, html })`
 * once and the platform decides how to deliver. Adding a new provider
 * later (Mailgun, Postmark, SES) is a one-file change.
 */
import { logger } from "../_core/logger";
import { isGmailAvailableForUser, sendViaGmail } from "./gmail";
import { isSendgridConfigured, sendViaSendgrid } from "./sendgrid";
import { isTwilioConfigured, sendViaTwilio } from "./twilio";
import {
  DeliveryFailedError,
  DeliveryResult,
  EmailDeliveryOptions,
  EmailMessage,
  EmailProvider,
  NoDeliveryProviderError,
  SmsDeliveryOptions,
  SmsMessage,
} from "./types";

export type {
  DeliveryResult,
  EmailDeliveryOptions,
  EmailMessage,
  EmailProvider,
  EmailRecipient,
  SmsDeliveryOptions,
  SmsMessage,
  SmsProvider,
} from "./types";
export {
  DeliveryFailedError,
  NoDeliveryProviderError,
} from "./types";

/**
 * Pick the email provider when the caller didn't force one.
 *
 * SendGrid is preferred when configured because it's the right tool
 * for transactional / programmatic sends (no OAuth dance, no per-user
 * daily quota). Gmail is the fallback for the personal-mode case where
 * a single-user merchant wants the email to come from their own
 * inbox.
 */
async function pickEmailProvider(
  options: EmailDeliveryOptions,
): Promise<EmailProvider> {
  if (options.provider) return options.provider;

  if (isSendgridConfigured()) return "sendgrid";

  if (options.userId !== undefined && (await isGmailAvailableForUser(options.userId))) {
    return "gmail";
  }

  throw new NoDeliveryProviderError(
    "email",
    "Configure SendGrid (SENDGRID_API_KEY + SENDGRID_FROM_EMAIL) or connect a Gmail account at /integrations.",
  );
}

/**
 * Send an email through the best available provider. Logs the result
 * (provider, message id) for observability without leaking body content.
 */
export async function sendEmail(
  message: EmailMessage,
  options: EmailDeliveryOptions = {},
): Promise<DeliveryResult> {
  const provider = await pickEmailProvider(options);

  try {
    let result: DeliveryResult;
    if (provider === "gmail") {
      if (options.userId === undefined) {
        throw new DeliveryFailedError(
          "gmail",
          "Gmail provider requires options.userId.",
        );
      }
      result = await sendViaGmail(message, options.userId);
    } else {
      result = await sendViaSendgrid(message, {
        fromEmail: options.fromEmail,
        fromName: options.fromName,
      });
    }

    logger.info("delivery_email_sent", {
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      recipientCount: Array.isArray(message.to) ? message.to.length : 1,
      categories: message.categories,
      userId: options.userId,
    });

    return result;
  } catch (err: unknown) {
    if (err instanceof DeliveryFailedError) {
      logger.error("delivery_email_failed", {
        provider: err.provider,
        statusCode: err.statusCode,
        message: err.providerMessage,
        userId: options.userId,
      });
    } else if (err instanceof NoDeliveryProviderError) {
      logger.warn("delivery_email_no_provider", { error: err.message });
    } else {
      logger.error("delivery_email_unexpected", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }
}

/**
 * Send an SMS through Twilio (the only SMS provider today). Logs the
 * result for observability; never logs the message body.
 */
export async function sendSms(
  message: SmsMessage,
  options: SmsDeliveryOptions = {},
): Promise<DeliveryResult> {
  // Future: support Vonage / MessageBird here. For now Twilio only.
  void options.provider;

  if (!isTwilioConfigured()) {
    throw new NoDeliveryProviderError(
      "sms",
      "Configure Twilio (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID).",
    );
  }

  try {
    const result = await sendViaTwilio(message);
    logger.info("delivery_sms_sent", {
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      to: redactPhone(message.to),
      bodyLength: message.body.length,
    });
    return result;
  } catch (err: unknown) {
    if (err instanceof DeliveryFailedError) {
      logger.error("delivery_sms_failed", {
        provider: err.provider,
        statusCode: err.statusCode,
        message: err.providerMessage,
      });
    }
    throw err;
  }
}

/**
 * Returns a per-channel snapshot of which providers are available right
 * now. Used by the diagnostics router so the UI can show "✓ SendGrid
 * configured" / "✗ Twilio not configured" without leaking secrets.
 */
export async function getDeliveryStatus(userId?: number): Promise<{
  email: { sendgrid: boolean; gmail: boolean };
  sms: { twilio: boolean };
}> {
  return {
    email: {
      sendgrid: isSendgridConfigured(),
      gmail: userId !== undefined ? await isGmailAvailableForUser(userId) : false,
    },
    sms: {
      twilio: isTwilioConfigured(),
    },
  };
}

/** Mask all but the last 4 digits — for logs. */
function redactPhone(phone: string): string {
  if (phone.length <= 4) return "***";
  return `${phone.slice(0, 2)}***${phone.slice(-4)}`;
}
