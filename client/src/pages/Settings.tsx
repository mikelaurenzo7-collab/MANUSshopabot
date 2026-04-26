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

type SettingsTab = "profile" | "bots" | "platform";

function readTabFromHash(allowed: SettingsTab[]): SettingsTab {
  if (typeof window === "undefined") return "profile";
  const hash = window.location.hash.replace(/^#/, "") as SettingsTab;
  return allowed.includes(hash) ? hash : "profile";
}

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const allowed = useMemo<SettingsTab[]>(
    () => (isAdmin ? ["profile", "bots", "platform"] : ["profile", "bots"]),
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
    <div className="page-enter h-full overflow-y-auto">
      <div className="px-6 pt-6 pb-2 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
          <SettingsIcon className="h-5 w-5 text-white/70" />
        </div>
        <div>
          <h1 className="text-xl font-heading font-bold tracking-tight text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Profile, bot configuration{isAdmin ? ", and platform health" : ""}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="px-6 pt-2">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="bots">Bot Settings</TabsTrigger>
          {isAdmin && <TabsTrigger value="platform">Platform Health</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfilePage />
        </TabsContent>
        <TabsContent value="bots" className="mt-4">
          <BotSettingsPage />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="platform" className="mt-4">
            <PlatformHealthPage />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
