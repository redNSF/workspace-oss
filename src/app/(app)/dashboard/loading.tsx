import { LayoutDashboard } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col min-h-full bg-[#111111] text-white overflow-hidden pointer-events-none">
      <div className="relative px-8 pt-12 pb-10 shrink-0 border-b border-white/[0.04]">
        <div className="h-3 w-20 rounded bg-white/[0.05] animate-pulse mb-3" />
        <div className="h-8 w-64 rounded bg-white/[0.08] animate-pulse mb-2" />
        <div className="h-4 w-96 rounded bg-white/[0.04] animate-pulse" />
      </div>

      <div className="px-8 py-8 flex-1 space-y-10">
        <section>
          <div className="flex items-center gap-2 mb-4">
            <LayoutDashboard size={13} className="text-white/30" />
            <div className="h-3 w-20 rounded bg-white/[0.05] animate-pulse" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-5 animate-pulse">
                <div className="flex justify-between">
                  <div className="h-3 w-20 rounded bg-white/[0.06] mb-4" />
                  <div className="w-7 h-7 rounded-lg bg-white/[0.05]" />
                </div>
                <div className="h-8 w-12 rounded bg-white/[0.08]" />
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <LayoutDashboard size={13} className="text-white/30" />
            <div className="h-3 w-24 rounded bg-white/[0.05] animate-pulse" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden animate-pulse">
                <div className="px-5 py-4">
                  <div className="h-2.5 w-16 rounded bg-white/[0.04] mb-2" />
                  <div className="h-4 w-32 rounded bg-white/[0.06]" />
                  <div className="mt-4 h-1.5 w-full rounded-full bg-white/[0.05]" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
