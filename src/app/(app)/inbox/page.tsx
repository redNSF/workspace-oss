"use client";

import { useState, useEffect } from "react";
import { 
  Bell, 
  Check, 
  Calendar, 
  User, 
  MessageSquare, 
  AlertCircle, 
  Search,
  Filter,
  CheckCircle2,
  Trash2,
  Loader2
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import type { Notification } from "@/types/database";

export default function InboxPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");
  const [search, setSearch] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const router = useRouter();

  useEffect(() => {
    async function fetchNotifications() {
      setLoading(true);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      if (data) setNotifications(data as Notification[]);
      setLoading(false);
    }

    fetchNotifications();
  }, []);

  async function markAsRead(id: string, link: string) {
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", id);
    
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    if (link) router.push(link);
  }

  async function markAllAsRead() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id);
    
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  const filtered = notifications
    .filter(n => activeTab === "all" || !n.read)
    .filter(n => 
      n.title.toLowerCase().includes(search.toLowerCase()) || 
      n.body.toLowerCase().includes(search.toLowerCase())
    );

  const getIcon = (type: string) => {
    switch (type) {
      case "assignment": return <User className="text-blue-400" size={18} />;
      case "comment": return <MessageSquare className="text-emerald-400" size={18} />;
      case "status_change": return <AlertCircle className="text-amber-400" size={18} />;
      default: return <Bell className="text-indigo-400" size={18} />;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0f0f0f]">
      {/* Header */}
      <div className="px-10 py-8 border-b border-white/[0.04] bg-[#111111]">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Bell className="text-indigo-400" size={28} />
              Inbox
            </h1>
            <p className="text-white/40 text-sm mt-1">
              Stay updated with your latest activities and assignments.
            </p>
          </div>
          
          <button 
            onClick={markAllAsRead}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-xs font-bold text-white/60 hover:text-white hover:bg-white/[0.08] transition-all uppercase tracking-widest"
          >
            <CheckCircle2 size={14} />
            Mark all as read
          </button>
        </div>

        {/* Tabs & Search */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center p-1 bg-white/[0.03] rounded-xl border border-white/[0.05]">
            <button
              onClick={() => setActiveTab("all")}
              className={cn(
                "px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                activeTab === "all" ? "bg-white/[0.08] text-white shadow-lg" : "text-white/30 hover:text-white/50"
              )}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab("unread")}
              className={cn(
                "px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2",
                activeTab === "unread" ? "bg-white/[0.08] text-white shadow-lg" : "text-white/30 hover:text-white/50"
              )}
            >
              Unread
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
              )}
            </button>
          </div>

          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications..."
              className="w-full bg-[#161616] border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-10 py-8 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Loader2 className="animate-spin text-indigo-500" size={32} />
            <p className="text-white/20 text-sm font-medium">Fetching your notifications...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 text-center">
            <div className="w-20 h-20 rounded-full bg-white/[0.02] flex items-center justify-center mb-6 border border-dashed border-white/10">
              <Bell className="text-white/10" size={40} />
            </div>
            <h3 className="text-white/60 font-semibold text-lg">Your inbox is empty</h3>
            <p className="text-white/20 text-sm mt-1 max-w-xs mx-auto">
              {activeTab === "unread" 
                ? "You don't have any unread notifications right now." 
                : "When you get assignments or comments, they'll show up here."}
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl">
            {filtered.map((n) => (
              <div
                key={n.id}
                onClick={() => markAsRead(n.id, n.link)}
                className={cn(
                  "group relative p-5 rounded-2xl border transition-all cursor-pointer flex gap-5",
                  n.read 
                    ? "bg-[#161616]/50 border-white/[0.04] hover:bg-[#1a1a1a]" 
                    : "bg-indigo-500/[0.03] border-indigo-500/10 hover:bg-indigo-500/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.2)]"
                )}
              >
                {!n.read && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-indigo-500 rounded-r-full" />
                )}
                
                <div className="w-12 h-12 rounded-2xl bg-white/[0.04] flex items-center justify-center shrink-0 border border-white/[0.06] group-hover:scale-105 transition-transform">
                  {getIcon(n.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className={cn("text-[15px] font-bold tracking-tight", n.read ? "text-white/70" : "text-white")}>
                      {n.title}
                    </h4>
                    <span className="text-[11px] font-medium text-white/15 flex items-center gap-1.5 whitespace-nowrap">
                      <Calendar size={12} />
                      {mounted ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true }) : "just now"}
                    </span>
                  </div>
                  <p className="text-[13px] text-white/40 leading-relaxed mb-3 group-hover:text-white/50 transition-colors">
                    {n.body}
                  </p>
                  <div className="flex items-center gap-2">
                     <span className="text-[10px] font-bold text-indigo-400/80 uppercase tracking-widest group-hover:text-indigo-400 transition-colors">
                        View Item
                     </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
