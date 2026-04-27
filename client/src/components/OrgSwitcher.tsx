/**
 * OrgSwitcher — sidebar pill showing the active organization with a
 * dropdown to switch between memberships or create a new team org.
 *
 * Lives at the very top of the nav so it's always one click away.
 * Switching invalidates the entire react-query cache (handled inside
 * `useOrg`) so all data refetches under the new tenant.
 */
import { useState } from "react";
import { Building2, Check, ChevronDown, Plus, Loader2 } from "lucide-react";
import { useOrg, type OrgRole } from "@/contexts/OrgContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

const ROLE_COLOR: Record<OrgRole, string> = {
  owner: "text-sky-300 bg-sky-500/12 border-sky-500/30",
  admin: "text-cyan-300 bg-cyan-500/12 border-cyan-500/30",
  member: "text-white/60 bg-white/[0.04] border-white/[0.08]",
};

export function OrgSwitcher() {
  const { orgs, activeOrg, setActiveOrg, createOrg, loading } = useOrg();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  if (loading && !activeOrg) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-white/[0.06] bg-white/[0.02]">
        <Loader2 className="w-3 h-3 text-white/40 shrink-0 animate-spin" />
        <span className="text-[11px] text-white/40">Loading orgs…</span>
      </div>
    );
  }

  if (!activeOrg) return null;

  async function handleSwitch(orgId: number) {
    try {
      await setActiveOrg(orgId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to switch org";
      toast.error(msg);
    }
  }

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await createOrg(trimmed);
      toast.success(`Switched to "${trimmed}"`);
      setCreateOpen(false);
      setNewName("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create organization";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md border border-white/[0.06] bg-gradient-to-r from-white/[0.04] to-white/[0.015] hover:from-white/[0.07] hover:to-white/[0.025] hover:border-sky-400/25 transition-all group"
            data-testid="org-switcher"
            aria-label="Switch organization"
          >
            <span className="w-5 h-5 rounded bg-sky-500/12 border border-sky-500/25 flex items-center justify-center shrink-0">
              <Building2 className="w-2.5 h-2.5 text-sky-300" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 text-[12px] font-semibold text-white/90 truncate text-left">
              {activeOrg.name}
            </span>
            <ChevronDown
              className="w-3 h-3 text-white/35 shrink-0 group-hover:text-sky-300 transition-colors"
              aria-hidden="true"
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64 bg-[#0a0a0f] border-white/10">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-white/40">
            Your organizations
          </DropdownMenuLabel>

          {orgs.length === 0 && (
            <div className="px-2 py-3 text-xs text-white/40">
              No organizations yet.
            </div>
          )}

          {orgs.map((org) => {
            const isActive = org.id === activeOrg.id;
            return (
              <DropdownMenuItem
                key={org.id}
                onSelect={() => !isActive && handleSwitch(org.id)}
                className={`flex items-center gap-2 ${isActive ? "bg-sky-500/10" : ""}`}
                data-testid={`org-switcher-item-${org.id}`}
              >
                <span className="w-6 h-6 rounded-md bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                  <Building2 className="w-3 h-3 text-sky-300" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-white/90 truncate">
                    {org.name}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${ROLE_COLOR[org.role]}`}
                    >
                      {ROLE_LABEL[org.role]}
                    </span>
                    {org.kind === "personal" && (
                      <span className="text-[9px] text-white/30">Personal</span>
                    )}
                  </div>
                </div>
                {isActive && <Check className="w-3.5 h-3.5 text-sky-300 shrink-0" aria-hidden="true" />}
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setCreateOpen(true);
            }}
            className="text-sky-300 focus:bg-sky-500/10"
          >
            <Plus className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
            <span className="text-xs font-semibold">Create team organization</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-[#0a0a0f] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-300" aria-hidden="true" />
              Create a new organization
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-xs text-white/55 leading-relaxed">
              Team orgs let you bring in additional members, separate stores
              from your personal account, and bill independently. You become
              the owner of the org you create.
            </p>
            <Input
              autoFocus
              placeholder="Acme Agency"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="bg-white/[0.04] border-white/10 text-white"
              maxLength={255}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
                className="text-white/60"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="bg-sky-500 hover:bg-sky-600 text-white"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
