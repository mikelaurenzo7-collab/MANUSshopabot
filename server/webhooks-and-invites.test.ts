/**
 * Tests for the SendGrid webhook handler + email-based org invitations.
 *
 * Webhook tests invoke the handler directly with mocked req/res so we
 * don't pull in supertest. Invitation tests assert on the wired tRPC
 * procedures (existence + boundary checks). Schema tests prove the
 * new tables are exported.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// Mock the db so the webhook handler doesn't need a live MySQL.
const recordEventMock = vi.hoisted(() => vi.fn());
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    recordEmailDeliveryEvent: recordEventMock,
  };
});

beforeEach(() => {
  recordEventMock.mockReset();
  recordEventMock.mockResolvedValue(undefined);
  delete process.env.SENDGRID_WEBHOOK_PUBLIC_KEY;
});

interface MockRes {
  statusCode: number;
  body: any;
  headers: Record<string, string>;
  status(code: number): MockRes;
  json(payload: any): MockRes;
  end(): MockRes;
}

function mockRes(): MockRes {
  const res: any = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

function mockReq(body: any, headers: Record<string, string> = {}): Request {
  return {
    body,
    headers,
    header(name: string) {
      return headers[name] ?? headers[name.toLowerCase()];
    },
    rawBody: Buffer.from(JSON.stringify(body)),
  } as unknown as Request;
}

describe("SendGrid webhook handler", () => {
  it("records delivered events with campaignId attribution", async () => {
    const { handleSendgridWebhook } = await import("./sendgridWebhooks");
    const events = [
      {
        email: "user@example.com",
        timestamp: 1714003200,
        event: "delivered",
        sg_event_id: "evt-1",
        sg_message_id: "msg-1",
        category: ["campaign", "promotional"],
        custom_args: { campaignId: "42" },
      },
    ];

    const res = mockRes();
    await handleSendgridWebhook(mockReq(events) as Request, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ received: 1, recorded: 1, skipped: 0 });
    expect(recordEventMock).toHaveBeenCalledOnce();
    const recorded = recordEventMock.mock.calls[0][0];
    expect(recorded.providerMessageId).toBe("msg-1");
    expect(recorded.eventType).toBe("delivered");
    expect(recorded.campaignId).toBe(42);
    expect(recorded.email).toBe("user@example.com");
  });

  it("skips events with missing message id, timestamp, or unknown type", async () => {
    const { handleSendgridWebhook } = await import("./sendgridWebhooks");
    const events = [
      { event: "delivered", sg_message_id: "msg-1", sg_event_id: "evt-1", timestamp: 1714003200 },
      { event: "open", sg_event_id: "evt-2", timestamp: 1714003201 }, // no msg_id
      { event: "click", sg_message_id: "msg-2", sg_event_id: "evt-3" }, // no timestamp
      { event: "telemetry_log", sg_message_id: "msg-3", timestamp: 1714003202 }, // unknown type
    ];

    const res = mockRes();
    await handleSendgridWebhook(mockReq(events) as Request, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ received: 4, recorded: 1, skipped: 3 });
  });

  it("returns 204 for an empty event batch", async () => {
    const { handleSendgridWebhook } = await import("./sendgridWebhooks");
    const res = mockRes();
    await handleSendgridWebhook(mockReq([]) as Request, res as unknown as Response);
    expect(res.statusCode).toBe(204);
    expect(recordEventMock).not.toHaveBeenCalled();
  });

  it("rejects requests when signature verification is required and headers are missing", async () => {
    process.env.SENDGRID_WEBHOOK_PUBLIC_KEY =
      "-----BEGIN PUBLIC KEY-----\nstub\n-----END PUBLIC KEY-----";

    const { handleSendgridWebhook } = await import("./sendgridWebhooks");
    const res = mockRes();
    await handleSendgridWebhook(
      mockReq([{ event: "delivered", sg_message_id: "msg-1", timestamp: 1 }]) as Request,
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: "invalid_signature" });
    expect(recordEventMock).not.toHaveBeenCalled();
  });

  it("normalizes a single string category to an array", async () => {
    const { handleSendgridWebhook } = await import("./sendgridWebhooks");
    const res = mockRes();
    await handleSendgridWebhook(
      mockReq([
        {
          event: "open",
          sg_message_id: "msg-1",
          sg_event_id: "evt-1",
          timestamp: 1714003200,
          category: "promotional",
          email: "u@example.com",
        },
      ]) as Request,
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    const recorded = recordEventMock.mock.calls[0][0];
    expect(recorded.categories).toEqual(["promotional"]);
  });
});

describe("Email-based org invitations — wiring", () => {
  it("appRouter exposes orgs.inviteByEmail", async () => {
    const { appRouter } = await import("./routers");
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures["orgs.inviteByEmail"]).toBeDefined();
  });

  it("appRouter exposes orgs.previewInvitation", async () => {
    const { appRouter } = await import("./routers");
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures["orgs.previewInvitation"]).toBeDefined();
  });

  it("appRouter exposes orgs.acceptInvite", async () => {
    const { appRouter } = await import("./routers");
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures["orgs.acceptInvite"]).toBeDefined();
  });

  it("appRouter exposes orgs.pendingInvitations", async () => {
    const { appRouter } = await import("./routers");
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures["orgs.pendingInvitations"]).toBeDefined();
  });
});

describe("Email template — invite", () => {
  it("renders subject + html + text with all key fields interpolated", async () => {
    const { renderOrgInviteEmail } = await import("./delivery/templates");
    const result = renderOrgInviteEmail({
      inviteeEmail: "alice@example.com",
      orgName: "Acme Agency",
      inviterName: "Bob",
      role: "admin",
      acceptUrl: "https://shop-a-bot.app/invite/abc123",
      expiresIn: "in 7 days",
    });

    expect(result.subject).toContain("Bob");
    expect(result.subject).toContain("Acme Agency");
    expect(result.html).toContain("Acme Agency");
    expect(result.html).toContain("admin");
    expect(result.html).toContain("https://shop-a-bot.app/invite/abc123");
    expect(result.text).toContain("Acme Agency");
    expect(result.text).toContain("https://shop-a-bot.app/invite/abc123");
  });

  it("escapes HTML in user-controlled fields to prevent injection", async () => {
    const { renderOrgInviteEmail } = await import("./delivery/templates");
    const result = renderOrgInviteEmail({
      inviteeEmail: "alice@example.com",
      orgName: '<script>alert(1)</script>Evil Co',
      inviterName: 'Bob"</td><td>',
      role: "member",
      acceptUrl: "https://shop-a-bot.app/invite/abc",
      expiresIn: "in 7 days",
    });

    expect(result.html).not.toContain("<script>alert(1)</script>");
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain('Bob"</td>');
  });
});

describe("Schema — new tables", () => {
  it("exports email_delivery_events table", async () => {
    const schema = await import("../drizzle/schema");
    expect((schema.emailDeliveryEvents as Record<string, unknown>).providerMessageId).toBeDefined();
    expect((schema.emailDeliveryEvents as Record<string, unknown>).eventType).toBeDefined();
  });

  it("exports org_invitations table with token + role + expiresAt", async () => {
    const schema = await import("../drizzle/schema");
    expect((schema.orgInvitations as Record<string, unknown>).token).toBeDefined();
    expect((schema.orgInvitations as Record<string, unknown>).role).toBeDefined();
    expect((schema.orgInvitations as Record<string, unknown>).expiresAt).toBeDefined();
  });
});
