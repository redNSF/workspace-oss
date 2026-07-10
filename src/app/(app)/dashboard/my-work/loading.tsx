import { CheckCircle2 } from "lucide-react";

export default function MyWorkLoading() {
  return (
    <div className="flex flex-col min-h-full bg-[#111111] text-white overflow-hidden pointer-events-none">
      <div className="relative px-8 pt-12 pb-8 shrink-0 border-b border-white/[0.04]">
        <div className="h-3 w-16 rounded bg-white/[0.05] animate-pulse mb-3" />
        <div className="flex items-center gap-3">
          <CheckCircle2 size={26} className="text-indigo-400/50 shrink-0" />
          <div className="h-10 w-48 rounded bg-white/[0.08] animate-pulse" />
        </div>
        <div className="mt-4 h-4 w-64 rounded bg-white/[0.04] animate-pulse" />
      </div>

      <div className="flex-1 px-8 py-8 max-w-5xl">
        <div className="space-y-8">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-28 rounded bg-white/[0.05] animate-pulse" />
              <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] overflow-hidden animate-pulse">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="flex items-center gap-4 px-5 py-3.5 border-b border-[#2a2a2a] last:border-0">
                    <div className="flex-1 h-3 rounded bg-white/[0.06]" />
                    <div className="w-24 h-3 rounded bg-white/[0.04]" />
                    <div className="w-20 h-5 rounded-full bg-white/[0.05]" />
                    <div className="w-20 h-3 rounded bg-white/[0.04]" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
