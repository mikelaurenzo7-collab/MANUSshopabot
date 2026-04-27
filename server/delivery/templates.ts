/**
 * Tiny email template utility — a single branded shell + a couple of
 * transactional templates. Lives next to the delivery layer so the two
 * are always in sync.
 *
 * NOT a full template engine. The tradeoff is intentional: every
 * transactional email is written in TS once, type-checked, and rendered
 * with simple string interpolation. No mustache/handlebars, no runtime
 * compilation, no template injection surface.
 */

interface ShellOptions {
  preheader?: string;
  /** Footer note shown under the action button — e.g. expiry text. */
  footnote?: string;
}

const BRAND_COLOR = "#0EA5E9";
const BG_COLOR = "#050507";
const CARD_BG = "#0f1116";
const TEXT_COLOR = "#e2e8f0";
const MUTED_COLOR = "#94a3b8";

/**
 * Render a branded transactional shell around the given inner HTML.
 *
 * Email-client constraints:
 *   - inline styles only (Gmail strips <style> blocks in some contexts)
 *   - tables for layout (Outlook still doesn't grok flexbox)
 *   - max-width: 600px is the long-standing safe default
 *   - preheader is a hidden 1px element shown after subject in inbox preview
 */
export function renderEmailShell(innerHtml: string, options: ShellOptions = {}): string {
  const preheader = options.preheader
    ? `<div style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;color:transparent;">${escapeHtml(
        options.preheader,
      )}</div>`
    : "";

  const footnote = options.footnote
    ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:${MUTED_COLOR};">${escapeHtml(
        options.footnote,
      )}</p>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shop_a_Bot</title></head>
<body style="margin:0;padding:0;background:${BG_COLOR};color:${TEXT_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG_COLOR};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${CARD_BG};border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:32px 32px 16px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,${BRAND_COLOR},#06B6D4);vertical-align:middle;"></span>
            <span style="margin-left:10px;font-size:18px;font-weight:800;letter-spacing:-0.01em;color:${TEXT_COLOR};vertical-align:middle;">Shop_a_Bot</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;font-size:15px;line-height:1.6;color:${TEXT_COLOR};">
            ${innerHtml}
            ${footnote}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;background:rgba(255,255,255,0.02);border-top:1px solid rgba(255,255,255,0.05);font-size:12px;color:${MUTED_COLOR};text-align:center;">
            Shop_a_Bot — autonomous e-commerce orchestration · <a href="https://shop-a-bot.app" style="color:${MUTED_COLOR};text-decoration:underline;">shop-a-bot.app</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body></html>`;
}

export function renderEmailShellText(innerText: string, signature?: string): string {
  const sig = signature ?? "— Shop_a_Bot\nshop-a-bot.app";
  return `${innerText}\n\n${sig}`;
}

/** Escape HTML for safe interpolation into the shell. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Templates ─────────────────────────────────────────────────────────────

interface OrgInviteTemplateInput {
  inviteeEmail: string;
  orgName: string;
  inviterName: string;
  /** "owner" | "admin" | "member" */
  role: string;
  /** Full URL — e.g. https://shop-a-bot.app/invite/<token> */
  acceptUrl: string;
  /** Pretty expiry, e.g. "in 7 days". */
  expiresIn: string;
}

export function renderOrgInviteEmail(input: OrgInviteTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { inviteeEmail, orgName, inviterName, role, acceptUrl, expiresIn } = input;
  const subject = `${inviterName} invited you to ${orgName} on Shop_a_Bot`;

  const inner = `
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:800;color:${TEXT_COLOR};letter-spacing:-0.01em;">You're invited to ${escapeHtml(orgName)}</h1>
    <p style="margin:0 0 8px;color:${TEXT_COLOR};">Hi,</p>
    <p style="margin:0 0 16px;color:${TEXT_COLOR};">
      <strong>${escapeHtml(inviterName)}</strong> has invited you to join
      <strong>${escapeHtml(orgName)}</strong> on Shop_a_Bot as
      <strong>${escapeHtml(role)}</strong>. You'll get access to their connected
      stores, bots, and workflows.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr>
        <td style="border-radius:8px;background:${BRAND_COLOR};">
          <a href="${escapeHtml(acceptUrl)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#fff;text-decoration:none;border-radius:8px;">
            Accept invitation
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:${MUTED_COLOR};">
      Or copy this link into your browser:<br>
      <span style="color:${BRAND_COLOR};word-break:break-all;">${escapeHtml(acceptUrl)}</span>
    </p>
  `;

  const html = renderEmailShell(inner, {
    preheader: `${inviterName} invited you to join ${orgName} as ${role}.`,
    footnote: `This invite expires ${expiresIn}. If you weren't expecting this email, you can safely ignore it — it was sent to ${inviteeEmail}.`,
  });

  const text = renderEmailShellText(
    `You're invited to ${orgName}\n\n` +
      `${inviterName} has invited you to join ${orgName} on Shop_a_Bot as ${role}.\n\n` +
      `Accept the invitation:\n${acceptUrl}\n\n` +
      `This invite expires ${expiresIn}. If you weren't expecting this email, you can safely ignore it.`,
  );

  return { subject, html, text };
}

interface TrialEndingTemplateInput {
  recipientEmail: string;
  firstName: string;
  planName: string;
  /** Pretty date, already formatted ("Friday, May 3"). */
  trialEndDate: string;
  billingPortalUrl: string;
}

export function renderTrialEndingEmail(input: TrialEndingTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { firstName, planName, trialEndDate, billingPortalUrl } = input;
  const subject = `Your Shop_a_Bot trial ends ${trialEndDate}`;

  const inner = `
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:800;color:${TEXT_COLOR};letter-spacing:-0.01em;">Your trial ends ${escapeHtml(trialEndDate)}</h1>
    <p style="margin:0 0 8px;color:${TEXT_COLOR};">Hi ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 16px;color:${TEXT_COLOR};">
      Heads up — your free trial of <strong>Shop_a_Bot ${escapeHtml(planName)}</strong> ends
      on <strong>${escapeHtml(trialEndDate)}</strong>. We'll automatically convert your
      subscription on that day so your bots keep running uninterrupted.
    </p>
    <p style="margin:0 0 16px;color:${TEXT_COLOR};">
      If you'd like to update your payment method, change plans, or cancel before then,
      you can do it in one click from your billing portal:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr>
        <td style="border-radius:8px;background:${BRAND_COLOR};">
          <a href="${escapeHtml(billingPortalUrl)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#fff;text-decoration:none;border-radius:8px;">
            Manage subscription
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:${MUTED_COLOR};">
      No action needed if you're happy — your bots will keep running and you'll be
      charged on ${escapeHtml(trialEndDate)}.
    </p>
  `;

  const html = renderEmailShell(inner, {
    preheader: `Your Shop_a_Bot ${planName} trial ends ${trialEndDate}.`,
    footnote: `You're receiving this because you started a free trial. Manage notifications anytime from Settings.`,
  });

  const text = renderEmailShellText(
    `Your Shop_a_Bot trial ends ${trialEndDate}\n\n` +
      `Hi ${firstName},\n\n` +
      `Your free trial of Shop_a_Bot ${planName} ends on ${trialEndDate}. We'll auto-convert your subscription so your bots keep running.\n\n` +
      `Manage your subscription:\n${billingPortalUrl}\n\n` +
      `No action needed if you're happy — you'll be charged on ${trialEndDate}.`,
  );

  return { subject, html, text };
}
