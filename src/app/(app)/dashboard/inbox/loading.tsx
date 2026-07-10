import { Inbox } from "lucide-react";

export default function InboxLoading() {
  return (
    <div className="flex flex-col min-h-full bg-[#111111] text-white overflow-hidden pointer-events-none">
      <div className="relative px-8 pt-12 pb-8 shrink-0 border-b border-white/[0.04]">
        <div className="h-3 w-16 rounded bg-white/[0.05] animate-pulse mb-3" />
        <div className="flex items-center gap-3">
          <Inbox size={26} className="text-blue-400/50 shrink-0" />
          <div className="h-10 w-48 rounded bg-white/[0.08] animate-pulse" />
        </div>
        <div className="mt-4 h-4 w-64 rounded bg-white/[0.04] animate-pulse" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center py-20 px-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.07] animate-pulse mb-4" />
        <div className="h-4 w-64 rounded bg-white/[0.05] animate-pulse mb-2" />
        <div className="h-3 w-80 rounded bg-white/[0.04] animate-pulse" />
      </div>
    </div>
  );
}
