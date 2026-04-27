/**
 * Shared types for the outbound delivery layer.
 *
 * Three providers fan in here: Gmail (per-user OAuth), SendGrid
 * (transactional / marketing), and Twilio (SMS). Each provider
 * implements the matching interface; a thin selector picks the right
 * one based on caller intent + ENV configuration.
 */

export type EmailProvider = "gmail" | "sendgrid";
export type SmsProvider = "twilio";

/** A single email recipient. */
export interface EmailRecipient {
  email: string;
  name?: string;
}

/** Inputs to deliver an email — provider-agnostic. */
export interface EmailMessage {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  /** HTML body — preferred for marketing/transactional. */
  html?: string;
  /** Plain-text fallback. At least one of html/text is required. */
  text?: string;
  /** Optional reply-to address (e.g. customer support inbox). */
  replyTo?: string;
  /** Optional preheader text — shown after subject in many clients. */
  preheader?: string;
  /** Tags for analytics / SendGrid categories. */
  categories?: string[];
}

/**
 * Options that control which provider handles this send.
 *
 * `userId` is required when `provider: "gmail"` is selected (or when the
 * default selection might land on Gmail) so the provider can look up
 * the user's connected Gmail OAuth credentials. SendGrid sends do not
 * need a userId — they go from the platform's own verified sender.
 */
export interface EmailDeliveryOptions {
  /** Force a specific provider; otherwise auto-selected. */
  provider?: EmailProvider;
  /** Required when Gmail might be the chosen provider. */
  userId?: number;
  /**
   * Override the from-address. SendGrid: must be a verified sender.
   * Gmail: ignored (always uses the connected account's address).
   */
  fromEmail?: string;
  fromName?: string;
}

/** Inputs to deliver an SMS. */
export interface SmsMessage {
  /** E.164 destination phone number, e.g. "+14155551234". */
  to: string;
  /** Message body — Twilio truncates / segments at 1600 chars. */
  body: string;
}

export interface SmsDeliveryOptions {
  provider?: SmsProvider;
}

/**
 * Result returned from any successful provider send. The shape is
 * provider-agnostic so callers can log it uniformly.
 */
export interface DeliveryResult {
  /** Provider-specific message id (Gmail thread, SendGrid msg id, Twilio sid). */
  providerMessageId: string;
  provider: EmailProvider | SmsProvider;
  /** Server-side ISO timestamp the provider acknowledged the send. */
  sentAt: string;
}

/** Thrown when no provider is configured for the requested channel. */
export class NoDeliveryProviderError extends Error {
  constructor(channel: "email" | "sms", details?: string) {
    super(
      `No delivery provider configured for ${channel}. ` +
        (details ?? `Set the relevant env vars (SENDGRID_API_KEY for email, TWILIO_* for SMS).`),
    );
    this.name = "NoDeliveryProviderError";
  }
}

/** Thrown when the selected provider rejects the message. */
export class DeliveryFailedError extends Error {
  constructor(
    public provider: EmailProvider | SmsProvider,
    public providerMessage: string,
    public statusCode?: number,
  ) {
    super(`[${provider}] ${providerMessage}`);
    this.name = "DeliveryFailedError";
  }
}
