import React, { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import {
  Database,
  LayoutDashboard,
  Settings,
  Workflow,
  Zap,
  Activity,
  Bot,
  Package,
  Megaphone,
  LogOut,
  FolderTree,
  FileCode2,
  Cpu,
  Globe
} from "lucide-react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  
  const navGroups = [
    {
      label: "Ontology Workspace",
      items: [
        { title: "Investigation Canvas", url: "/", icon: LayoutDashboard },
        { title: "Node Activity", url: "/activity", icon: Activity },
        { title: "Global Intel", url: "/intelligence", icon: Globe },
      ]
    },
    {
      label: "Processing Engines",
      items: [
        { title: "Builder Bot", url: "/architect", icon: Bot },
        { title: "Merchant Bot", url: "/merchant", icon: Package },
        { title: "Social Engine", url: "/social", icon: Megaphone },
      ]
    },
    {
      label: "System Data",
      items: [
        { title: "Workflows", url: "/workflows", icon: Workflow },
        { title: "Integrations", url: "/integrations", icon: Zap },
        { title: "System Output", url: "/orchestrator", icon: Cpu },
      ]
    }
  ];

  const handleLogout = () => {
    window.location.href = getLoginUrl() + "?action=logout";
  };

  // Skip rendering sidebar for layout wrapper routes if needed, 
  // but as an Enterprise OS, everything stays wrapped.
  
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#050505] text-[#e2e8f0] font-sans selection:bg-[#00ff41]/20">
      {/* LEFT: System Ontology Navbar */}
      <aside className="w-[260px] shrink-0 flex flex-col border-r border-[#1e293b] bg-[#050505] relative z-20 box-border">
        {/* Header */}
        <div className="h-14 flex items-center px-4 border-b border-[#1e293b]">
          <Database className="w-4 h-4 mr-2 text-[#00ff41]" />
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] font-bold text-white/90">
            System Interface
          </span>
        </div>
        
        {/* Nav Content */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar">
          {navGroups.map((group, i) => (
            <div key={i} className="mb-6">
              <div className="flex items-center gap-2 mb-2 px-2">
                <FolderTree className="w-3 h-3 text-white/30" />
                <span className="text-[11px] tracking-wide text-[#94a3b8] font-semibold">
                  {group.label}
                </span>
              </div>
              <div className="space-y-0.5 relative before:absolute before:left-3 before:top-1 before:bottom-1 before:w-px before:bg-[#1e293b]">
                {group.items.map((item) => {
                  const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
                  return (
                    <Link key={item.title} href={item.url}>
                      <a className={`flex items-center h-8 pl-7 pr-4 rounded-none border border-transparent transition-colors duration-200 relative group
                        ${isActive ? "bg-[#1e293b]/50 border-l-[#00ff41] !border-l-2 text-[#f8fafc]" : "hover:bg-[#1e293b]/10 text-[#94a3b8] hover:text-[#e2e8f0]"}
                      `}>
                        <div className="absolute left-3 top-1/2 -mt-px w-2 h-px bg-[#1e293b]" />
                        <item.icon className="w-3.5 h-3.5 mr-2 opacity-70 group-hover:opacity-100 transition-opacity" />
                        <span className="font-mono text-[10px] uppercase tracking-wider truncate">
                          {item.title}
                        </span>
                      </a>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer Auth */}
        <div className="mt-auto border-t border-[#1e293b] p-4 bg-[#050505]">
          <div className="flex items-center gap-3 px-3 py-2.5 mb-3 rounded-none bg-[#1e293b]/20 border border-[#1e293b]/50">
            <div className="w-7 h-7 rounded-none bg-[#1e293b] flex items-center justify-center shrink-0 border border-[#475569]">
              <span className="font-mono text-[10px] font-bold text-[#e2e8f0]">
                {user?.name?.charAt(0) || "U"}
              </span>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-mono text-[10px] text-white truncate">{user?.name}</span>
              <span className="text-[9px] font-mono text-white/40 truncate">L9_CLEARANCE</span>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center h-8 px-4 rounded-none border border-[#1e293b] hover:bg-red-500/10 hover:border-red-500/30 text-[#94a3b8] transition-colors group">
            <LogOut className="w-3.5 h-3.5 mr-2 opacity-70 group-hover:opacity-100 group-hover:text-red-400" />
            <span className="font-mono text-[10px] uppercase tracking-wider group-hover:text-red-400">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* CENTER & RIGHT Workspace */}
      <main className="flex-1 flex flex-col relative h-full min-w-0 bg-[#050505]">
        {children}
      </main>
      
      {/* Global CSS Overrides for scrollbar & selection */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 0; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}</style>
    </div>
  );
}
