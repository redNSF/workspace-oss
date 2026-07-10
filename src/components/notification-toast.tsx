"use client";

import { useToastStore, ToastType } from "@/lib/store/toast-store";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, User, Activity, Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";

function getToastStyles(type: ToastType) {
  switch (type) {
    case "comment":
      return { icon: <MessageSquare size={16} className="text-blue-400" />, border: "border-l-blue-400" };
    case "assignment":
      return { icon: <User size={16} className="text-green-400" />, border: "border-l-green-400" };
    case "status_change":
      return { icon: <Activity size={16} className="text-amber-400" />, border: "border-l-amber-400" };
    default:
      return { icon: <Bell size={16} className="text-red-400" />, border: "border-l-red-400" };
  }
}

export function NotificationToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-6 right-6 z-[999999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const { icon, border } = getToastStyles(toast.type);
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
              className={cn(
                "bg-[#1a1a1a] border border-white/10 shadow-y-2xl rounded-lg p-3.5 flex gap-3 pointer-events-auto items-start w-[320px]",
                "border-l-4",
                border
              )}
            >
              <div className="shrink-0 mt-0.5 bg-white/5 p-1.5 rounded-full border border-white/5">{icon}</div>
              <div className="flex-1 min-w-0 pr-2">
                <h4 className="text-[14px] font-bold text-white mb-0.5 truncate">{toast.title}</h4>
                <p className="text-[12px] text-white/50 leading-snug line-clamp-2">{toast.body}</p>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 text-white/30 hover:text-white/80 transition-colors p-1 -mr-1 -mt-1 rounded-md hover:bg-white/5"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
