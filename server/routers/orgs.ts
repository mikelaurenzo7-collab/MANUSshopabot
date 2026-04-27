/**
 * orgs router — multi-tenancy management.
 *
 * Lifecycle:
 *  - Every user has a personal org auto-created on first auth.
 *  - Owners/admins can create additional orgs (e.g., a team org for an
 *    agency they run).
 *  - Members can switch their active org via `setActive`.
 *  - Owners can invite new members. Email delivery is a future pass —
 *    for now an invite returns a token the recipient can redeem.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "node:crypto";
import {
  orgProcedure,
  orgAdminProcedure,
  protectedProcedure,
  router,
} from "../_core/trpc";
import * as db from "../db";
import { sanitizeEmail, sanitizeName } from "../utils/sanitize";
import {
  sendEmail,
  DeliveryFailedError,
  NoDeliveryProviderError,
} from "../delivery";
import { renderOrgInviteEmail } from "../delivery/templates";

/** Generate a URL-safe random invite token. 32 bytes → 43 chars base64url. */
function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

const INVITE_TTL_DAYS = 7;

export const orgsRouter = router({
  /** Orgs the current user is a member of, with role. */
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getOrgsForUser(ctx.user.id);
  }),

  /** The currently active org for this request, plus the user's role. */
  current: orgProcedure.query(async ({ ctx }) => {
    const org = await db.getOrgById(ctx.org.id);
    if (!org) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Active org not found" });
    }
    return { ...org, role: ctx.org.role };
  }),

  /**
   * Switch the user's active org. Verifies membership before persisting.
   * The frontend should re-fetch all org-scoped queries after this.
   */
  setActive: protectedProcedure
    .input(z.object({ orgId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getOrgMembership(input.orgId, ctx.user.id);
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of that organization.",
        });
      }
      await db.setCurrentOrgForUser(ctx.user.id, input.orgId);
      return { success: true, orgId: input.orgId, role: membership.role };
    }),

  /**
   * Create a new "team" org (agencies, multi-user companies). The caller
   * becomes its owner. Personal orgs are auto-created elsewhere and
   * cannot be created via this procedure.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cleanName = sanitizeName(input.name, 255);
      const created = await db.createOrganization({
        name: cleanName,
        ownerId: ctx.user.id,
        kind: "team",
      });
      // Auto-switch the user into the org they just created
      await db.setCurrentOrgForUser(ctx.user.id, created.id);
      return created;
    }),

  /** Members of the active org (owner/admin/member). */
  members: orgProcedure.query(async ({ ctx }) => {
    return db.getOrgMembers(ctx.org.id);
  }),

  /**
   * Invite a user to the active org by their userId. Owner/admin only.
   *
   * Future pass: accept an email instead, look up or pre-create the
   * user, and send a SendGrid invite email. For now this is a
   * direct add-by-id, suitable for a sales-assisted onboarding.
   */
  inviteMember: orgAdminProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        role: z.enum(["admin", "member"]).default("member"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Don't let admins escalate themselves to owner via this path
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You are already a member of this organization.",
        });
      }
      await db.addOrgMember({
        orgId: ctx.org.id,
        userId: input.userId,
        role: input.role,
        invitedByUserId: ctx.user.id,
      });
      return { success: true };
    }),

  /**
   * Invite a person to the active org by email. Generates a one-shot
   * redemption token, persists an `org_invitations` row, and sends a
   * branded invite email via the delivery layer.
   *
   * The invitee doesn't need to have an account yet — they'll click
   * the link, sign in (creating an account if needed), and the
   * `acceptInvite` mutation will add their membership.
   *
   * Returns the invitation row + the public accept URL (for displaying
   * a "copy link" affordance in the UI).
   */
  inviteByEmail: orgAdminProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["admin", "member"]).default("member"),
        /** Public origin used to build the redemption URL — passed from the client. */
        origin: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cleanEmail = sanitizeEmail(input.email);
      if (!cleanEmail) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid email address" });
      }

      const org = await db.getOrgById(ctx.org.id);
      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      const token = generateInviteToken();
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

      const invitation = await db.createOrgInvitation({
        orgId: ctx.org.id,
        email: cleanEmail,
        role: input.role,
        token,
        invitedByUserId: ctx.user.id,
        expiresAt,
      });

      const acceptUrl = `${input.origin.replace(/\/$/, "")}/invite/${token}`;
      const inviterName = ctx.user.name?.trim() || ctx.user.email || "A teammate";

      // Render + send. If delivery fails, the invitation row stays so
      // the caller can re-send by token (manual copy + paste from the
      // returned URL is a usable fallback).
      const { subject, html, text } = renderOrgInviteEmail({
        inviteeEmail: cleanEmail,
        orgName: org.name,
        inviterName,
        role: input.role,
        acceptUrl,
        expiresIn: `in ${INVITE_TTL_DAYS} days`,
      });

      let delivered: boolean;
      let deliveryError: string | undefined;
      try {
        await sendEmail(
          {
            to: { email: cleanEmail },
            subject,
            html,
            text,
            categories: ["org_invite"],
          },
          {
            userId: ctx.user.id,
            // Force the platform sender — invites should never come from
            // the inviter's personal Gmail (deliverability + impersonation
            // concerns). If SendGrid isn't configured this throws and the
            // caller surfaces the manual-link fallback.
            provider: "sendgrid",
          },
        );
        delivered = true;
      } catch (err) {
        delivered = false;
        if (err instanceof NoDeliveryProviderError) {
          deliveryError = "SendGrid not configured — share the invite link manually.";
        } else if (err instanceof DeliveryFailedError) {
          deliveryError = err.message;
        } else {
          deliveryError = err instanceof Error ? err.message : String(err);
        }
      }

      return {
        invitationId: invitation.id,
        email: cleanEmail,
        role: input.role,
        acceptUrl,
        expiresAt,
        delivered,
        deliveryError,
      };
    }),

  /** List pending invitations for the active org. Owner/admin only. */
  pendingInvitations: orgAdminProcedure.query(async ({ ctx }) => {
    return db.getPendingInvitationsForOrg(ctx.org.id);
  }),

  /**
   * Public preview of an invitation by token — used by the /invite/:token
   * page so the invitee can see what they're accepting before signing in.
   * Does NOT require auth (the token is the proof).
   */
  previewInvitation: protectedProcedure
    .input(z.object({ token: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const invitation = await db.getOrgInvitationByToken(input.token);
      if (!invitation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." });
      }
      if (invitation.acceptedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation has already been accepted.",
        });
      }
      if (invitation.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation has expired. Ask the inviter to send a new one.",
        });
      }
      const org = await db.getOrgById(invitation.orgId);
      return {
        orgName: org?.name ?? "an organization",
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      };
    }),

  /**
   * Accept a pending invitation. Adds the calling user as a member of
   * the target org with the role specified in the invitation, marks
   * the invitation accepted, and switches the user's active org so
   * they land in the right place after redirect.
   *
   * The token alone is the authorization — we don't require the caller's
   * email to match the invitation's email (that would block invites to
   * an email distinct from the user's signed-in email, which is a
   * common pattern).
   */
  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await db.getOrgInvitationByToken(input.token);
      if (!invitation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." });
      }
      if (invitation.acceptedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation has already been accepted.",
        });
      }
      if (invitation.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation has expired.",
        });
      }

      // Add membership (idempotent — onDuplicateKeyUpdate handles re-accepts)
      await db.addOrgMember({
        orgId: invitation.orgId,
        userId: ctx.user.id,
        role: invitation.role,
        invitedByUserId: invitation.invitedByUserId,
      });

      await db.markOrgInvitationAccepted(invitation.id, ctx.user.id);

      // Auto-switch into the org so the redirect lands them in context
      await db.setCurrentOrgForUser(ctx.user.id, invitation.orgId);

      const org = await db.getOrgById(invitation.orgId);
      return {
        orgId: invitation.orgId,
        orgName: org?.name ?? "your organization",
        role: invitation.role,
      };
    }),
});
