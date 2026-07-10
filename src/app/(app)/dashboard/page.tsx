"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { ClientGreeting } from "@/components/client-greeting";
import { ItemDetailPanel } from "@/app/(app)/board/[boardId]/item-detail-panel";
import {
  AlertCircle,
  ArrowUpRight,
  LayoutDashboard,
  Activity,
  CheckCircle2,
  Clock,
  Layers,
  Calendar,
  User,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow, parseISO, isValid, isPast, isToday, isFuture, endOfDay, format } from "date-fns";
import type { Item, Column, CellValue, Group } from "@/types/database";

// ── Types ──────────────────────────────────────────────────────────────────────

interface BoardStat {
  id: string;
  name: string;
  color: string;
  workspace_name: string;
  total_items: number;
  done_items: number;
}

interface EnrichedTask {
  id: string;
  name: string;
  description?: string | null;
  group_id: string;
  position: number;
  created_at: string;
  created_by: string | null;
  group: Group;
  group_name: string;
  board_id: string;
  board_name: string;
  board_color: string;
  status_value: string | null;
  due_date_raw: string | null;
  due_date: Date | null;
  all_cell_values: CellValue[];
}

interface ActivityEntry {
  id: string;
  action: string;
  created_at: string;
  profiles?: { full_name: string | null } | null;
}

interface Stats {
  totalBoards: number;
  totalItems: number;
  assignedToMe: number;
  overdueItems: number;
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
    if (start) { const d = parseISO(start); return isValid(d) ? d : null; }
  } catch {
    const part = raw.split(",")[0];
    if (part) { const d = parseISO(part.trim()); return isValid(d) ? d : null; }
  }
  return null;
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

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

type DueBucket = "overdue" | "today" | "upcoming" | "nodate";
function getBucket(d: Date | null): DueBucket {
  if (!d) return "nodate";
  if (isToday(d)) return "today";
  if (isPast(endOfDay(d))) return "overdue";
  return "upcoming";
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: "Not Started", color: "#666666", bg: "#66666622" },
  in_progress: { label: "In Progress", color: "#0073ea", bg: "#0073ea22" },
  done:        { label: "Done",        color: "#00c875", bg: "#00c87522" },
  stuck:       { label: "Stuck",       color: "#e03131", bg: "#e0313122" },
  on_hold:     { label: "On Hold",     color: "#ffcb00", bg: "#ffcb0022" },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-5 animate-pulse">
      <div className="h-3 w-20 rounded bg-white/[0.06] mb-4" />
      <div className="h-8 w-12 rounded bg-white/[0.08]" />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-5 flex flex-col gap-3 transition-shadow hover:shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: accent ?? "var(--dashboard-stat-muted)" }}
        >
          {label}
        </span>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: accent ? `${accent}18` : "var(--dashboard-stat-icon-bg)" }}
        >
          <div style={{ color: accent ?? "var(--dashboard-stat-muted)" }}>{icon}</div>
        </div>
      </div>
      <span
        className="text-3xl font-bold tracking-tight"
        style={{ color: accent ?? "var(--dashboard-stat-value)" }}
      >
        {value}
      </span>
    </motion.div>
  );
}

function BoardCardSkeleton() {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden animate-pulse">
      <div className="w-1 h-full absolute left-0 top-0 bottom-0" />
      <div className="px-5 py-4">
        <div className="h-2.5 w-16 rounded bg-white/[0.04] mb-2" />
        <div className="h-4 w-32 rounded bg-white/[0.06]" />
        <div className="mt-4 h-1.5 w-full rounded-full bg-white/[0.05]" />
      </div>
    </div>
  );
}

function BoardCard({ board }: { board: BoardStat }) {
  const pct = board.total_items > 0
    ? Math.round((board.done_items / board.total_items) * 100)
    : 0;

  return (
    <motion.div whileHover={{ y: -2 }}>
      <Link
        href={`/board/${board.id}`}
        className="relative block bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden
          hover:border-white/[0.1] hover:shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-all duration-200"
      >
        {/* Left color accent */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ backgroundColor: board.color }}
        />

        <div className="pl-6 pr-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25 truncate mb-1">
            {board.workspace_name}
          </p>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-white/80 group-hover:text-white leading-snug">
              {board.name}
            </p>
            <ArrowUpRight size={14} className="text-white/20 shrink-0 mt-0.5" />
          </div>

          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-white/30">
                {board.done_items}/{board.total_items} done
              </span>
              <span className="text-[11px] font-semibold" style={{ color: board.color }}>
                {pct}%
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-1 w-full rounded-full bg-white/[0.06]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ backgroundColor: board.color }}
              />
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function TaskRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
      <div className="w-2 h-2 rounded-sm bg-white/[0.06] shrink-0" />
      <div className="flex-1 h-3 rounded bg-white/[0.06]" />
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

function ActivityFeedEntry({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500/60 to-purple-600/60 flex items-center justify-center text-[9px] font-bold text-white shrink-0 border border-white/[0.08]">
        {initials(entry.profiles?.full_name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-white/60 leading-snug">
          <span className="font-semibold text-white/80">
            {entry.profiles?.full_name ?? "System"}
          </span>{" "}
          {entry.action}
        </p>
        <p className="text-[10px] text-white/25 mt-0.5">
          <ClientOnlyTimeAgo date={entry.created_at} />
        </p>
      </div>
    </div>
  );
}

function ClientOnlyTimeAgo({ date }: { date: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <span>just now</span>;
  return <span>{formatDistanceToNow(new Date(date), { addSuffix: true })}</span>;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("there");
  const [userId, setUserId] = useState<string>("");
  const [stats, setStats] = useState<Stats>({ totalBoards: 0, totalItems: 0, assignedToMe: 0, overdueItems: 0 });
  const [recentBoards, setRecentBoards] = useState<BoardStat[]>([]);
  const [myTasks, setMyTasks] = useState<EnrichedTask[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [panel, setPanel] = useState<PanelState | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      // ── Phase 1: parallel fetches with no inter-dependencies ──────────────
      const [profileRes, boardsRes, activityRes, personCellsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, role")
          .eq("id", user.id)
          .maybeSingle(),

        // Admin sees all their boards, others see shared boards
        supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle()
          .then(async ({ data: p }) => {
            if (p?.role === "admin") {
              return supabase
                .from("boards")
                .select("id, name, color, workspaces!inner(id, name, owner_id)")
                .eq("workspaces.owner_id", user.id)
                .order("created_at", { ascending: false });
            } else {
              const { data: access } = await supabase
                .from("board_access")
                .select("board_id")
                .eq("user_id", user.id);
              const ids = access?.map((a) => a.board_id) ?? [];
              if (ids.length === 0) return { data: [] };
              return supabase
                .from("boards")
                .select("id, name, color, workspaces!inner(id, name, owner_id)")
                .in("id", ids)
                .order("created_at", { ascending: false });
            }
          }),

        supabase
          .from("activity_log")
          .select("id, action, created_at, profiles(full_name)")
          .order("created_at", { ascending: false })
          .limit(10),

        supabase
          .from("cell_values")
          .select("item_id")
          .ilike("value", `%${user.id}%`),
      ]);

      const fn = profileRes.data?.full_name?.split(" ")[0] ?? "there";
      setFirstName(fn);
      setActivity((activityRes.data ?? []) as unknown as ActivityEntry[]);

      const boards = ((boardsRes as any)?.data ?? []) as any[];
      const boardIds = boards.map((b: any) => b.id) as string[];

      const assignedItemIds = [
        ...new Set((personCellsRes.data ?? []).map((cv) => cv.item_id).filter(Boolean)),
      ] as string[];

      if (boardIds.length === 0 && assignedItemIds.length === 0) {
        setLoading(false);
        return;
      }

      // ── Phase 2: parallel — depends on boardIds and assignedItemIds ────────
      // Wrap each Supabase query in an async fn so TS sees a native Promise
      const [groupsRes, statusColsRes, assignedItemsRes, assignedCellValues] =
        await Promise.all([
          // 2a: All groups for user's boards
          boardIds.length > 0
            ? (async () => supabase.from("groups").select("id, board_id").in("board_id", boardIds))()
            : Promise.resolve({ data: [] as { id: string; board_id: string }[] }),

          // 2b: Status columns for all user boards (needed for done-item counting)
          boardIds.length > 0
            ? (async () => supabase.from("columns").select("id, board_id").in("board_id", boardIds).eq("type", "status"))()
            : Promise.resolve({ data: [] as { id: string; board_id: string }[] }),

          // 2c: Assigned items with group + board info
          assignedItemIds.length > 0
            ? (async () => supabase.from("items").select(`
                id, name, description, group_id, position, created_at, created_by,
                groups (
                  id, name, board_id, position, color,
                  boards ( id, name, color )
                )
              `).in("id", assignedItemIds))()
            : Promise.resolve({ data: [] as any[] }),

          // 2d: All cell values for assigned items (status + date)
          assignedItemIds.length > 0
            ? (async () => supabase.from("cell_values").select("id, item_id, column_id, value, columns ( type )").in("item_id", assignedItemIds))()
            : Promise.resolve({ data: [] as any[] }),
        ]);

      const groups = (groupsRes.data ?? []) as { id: string; board_id: string }[];
      const statusCols = (statusColsRes.data ?? []) as { id: string; board_id: string }[];
      const statusColIds = statusCols.map((c) => c.id);

      // Get all item IDs from groups
      const groupIds = groups.map((g) => g.id);

      // ── Phase 3: parallel — depends on phase 2 results ────────────────────
      const [allItemsRes, doneItemsRes] = await Promise.all([
        // 3a: All items across user's boards (for total count + progress)
        groupIds.length > 0
          ? (async () => supabase.from("items").select("id, group_id").in("group_id", groupIds))()
          : Promise.resolve({ data: [] as { id: string; group_id: string }[] }),

        // 3b: Done items — single batched query across all boards, no N+1
        groupIds.length > 0 && statusColIds.length > 0
          ? (async () => supabase.from("cell_values").select("item_id, column_id").in("column_id", statusColIds).eq("value", "done"))()
          : Promise.resolve({ data: [] as { item_id: string; column_id: string }[] }),
      ]);

      const allItems = (allItemsRes.data ?? []) as { id: string; group_id: string }[];
      const doneItems = (doneItemsRes.data ?? []) as { item_id: string; column_id: string }[];
      const doneItemIds = new Set(doneItems.map((d) => d.item_id));

      // ── Build board stats ──────────────────────────────────────────────────
      const groupsByBoard = new Map<string, string[]>();
      groups.forEach((g) => {
        const list = groupsByBoard.get(g.board_id) ?? [];
        list.push(g.id);
        groupsByBoard.set(g.board_id, list);
      });

      const itemsByGroupId = new Map<string, string[]>();
      allItems.forEach((item) => {
        const list = itemsByGroupId.get(item.group_id) ?? [];
        list.push(item.id);
        itemsByGroupId.set(item.group_id, list);
      });

      // Status col per board
      const statusColByBoard = new Map<string, string>();
      statusCols.forEach((c) => statusColByBoard.set(c.board_id, c.id));

      const boardStats: BoardStat[] = boards.slice(0, 4).map((board: any) => {
        const ws = board.workspaces as { name: string } | null;
        const boardGroupIds = groupsByBoard.get(board.id) ?? [];
        const totalItems = boardGroupIds.reduce(
          (sum, gid) => sum + (itemsByGroupId.get(gid)?.length ?? 0),
          0
        );
        const boardStatusColId = statusColByBoard.get(board.id);
        const doneCount = boardGroupIds.reduce((sum, gid) => {
          const itemsInGroup = itemsByGroupId.get(gid) ?? [];
          return (
            sum +
            itemsInGroup.filter((iid) => {
              if (!boardStatusColId) return false;
              return doneItemIds.has(iid);
            }).length
          );
        }, 0);

        return {
          id: board.id,
          name: board.name,
          color: board.color ?? "#8b5cf6",
          workspace_name: ws?.name ?? "Workspace",
          total_items: totalItems,
          done_items: doneCount,
        };
      });

      setRecentBoards(boardStats);

      // ── Build stats ───────────────────────────────────────────────────────
      const rawCells = (assignedCellValues.data ?? []) as any[];
      const enrichedTasks: EnrichedTask[] = ((assignedItemsRes.data ?? []) as any[]).map((item) => {
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
          group: group as Group,
          group_name: group?.name ?? "Unknown Group",
          board_id: board?.id ?? "",
          board_name: board?.name ?? "Unknown Board",
          board_color: board?.color ?? "#8b5cf6",
          status_value: statusCell?.value ?? null,
          due_date_raw: dateCell?.value ?? null,
          due_date: dueDate,
          all_cell_values: itemCells,
        };
      });

      // Sort tasks: overdue first, then today, upcoming, no date
      const bucketOrder: DueBucket[] = ["overdue", "today", "upcoming", "nodate"];
      const sorted = [...enrichedTasks].sort((a, b) => {
        const ba = bucketOrder.indexOf(getBucket(a.due_date));
        const bb = bucketOrder.indexOf(getBucket(b.due_date));
        if (ba !== bb) return ba - bb;
        if (a.due_date && b.due_date) return a.due_date.getTime() - b.due_date.getTime();
        return 0;
      });

      const topTasks = sorted.slice(0, 10);
      setMyTasks(topTasks);

      const overdueCount = enrichedTasks.filter(
        (t) => getBucket(t.due_date) === "overdue"
      ).length;

      setStats({
        totalBoards: boards.length,
        totalItems: allItems.length,
        assignedToMe: enrichedTasks.length,
        overdueItems: overdueCount,
      });

      setLoading(false);
    }

    void load();
  }, []);

  const openTask = useCallback(async (task: EnrichedTask) => {
    const supabase = createClient();
    const { data: columns } = await supabase
      .from("columns")
      .select("*")
      .eq("board_id", task.board_id)
      .order("position", { ascending: true });

    setPanel({
        item: {
          id: task.id,
          name: task.name,
          description: task.description ?? null,
          group_id: task.group_id,
        position: task.position,
        created_at: task.created_at,
        created_by: task.created_by,
      },
      group: task.group,
      boardId: task.board_id,
      boardName: task.board_name,
      columns: (columns ?? []) as Column[],
      cellValues: task.all_cell_values,
    });
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col min-h-full bg-[#111111] text-white overflow-auto"
    >
      {/* ── Hero Header ────────────────────────────────────────────────────── */}
      <div className="relative px-8 pt-12 pb-10 shrink-0 border-b border-white/[0.04]">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/25 mb-2">
          Dashboard
        </p>
        <ClientGreeting firstName={firstName} />
        <p className="mt-2 text-sm text-white/30">
          Here&apos;s everything happening in your workspace.
        </p>
      </div>

      <div className="px-8 py-8 flex-1 space-y-10">

        {/* ── Stats Row ──────────────────────────────────────────────────────── */}
        <section>
          <SectionHeader icon={<LayoutDashboard size={13} />} label="Overview" />
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {loading ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : (
              <>
                <StatCard
                  label="Total Boards"
                  value={stats.totalBoards}
                  icon={<LayoutDashboard size={14} />}
                />
                <StatCard
                  label="Total Items"
                  value={stats.totalItems}
                  icon={<Layers size={14} />}
                />
                <StatCard
                  label="Assigned to Me"
                  value={stats.assignedToMe}
                  icon={<User size={14} />}
                  accent="#8b5cf6"
                />
                <StatCard
                  label="Overdue"
                  value={stats.overdueItems}
                  icon={<AlertCircle size={14} />}
                  accent={stats.overdueItems > 0 ? "#ef4444" : undefined}
                />
              </>
            )}
          </div>
        </section>

        {/* ── Recent Boards ─────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <SectionHeader icon={<LayoutDashboard size={13} />} label="Recent Boards" />
            <Link
              href="/dashboard"
              className="text-[11px] text-white/25 hover:text-white/60 transition-colors flex items-center gap-1"
            >
              View all <ArrowUpRight size={11} />
            </Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <BoardCardSkeleton />
              <BoardCardSkeleton />
              <BoardCardSkeleton />
              <BoardCardSkeleton />
            </div>
          ) : recentBoards.length === 0 ? (
            <EmptyState icon={<LayoutDashboard size={24} />} text="Welcome — Create your first workspace to get started" sub="Use the sidebar to create your first workspace and board →" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {recentBoards.map((board) => (
                <BoardCard key={board.id} board={board} />
              ))}
            </div>
          )}
        </section>

        {/* ── My Tasks ──────────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <SectionHeader icon={<CheckCircle2 size={13} />} label="My Tasks" />
            <Link
              href="/dashboard/my-work"
              className="text-[11px] text-white/25 hover:text-white/60 transition-colors flex items-center gap-1"
            >
              View all <ArrowUpRight size={11} />
            </Link>
          </div>
          {loading ? (
            <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] overflow-hidden">
              {[1, 2, 3].map((i) => (
                <div key={i}>
                  {i > 1 && <div className="h-px bg-[#2a2a2a]" />}
                  <TaskRowSkeleton />
                </div>
              ))}
            </div>
          ) : myTasks.length === 0 ? (
            <EmptyState icon={<CheckCircle2 size={24} />} text="You're all caught up — No tasks assigned to you" sub="Items assigned to you will appear here" />
          ) : (
            <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] overflow-hidden">
              {myTasks.map((task, idx) => (
                <div key={task.id}>
                  {idx > 0 && <div className="h-px bg-[#2a2a2a]" />}
                  <motion.button
                    whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                    onClick={() => openTask(task)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors"
                  >
                    <div
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ backgroundColor: task.board_color }}
                    />
                    <span className="flex-1 text-[13px] font-medium text-white/80 truncate">
                      {task.name || "Untitled"}
                    </span>
                    <span className="hidden sm:block text-[11px] text-white/25 truncate max-w-[120px] shrink-0">
                      {task.board_name}
                    </span>
                    <div className="shrink-0">
                      <StatusPill value={task.status_value} />
                    </div>
                    <div className="shrink-0 w-24 text-right">
                      {task.due_date ? (
                        <span className={`text-[11px] font-medium ${
                          getBucket(task.due_date) === "overdue"
                            ? "text-red-400"
                            : getBucket(task.due_date) === "today"
                            ? "text-amber-400"
                            : "text-white/40"
                        }`}>
                          {formatDueDate(task.due_date, task.due_date_raw)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-white/15 italic">No date</span>
                      )}
                    </div>
                  </motion.button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Recent Activity ───────────────────────────────────────────────── */}
        <section>
          <SectionHeader icon={<Activity size={13} />} label="Recent Activity" />
          <div className="mt-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-5">
            {loading ? (
              <div className="space-y-4 animate-pulse">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-white/[0.06] shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 rounded bg-white/[0.05]" />
                      <div className="h-2 w-1/4 rounded bg-white/[0.04]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activity.length === 0 ? (
              <EmptyState icon={<Activity size={24} />} text="No activity yet" sub="Actions on boards and items will appear here" />
            ) : (
              <div className="space-y-4">
                {activity.map((entry) => (
                  <ActivityFeedEntry key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </section>
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
              setMyTasks((prev) =>
                prev.map((t) => {
                  if (t.id !== itemId) return t;
                  const updated: CellValue = { id: colId, item_id: itemId, column_id: colId, value };
                  const existing = t.all_cell_values.findIndex((cv) => cv.column_id === colId);
                  const newCells = existing >= 0
                    ? t.all_cell_values.map((cv) => cv.column_id === colId ? updated : cv)
                    : [...t.all_cell_values, updated];
                  return { ...t, all_cell_values: newCells };
                })
              );
            }}
            onNameChange={(id, name) => {
              setMyTasks((prev) => prev.map((t) => t.id === id ? { ...t, name } : t));
            }}
            onDescriptionChange={(id, description) => {
              setMyTasks((prev) => prev.map((t) => t.id === id ? { ...t, description } : t));
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

// ── Shared helpers ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-white/30">{icon}</div>
      <span className="text-[11px] font-bold uppercase tracking-widest text-white/30">
        {label}
      </span>
    </div>
  );
}

function EmptyState({ icon, text, sub }: { icon: React.ReactNode; text: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3 text-white/15">
        {icon}
      </div>
      <p className="text-sm text-white/40 font-medium">{text}</p>
      <p className="text-xs text-white/20 mt-1">{sub}</p>
    </div>
  );
}
