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
import {
  orgProcedure,
  orgAdminProcedure,
  protectedProcedure,
  router,
} from "../_core/trpc";
import * as db from "../db";
import { sanitizeName } from "../utils/sanitize";

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
});
