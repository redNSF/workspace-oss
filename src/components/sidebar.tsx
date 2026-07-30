"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Home,
  Inbox,
  LayoutDashboard,
  Plus,
  Settings,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import type { WorkspaceWithBoards, Profile } from "@/types/database";
import { getActivityStatusMeta } from "@/lib/profile-customization";
import { CreateWorkspaceModal } from "./modals/create-workspace-modal";
import { CreateBoardModal } from "./modals/create-board-modal";
import { NotificationsDropdown } from "./notifications-dropdown";
import { useSearchStore } from "@/store/search-store";
import { useSidebarStore } from "@/store/sidebar-store";
import { AuthSplash } from "./auth-splash";
import { AppLogo } from "./app-logo";

function ProfileAvatar({ profile, initials, collapsed }: { profile: Profile | null; initials: string; collapsed: boolean }) {
  const status = getActivityStatusMeta(profile?.activity_status);

  return (
    <div className="relative h-8 w-8 shrink-0">
      {profile?.avatar_url ? (
        // Profile pictures may be data URLs or operator-configured remote URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatar_url}
          alt={profile.full_name ? `${profile.full_name} profile picture` : "Profile picture"}
          className="h-8 w-8 rounded-full object-cover border border-white/10 shadow-md"
          title={collapsed ? profile?.full_name || "User" : undefined}
        />
      ) : (
        <div
          className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-md"
          title={collapsed ? profile?.full_name || "User" : undefined}
        >
          {initials}
        </div>
      )}
      {status.value !== "active" && (
        <span className={cn("absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-[#141414]", status.dotClass)} title={status.label} />
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [workspaces, setWorkspaces] = useState<WorkspaceWithBoards[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [createBoardForWorkspace, setCreateBoardForWorkspace] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showGoodbye, setShowGoodbye] = useState(false);
  const [showHello, setShowHello] = useState(false);
  const refresh = () => setRefreshKey((k) => k + 1);

  const handleSignOut = async () => {
    setShowGoodbye(true);
    const supabase = createClient();
    
    // Delay to show splash
    setTimeout(async () => {
      await supabase.auth.signOut();
      router.push("/login");
    }, 2000);
  };

  const { isCollapsed, toggleSidebar, setCollapsed } = useSidebarStore();
  const { openSearch } = useSearchStore();

  useEffect(() => {
    if (mounted) {
      const hasSeenHello = sessionStorage.getItem("hasSeenHello");
      if (!hasSeenHello) {
        setShowHello(true);
        sessionStorage.setItem("hasSeenHello", "true");
        setTimeout(() => setShowHello(false), 2500); // Wait for animation
      }
    }
  }, [mounted]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setCollapsed(true);
      }
    };
    window.addEventListener("resize", handleResize);
    // Initial check
    if (typeof window !== "undefined") {
      handleResize();
    }
    return () => window.removeEventListener("resize", handleResize);
  }, [setCollapsed]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled && profileData) setProfile(profileData as Profile);

      // RLS is the canonical visibility filter for both workspaces and their
      // nested boards. Keep empty authorized workspaces visible so members with
      // create permission can add their first board.
      const { data: workspaceData } = await supabase
        .from("workspaces")
        .select("*, boards(*)")
        .order("created_at", { ascending: true });

      if (!cancelled && workspaceData) {
        setWorkspaces(workspaceData as WorkspaceWithBoards[]);
        setExpandedWorkspaces(new Set(workspaceData.map((w) => w.id)));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const toggleWorkspace = (id: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const { can } = usePermissions();
  const isAdmin = profile?.role === 'admin';
  
  const canSeeSettings = true;
  const canSeeWorkspaces = workspaces.length > 0 || isAdmin || can("create_boards") || can("create_items");

  if (showGoodbye) {
    return <AuthSplash type="goodbye" userName={profile?.full_name || undefined} />;
  }

  return (
    <>
      {showHello && <AuthSplash type="hello" userName={profile?.full_name || undefined} />}
      <motion.aside
        initial={false}
        animate={{ width: mounted ? (isCollapsed ? 64 : 240) : 240 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed left-0 top-0 bottom-0 bg-[#141414] text-white/40 flex flex-col z-40 border-r border-white/[0.05]"
      >
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-5 w-6 h-6 bg-[#222222] border border-white/10 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-[#333333] transition-colors z-50 shadow-md"
        >
          {isCollapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
        </button>

        <div className="h-14 flex items-center shrink-0 border-b border-white/[0.04] overflow-hidden px-3">
          {isCollapsed ? (
            <AppLogo iconOnly height={30} />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center"
            >
              <AppLogo height={32} />
            </motion.div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar overflow-x-hidden flex flex-col">
          <nav className="flex flex-col gap-0.5 px-2.5 mt-3">
            <button
              onClick={openSearch}
              title={isCollapsed ? "Search (⌘K)" : undefined}
              className={cn(
                "flex items-center justify-between py-1.5 rounded-md transition-all text-[13px] font-medium text-white/40 hover:bg-white/[0.05] hover:text-white/80 group",
                isCollapsed ? "px-0 justify-center" : "px-2.5"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Search size={14} className={isCollapsed ? "mx-auto" : ""} />
                {!isCollapsed && <span>Search</span>}
              </div>
              {!isCollapsed && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <kbd className="px-1 py-[1px] rounded bg-white/[0.05] border border-white/[0.05] text-[9px] font-sans text-white/40">⌘K</kbd>
                </div>
              )}
            </button>
            <Link
              href="/dashboard"
              title={isCollapsed ? "Home" : undefined}
              className={cn(
                "flex items-center py-1.5 rounded-md transition-all text-[13px] font-medium",
                isCollapsed ? "justify-center" : "gap-2.5 px-2.5",
                mounted && pathname === "/dashboard"
                  ? "bg-white/[0.07] text-white"
                  : "text-white/40 hover:bg-white/[0.05] hover:text-white/80"
              )}
            >
              <Home size={14} />
              {!isCollapsed && <span>Home</span>}
            </Link>
            <Link
              href="/dashboard/my-work"
              title={isCollapsed ? "My Work" : undefined}
              className={cn(
                "flex items-center py-1.5 rounded-md transition-all text-[13px] font-medium",
                isCollapsed ? "justify-center" : "gap-2.5 px-2.5",
                mounted && pathname === "/dashboard/my-work"
                  ? "bg-white/[0.07] text-white"
                  : "text-white/40 hover:bg-white/[0.05] hover:text-white/80"
              )}
            >
              <LayoutDashboard size={14} />
              {!isCollapsed && <span>My Work</span>}
            </Link>
            <Link
              href="/inbox"
              title={isCollapsed ? "Inbox" : undefined}
              className={cn(
                "flex items-center py-1.5 rounded-md transition-all text-[13px] font-medium",
                isCollapsed ? "justify-center" : "gap-2.5 px-2.5",
                mounted && pathname === "/inbox"
                  ? "bg-white/[0.07] text-white"
                  : "text-white/40 hover:bg-white/[0.05] hover:text-white/80"
              )}
            >
              <Inbox size={14} />
              {!isCollapsed && <span>Inbox</span>}
            </Link>
          </nav>

          {canSeeWorkspaces && !isCollapsed && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-5 px-2.5 flex-1"
            >
              <div className="flex items-center justify-between px-1.5 mb-1.5 group">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/20 whitespace-nowrap">
                  Workspaces
                </span>
                <button
                  onClick={() => setShowCreateWorkspace(true)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/[0.07] rounded-md transition-all text-white/30 hover:text-white/70"
                  title="New Workspace"
                >
                  <Plus size={12} />
                </button>
              </div>

              <div className="flex flex-col gap-0.5">
                {workspaces.length === 0 && (
                  <button
                    onClick={() => setShowCreateWorkspace(true)}
                    className="text-[12px] text-white/20 hover:text-white/50 px-1.5 py-2 text-left transition-colors whitespace-nowrap overflow-hidden text-ellipsis"
                  >
                    + Create your first workspace
                  </button>
                )}
                {workspaces.map((workspace) => {
                  const isExpanded = expandedWorkspaces.has(workspace.id);
                  return (
                    <div key={workspace.id} className="flex flex-col">
                      <div className="flex items-center gap-1 px-1 py-1 rounded-md hover:bg-white/[0.05] cursor-pointer transition-colors group/workspace">
                        <button
                          onClick={() => toggleWorkspace(workspace.id)}
                          className="text-white/20 hover:text-white/60 p-0.5 rounded transition-colors shrink-0"
                        >
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                        <span
                          className="text-[13px] font-medium truncate flex-1 text-white/40 group-hover/workspace:text-white/80 transition-colors"
                          onClick={() => toggleWorkspace(workspace.id)}
                        >
                          {workspace.name}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCreateBoardForWorkspace(workspace.id);
                          }}
                          className="opacity-0 group-hover/workspace:opacity-100 p-0.5 hover:bg-white/[0.07] rounded transition-all text-white/30 hover:text-white/70 shrink-0"
                          title="New Board"
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="pl-5 pr-1 flex flex-col gap-0.5 mt-0.5 mb-1">
                          {workspace.boards?.length === 0 && (
                            <span className="text-[11px] text-white/15 px-2 py-1 whitespace-nowrap">No boards yet</span>
                          )}
                          {workspace.boards?.map((board) => {
                            const isActive = mounted && pathname === `/board/${board.id}`;
                            return (
                              <Link
                                key={board.id}
                                href={`/board/${board.id}`}
                                className={cn(
                                  "flex items-center gap-2 px-2 py-1.5 rounded-md transition-all text-[13px]",
                                  isActive
                                    ? "bg-white/[0.08] text-white"
                                    : "text-white/35 hover:bg-white/[0.05] hover:text-white/75"
                                )}
                              >
                                <div
                                  className="w-2 h-2 rounded-sm shrink-0 opacity-90"
                                  style={{ backgroundColor: board.color ?? "#555" }}
                                />
                                <span className="truncate">{board.name}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {!canSeeWorkspaces && !isCollapsed && <div className="flex-1" />}
        </div>

        {/* Bottom bar */}
        <div className="mt-auto p-2.5 shrink-0 border-t border-white/[0.04]">
          {canSeeSettings && (
            <Link
              href="/settings"
              title={isCollapsed ? "Settings" : undefined}
              className={cn(
                "flex items-center py-1.5 rounded-md transition-all text-[13px] font-medium mb-1",
                isCollapsed ? "justify-center" : "gap-2.5 px-2.5",
                mounted && pathname === "/settings"
                  ? "bg-white/[0.07] text-white"
                  : "text-white/35 hover:bg-white/[0.05] hover:text-white/70"
              )}
            >
              <Settings size={14} />
              {!isCollapsed && <span>Settings</span>}
            </Link>
          )}

          <div className={cn("flex items-center gap-2 group", isCollapsed ? "justify-center flex-col" : "")}>
            <div className={cn("flex items-center rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer min-w-0", isCollapsed ? "p-1 justify-center" : "flex-1 gap-2.5 px-2 py-2")}>
              <ProfileAvatar profile={profile} initials={initials} collapsed={isCollapsed} />
              {!isCollapsed && (
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[13px] font-semibold text-white/80 group-hover:text-white truncate transition-colors">
                    {profile?.full_name ?? "User"}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-white/25 uppercase tracking-wider truncate">
                    <span className={cn("h-1.5 w-1.5 rounded-full", getActivityStatusMeta(profile?.activity_status).dotClass)} />
                    {getActivityStatusMeta(profile?.activity_status).label}
                  </span>
                </div>
              )}
            </div>
            
            {!isCollapsed && <NotificationsDropdown />}

            <button
              onClick={handleSignOut}
              title="Sign out"
              className="p-2 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Modals */}
      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onClose={() => setShowCreateWorkspace(false)}
          onSuccess={refresh}
        />
      )}
      {createBoardForWorkspace && (
        <CreateBoardModal
          workspaceId={createBoardForWorkspace}
          onClose={() => setCreateBoardForWorkspace(null)}
          onSuccess={refresh}
        />
      )}
    </>
  );
}
