"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { upsertCellValue } from "@/lib/supabase/upsert-cell";
import { logActivity } from "@/lib/notifications";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";

export const STATUS_OPTIONS = [
  { label: "Not Started", value: "not_started", color: "#666666", bg: "#66666622" },
  { label: "In Progress", value: "in_progress", color: "#0073ea", bg: "#0073ea22" },
  { label: "Done",        value: "done",        color: "#00c875", bg: "#00c87522" },
  { label: "Stuck",       value: "stuck",       color: "#e03131", bg: "#e0313122" },
  { label: "On Hold",     value: "on_hold",     color: "#ffcb00", bg: "#ffcb0022" },
] as const;

export type StatusValue = (typeof STATUS_OPTIONS)[number]["value"] | null;

interface StatusCellProps {
  itemId: string;
  boardId: string;
  columnId: string;
  value: StatusValue;
  onSaved?: (itemId: string, columnId: string, value: StatusValue) => void;
}

const MENU_W = 192; // w-48
const MENU_H = 240; // approximate

export function StatusCell({ itemId, boardId, columnId, value: propValue, onSaved }: StatusCellProps) {
  const [value, setValue] = useState<StatusValue>(propValue);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setValue(propValue); }, [propValue]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (open) { setOpen(false); return; }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const isUp = (window.innerHeight - rect.bottom) < MENU_H && rect.top > MENU_H;
    setPanelStyle({
      position: "fixed",
      left: rect.left,
      width: MENU_W,
      zIndex: 99999,
      ...(isUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
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

  async function selectStatus(next: StatusValue) {
    if (!itemId || !columnId) {
      console.error("Missing itemId or columnId for status-cell upsert");
      return;
    }
    if (next === value) { setOpen(false); return; }
    const prevValue = value;
    setValue(next);
    setOpen(false);
    setSaving(true);
    const supabase = createClient();
    const { error } = await upsertCellValue(supabase, itemId, columnId, next);
    if (!error) {
      const statusLabel = STATUS_OPTIONS.find((o) => o.value === next)?.label || "No Status";
      logActivity({ boardId, itemId, action: `changed status to ${statusLabel}`, details: { from: prevValue, to: next } });
      onSaved?.(itemId, columnId, next);
    } else {
      setValue(propValue);
    }
    setSaving(false);
  }

  const currentStatus = STATUS_OPTIONS.find((o) => o.value === value);

  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.95, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -6 }}
          transition={{ type: "spring", damping: 25, stiffness: 500 }}
          style={{ ...panelStyle, backdropFilter: "blur(24px)" }}
          className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-[0_20px_50px_-12px_rgba(0,0,0,1)] p-1 overflow-hidden"
        >
          <button
            onClick={() => selectStatus(null)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.06] transition-all group/item rounded-lg"
          >
            <div className="w-2 h-2 rounded-full shrink-0 bg-white/20 group-hover/item:bg-white/40" />
            <span className="text-white/30 font-medium text-[12px] group-hover/item:text-white/50">No Status</span>
          </button>
          <div className="h-px bg-white/[0.06] mx-3 my-0.5" />
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => selectStatus(opt.value)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.06] transition-all group/item rounded-lg"
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
              <span style={{ color: opt.color }} className="font-semibold text-[12px] flex-1">{opt.label}</span>
              {value === opt.value && <Check size={14} style={{ color: opt.color }} />}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleToggle}
        disabled={saving}
        className="w-full h-full flex items-center justify-center px-2 transition-all active:scale-[0.97] focus:outline-none select-none"
      >
        {currentStatus ? (
          <span
            className="px-2.5 py-0.5 rounded text-[11px] font-semibold tracking-wide truncate transition-transform shadow-sm"
            style={{ color: currentStatus.color, backgroundColor: currentStatus.bg }}
          >
            {currentStatus.label}
          </span>
        ) : (
          <span
            className="px-2.5 py-0.5 rounded text-[11px] font-semibold tracking-wide text-white/20 transition-colors hover:text-white/40"
            style={{ backgroundColor: "#ffffff08" }}
          >
            No Status
          </span>
        )}
      </button>

      {typeof document !== "undefined" && createPortal(panel, document.body)}
    </>
  );
}
