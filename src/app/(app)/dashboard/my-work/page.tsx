"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Layers,
  User,
} from "lucide-react";
import { parseISO, isValid, isPast, isToday, isFuture, endOfDay, format } from "date-fns";
import { ItemDetailPanel } from "@/app/(app)/board/[boardId]/item-detail-panel";
import type { Item, Column, CellValue, Group } from "@/types/database";

// ── Types ──────────────────────────────────────────────────────────────────────

interface EnrichedItem {
  // item fields
  id: string;
  name: string;
  description?: string | null;
  group_id: string;
  position: number;
  created_at: string;
  created_by: string | null;
  // joined
  group_name: string;
  group: Group;
  board_id: string;
  board_name: string;
  board_color: string;
  // cell data
  status_value: string | null;
  due_date_raw: string | null; // raw cell value
  due_date: Date | null;       // parsed start date for bucketing
  all_cell_values: CellValue[];
}

interface PanelState {
  item: Item;
  group: Group;
  boardId: string;
  boardName: string;
  columns: Column[];
  cellValues: CellValue[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseDueDate(raw: string | null): Date | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const start = parsed?.start ?? parsed?.[0] ?? null;
    if (start) {
      const d = parseISO(start);
      return isValid(d) ? d : null;
    }
  } catch {
    // fallback: comma-separated
    const part = raw.split(",")[0];
    if (part) {
      const d = parseISO(part.trim());
      return isValid(d) ? d : null;
    }
  }
  return null;
}

type Bucket = "overdue" | "today" | "upcoming" | "nodate";

function getBucket(dueDate: Date | null): Bucket {
  if (!dueDate) return "nodate";
  if (isToday(dueDate)) return "today";
  if (isPast(endOfDay(dueDate))) return "overdue";
  return "upcoming";
}

function formatDueDate(date: Date | null, raw: string | null): string {
  if (!date) return "";
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    const end = parsed?.end ? parseISO(parsed.end) : null;
    if (end && isValid(end) && end.getTime() !== date.getTime()) {
      return `${format(date, "MMM d")} – ${format(end, "MMM d")}`;
    }
  } catch {}
  return format(date, "MMM d");
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: "Not Started", color: "#666666", bg: "#66666622" },
  in_progress: { label: "In Progress", color: "#0073ea", bg: "#0073ea22" },
  done: { label: "Done",        color: "#00c875", bg: "#00c87522" },
  stuck: { label: "Stuck",      color: "#e03131", bg: "#e0313122" },
  on_hold: { label: "On Hold",  color: "#ffcb00", bg: "#ffcb0022" },
};

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
      <div className="flex-1 h-3 rounded bg-white/[0.06]" />
      <div className="w-24 h-3 rounded bg-white/[0.04]" />
      <div className="w-20 h-5 rounded-full bg-white/[0.05]" />
      <div className="w-20 h-3 rounded bg-white/[0.04]" />
    </div>
  );
}

function StatusPill({ value }: { value: string | null }) {
  const s = value ? STATUS_MAP[value] : null;
  if (!s) {
    return (
      <span className="px-2.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase"
        style={{ backgroundColor: "var(--dashboard-pill-bg)", color: "var(--dashboard-pill-muted)" }}>
        No Status
      </span>
    );
  }
  return (
    <span className="px-2.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase"
      style={{ color: s.color, backgroundColor: s.bg }}>
      {s.label}
    </span>
  );
}

interface SectionProps {
  label: string;
  icon: React.ReactNode;
  headerClass: string;
  items: EnrichedItem[];
  onOpenItem: (item: EnrichedItem) => void;
}

function Section({ label, icon, headerClass, items, onOpenItem }: SectionProps) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {/* Section header */}
      <div className={`flex items-center gap-2 px-1 py-1 ${headerClass}`}>
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-widest">
          {label}
        </span>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/[0.07] text-[10px] font-semibold text-white/40">
          {items.length}
        </span>
      </div>

      {/* Item rows */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] overflow-hidden">
        {items.map((item, idx) => (
          <div key={item.id}>
            {idx > 0 && <div className="h-px bg-[#2a2a2a]" />}
            <motion.button
              whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
              onClick={() => onOpenItem(item)}
              className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors"
            >
              {/* Board color dot */}
              <div
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ backgroundColor: item.board_color }}
              />

              {/* Item name */}
              <span className="flex-1 text-[13px] font-medium text-white/80 hover:text-white truncate">
                {item.name || "Untitled"}
              </span>

              {/* Board / Group */}
              <span className="hidden sm:block text-[11px] text-white/30 truncate max-w-[140px] shrink-0">
                {item.board_name} · {item.group_name}
              </span>

              {/* Status pill */}
              <div className="shrink-0">
                <StatusPill value={item.status_value} />
              </div>

              {/* Due date */}
              <div className="shrink-0 w-28 text-right">
                {item.due_date ? (
                  <span className={`text-[11px] font-medium ${
                    getBucket(item.due_date) === "overdue"
                      ? "text-red-400"
                      : getBucket(item.due_date) === "today"
                      ? "text-amber-400"
                      : "text-white/40"
                  }`}>
                    {formatDueDate(item.due_date, item.due_date_raw)}
                  </span>
                ) : (
                  <span className="text-[11px] text-white/15 italic">No date</span>
                )}
              </div>
            </motion.button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function MyWorkPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");
  const [items, setItems] = useState<EnrichedItem[]>([]);
  const [panel, setPanel] = useState<PanelState | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user || !user.id) { 
        console.log("MyWork: No user or user.id found, returning early");
        setLoading(false); 
        return; 
      }
      
      const currentUserId = user.id;
      console.log('current userId:', currentUserId);
      setUserId(currentUserId);

      // Step 1: Find all item_ids where user is assigned (person column)
      const { data: personCells } = await supabase
        .from("cell_values")
        .select("item_id, columns!inner(type)")
        .ilike("value", `%${currentUserId}%`)
        .eq("columns.type", "person");

      const itemIds = [...new Set(
        (personCells ?? []).map((cv) => cv.item_id).filter(Boolean)
      )] as string[];

      if (itemIds.length === 0) {
        setLoading(false);
        return;
      }

      // Step 2: Fetch items with group + board info AND all cell_values — in parallel
      const [itemsRes, cellsRes] = await Promise.all([
        supabase
          .from("items")
          .select(`
            id, name, description, group_id, position, created_at, created_by,
            groups (
              id, name, board_id, position, color,
              boards ( id, name, color )
            )
          `)
          .in("id", itemIds),
        supabase
          .from("cell_values")
          .select("id, item_id, column_id, value, columns ( type )")
          .in("item_id", itemIds),
      ]);

      const rawItems = (itemsRes.data ?? []) as any[];
      const rawCells = (cellsRes.data ?? []) as any[];

      const enriched: EnrichedItem[] = rawItems.map((item) => {
        const group = item.groups as any;
        const board = group?.boards as any;

        const itemCells: CellValue[] = rawCells
          .filter((cv) => cv.item_id === item.id)
          .map((cv) => ({ id: cv.id, item_id: cv.item_id, column_id: cv.column_id, value: cv.value }));

        const statusCell = rawCells.find(
          (cv) => cv.item_id === item.id && cv.columns?.type === "status"
        );
        const dateCell = rawCells.find(
          (cv) => cv.item_id === item.id && cv.columns?.type === "date"
        );

        const dueDate = parseDueDate(dateCell?.value ?? null);

        return {
          id: item.id,
          name: item.name,
          description: item.description ?? null,
          group_id: item.group_id,
          position: item.position,
          created_at: item.created_at,
          created_by: item.created_by,
          group_name: group?.name ?? "Unknown Group",
          group: group as Group,
          board_id: board?.id ?? "",
          board_name: board?.name ?? "Unknown Board",
          board_color: board?.color ?? "#8b5cf6",
          status_value: statusCell?.value ?? null,
          due_date_raw: dateCell?.value ?? null,
          due_date: dueDate,
          all_cell_values: itemCells,
        };
      });

      setItems(enriched);
      setLoading(false);
    }

    void load();
  }, []);

  // Open item detail panel — fetch columns on-demand per board
  const openItem = useCallback(async (item: EnrichedItem) => {
    const supabase = createClient();
    const { data: columns } = await supabase
      .from("columns")
      .select("*")
      .eq("board_id", item.board_id)
      .order("position", { ascending: true });

    setPanel({
        item: {
          id: item.id,
          name: item.name,
          description: item.description ?? null,
          group_id: item.group_id,
        position: item.position,
        created_at: item.created_at,
        created_by: item.created_by,
      },
      group: item.group,
      boardId: item.board_id,
      boardName: item.board_name,
      columns: (columns ?? []) as Column[],
      cellValues: item.all_cell_values,
    });
  }, []);

  // Bucket items
  const overdue   = items.filter((i) => getBucket(i.due_date) === "overdue");
  const today     = items.filter((i) => getBucket(i.due_date) === "today");
  const upcoming  = items.filter((i) => getBucket(i.due_date) === "upcoming");
  const noDate    = items.filter((i) => getBucket(i.due_date) === "nodate");

  const totalCount = items.length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col min-h-full bg-[#111111] text-white overflow-auto"
    >
      {/* Header */}
      <div className="relative px-8 pt-12 pb-8 shrink-0 border-b border-white/[0.04]">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/25 mb-2">
          My Work
        </p>
        <div className="flex items-center gap-3">
          <CheckCircle2 size={26} className="text-indigo-400 shrink-0" />
          <h1 className="text-4xl font-bold tracking-tight text-white">My Tasks</h1>
        </div>
        <p className="mt-2 text-sm text-white/30">
          Items assigned to you across all boards
          {!loading && totalCount > 0 && (
            <span className="ml-2 text-white/20">— {totalCount} total</span>
          )}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 px-8 py-8 max-w-5xl">
        {loading ? (
          <div className="space-y-8">
            {[1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-28 rounded bg-white/[0.05] animate-pulse" />
                <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] overflow-hidden animate-pulse">
                  <SkeletonRow />
                  <div className="h-px bg-[#2a2a2a]" />
                  <SkeletonRow />
                  <div className="h-px bg-[#2a2a2a]" />
                  <SkeletonRow />
                </div>
              </div>
            ))}
          </div>
        ) : totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center h-72 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-4 text-white/15">
              <CheckCircle2 size={28} />
            </div>
            <h3 className="text-white/40 font-semibold text-sm mb-1">
              You're all caught up — No tasks assigned to you
            </h3>
            <p className="text-white/20 text-xs">
              When tasks are assigned to you, they'll show up here
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <Section
              label="Overdue"
              icon={<AlertCircle size={13} className="text-red-400" />}
              headerClass="text-red-400"
              items={overdue}
              onOpenItem={openItem}
            />
            <Section
              label="Today"
              icon={<Clock size={13} className="text-amber-400" />}
              headerClass="text-amber-400"
              items={today}
              onOpenItem={openItem}
            />
            <Section
              label="Upcoming"
              icon={<Calendar size={13} className="text-blue-400" />}
              headerClass="text-blue-400"
              items={upcoming}
              onOpenItem={openItem}
            />
            <Section
              label="No Date"
              icon={<Layers size={13} className="text-white/30" />}
              headerClass="text-white/30"
              items={noDate}
              onOpenItem={openItem}
            />
          </div>
        )}
      </div>

      {/* Item Detail Panel */}
      <AnimatePresence>
        {panel && (
          <ItemDetailPanel
            key={panel.item.id}
            item={panel.item}
            group={panel.group}
            boardId={panel.boardId}
            boardName={panel.boardName}
            columns={panel.columns}
            cellValues={panel.cellValues}
            userId={userId}
            onClose={() => setPanel(null)}
            onCellValueChange={(itemId, colId, value) => {
              // Update local cell values so panel stays in sync
              setItems((prev) =>
                prev.map((i) => {
                  if (i.id !== itemId) return i;
                  const existing = i.all_cell_values.findIndex((cv) => cv.column_id === colId);
                  const updated: CellValue = { id: colId, item_id: itemId, column_id: colId, value };
                  const newValues = existing >= 0
                    ? i.all_cell_values.map((cv) => cv.column_id === colId ? updated : cv)
                    : [...i.all_cell_values, updated];
                  return { ...i, all_cell_values: newValues };
                })
              );
            }}
            onNameChange={(id, name) => {
              setItems((prev) => prev.map((i) => i.id === id ? { ...i, name } : i));
            }}
            onDescriptionChange={(id, description) => {
              setItems((prev) => prev.map((i) => i.id === id ? { ...i, description } : i));
              setPanel((prev) =>
                prev && prev.item.id === id
                  ? { ...prev, item: { ...prev.item, description } }
                  : prev
              );
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
