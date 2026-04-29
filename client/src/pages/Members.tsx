/**
 * Members.tsx — Organization members management.
 *
 * Mounted as a tab inside Settings. Surfaces the orgs.members and
 * orgs.pendingInvitations queries (already wired) plus the
 * orgs.inviteByEmail mutation so an owner/admin can:
 *   • see who's in the active org with their role
 *   • see invitations that haven't been accepted yet
 *   • invite new people by email (delivery layer sends the SendGrid
 *     branded invite; falls back to a copy-link if SendGrid isn't
 *     configured)
 *
 * Member-role users see a read-only view of the roster — no invite
 * button. Owner/admin get the invite controls.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useOrg } from "@/contexts/OrgContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Mail,
  Loader2,
  Copy,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Crown,
  Shield,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";

type Role = "owner" | "admin" | "member";

const ROLE_ICON: Record<Role, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: UserIcon,
};

const ROLE_BADGE: Record<Role, string> = {
  owner: "bg-sky-500/12 border-sky-500/30 text-sky-300",
  admin: "bg-cyan-500/12 border-cyan-500/30 text-cyan-300",
  member: "bg-white/[0.04] border-white/[0.08] text-white/70",
};

export default function Members() {
  const { activeOrg } = useOrg();
  const utils = trpc.useUtils();
  const isAdminOrOwner = activeOrg?.role === "owner" || activeOrg?.role === "admin";

  const membersQuery = trpc.orgs.members.useQuery(undefined, {
    enabled: !!activeOrg,
  });
  const pendingQuery = trpc.orgs.pendingInvitations.useQuery(undefined, {
    enabled: !!activeOrg && isAdminOrOwner,
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");

  const inviteMutation = trpc.orgs.inviteByEmail.useMutation({
    onSuccess: (result) => {
      if (result.delivered) {
        toast.success(`Invite sent to ${result.email}`);
      } else if (result.deliveryError) {
        toast.warning(`Invite created — ${result.deliveryError}`, {
          description: "Copy the link below and send it manually.",
          duration: 8000,
        });
      }
      setEmail("");
      void utils.orgs.pendingInvitations.invalidate();
    },
    onError: (err) => toast.error(err.message ?? "Failed to send invite"),
  });

  async function handleInvite() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    inviteMutation.mutate({
      email: trimmed,
      role,
      origin: window.location.origin,
    });
  }

  function handleCopy(url: string) {
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Invite link copied"))
      .catch(() => toast.error("Couldn't access clipboard"));
  }

  if (!activeOrg) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-white/35" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Active org header */}
      <div className="bento-card spotlight-card p-3">
        <span className="eyebrow">Active Organization</span>
        <h2 className="mt-1 text-base font-heading font-bold tracking-tight text-white leading-tight">
          {activeOrg.name}
        </h2>
        <p className="text-[11px] text-white/45 mt-0.5">
          You're operating as{" "}
          <span className="text-sky-300 font-semibold">{activeOrg.role}</span>.{" "}
          {activeOrg.kind === "personal"
            ? "Personal organizations are single-user; create a team org to invite members."
            : "Invite teammates to collaborate on stores, bots, and workflows."}
        </p>
      </div>

      {/* Invite form (owner/admin only) */}
      {isAdminOrOwner && activeOrg.kind === "team" && (
        <div className="bento-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-sky-400" aria-hidden="true" />
            <h3 className="text-sm font-heading font-bold tracking-tight text-white">Invite by email</h3>
          </div>
          <p className="text-xs text-white/45 mb-4 leading-relaxed">
            We'll email a branded invite link via SendGrid. The recipient signs in (or signs up), accepts, and lands inside this organization automatically.
          </p>
          <div className="flex flex-col md:flex-row gap-2">
            <Input
              type="email"
              placeholder="alice@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              className="flex-1 bg-white/[0.03] border-white/10 text-white"
              disabled={inviteMutation.isPending}
              maxLength={320}
            />
            <Select value={role} onValueChange={(v) => setRole(v as "admin" | "member")} disabled={inviteMutation.isPending}>
              <SelectTrigger className="w-full md:w-32 bg-white/[0.03] border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-surface-overlay border-white/10">
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleInvite}
              disabled={inviteMutation.isPending || !email.trim()}
              className="bg-sky-500 hover:bg-sky-600 text-white"
            >
              {inviteMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send invite"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Pending invitations */}
      {isAdminOrOwner && pendingQuery.data && pendingQuery.data.length > 0 && (
        <div className="bento-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <h3 className="text-sm font-heading font-bold tracking-tight text-white">
              Pending invitations
              <span className="ml-2 text-[10px] font-mono text-white/40">
                {pendingQuery.data.filter((i: any) => !i.acceptedAt).length} active
              </span>
            </h3>
          </div>
          <div className="space-y-2">
            {pendingQuery.data
              .filter((inv: any) => !inv.acceptedAt)
              .map((inv: any) => {
                const expires = new Date(inv.expiresAt);
                const expired = expires.getTime() < Date.now();
                const acceptUrl = `${window.location.origin}/invite/${inv.token}`;
                return (
                  <div
                    key={inv.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02]"
                  >
                    <Mail className="w-3.5 h-3.5 text-white/40 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white truncate">{inv.email}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${ROLE_BADGE[inv.role as Role]}`}
                        >
                          {inv.role}
                        </span>
                        <span className="text-[10px] text-white/40 font-mono">
                          {expired ? (
                            <span className="text-red-400">Expired {expires.toLocaleDateString()}</span>
                          ) : (
                            <>Expires {expires.toLocaleDateString()}</>
                          )}
                        </span>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleCopy(acceptUrl)}
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-white/10 text-white/65 hover:border-sky-400/30 hover:text-sky-300"
                    >
                      <Copy className="w-3 h-3 mr-1.5" aria-hidden="true" />
                      Copy link
                    </Button>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Members roster */}
      <div className="bento-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-sky-400" aria-hidden="true" />
          <h3 className="text-sm font-heading font-bold tracking-tight text-white">
            Members
            {membersQuery.data && (
              <span className="ml-2 text-[10px] font-mono text-white/40">
                {membersQuery.data.length}
              </span>
            )}
          </h3>
        </div>

        {membersQuery.isLoading && (
          <div className="flex items-center gap-2 text-white/45 text-sm py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading members…
          </div>
        )}

        {membersQuery.error && (
          <div className="flex items-center gap-2 text-red-400 text-sm py-3 px-3 rounded-lg border border-red-500/20 bg-red-500/[0.05]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{membersQuery.error.message}</span>
          </div>
        )}

        {membersQuery.data && membersQuery.data.length > 0 && (
          <div className="space-y-2">
            {membersQuery.data.map((m: any) => {
              const RoleIcon = ROLE_ICON[m.role as Role] ?? UserIcon;
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02]"
                >
                  <div className="brand-mark shrink-0" style={{ width: "2rem", height: "2rem" }}>
                    <span className="text-[11px] font-bold text-white">
                      {(m.userName ?? m.userEmail ?? "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white truncate">
                      {m.userName ?? m.userEmail ?? `User ${m.userId}`}
                    </div>
                    <div className="text-[11px] text-white/40 font-mono truncate">
                      {m.userEmail ?? "—"}
                    </div>
                  </div>
                  <span
                    className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${ROLE_BADGE[m.role as Role]}`}
                  >
                    <RoleIcon className="w-3 h-3" aria-hidden="true" />
                    {m.role}
                  </span>
                  {m.joinedAt && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/70 shrink-0" aria-label="Active member" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
