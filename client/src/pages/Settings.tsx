/**
 * Settings.tsx — Unified settings surface.
 *
 * Merges Profile + Bot Settings + Platform Health (admin-gated) as tabs.
 * Legacy /profile, /bot-settings, /health deep-links still resolve.
 */

import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import ProfilePage from "./Profile";
import BotSettingsPage from "./BotSettings";
import PlatformHealthPage from "./PlatformHealth";
import MembersPage from "./Members";

type SettingsTab = "profile" | "members" | "bots" | "platform";

function readTabFromHash(allowed: SettingsTab[]): SettingsTab {
  if (typeof window === "undefined") return "profile";
  const hash = window.location.hash.replace(/^#/, "") as SettingsTab;
  return allowed.includes(hash) ? hash : "profile";
}

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const allowed = useMemo<SettingsTab[]>(
    () => (isAdmin
      ? ["profile", "members", "bots", "platform"]
      : ["profile", "members", "bots"]),
    [isAdmin],
  );

  const [tab, setTab] = useState<SettingsTab>(() => readTabFromHash(allowed));

  useEffect(() => {
    const onHash = () => setTab(readTabFromHash(allowed));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [allowed]);

  // If a non-admin lands on #platform, drop them back to profile.
  useEffect(() => {
    if (!allowed.includes(tab)) setTab("profile");
  }, [allowed, tab]);

  const handleTabChange = (value: string) => {
    const next = (allowed.includes(value as SettingsTab) ? value : "profile") as SettingsTab;
    setTab(next);
    if (typeof window !== "undefined") {
      const { pathname, search } = window.location;
      window.history.replaceState(null, "", `${pathname}${search}#${next}`);
    }
  };

  return (
    <div className="page-enter h-full overflow-y-auto relative">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.04),transparent_30%),radial-gradient(circle_at_10%_50%,rgba(168,85,247,0.03),transparent_25%)]" />

      {/* Header */}
      <div className="relative px-5 pt-4 pb-1.5 flex items-center gap-2.5">
        <div className="relative">
          <div className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shadow-[0_0_10px_rgba(14,165,233,0.06)]">
            <SettingsIcon className="h-4 w-4 text-sky-400" />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 border-2 border-[#050505]" />
        </div>
        <div>
          <h1 className="text-lg font-heading font-bold tracking-tight text-white leading-tight">Settings</h1>
          <p className="text-xs text-white/35">Profile, bot configuration{isAdmin ? ", and platform health" : ""}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="px-5 pt-1.5 relative">
        <TabsList className="bg-white/[0.03] border border-white/[0.06] p-1">
          <TabsTrigger value="profile" className="data-[state=active]:bg-sky-500/15 data-[state=active]:text-sky-300 data-[state=active]:border-sky-500/20 border border-transparent text-white/50">Profile</TabsTrigger>
          <TabsTrigger value="members" className="data-[state=active]:bg-sky-500/15 data-[state=active]:text-sky-300 data-[state=active]:border-sky-500/20 border border-transparent text-white/50">Members</TabsTrigger>
          <TabsTrigger value="bots" className="data-[state=active]:bg-sky-500/15 data-[state=active]:text-sky-300 data-[state=active]:border-sky-500/20 border border-transparent text-white/50">Bot Settings</TabsTrigger>
          {isAdmin && <TabsTrigger value="platform" className="data-[state=active]:bg-sky-500/15 data-[state=active]:text-sky-300 data-[state=active]:border-sky-500/20 border border-transparent text-white/50">Platform Health</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile" className="mt-3">
          <ProfilePage />
        </TabsContent>
        <TabsContent value="members" className="mt-3">
          <MembersPage />
        </TabsContent>
        <TabsContent value="bots" className="mt-3">
          <BotSettingsPage />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="platform" className="mt-3">
            <PlatformHealthPage />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
