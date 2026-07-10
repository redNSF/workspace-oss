import { LayoutGrid, Rows3, Plus } from "lucide-react";

export default function BoardLoading() {
  return (
    <div className="flex flex-col h-full bg-[#111111] text-white overflow-hidden pointer-events-none">
      {/* Board Header Skeleton */}
      <div className="relative px-8 pt-9 pb-5 shrink-0 border-b border-white/[0.04]">
        <div className="h-3 w-20 rounded bg-white/[0.05] animate-pulse mb-3" />
        <div className="flex items-center gap-3 mb-3">
          <div className="w-3 h-3 rounded-sm shrink-0 bg-white/[0.08] animate-pulse" />
          <div className="h-8 w-64 rounded bg-white/[0.08] animate-pulse" />
        </div>
        <div className="h-4 w-96 rounded bg-white/[0.04] animate-pulse" />
      </div>

      {/* Toolbar Skeleton */}
      <div className="px-8 py-3 flex items-center gap-2 border-b border-white/[0.04] bg-[#111111] shrink-0">
        <div className="flex items-center bg-[#1a1a1a] rounded-lg p-0.5 border border-white/5 mr-2 animate-pulse">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] bg-white/5 text-white/30">
            <Rows3 size={14} /> Table
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] text-white/20">
            <LayoutGrid size={14} /> Kanban
          </div>
        </div>
        <div className="h-8 w-28 rounded-lg bg-white/[0.04] animate-pulse" />
        <div className="ml-auto flex gap-2">
          <div className="h-8 w-24 rounded-lg bg-white/[0.04] animate-pulse" />
          <div className="h-8 w-8 rounded-lg bg-white/[0.04] animate-pulse" />
        </div>
      </div>

      {/* Board Content Skeleton */}
      <div className="flex-1 overflow-x-auto">
        <div className="min-w-[800px] h-full flex flex-col px-12 py-7 space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-lg border border-white/[0.06] overflow-hidden animate-pulse">
              <div className="bg-[#1a1a1a] px-4 py-3 flex items-center gap-3">
                <div className="w-20 h-3 rounded bg-white/[0.08]" />
                <div className="ml-2 w-8 h-2.5 rounded bg-white/[0.05]" />
              </div>
              <div className="bg-[#1a1a1a] border-t border-white/[0.04] px-4 py-2 flex gap-4">
                <div className="flex-1 h-2.5 rounded bg-white/[0.05]" />
                <div className="w-24 h-2.5 rounded bg-white/[0.05]" />
                <div className="w-24 h-2.5 rounded bg-white/[0.05]" />
              </div>
              {[1, 2, 3].map((j) => (
                <div key={j} className="bg-[#161616] border-t border-white/[0.04] px-4 py-2.5 flex items-center gap-4">
                  <div className="flex-1 h-3 rounded bg-white/[0.06]" style={{ width: `${60 + j * 10}%` }} />
                  <div className="w-20 h-5 rounded-full bg-white/[0.05]" />
                  <div className="w-20 h-2.5 rounded bg-white/[0.04]" />
                </div>
              ))}
            </div>
          ))}
          
          <div className="flex items-center gap-2 px-3 py-2 mt-2 rounded-lg text-[13px] text-white/10 self-start animate-pulse">
            <Plus size={14} /> Add Group
          </div>
        </div>
      </div>
    </div>
  );
}
