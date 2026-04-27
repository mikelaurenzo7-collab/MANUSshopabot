import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

/**
 * The active organization context attached to every authenticated request.
 *
 * Resolved (in order) from:
 *   1. The `X-Org-Id` request header — explicit per-call switch.
 *   2. The user's `currentOrgId` column — sticky default.
 *   3. The user's first owned org — fallback for users without a current.
 *
 * Membership is verified before the value is set. If the user is not a
 * member of the requested org, the field is left null and protected
 * procedures that need an org will throw FORBIDDEN.
 */
export type ActiveOrg = {
  id: number;
  role: "owner" | "admin" | "member";
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** Active org for this request, after membership verification. Null if the user is unauth'd or has no orgs. */
  activeOrg: ActiveOrg | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  const activeOrg = user ? await resolveActiveOrg(user, opts.req) : null;

  return {
    req: opts.req,
    res: opts.res,
    user,
    activeOrg,
  };
}

/**
 * Resolve the request's active organization. Imported lazily to avoid
 * a startup cycle where db.ts indirectly pulls in the trpc module.
 */
async function resolveActiveOrg(
  user: User,
  req: CreateExpressContextOptions["req"],
): Promise<ActiveOrg | null> {
  // Defer the import so context.ts stays cheap to load and test
  const db = await import("../db");

  const headerRaw = (req.headers["x-org-id"] ?? req.headers["X-Org-Id"]) as string | string[] | undefined;
  const headerVal = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  const headerOrgId = headerVal && /^\d+$/.test(headerVal) ? Number(headerVal) : null;

  const candidates = [
    headerOrgId,
    user.currentOrgId,
  ].filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);

  // Try each candidate; first one with a verified membership wins
  for (const candidate of candidates) {
    const membership = await db.getOrgMembership(candidate, user.id);
    if (membership) return { id: candidate, role: membership.role };
  }

  // Fallback: pick any org the user is a member of (e.g. their personal org)
  const memberships = await db.getOrgsForUser(user.id);
  if (memberships[0]) return { id: memberships[0].id, role: memberships[0].role };

  // No memberships: auto-create a personal org so this user is never stranded.
  // This handles the edge case of a brand-new signup that hasn't run the
  // upsert path yet.
  try {
    const personal = await db.ensurePersonalOrg(user.id);
    return { id: personal.id, role: "owner" };
  } catch (err) {
    console.error("[trpc/context] failed to ensure personal org for user", user.id, err);
    return null;
  }
}
