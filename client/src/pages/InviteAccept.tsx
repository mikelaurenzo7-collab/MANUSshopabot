/**
 * /invite/:token — invitation redemption page.
 *
 * The flow:
 *   1. Page loads with token in the URL.
 *   2. Calls `orgs.previewInvitation` to display the org name + role
 *      so the invitee sees what they're about to accept.
 *   3. If the user isn't authenticated, redirects to login with a
 *      returnPath that brings them back here after sign-in.
 *   4. On Accept click, calls `orgs.acceptInvite` which adds the
 *      membership and switches the active org. We redirect to / so
 *      the dashboard renders under the new tenant.
 *
 * Errors (expired, already-accepted, not-found) are surfaced inline
 * with a Retry / Back to dashboard fallback.
 */
import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Loader2, Building2, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandName } from "@/components/BrandName";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

const ROLE_DESCRIPTION: Record<string, string> = {
  admin: "Admin — manage stores, members, and bots. No billing access.",
  member: "Member — read access and run bots. No member management.",
};

export default function InviteAccept() {
  const [, params] = useRoute<{ token: string }>("/invite/:token");
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const token = params?.token ?? "";
  const [accepting, setAccepting] = useState(false);

  const previewQuery = trpc.orgs.previewInvitation.useQuery(
    { token },
    { enabled: !!token && !!user, retry: false },
  );
  const acceptMutation = trpc.orgs.acceptInvite.useMutation();

  // If unauthenticated, bounce to login with a returnPath that brings
  // them back to this exact URL after sign-in.
  useEffect(() => {
    if (authLoading) return;
    if (user) return;
    if (!token) return;
    const returnPath = `/invite/${token}`;
    window.location.href = `/manus-oauth/login?returnPath=${encodeURIComponent(returnPath)}`;
  }, [authLoading, user, token]);

  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    try {
      const result = await acceptMutation.mutateAsync({ token });
      toast.success(`Welcome to ${result.orgName}!`);
      // Hard reload so the OrgContext picks up the new active-org.
      window.location.href = "/";
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to accept invitation");
      setAccepting(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-surface-base text-white relative overflow-hidden grain">
      <div className="aurora-mesh" aria-hidden="true" />
      <div className="absolute inset-0 grid-bg-dense opacity-30 pointer-events-none" />
      <div className="light-leak-blue absolute -top-32 left-1/3 opacity-50" />

      <div className="relative max-w-md w-full mx-auto px-6 py-16 page-enter">
        <div className="flex justify-center mb-8">
          <BrandName size="lg" />
        </div>

        <div className="bento-card gradient-ring rounded-2xl p-8">
          {/* Loading state */}
          {(authLoading || previewQuery.isLoading) && (
            <div className="flex flex-col items-center text-center py-6">
              <Loader2 className="w-6 h-6 text-sky-400 animate-spin mb-4" aria-hidden="true" />
              <p className="text-sm text-white/60">Loading your invitation…</p>
            </div>
          )}

          {/* Error state */}
          {previewQuery.error && !previewQuery.isLoading && (
            <div className="flex flex-col items-center text-center py-2">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center mb-5">
                <AlertTriangle className="w-5 h-5 text-red-400" aria-hidden="true" />
              </div>
              <span className="eyebrow mb-3 text-red-400">Invitation problem</span>
              <h1 className="mt-2 text-xl font-heading font-bold text-white mb-3">
                We couldn't load this invitation
              </h1>
              <p className="text-sm text-white/55 leading-relaxed mb-6 max-w-sm">
                {previewQuery.error.message ||
                  "The link may have expired or already been used. Ask the inviter to send a new one."}
              </p>
              <Button
                onClick={() => setLocation("/")}
                variant="outline"
                className="border-white/10 text-white/75 hover:border-sky-400/40 hover:text-white"
              >
                Back to dashboard
              </Button>
            </div>
          )}

          {/* Preview + accept */}
          {previewQuery.data && !previewQuery.isLoading && (
            <div className="flex flex-col text-center">
              <div className="w-14 h-14 rounded-2xl bg-sky-500/12 border border-sky-500/25 flex items-center justify-center mx-auto mb-5 shadow-[0_0_24px_rgba(14,165,233,0.15)]">
                <Building2 className="w-6 h-6 text-sky-300" aria-hidden="true" />
              </div>
              <span className="eyebrow mb-3 mx-auto">You're invited</span>
              <h1 className="mt-2 text-2xl md:text-3xl font-heading font-black text-white tracking-tight">
                Join <span className="hero-title-shine">{previewQuery.data.orgName}</span>
              </h1>
              <p className="mt-3 text-sm text-white/55 leading-relaxed">
                You'll join as{" "}
                <span className="text-sky-300 font-semibold">{previewQuery.data.role}</span> and gain
                access to this organization's stores, bots, and workflows.
              </p>

              <div className="mt-6 mb-6 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-left">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1.5">
                  Your role
                </p>
                <p className="text-sm text-white/80 leading-relaxed">
                  {ROLE_DESCRIPTION[previewQuery.data.role] ?? "Standard access."}
                </p>
              </div>

              <Button
                onClick={handleAccept}
                disabled={accepting}
                size="lg"
                className="btn-glow text-white px-6 h-11 text-sm font-semibold disabled:opacity-70"
              >
                {accepting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Accepting…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Accept invitation
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>

              <p className="mt-4 text-xs text-white/35">
                Signing in as{" "}
                <span className="text-white/55 font-mono">{user?.email ?? "—"}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
