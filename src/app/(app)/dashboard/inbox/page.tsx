"use client";

import { motion } from "framer-motion";
import { Inbox } from "lucide-react";

export default function InboxPage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col min-h-full bg-[#111111] text-white overflow-auto"
    >
      <div className="relative px-8 pt-12 pb-8 shrink-0 border-b border-white/[0.04]">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/25 mb-2">
          Inbox
        </p>
        <div className="flex items-center gap-3">
          <Inbox size={26} className="text-blue-400 shrink-0" />
          <h1 className="text-4xl font-bold tracking-tight text-white">Notifications</h1>
        </div>
        <p className="mt-2 text-sm text-white/30">
          Stay updated on mentions, assignments, and board activity
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center py-20 px-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-4 text-white/15">
          <Inbox size={28} />
        </div>
        <h3 className="text-white/40 font-semibold text-sm mb-1">
          No notifications — You're up to date
        </h3>
        <p className="text-white/20 text-xs max-w-sm">
          When people mention you or assign you to items, you'll see notifications here
        </p>
      </div>
    </motion.div>
  );
}
