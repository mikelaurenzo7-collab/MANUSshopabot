/**
 * Tests for the unified outbound delivery layer.
 *
 * These tests prove the *contract* — provider selection, error mapping,
 * env-gated guards. They mock the underlying providers so no real
 * Gmail / SendGrid / Twilio API calls are made.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────────────────────────
// vi.mock is hoisted before imports; we use vi.hoisted for the spies so
// the test body can re-program them between cases.
const { sendViaGmailMock, sendViaSendgridMock, sendViaTwilioMock, isGmailAvailableMock } =
  vi.hoisted(() => {
    return {
      sendViaGmailMock: vi.fn(),
      sendViaSendgridMock: vi.fn(),
      sendViaTwilioMock: vi.fn(),
      isGmailAvailableMock: vi.fn(),
    };
  });

vi.mock("./delivery/gmail", () => ({
  sendViaGmail: sendViaGmailMock,
  isGmailAvailableForUser: isGmailAvailableMock,
}));

vi.mock("./delivery/sendgrid", () => ({
  sendViaSendgrid: sendViaSendgridMock,
  isSendgridConfigured: () => !!process.env.SENDGRID_API_KEY && !!process.env.SENDGRID_FROM_EMAIL,
}));

vi.mock("./delivery/twilio", () => ({
  sendViaTwilio: sendViaTwilioMock,
  isTwilioConfigured: () =>
    !!process.env.TWILIO_ACCOUNT_SID &&
    !!process.env.TWILIO_AUTH_TOKEN &&
    (!!process.env.TWILIO_FROM_NUMBER || !!process.env.TWILIO_MESSAGING_SERVICE_SID),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.SENDGRID_API_KEY;
  delete process.env.SENDGRID_FROM_EMAIL;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
  delete process.env.TWILIO_MESSAGING_SERVICE_SID;

  sendViaGmailMock.mockReset();
  sendViaSendgridMock.mockReset();
  sendViaTwilioMock.mockReset();
  isGmailAvailableMock.mockReset();

  sendViaGmailMock.mockResolvedValue({
    providerMessageId: "gmail-msg-1",
    provider: "gmail",
    sentAt: new Date().toISOString(),
  });
  sendViaSendgridMock.mockResolvedValue({
    providerMessageId: "sg-msg-1",
    provider: "sendgrid",
    sentAt: new Date().toISOString(),
  });
  sendViaTwilioMock.mockResolvedValue({
    providerMessageId: "twilio-sid-1",
    provider: "twilio",
    sentAt: new Date().toISOString(),
  });
  isGmailAvailableMock.mockResolvedValue(false);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("delivery — email provider selection", () => {
  it("uses SendGrid when configured (preferred for transactional)", async () => {
    process.env.SENDGRID_API_KEY = "SG.test";
    process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";

    const { sendEmail } = await import("./delivery");
    const result = await sendEmail(
      { to: { email: "to@example.com" }, subject: "hi", html: "<p>hi</p>" },
      { userId: 1 },
    );

    expect(result.provider).toBe("sendgrid");
    expect(sendViaSendgridMock).toHaveBeenCalledOnce();
    expect(sendViaGmailMock).not.toHaveBeenCalled();
  });

  it("falls back to Gmail when SendGrid is not configured but the user has Gmail connected", async () => {
    isGmailAvailableMock.mockResolvedValue(true);

    vi.resetModules();
    const { sendEmail } = await import("./delivery");
    const result = await sendEmail(
      { to: { email: "to@example.com" }, subject: "hi", html: "<p>hi</p>" },
      { userId: 42 },
    );

    expect(result.provider).toBe("gmail");
    expect(sendViaGmailMock).toHaveBeenCalledWith(expect.any(Object), 42);
  });

  it("throws NoDeliveryProviderError when neither provider is available", async () => {
    isGmailAvailableMock.mockResolvedValue(false);

    vi.resetModules();
    const { sendEmail, NoDeliveryProviderError } = await import("./delivery");

    await expect(
      sendEmail(
        { to: { email: "to@example.com" }, subject: "hi", text: "hi" },
        { userId: 1 },
      ),
    ).rejects.toBeInstanceOf(NoDeliveryProviderError);
  });

  it("respects an explicit provider override even if SendGrid is configured", async () => {
    process.env.SENDGRID_API_KEY = "SG.test";
    process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";

    vi.resetModules();
    const { sendEmail } = await import("./delivery");
    await sendEmail(
      { to: { email: "to@example.com" }, subject: "hi", html: "<p>hi</p>" },
      { provider: "gmail", userId: 1 },
    );

    expect(sendViaGmailMock).toHaveBeenCalledOnce();
    expect(sendViaSendgridMock).not.toHaveBeenCalled();
  });
});

describe("delivery — SMS provider selection", () => {
  it("throws NoDeliveryProviderError when Twilio is not configured", async () => {
    vi.resetModules();
    const { sendSms, NoDeliveryProviderError } = await import("./delivery");
    await expect(
      sendSms({ to: "+14155551234", body: "hi" }),
    ).rejects.toBeInstanceOf(NoDeliveryProviderError);
  });

  it("delivers via Twilio when account + auth token + from number are set", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_FROM_NUMBER = "+15555550000";

    vi.resetModules();
    const { sendSms } = await import("./delivery");
    const result = await sendSms({ to: "+14155551234", body: "abandoned cart!" });

    expect(result.provider).toBe("twilio");
    expect(sendViaTwilioMock).toHaveBeenCalledWith({
      to: "+14155551234",
      body: "abandoned cart!",
    });
  });

  it("accepts messaging-service-sid as an alternative to from-number", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG999";
    delete process.env.TWILIO_FROM_NUMBER;

    vi.resetModules();
    const { sendSms } = await import("./delivery");
    const result = await sendSms({ to: "+14155551234", body: "hi" });
    expect(result.provider).toBe("twilio");
  });
});

describe("delivery — getDeliveryStatus", () => {
  it("reports SendGrid + Twilio status independently of any user", async () => {
    process.env.SENDGRID_API_KEY = "SG.test";
    process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_FROM_NUMBER = "+15555550000";

    vi.resetModules();
    const { getDeliveryStatus } = await import("./delivery");
    const status = await getDeliveryStatus();

    expect(status.email.sendgrid).toBe(true);
    expect(status.sms.twilio).toBe(true);
    expect(status.email.gmail).toBe(false); // no user
  });

  it("reports Gmail availability per-user", async () => {
    isGmailAvailableMock.mockResolvedValue(true);

    vi.resetModules();
    const { getDeliveryStatus } = await import("./delivery");
    const status = await getDeliveryStatus(123);
    expect(status.email.gmail).toBe(true);
    expect(isGmailAvailableMock).toHaveBeenCalledWith(123);
  });

  it("reports nothing configured when env is bare", async () => {
    vi.resetModules();
    const { getDeliveryStatus } = await import("./delivery");
    const status = await getDeliveryStatus();
    expect(status.email.sendgrid).toBe(false);
    expect(status.email.gmail).toBe(false);
    expect(status.sms.twilio).toBe(false);
  });
});

describe("delivery — router wiring", () => {
  it("appRouter exposes social.sendEmailCampaign", async () => {
    const { appRouter } = await import("./routers");
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures["social.sendEmailCampaign"]).toBeDefined();
  });

  it("appRouter exposes social.sendSms", async () => {
    const { appRouter } = await import("./routers");
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures["social.sendSms"]).toBeDefined();
  });
});
