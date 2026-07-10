"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths,
  parseISO, isAfter, isBefore, isValid,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  className?: string;
  align?: "left" | "right";
  children?: React.ReactNode;
}

const PANEL_W = 310;

function parseRange(val: string | null) {
  if (!val) return { start: null, end: null };
  try {
    const parsed = JSON.parse(val);
    const s = parsed.start ? parseISO(parsed.start) : null;
    const e = parsed.end ? parseISO(parsed.end) : null;
    return {
      start: (s && isValid(s)) ? s : null,
      end: (e && isValid(e)) ? e : null,
    };
  } catch {
    const parts = val.split(",");
    const s = parts[0] ? parseISO(parts[0]) : null;
    const e = parts[1] ? parseISO(parts[1]) : null;
    return {
      start: (s && isValid(s)) ? s : null,
      end: (e && isValid(e)) ? e : null,
    };
  }
}

export function DatePicker({
  value, onChange, placeholder = "Set timeline", className,
  align = "left", children,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { start: savedStart, end: savedEnd } = parseRange(value);

  // Draft state while in popup
  const [tempStart, setTempStart] = useState<Date | null>(savedStart);
  const [tempEnd, setTempEnd] = useState<Date | null>(savedEnd);
  
  // Real-time hover state
  const [hovered, setHovered] = useState<Date | null>(null);

  // Month navigation
  const [viewDate, setViewDate] = useState(savedStart || new Date(2024, 0, 1));
  const [slideDir, setSlideDir] = useState(0);

  useEffect(() => {
    if (!savedStart) {
      setViewDate(new Date());
    }
  }, [savedStart]);

  const openPicker = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOpen) { setIsOpen(false); return; }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setTempStart(savedStart);
    setTempEnd(savedEnd);
    setViewDate(savedStart || new Date());
    setSlideDir(0);

    const left = align === "right"
      ? Math.max(4, rect.right - PANEL_W)
      : rect.left;

    let top = rect.bottom + 8;
    // rough estimation of fully expanded panel ~ 380px
    if (window.innerHeight - rect.bottom < 380 && rect.top > 380) {
      top = rect.top - 380;
    }

    setPanelStyle({
      position: "fixed",
      left,
      top,
      width: PANEL_W,
      zIndex: 99999,
    });
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const handleApply = () => {
    if (!tempStart && !tempEnd) {
      onChange(null);
    } else {
      onChange(JSON.stringify({
        start: tempStart ? format(tempStart, "yyyy-MM-dd") : null,
        end: tempEnd ? format(tempEnd, "yyyy-MM-dd") : null,
      }));
    }
    setIsOpen(false);
  };

  const handleClear = () => {
    setTempStart(null);
    setTempEnd(null);
  };

  const handleDayClick = (day: Date) => {
    // If no start or if both are set, reset and start new range
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(day);
      setTempEnd(null);
    } else if (tempStart && !tempEnd) {
      // Set end date. Swap if end is before start.
      if (isBefore(day, tempStart)) {
        setTempEnd(tempStart);
        setTempStart(day);
      } else {
        setTempEnd(day);
      }
    }
  };

  const prevMonth = () => { setSlideDir(-1); setViewDate(subMonths(viewDate, 1)); };
  const nextMonth = () => { setSlideDir(1); setViewDate(addMonths(viewDate, 1)); };

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 }), // Week starts Monday
    end: endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 }),
  });

  const displayStart = tempStart;
  const displayEnd = tempEnd || (tempStart && hovered && isAfter(hovered, tempStart) ? hovered : null);

  const isInRange = (day: Date) => {
    if (!displayStart || !displayEnd) return false;
    return isAfter(day, displayStart) && isBefore(day, displayEnd);
  };

  const rangeSummary = tempStart && tempEnd
    ? `${format(tempStart, "MMM d")} → ${format(tempEnd, "MMM d")}`
    : tempStart
    ? format(tempStart, "MMM d")
    : "No date selected";

  const calendarPanel = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.95, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -8 }}
          transition={{ type: "spring", damping: 28, stiffness: 400 }}
          style={panelStyle}
          className="bg-[#1e1e1e] border border-[#333] rounded-xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] p-5 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-[14px] font-bold text-white tracking-wide">
              {format(viewDate, "MMMM yyyy")}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.preventDefault(); prevMonth(); }}
                className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={(e) => { e.preventDefault(); nextMonth(); }}
                className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-2">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <div key={d} className="text-center text-[11px] font-bold text-white/30 uppercase tracking-wider">{d}</div>
            ))}
          </div>

          {/* Day grid container with slider */}
          <div className="relative h-[190px] overflow-hidden">
            <AnimatePresence initial={false} custom={slideDir}>
              <motion.div
                key={format(viewDate, "yyyy-MM")}
                custom={slideDir}
                variants={{
                  enter: (dir: number) => ({ x: dir * 300, opacity: 0 }),
                  center: { x: 0, opacity: 1 },
                  exit: (dir: number) => ({ x: dir * -300, opacity: 0 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "spring", damping: 30, stiffness: 350 }}
                className="absolute inset-0 grid grid-cols-7 grid-rows-6 gap-y-1"
              >
                {days.map((day, i) => {
                  const today = mounted && isSameDay(day, new Date());
                  const inMonth = isSameMonth(day, viewDate);
                  
                  const isStart = tempStart && isSameDay(day, tempStart);
                  const isEnd = tempEnd && isSameDay(day, tempEnd);
                  // Preview end if only start exists
                  const isPreviewEnd = !tempEnd && tempStart && hovered && isSameDay(day, hovered) && isAfter(hovered, tempStart);
                  
                  const activeRange = isInRange(day);

                  // Base text styles
                  let btnCls = "relative flex items-center justify-center text-[13px] h-[30px] w-[30px] mx-auto transition-colors z-10 ";
                  
                  if (isStart || isEnd || isPreviewEnd) {
                    btnCls += "bg-[#e03131] text-white font-bold rounded-full ";
                  } else {
                    btnCls += "rounded-md "; // rounded square
                    if (!inMonth) btnCls += "text-white/20 ";
                    else btnCls += "text-white/80 ";

                    if (inMonth) btnCls += "hover:bg-[#333] hover:text-white ";
                    if (today) btnCls += "border border-white/30 rounded-full ";
                  }

                  return (
                    <div key={i} className="relative w-full h-[30px] flex items-center justify-center">
                      {/* Range Background */}
                      {(activeRange || isStart || isEnd || isPreviewEnd) && (
                        <div className={cn(
                          "absolute inset-y-0 bg-[#e03131]/15 block",
                          (isStart && !isEnd && !isPreviewEnd) ? "hidden" : // no bg if just start
                          isStart ? "left-1/2 right-0" :
                          (isEnd || isPreviewEnd) ? "left-0 right-1/2" :
                          "inset-x-0"
                        )} />
                      )}
                      
                      <button
                        onClick={(e) => { e.preventDefault(); handleDayClick(day); }}
                        onMouseEnter={() => tempStart && !tempEnd && setHovered(day)}
                        onMouseLeave={() => setHovered(null)}
                        className={cn(btnCls)}
                      >
                        {format(day, "d")}
                      </button>
                    </div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="mt-2 pt-4 border-t border-[#333]">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[12px] font-medium text-white/50">{rangeSummary}</span>
            </div>
            <div className="flex justify-between items-center">
              <button
                onClick={(e) => { e.preventDefault(); handleClear(); }}
                className="text-[12px] font-semibold text-white/40 hover:text-white transition-colors"
              >
                Clear
              </button>
              <button
                onClick={(e) => { e.preventDefault(); handleApply(); }}
                className="bg-[#e03131] hover:bg-[#c92a2a] text-white px-3.5 py-1.5 rounded text-[12px] font-bold shadow-lg shadow-black/20 transition-all active:scale-95"
              >
                Apply
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <div
        ref={triggerRef}
        className={cn("relative w-full h-full flex items-center group/picker", className)}
      >
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={openPicker}
          className="w-full h-full cursor-pointer"
        >
          {children ?? (
            <div className="flex-1 flex items-center h-full px-3 select-none">
              <span className="text-[12px] text-white/20 italic">{placeholder}</span>
            </div>
          )}
        </div>
      </div>

      {mounted && createPortal(calendarPanel, document.body)}
    </>
  );
}
