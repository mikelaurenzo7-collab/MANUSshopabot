/**
 * Twilio SMS provider.
 *
 * Sends SMS via the Twilio REST API. Like SendGrid, we hit the v1 API
 * directly via axios (no SDK dependency).
 *
 * Configuration (env):
 *   TWILIO_ACCOUNT_SID            — required
 *   TWILIO_AUTH_TOKEN             — required
 *   TWILIO_FROM_NUMBER            — E.164 phone number (e.g. "+14155551234")
 *   TWILIO_MESSAGING_SERVICE_SID  — alternative to from-number
 *
 * Either `TWILIO_FROM_NUMBER` OR `TWILIO_MESSAGING_SERVICE_SID` must be
 * set; messaging-service is preferred for production (handles A2P
 * registration, geographic routing, opt-out handling).
 */
import axios from "axios";
import { ENV } from "../_core/env";
import {
  DeliveryFailedError,
  DeliveryResult,
  NoDeliveryProviderError,
  SmsMessage,
} from "./types";

export function isTwilioConfigured(): boolean {
  if (!ENV.twilioAccountSid || !ENV.twilioAuthToken) return false;
  return !!ENV.twilioFromNumber || !!ENV.twilioMessagingServiceSid;
}

const E164 = /^\+[1-9]\d{6,14}$/;

export async function sendViaTwilio(message: SmsMessage): Promise<DeliveryResult> {
  if (!isTwilioConfigured()) {
    throw new NoDeliveryProviderError(
      "sms",
      "Twilio not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER (or TWILIO_MESSAGING_SERVICE_SID).",
    );
  }

  if (!E164.test(message.to)) {
    throw new DeliveryFailedError(
      "twilio",
      `Recipient "${message.to}" is not in E.164 format (e.g. "+14155551234").`,
    );
  }

  if (!message.body || !message.body.trim()) {
    throw new DeliveryFailedError("twilio", "SMS body is empty.");
  }

  // Twilio expects application/x-www-form-urlencoded
  const params = new URLSearchParams();
  params.set("To", message.to);
  params.set("Body", message.body);
  if (ENV.twilioMessagingServiceSid) {
    params.set("MessagingServiceSid", ENV.twilioMessagingServiceSid);
  } else {
    params.set("From", ENV.twilioFromNumber);
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${ENV.twilioAccountSid}/Messages.json`;

  try {
    const res = await axios.post(url, params.toString(), {
      auth: {
        username: ENV.twilioAccountSid,
        password: ENV.twilioAuthToken,
      },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return {
      providerMessageId: res.data?.sid ?? `twilio:${Date.now()}`,
      provider: "twilio",
      sentAt: new Date().toISOString(),
    };
  } catch (err: any) {
    const statusCode = err.response?.status;
    const providerMessage =
      err.response?.data?.message ??
      err.response?.data?.detail ??
      err.message ??
      "Unknown Twilio error";
    throw new DeliveryFailedError("twilio", providerMessage, statusCode);
  }
}
