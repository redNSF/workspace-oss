"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Bell, User, MessageSquare, AlertCircle, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { useToastStore } from "@/lib/store/toast-store";
import type { Notification } from "@/types/database";

// Panel dimensions — keep in sync with the panel's actual width/height cap.
const PANEL_WIDTH = 320; // w-80

export function NotificationsDropdown() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  // Position of the panel (fixed, computed from the bell button's rect).
  const [panelPos, setPanelPos] = useState({ bottom: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // ── Data fetching ────────────────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (data) {
      setNotifications(data as Notification[]);
      setUnreadCount(data.filter((n) => !n.read).length);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      void fetchNotifications();
    }
  }, [userId, fetchNotifications]);

  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev]);
          setUnreadCount((prev) => prev + 1);

          const toastType = (["comment", "assignment", "status_change"].includes(newNotif.type)
            ? newNotif.type
            : "default") as import("@/lib/store/toast-store").ToastType;
          addToast({
            title: newNotif.title,
            body: newNotif.body,
            type: toastType,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, addToast]);

  // ── Open / close ─────────────────────────────────────────────────────────────
  const handleToggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    // Compute where to anchor the panel before opening.
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPanelPos({
        // Position above the bell button with a small gap.
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left,
      });
    }
    setOpen(true);
  };

  // Click-outside: close when clicking neither the button nor the portal panel.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function markAsRead(id: string, link: string) {
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    if (link) router.push(link);
    setOpen(false);
  }

  async function markAllAsRead() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  const getIcon = (type: string) => {
    switch (type) {
      case "assignment":    return <User className="text-blue-400" size={14} />;
      case "comment":       return <MessageSquare className="text-emerald-400" size={14} />;
      case "status_change": return <AlertCircle className="text-amber-400" size={14} />;
      default:              return <Bell className="text-indigo-400" size={14} />;
    }
  };

  // ── Portal panel ─────────────────────────────────────────────────────────────
  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ type: "spring", damping: 28, stiffness: 380 }}
          style={{
            position: "fixed",
            bottom: panelPos.bottom,
            left: panelPos.left,
            width: PANEL_WIDTH,
            zIndex: 99999,
          }}
          className="bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-[0_20px_60px_-12px_rgba(0,0,0,0.9)] overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.02]">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/60">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-wider transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="p-10 text-center">
                <Bell className="mx-auto text-white/5 mb-3" size={32} />
                <p className="text-xs text-white/20">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => markAsRead(n.id, n.link)}
                    className={cn(
                      "w-full p-4 text-left flex gap-3 transition-colors hover:bg-white/[0.03] group",
                      !n.read && "bg-indigo-500/[0.03]"
                    )}
                  >
                    <div className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center shrink-0 border border-white/[0.05]">
                      {getIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={cn("text-[13px] font-semibold truncate", n.read ? "text-white/60" : "text-white")}>
                          {n.title}
                        </span>
                        {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />}
                      </div>
                      <p className="text-[12px] text-white/30 line-clamp-2 leading-relaxed mb-1.5">
                        {n.body}
                      </p>
                      <span className="text-[10px] text-white/15 flex items-center gap-1">
                        <Calendar size={10} />
                        {mounted ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true }) : "just now"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <button
            onClick={() => { router.push("/inbox"); setOpen(false); }}
            className="w-full p-3 text-center border-t border-white/[0.06] text-[11px] font-bold text-white/40 hover:text-white transition-colors bg-white/[0.01]"
          >
            View all in Inbox
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {/* Bell trigger — stays in the sidebar DOM */}
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="relative p-2 rounded-lg hover:bg-white/[0.05] text-white/40 hover:text-white transition-all group"
      >
        <Bell size={18} className={cn(unreadCount > 0 && "animate-tada")} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#141414] shadow-sm ring-1 ring-red-500/20" />
        )}
      </button>

      {/* Portal — rendered into document.body, escapes any overflow:hidden ancestor */}
      {mounted && createPortal(panel, document.body)}
    </>
  );
}
