"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { upsertCellValue } from "@/lib/supabase/upsert-cell";
import { logActivity } from "@/lib/notifications";
import { createAssignmentNotification } from "@/app/actions/notifications";
import { motion, AnimatePresence } from "framer-motion";
import { Check, User, X, Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getActivityStatusMeta } from "@/lib/profile-customization";

// Module-level cache so profiles are shared and survive open/close cycles.
let _profilesCache: Profile[] = [];
let _profilesFetchedAt = 0;

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  activity_status?: string | null;
  email?: string | null;
}

interface PersonCellProps {
  itemId: string;
  boardId: string;
  columnId: string;
  value: string | null; // JSON stringified array ["id1", "id2"]
  onSaved?: (itemId: string, columnId: string, value: string | null) => void;
  variant?: "cell" | "detail";
}

const PANEL_W = 256; // w-64
const PANEL_H = 350;

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function PersonAvatar({ profile, size = "md", className }: { profile: Profile; size?: "sm" | "md"; className?: string }) {
  const status = getActivityStatusMeta(profile.activity_status);
  const sizeClass = size === "sm" ? "w-5 h-5 text-[9px]" : "w-8 h-8 text-[11px]";
  const dotClass = size === "sm" ? "w-1.5 h-1.5" : "w-2.5 h-2.5";

  return (
    <div className={cn("relative shrink-0", sizeClass, className)}>
      {profile.avatar_url ? (
        // Profile pictures may be data URLs or operator-configured remote URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatar_url}
          alt={profile.full_name ? `${profile.full_name} profile picture` : "Profile picture"}
          className="h-full w-full rounded-full object-cover border border-white/10"
        />
      ) : (
        <div className="h-full w-full rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white border border-white/10">
          {initials(profile.full_name)}
        </div>
      )}
      {status.value !== "active" && (
        <span className={cn("absolute bottom-0 right-0 rounded-full border border-[#1a1a1a]", dotClass, status.dotClass)} title={status.label} />
      )}
    </div>
  );
}

export function PersonCell({ itemId, boardId, columnId, value: propValue, onSaved, variant = "cell" }: PersonCellProps) {
  const parseValue = (val: string | null): string[] => {
    if (!val) return [];
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [val];
    } catch {
      return val ? [val] : [];
    }
  };

  const [selectedIds, setSelectedIds] = useState<string[]>(parseValue(propValue));
  const [profiles, setProfiles] = useState<Profile[]>(_profilesCache);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSelectedIds(parseValue(propValue)); }, [propValue]);

  const fetchProfiles = useCallback(async (force = false) => {
    if (!force && _profilesCache.length > 0 && Date.now() - _profilesFetchedAt < 60_000) {
      setProfiles(_profilesCache);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("full_name", { ascending: true });
    if (!error && data) {
      _profilesCache = data as Profile[];
      _profilesFetchedAt = Date.now();
      setProfiles(_profilesCache);
    }
    setLoading(false);
  }, []);

  // Eager fetch on mount so avatars render immediately without opening dropdown.
  useEffect(() => { void fetchProfiles(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (open) { setOpen(false); return; }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const isUp = (window.innerHeight - rect.bottom) < PANEL_H && rect.top > PANEL_H;
    setPanelStyle({
      position: "fixed",
      left: rect.left,
      width: PANEL_W,
      zIndex: 99999,
      ...(isUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
    void fetchProfiles(true);
    setSearch("");
    setOpen(true);
  };

  // Click-outside — checks both trigger and portal panel
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const saveToSupabase = async (ids: string[]) => {
    if (!itemId || !columnId) {
      console.error("Missing itemId or columnId for person-cell upsert");
      return;
    }
    const supabase = createClient();
    const stringifiedValue = ids.length > 0 ? JSON.stringify(ids) : null;
    const prevIds = parseValue(propValue);
    const newIds = ids.filter((id) => !prevIds.includes(id));

    const { error } = await upsertCellValue(supabase, itemId, columnId, stringifiedValue);

    if (!error) {
      if (newIds.length > 0) {
        const newNames = profiles.filter((p) => newIds.includes(p.id)).map((p) => p.full_name).join(", ");
        logActivity({ boardId, itemId, action: `assigned ${newNames || "new members"}`, details: { assigned: newIds } });
        await Promise.all(
          newIds.map((uid) =>
            createAssignmentNotification({ userId: uid, itemId, boardId })
          )
        );
      }
      onSaved?.(itemId, columnId, stringifiedValue);
    } else {
      setSelectedIds(parseValue(propValue));
    }
  };

  const togglePerson = (personId: string) => {
    const nextIds = selectedIds.includes(personId)
      ? selectedIds.filter((id) => id !== personId)
      : [...selectedIds, personId];
    setSelectedIds(nextIds);
    saveToSupabase(nextIds);
  };

  const clearAll = () => { setSelectedIds([]); saveToSupabase([]); };

  const displayProfiles = selectedIds.map((id) =>
    profiles.find((p) => p.id === id) || { id, full_name: "...", avatar_url: null, activity_status: "offline" }
  );
  const filteredProfiles = profiles.filter((p) =>
    p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase())
  );

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const dropdownPanel = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.95, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -6 }}
          style={{ ...panelStyle, backdropFilter: "blur(24px)" }}
          className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-[0_20px_50px_-12px_rgba(0,0,0,1)] flex flex-col overflow-hidden"
        >
          {/* Search */}
          <div className="p-2 border-b border-white/[0.06] flex items-center gap-2">
            <Search size={13} className="text-white/30 ml-1" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people..."
              className="bg-transparent border-none outline-none text-[12px] text-white w-full placeholder:text-white/20 py-1"
            />
          </div>

          <div className="max-h-[280px] overflow-y-auto p-1 custom-scrollbar">
            <button
              onClick={clearAll}
              className="w-full flex items-center gap-3 px-2 py-2 text-left hover:bg-white/[0.06] transition-all group/item rounded-lg"
            >
              <div className="w-8 h-8 rounded-full border border-dashed border-white/20 flex items-center justify-center shrink-0 group-hover/item:border-white/40">
                <X size={14} className="text-white/40 group-hover/item:text-white/60" />
              </div>
              <span className="text-white/40 font-medium text-[12px] group-hover/item:text-white/60">Clear All</span>
            </button>

            <div className="h-px bg-white/[0.06] my-1 mx-2" />

            {loading && (
              <div className="p-4 text-center text-[12px] text-white/20 animate-pulse">Loading people...</div>
            )}

            {!loading && filteredProfiles.map((p) => (
              <button
                key={p.id}
                onClick={() => togglePerson(p.id)}
                className="w-full flex items-center gap-3 px-2 py-2 text-left hover:bg-white/[0.06] transition-all group/item rounded-lg"
              >
                <PersonAvatar profile={p} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-white/80 group-hover/item:text-white truncate">{p.full_name}</div>
                  <div className="text-[10px] text-white/30 group-hover/item:text-white/50 truncate">
                    {getActivityStatusMeta(p.activity_status).label}{p.email ? ` - ${p.email}` : ""}
                  </div>
                </div>
                {selectedIds.includes(p.id) && <Check size={14} className="text-indigo-400 shrink-0 mr-1" />}
              </button>
            ))}

            {!loading && filteredProfiles.length === 0 && (
              <div className="p-8 text-center text-[12px] text-white/20">No people found</div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <div ref={triggerRef} className="relative flex items-center h-full w-full">
        {variant === "cell" ? (
          <button
            type="button"
            onClick={handleToggleMenu}
            className="w-full h-full flex items-center justify-center px-2 transition-all hover:bg-white/[0.02] active:scale-[0.98] focus:outline-none select-none group/btn overflow-visible"
          >
            {displayProfiles.length > 0 ? (
              <div className="isolate flex -space-x-2 overflow-visible items-center px-1 py-1">
                {displayProfiles.slice(0, 3).map((p, i) => (
                  <div
                    key={p.id}
                    className="relative w-6 h-6 shrink-0"
                    title={p.full_name || ""}
                    style={{ zIndex: 3 - i }}
                  >
                    {p.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatar_url} alt="" className="h-full w-full rounded-full object-cover border border-[var(--avatar-stack-ring)] ring-1 ring-[var(--avatar-stack-ring)] shadow-sm" />
                    ) : (
                      <div className="h-full w-full rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-[var(--avatar-stack-foreground)] border border-[var(--avatar-stack-ring)] ring-1 ring-[var(--avatar-stack-ring)] shadow-sm">
                        {initials(p.full_name)}
                      </div>
                    )}
                    {getActivityStatusMeta(p.activity_status).value !== "active" && (
                      <span className={cn("absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full border border-[var(--avatar-stack-ring)]", getActivityStatusMeta(p.activity_status).dotClass)} />
                    )}
                  </div>
                ))}
                {displayProfiles.length > 3 && (
                  <div className="w-6 h-6 rounded-full bg-[#2a2a2a] flex items-center justify-center text-[10px] font-bold text-[var(--avatar-stack-muted)] shrink-0 border border-[var(--avatar-stack-ring)] ring-1 ring-[var(--avatar-stack-ring)] z-0">
                    +{displayProfiles.length - 3}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center w-6 h-6 rounded-full border border-dashed border-white/10 text-white/10 group-hover/btn:border-white/20 group-hover/btn:text-white/30 transition-colors">
                <User size={12} />
              </div>
            )}
          </button>
        ) : (
          <div className="flex flex-col gap-2 w-full py-1">
            <div className="flex flex-wrap gap-1.5">
              {displayProfiles.map((p) => (
                <div key={p.id} className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] group/pill">
                  <PersonAvatar profile={p} size="sm" />
                  <span className="text-[12px] text-white/80 font-medium">{p.full_name}</span>
                  <button onClick={() => togglePerson(p.id)} className="p-0.5 rounded-full hover:bg-white/10 text-white/20 hover:text-white/60 transition-colors">
                    <X size={10} />
                  </button>
                </div>
              ))}
              <button
                onClick={handleToggleMenu}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border border-dashed border-white/20 text-white/30 hover:text-white/60 hover:border-white/40 hover:bg-white/[0.03] transition-all text-[12px]"
              >
                <Plus size={12} />
                Add Assignee
              </button>
            </div>
          </div>
        )}
      </div>

      {mounted && createPortal(dropdownPanel, document.body)}
    </>
  );
}
