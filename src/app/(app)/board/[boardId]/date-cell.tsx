"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { upsertCellValue } from "@/lib/supabase/upsert-cell";
import { DatePicker } from "@/components/ui/date-picker";
import { parseISO, format, isValid, differenceInDays, isSameDay, isPast, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarDays, X, Clock } from "lucide-react";

interface DateCellProps {
  itemId: string;
  columnId: string;
  value: string | null;
  onSaved?: (itemId: string, columnId: string, value: string | null) => void;
}

function parseRange(val: string | null) {
  if (!val) return { start: null, end: null };
  try {
    const parsed = JSON.parse(val);
    const s = parsed.start ? parseISO(parsed.start) : null;
    const e = parsed.end ? parseISO(parsed.end) : s; // default end to start if not provided
    return {
      start: s && isValid(s) ? s : null,
      end: e && isValid(e) ? e : null,
    };
  } catch {
    // fallback for old comma-separated
    const parts = val.split(",");
    const s = parts[0] ? parseISO(parts[0]) : null;
    const e = parts[1] ? parseISO(parts[1]) : s;
    return {
      start: s && isValid(s) ? s : null,
      end: e && isValid(e) ? e : null,
    };
  }
}

export function DateCell({ itemId, columnId, value: propValue, onSaved }: DateCellProps) {
  const [value, setValue] = useState(propValue ?? null);

  useEffect(() => {
    setValue(propValue ?? null);
  }, [propValue]);

  async function save(nextValue: string | null) {
    if (!itemId || !columnId) {
      console.error("Missing itemId or columnId for date-cell upsert");
      return;
    }
    setValue(nextValue);
    const supabase = createClient();
    const { error } = await upsertCellValue(supabase, itemId, columnId, nextValue);
    if (error) {
      setValue(propValue ?? null); // revert
    } else {
      onSaved?.(itemId, columnId, nextValue);
    }
  }

  const { start, end } = parseRange(value);
  const hasRange = !!start;
  const isMultiDay = !!(start && end && !isSameDay(start, end));
  const days = start && end ? differenceInDays(end, start) + 1 : 0;

  const rangeLabel = start
    ? isMultiDay
      ? `${format(start, "MMM d")} – ${format(end!, "MMM d")}`
      : format(start, "MMM d")
    : null;

  const relevantDate = end || start;
  const isOverdue = relevantDate ? isPast(endOfDay(relevantDate)) : false;

  return (
    <DatePicker
      value={value}
      onChange={save}
      align="right"
    >
      <div className="w-full h-full flex items-center px-2 group/datecell">
        {hasRange ? (
          // Monday.com-style timeline pill
          <div className={cn(
            "w-full h-[26px] rounded-full relative overflow-hidden flex items-center px-3 gap-2 transition-all",
            isOverdue
              ? "bg-red-500/20 hover:bg-red-500/30 border border-red-500/20"
              : "bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/20"
          )}>
            {/* Animated fill for multi-day ranges */}
            {isMultiDay && !isOverdue && (
              <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-blue-500/20 to-transparent pointer-events-none" />
            )}
            {isOverdue && <Clock size={11} className="text-red-400 shrink-0 z-10" />}
            <span className={cn("text-[11px] font-semibold truncate z-10 flex-1", isOverdue ? "text-red-400" : "text-blue-300")}>
              {rangeLabel}
            </span>
            {isMultiDay && (
              <span className={cn("text-[10px] font-normal shrink-0 z-10", isOverdue ? "text-red-400/50" : "text-blue-400/50")}>
                {days}d
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); save(null); }}
              className="shrink-0 z-10 opacity-0 group-hover/datecell:opacity-100 text-blue-400/50 hover:text-blue-300 transition-all -mr-1"
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          // Empty state
          <div className="w-full h-full flex items-center gap-1.5 opacity-0 group-hover/datecell:opacity-60 transition-opacity">
            <CalendarDays size={12} className="text-white/40 shrink-0" />
            <span className="text-[11px] text-white/40 italic">Timeline</span>
          </div>
        )}
      </div>
    </DatePicker>
  );
}
