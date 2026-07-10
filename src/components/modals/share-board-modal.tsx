"use client";

import { useState, useEffect } from "react";
import { X, Search, Check, Shield, UserPlus, ShieldAlert, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Profile, BoardAccess } from "@/types/database";

interface ShareBoardModalProps {
  boardId: string;
  boardName: string;
  onClose: () => void;
}

interface ProfileWithAccess extends Profile {
  email: string;
  access?: BoardAccess;
}

export function ShareBoardModal({ boardId, boardName, onClose }: ShareBoardModalProps) {
  const [profiles, setProfiles] = useState<ProfileWithAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      
      // Fetch all profiles
      const { data: profileData, error: pError } = await supabase
        .from("profiles")
        .select("*")
        .order("full_name", { ascending: true });

      if (pError) {
        console.error("Error fetching profiles:", pError);
        setLoading(false);
        return;
      }

      // Fetch existing board access
      const { data: accessData, error: aError } = await supabase
        .from("board_access")
        .select("*")
        .eq("board_id", boardId);

      if (aError) {
        console.error("Error fetching access:", aError);
      }

      const merged = (profileData as any[]).map(p => ({
        ...p,
        access: accessData?.find(a => a.user_id === p.id)
      }));

      setProfiles(merged);
      setLoading(false);
    }
    void load();
  }, [boardId]);

  async function toggleAccess(userId: string, currentAccess?: BoardAccess) {
    setSavingId(userId);
    const supabase = createClient();

    if (currentAccess) {
      // Remove access
      const { error } = await supabase
        .from("board_access")
        .delete()
        .eq("id", currentAccess.id);

      if (!error) {
        setProfiles(prev => prev.map(p => 
          p.id === userId ? { ...p, access: undefined } : p
        ));
      }
    } else {
      // Add access
      const { data, error } = await supabase
        .from("board_access")
        .insert({
          board_id: boardId,
          user_id: userId,
          can_edit: false
        })
        .select()
        .single();

      if (!error && data) {
        setProfiles(prev => prev.map(p => 
          p.id === userId ? { ...p, access: data as BoardAccess } : p
        ));
      }
    }
    setSavingId(null);
  }

  async function toggleEdit(userId: string, access: BoardAccess) {
    setSavingId(userId + "-edit");
    const supabase = createClient();
    const nextEdit = !access.can_edit;

    const { data, error } = await supabase
      .from("board_access")
      .update({ can_edit: nextEdit })
      .eq("id", access.id)
      .select()
      .single();

    if (!error && data) {
      setProfiles(prev => prev.map(p => 
        p.id === userId ? { ...p, access: data as BoardAccess } : p
      ));
    }
    setSavingId(null);
  }

  const filtered = profiles.filter(p => 
    p.full_name?.toLowerCase().includes(search.toLowerCase()) || 
    p.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={onClose} 
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <UserPlus size={20} className="text-indigo-400" />
              Share Board
            </h2>
            <p className="text-white/40 text-xs mt-1">Manage access for "{boardName}"</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-white/40 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-white/[0.06] bg-white/[0.02]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
            <input 
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full bg-[#121212] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50 transition-all shadow-inner"
            />
          </div>
        </div>

        {/* Members List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Loader2 className="animate-spin text-indigo-500" size={24} />
              <p className="text-white/20 text-sm">Loading team members...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center px-8">
              <p className="text-white/40 text-sm font-medium">No members found</p>
              <p className="text-white/20 text-xs mt-1">Check the spelling or invite them to the workspace</p>
            </div>
          ) : (
            filtered.map(p => (
              <div 
                key={p.id}
                className={cn(
                  "flex items-center gap-4 px-4 py-3 rounded-xl transition-all border border-transparent",
                  p.access ? "bg-indigo-500/5 border-indigo-500/10" : "hover:bg-white/[0.03]"
                )}
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-lg ring-2 ring-[#1a1a1a]">
                  {p.full_name?.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() || "?"}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-white/90 truncate">{p.full_name}</span>
                    {p.role === 'admin' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold uppercase tracking-wider">Admin</span>
                    )}
                  </div>
                  <p className="text-[12px] text-white/30 truncate">{p.email}</p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3 shrink-0">
                  {p.access && (
                    <div className="flex items-center gap-2 mr-2">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <div 
                          onClick={() => toggleEdit(p.id, p.access!)}
                          className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center transition-all",
                            p.access.can_edit 
                              ? "bg-indigo-500 border-indigo-500 text-white" 
                              : "border-white/20 bg-transparent group-hover:border-white/40"
                          )}
                        >
                          {p.access.can_edit && <Check size={10} strokeWidth={4} />}
                        </div>
                        <span className="text-[11px] font-bold text-white/40 group-hover:text-white/60 uppercase tracking-widest transition-colors">Edit</span>
                      </label>
                    </div>
                  )}

                  <button
                    onClick={() => toggleAccess(p.id, p.access)}
                    disabled={savingId === p.id || p.role === 'admin'}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all",
                      p.role === 'admin' 
                        ? "bg-white/5 text-white/20 cursor-not-allowed"
                        : p.access 
                          ? "bg-indigo-500 text-white hover:bg-indigo-600 shadow-lg shadow-indigo-500/20" 
                          : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white border border-white/5"
                    )}
                  >
                    {savingId === p.id ? (
                      <Loader2 className="animate-spin" size={12} />
                    ) : p.role === 'admin' ? (
                      "Full Access"
                    ) : p.access ? (
                      "Shared"
                    ) : (
                      "Share"
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.06] bg-[#1a1a1a] flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
            <ShieldAlert size={16} className="text-amber-500" />
          </div>
          <p className="text-[11px] text-white/30 leading-snug">
            Admins always have full access. Shared members will only see this board if they are explicitly given access.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
