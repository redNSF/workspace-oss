"use client";

import { useState, useEffect, useCallback, useId, useRef } from "react";
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Rows3, MoreHorizontal, Trash2, UserPlus, Activity, X, LayoutGrid } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToastStore } from "@/lib/store/toast-store";
import { KanbanBoard } from "./kanban-board";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import { GroupSection } from "./group-section";
import { ItemDetailPanel } from "./item-detail-panel";
import { ShareBoardModal } from "@/components/modals/share-board-modal";
import type { Group, Item, Column, CellValue } from "@/types/database";

export interface GroupWithData extends Group {
  items: (Item & { cell_values: CellValue[] })[];
}

export interface BoardCapabilities {
  canManageBoard: boolean;
  canShareBoard: boolean;
  canDeleteBoard: boolean;
  canCreateItems: boolean;
  canEditItems: boolean;
  canDeleteItems: boolean;
  canCreateComments: boolean;
  canDeleteComments: boolean;
}

interface BoardClientProps {
  boardId: string;
  boardName: string;
  boardDescription?: string | null;
  workspaceName: string;
  accentColor: string;
  initialGroups: GroupWithData[];
  columns: Column[];
  userId: string;
  capabilities: BoardCapabilities;
}

const GROUP_COLORS = [
  "#8b5cf6", "#3b82f6", "#22c55e", "#f59e0b",
  "#ef4444", "#ec4899", "#14b8a6", "#f97316",
];

// ── Skeleton ───────────────────────────────────────────────────────────────────
function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-5 animate-pulse">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-lg border border-white/[0.06] overflow-hidden">
          {/* Group header */}
          <div className="bg-[#1a1a1a] px-4 py-3 flex items-center gap-3">
            <div className="w-20 h-3 rounded bg-white/[0.08]" />
            <div className="ml-2 w-8 h-2.5 rounded bg-white/[0.05]" />
          </div>
          {/* Header row */}
          <div className="bg-[#1a1a1a] border-t border-white/[0.04] px-4 py-2 flex gap-4">
            <div className="flex-1 h-2.5 rounded bg-white/[0.05]" />
            <div className="w-24 h-2.5 rounded bg-white/[0.05]" />
            <div className="w-24 h-2.5 rounded bg-white/[0.05]" />
          </div>
          {/* Item rows */}
          {[0, 1, 2].map((j) => (
            <div key={j} className="bg-[#161616] border-t border-white/[0.04] px-4 py-2.5 flex items-center gap-4">
              <div className="flex-1 h-3 rounded bg-white/[0.06]" style={{ width: `${60 + j * 15}%` }} />
              <div className="w-20 h-5 rounded bg-white/[0.05]" />
              <div className="w-20 h-2.5 rounded bg-white/[0.04]" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Thin wrapper that wires useSortable → GroupSection's dragHandleProps ───────
function SortableGroupSection(props: {
  group: GroupWithData;
  columns: Column[];
  userId: string;
  boardId: string;
  isNewGroup: boolean;
  onOpenItem?: (item: Item) => void;
  onItemsChange?: (items: (Item & { cell_values: CellValue[] })[]) => void;
  onGroupDeleted?: (groupId: string) => void;
  canCreateItems: boolean;
  canEditItems: boolean;
  canDeleteItems: boolean;
  canManageGroup: boolean;
  onRescue?: () => void;
}) {
  const { group, onItemsChange, onGroupDeleted, onRescue, canManageGroup, ...rest } = props;
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: group.id, disabled: !canManageGroup });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <GroupSection
      group={group}
      items={group.items}
      onItemsChange={onItemsChange}
      onGroupDeleted={onGroupDeleted}
      onRescue={onRescue}
      canManageGroup={canManageGroup}
      dragHandleProps={{ attributes, listeners, setNodeRef, style, isDragging }}
      {...rest}
    />
  );
}

// ── Ghost overlay for group drag ───────────────────────────────────────────────
function GroupGhost({ group }: { group: GroupWithData }) {
  const color = group.color ?? "#8b5cf6";
  return (
    <div
      className="rounded-t-lg border border-white/[0.06] bg-[#1a1a1a] px-3 py-2 flex items-center gap-2 opacity-90 shadow-2xl"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <span className="text-[13px] font-semibold" style={{ color }}>
        {group.name}
      </span>
      <span className="text-[11px] text-white/25 ml-1">
        {group.items.length} {group.items.length === 1 ? "item" : "items"}
      </span>
    </div>
  );
}

// ── Main board client ──────────────────────────────────────────────────────────
export function BoardClient({
  boardId,
  boardName,
  boardDescription,
  workspaceName,
  accentColor,
  initialGroups,
  columns,
  userId,
  capabilities,
}: BoardClientProps) {
  const [groups, setGroups] = useState<GroupWithData[]>(initialGroups);
  const loading = false;
  const [newGroupId, setNewGroupId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [showBoardMenu, setShowBoardMenu] = useState(false);
  const [description, setDescription] = useState(boardDescription || "");
  const [view, setView] = useState<"table" | "kanban">("table");
  const { addToast } = useToastStore();
  const [showShareModal, setShowShareModal] = useState(false);
  const [showBoardActivity, setShowBoardActivity] = useState(false);
  const boardMenuRef = useRef<HTMLDivElement>(null);
  const [selectedItem, setSelectedItem] = useState<{
    item: Item;
    group: Group;
    cellValues: CellValue[];
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const groupsDndId = useId();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Close board menu on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (boardMenuRef.current && !boardMenuRef.current.contains(e.target as Node)) {
        setShowBoardMenu(false);
      }
    }
    if (showBoardMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showBoardMenu]);

  const createMissingColumns = useCallback(async () => {
    try {
      const supabase = createClient();
      const columnsToCreate = [
        { title: "Status",    type: "status", position: 0, board_id: boardId },
        { title: "Assignee",  type: "person", position: 1, board_id: boardId },
        { title: "Due Date",  type: "date",   position: 2, board_id: boardId },
      ];
      
      const { error } = await supabase.from("columns").insert(columnsToCreate);
      if (error) throw error;
      router.refresh();
    } catch (error) {
      console.error("Rescue column creation failed:", error);
      addToast({ title: "Error", body: "Something went wrong — please try again", type: "default" });
    }
  }, [boardId, router, addToast]);
  useEffect(() => {
    const supabase = createClient();
    
    // Subscribe to group changes
    const groupChannel = supabase
      .channel(`board-groups-${boardId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "groups", filter: `board_id=eq.${boardId}` },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const newGroup = payload.new as Group;
            setGroups(prev => {
              if (prev.find(g => g.id === newGroup.id)) return prev;
              return [...prev, { ...newGroup, items: [] }].sort((a, b) => a.position - b.position);
            });
          } else if (payload.eventType === "UPDATE") {
            const updatedGroup = payload.new as Group;
            setGroups(prev => prev.map(g => 
              g.id === updatedGroup.id ? { ...g, ...updatedGroup } : g
            ).sort((a, b) => a.position - b.position));
          } else if (payload.eventType === "DELETE") {
            setGroups(prev => prev.filter(g => g.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // Subscribe to item changes for this board's groups
    const itemChannel = supabase
      .channel(`board-items-${boardId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items" }, // We filter client-side or use a complex filter
        async (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const item = payload.new as Item;
            // Only care if this item belongs to one of our groups
            setGroups(prev => {
              return prev.map(g => {
                if (g.id === item.group_id) {
                  const exists = g.items.find(i => i.id === item.id);
                  let newItems;
                  if (exists) {
                    newItems = g.items.map(i => i.id === item.id ? { ...i, ...item } : i);
                  } else {
                    newItems = [...g.items, { ...item, cell_values: [] }];
                  }
                  return { ...g, items: newItems.sort((a, b) => a.position - b.position) };
                }
                // If it was moved FROM this group
                if (payload.eventType === "UPDATE" && g.items.find(i => i.id === item.id)) {
                   return { ...g, items: g.items.filter(i => i.id !== item.id) };
                }
                return g;
              });
            });
          } else if (payload.eventType === "DELETE") {
            setGroups(prev => prev.map(g => ({
              ...g,
              items: g.items.filter(i => i.id !== payload.old.id)
            })));
          }
        }
      )
      .subscribe();

    // Subscribe to cell_value changes
    const cellValueChannel = supabase
      .channel(`board-cell-values-${boardId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cell_values" },
        async (payload) => {
          const cellValue = (payload.new || payload.old) as CellValue;
          setGroups(prev => prev.map(g => ({
            ...g,
            items: g.items.map(i => {
              if (i.id === cellValue.item_id) {
                const existingValues = i.cell_values || [];
                let newValues;
                if (payload.eventType === "DELETE") {
                  newValues = existingValues.filter(v => v.column_id !== cellValue.column_id);
                } else {
                  const exists = existingValues.find(v => v.column_id === cellValue.column_id);
                  if (exists) {
                    newValues = existingValues.map(v => v.column_id === cellValue.column_id ? cellValue : v);
                  } else {
                    newValues = [...existingValues, cellValue];
                  }
                }
                return { ...i, cell_values: newValues };
              }
              return i;
            })
          })));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(groupChannel);
      supabase.removeChannel(itemChannel);
      supabase.removeChannel(cellValueChannel);
    };
  }, [boardId]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  async function addGroup() {
    try {
      const supabase = createClient();
      const nextPosition = groups.length;
      const color = GROUP_COLORS[nextPosition % GROUP_COLORS.length];

      const { data, error } = await supabase
        .from("groups")
        .insert({ name: "New Group", board_id: boardId, position: nextPosition, color })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        const newGroup: GroupWithData = { ...(data as Group), items: [] };
        setGroups((prev) => [...prev, newGroup]);
        setNewGroupId(newGroup.id);
      }
    } catch (error) {
      console.error("Error adding group:", error);
      addToast({ title: "Error", body: "Something went wrong — please try again", type: "default" });
    }
  }

  function handleGroupDragStart(event: DragStartEvent) {
    setActiveGroupId(event.active.id as string);
  }

  async function handleGroupDragEnd(event: DragEndEvent) {
    setActiveGroupId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = groups.findIndex((g) => g.id === active.id);
    const newIndex = groups.findIndex((g) => g.id === over.id);
    const reordered = arrayMove(groups, oldIndex, newIndex);

    // Optimistic update
    setGroups(reordered.map((g, idx) => ({ ...g, position: idx })));

    const supabase = createClient();
    // Batch update positions using upsert
    const updates = reordered.map((g, idx) => ({
      id: g.id,
      position: idx,
      board_id: boardId, // Required for some RLS policies
      name: g.name, // Required for upsert if not using ON CONFLICT (id) DO UPDATE
    }));

    const { error } = await supabase
      .from("groups")
      .upsert(updates, { onConflict: "id" });
      
    if (error) {
      console.error("Error updating group positions:", error);
      // Revert on error
      setGroups(groups);
    }
  }

  async function deleteBoard() {
    if (!confirm(`Are you sure you want to delete the board "${boardName}"? This cannot be undone.`)) return;
    
    try {
      const supabase = createClient();
      const { error } = await supabase.from("boards").delete().eq("id", boardId);
      if (error) throw error;
      router.push("/dashboard");
    } catch (error) {
      console.error("Error deleting board:", error);
      addToast({ title: "Error", body: "Something went wrong — please try again", type: "default" });
    }
  }

  async function updateDescription() {
    if (description === boardDescription) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from("boards").update({ description }).eq("id", boardId);
      if (error) throw error;
    } catch (error) {
      console.error("Error updating description:", error);
      addToast({ title: "Error", body: "Failed to update description", type: "default" });
    }
  }

  /** Update items within a group (called by GroupSection) */
  const handleItemsChange = useCallback((groupId: string, newItems: (Item & { cell_values: CellValue[] })[]) => {
    setGroups(prev => prev.map(g => 
      g.id === groupId ? { ...g, items: newItems } : g
    ));
  }, []);

  /** Called by ItemDetailPanel when any cell is saved -- updates the board row immediately */
  const handlePanelCellValueChange = useCallback((itemId: string, columnId: string, value: string | null) => {
    setGroups(prev => prev.map(g => ({
      ...g,
      items: g.items.map(i => {
        if (i.id !== itemId) return i;
        const existingValues = i.cell_values ?? [];
        const idx = existingValues.findIndex(cv => cv.column_id === columnId);
        const newValues = idx >= 0
          ? existingValues.map(cv => cv.column_id === columnId ? { ...cv, value } : cv)
          : [...existingValues, { id: columnId, item_id: itemId, column_id: columnId, value } as CellValue];
        return { ...i, cell_values: newValues };
      }),
    })));
    setSelectedItem(prev => {
      if (!prev || prev.item.id !== itemId) return prev;
      const existingValues = prev.cellValues ?? [];
      const idx = existingValues.findIndex(cv => cv.column_id === columnId);
      const newValues = idx >= 0
        ? existingValues.map(cv => cv.column_id === columnId ? { ...cv, value } : cv)
        : [...existingValues, { id: columnId, item_id: itemId, column_id: columnId, value } as CellValue];
      return { ...prev, cellValues: newValues };
    });
  }, []);

  const activeGroup = activeGroupId ? groups.find((g) => g.id === activeGroupId) : null;

  /** Open the detail panel for an item */
  const openItem = useCallback((item: Item) => {
    const parentGroup = groups.find((g) => g.items.some((i) => i.id === item.id));
    if (!parentGroup) return;
    const cellValues = parentGroup.items
      .find((i) => i.id === item.id)
      ?.cell_values ?? [];
    setSelectedItem({ item, group: parentGroup, cellValues });
  }, [groups]);

  // Handle deep linking via ?item= param
  useEffect(() => {
    const itemQuery = searchParams.get('item');
    if (!itemQuery || groups.length === 0) return;

    for (const g of groups) {
      const item = g.items.find(i => i.id === itemQuery);
      if (item) {
        openItem(item);
        
        // Clear the query param so refreshing doesn't reopen it
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('item');
        window.history.replaceState({}, '', newUrl.toString());
        break;
      }
    }
  }, [searchParams, groups, openItem]);

  return (
    <>
      {/* Board Header */}
      <div className="relative px-8 pt-9 pb-5 shrink-0 border-b border-white/[0.04]">
        <div
          className="absolute top-0 left-0 right-0 h-40 pointer-events-none opacity-[0.03] blur-2xl"
          style={{ background: `radial-gradient(ellipse at 30% 0%, ${accentColor}, transparent 70%)` }}
        />
        <p
          className="relative text-[10px] font-semibold uppercase tracking-[0.15em] mb-1.5"
          style={{ color: `${accentColor}99` }}
        >
          {workspaceName}
        </p>
        <div className="relative flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: accentColor }} />
            <h1 className="text-3xl font-bold tracking-tight text-white">{boardName}</h1>
          </div>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={updateDescription}
            disabled={!capabilities.canManageBoard}
            placeholder="Add board description..."
            className="w-full max-w-2xl bg-transparent border-none outline-none text-[13px] text-white/50 placeholder:text-white/20 focus:text-white/80 transition-colors"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-8 py-3 flex items-center gap-2 border-b border-white/[0.04] bg-[#111111] shrink-0">
        <div className="flex items-center bg-[#1a1a1a] rounded-lg p-0.5 border border-white/5 mr-2">
          <button
            onClick={() => setView("table")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] font-medium transition-all",
              view === "table" ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/70 hover:bg-white/5"
            )}
          >
            <Rows3 size={14} /> Table
          </button>
          <button
            onClick={() => setView("kanban")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] font-medium transition-all",
              view === "kanban" ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/70 hover:bg-white/5"
            )}
          >
            <LayoutGrid size={14} /> Kanban
          </button>
        </div>

        {capabilities.canManageBoard && (
          <button
            onClick={addGroup}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium border transition-all hover:bg-white/[0.04] active:scale-95"
            style={{ borderColor: `${accentColor}30`, color: `${accentColor}cc` }}
          >
            <Rows3 size={14} />
            New Group
          </button>
        )}

        {capabilities.canShareBoard && (
          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium border border-white/10 text-white/60 transition-all hover:bg-white/[0.04] hover:text-white active:scale-95 ml-1"
          >
            <UserPlus size={14} />
            Share
          </button>
          )}

          <button
          onClick={() => setShowBoardActivity(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium border border-white/10 text-white/60 transition-all hover:bg-white/[0.04] hover:text-white active:scale-95 ml-1"
          >
          <Activity size={14} />
          Activity
          </button>

          {capabilities.canDeleteBoard && (
            <div className="ml-auto relative" ref={boardMenuRef}>
              <button
                onClick={() => setShowBoardMenu(!showBoardMenu)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all"
              >
                <MoreHorizontal size={16} />
              </button>

              {showBoardMenu && (
                <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-white/10 bg-[#1e1e1e] shadow-2xl overflow-hidden p-1">
                  <button
                    onClick={deleteBoard}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-left text-[12px] font-medium text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                  >
                    <Trash2 size={14} />
                    Delete Board
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      {/* Board Content */}
      <div className="flex-1 overflow-x-auto">
        <div className="min-w-[800px] h-full flex flex-col px-12 py-7">
          {loading && groups.length === 0 && <BoardSkeleton />}

          {!loading && groups.length === 0 && (
            <div className="flex flex-col items-center justify-center h-72 text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 shadow-lg"
                style={{ backgroundColor: `${accentColor}12`, border: `1px solid ${accentColor}25` }}
              >
                <Plus size={24} style={{ color: `${accentColor}bb` }} />
              </div>
              <p className="text-white/40 text-sm font-medium mb-1">No groups yet</p>
              <p className="text-white/20 text-xs mb-6">Groups help you organize items on your board</p>
              {capabilities.canManageBoard && (
                <button
                  onClick={addGroup}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all active:scale-95"
                  style={{ backgroundColor: accentColor, boxShadow: `0 2px 14px ${accentColor}40` }}
                >
                  <Plus size={14} /> Add your first group
                </button>
              )}
            </div>
          )}

          {groups.length > 0 && view === "kanban" && (
            <KanbanBoard
              groups={groups}
              columns={columns}
              cellValues={groups.flatMap(g => g.items.flatMap(i => i.cell_values || []))}
              boardId={boardId}
              userId={userId}
              onOpenItem={openItem}
              canCreateItems={capabilities.canCreateItems}
              canEditItems={capabilities.canEditItems}
            />
          )}

          {groups.length > 0 && view === "table" && (
            <DndContext
              id={groupsDndId}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleGroupDragStart}
              onDragEnd={handleGroupDragEnd}
            >
              <SortableContext
                items={groups.map((g) => g.id)}
                strategy={verticalListSortingStrategy}
              >
                {groups.map((group) => (
                  <SortableGroupSection
                    key={group.id}
                    group={group}
                    columns={columns}
                    userId={userId}
                    boardId={boardId}
                    isNewGroup={group.id === newGroupId}
                    onOpenItem={openItem}
                    onRescue={createMissingColumns}
                    onItemsChange={(newItems) => handleItemsChange(group.id, newItems)}
                    onGroupDeleted={(groupId) => setGroups(prev => prev.filter(g => g.id !== groupId))}
                    canCreateItems={capabilities.canCreateItems}
                    canEditItems={capabilities.canEditItems}
                    canDeleteItems={capabilities.canDeleteItems}
                    canManageGroup={capabilities.canManageBoard}
                  />
                ))}
              </SortableContext>

              <DragOverlay>
                {activeGroup && <GroupGhost group={activeGroup} />}
              </DragOverlay>
            </DndContext>
          )}

          {groups.length > 0 && capabilities.canManageBoard && view === "table" && (
            <button
              onClick={addGroup}
              className="flex items-center gap-2 px-3 py-2 mt-2 rounded-lg text-[13px] text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all self-start"
            >
              <Plus size={14} />
              Add Group
            </button>
          )}
        </div>
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <ShareBoardModal
          boardId={boardId}
          boardName={boardName}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Board Activity Panel */}
      <AnimatePresence>
        {showBoardActivity && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setShowBoardActivity(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-[420px] bg-[#1a1a1a] border-l border-white/[0.07] flex flex-col shadow-2xl"
            >
              <div className="shrink-0 px-6 pt-6 pb-4 border-b border-white/[0.06] flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Activity size={20} className="text-indigo-400" />
                    Board Activity
                  </h2>
                  <p className="text-white/40 text-[11px] uppercase tracking-wider font-medium mt-1">{boardName}</p>
                </div>
                <button
                  onClick={() => setShowBoardActivity(false)}
                  className="text-white/30 hover:text-white/70 hover:bg-white/[0.06] p-1.5 rounded-lg transition-all"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
                <ActivityFeed boardId={boardId} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Item Detail Panel */}
      {selectedItem && (
        <ItemDetailPanel
          item={selectedItem.item}
          group={selectedItem.group}
          boardId={boardId}
          boardName={boardName}
          columns={columns}
          cellValues={selectedItem.cellValues}
          userId={userId}
          canEditItems={capabilities.canEditItems}
          canCreateComments={capabilities.canCreateComments}
          canDeleteComments={capabilities.canDeleteComments}
          onClose={() => setSelectedItem(null)}
          onCellValueChange={handlePanelCellValueChange}
          onNameChange={(id, name) => {
            setGroups((prev) =>
              prev.map((g) => ({
                ...g,
                items: g.items.map((i) =>
                  i.id === id ? { ...i, name } : i
                ),
              }))
            );
          }}
          onDescriptionChange={(id, description) => {
            setGroups((prev) =>
              prev.map((g) => ({
                ...g,
                items: g.items.map((i) =>
                  i.id === id ? { ...i, description } : i
                ),
              }))
            );
            setSelectedItem((prev) =>
              prev && prev.item.id === id
                ? { ...prev, item: { ...prev.item, description } }
                : prev
            );
          }}
        />
      )}
    </>
  );
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function ActivityFeed({ itemId, boardId }: { itemId?: string; boardId?: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      const supabase = createClient();
      let query = supabase
        .from("activity_logs")
        .select("*, profiles(full_name)")
        .order("created_at", { ascending: false })
        .limit(20);
      
      if (itemId) query = query.eq("item_id", itemId);
      if (boardId) query = query.eq("board_id", boardId);

      const { data } = await query;
      if (data) setLogs(data);
      setLoading(false);
    }
    fetchLogs();
  }, [itemId, boardId]);

  if (loading) return <div className="space-y-3 animate-pulse">
    {[0, 1, 2].map(i => <div key={i} className="h-10 bg-white/[0.03] rounded-lg" />)}
  </div>;

  if (logs.length === 0) return <p className="text-[12px] text-white/20">No activity yet.</p>;

  return (
    <div className="space-y-4">
      {logs.map((log) => (
        <div key={log.id} className="flex gap-3">
          <div className="w-6 h-6 rounded-full bg-white/[0.05] flex items-center justify-center text-[9px] font-bold text-white/60 shrink-0 border border-white/[0.05]">
            {initials(log.profiles?.full_name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-white/60 leading-tight">
              <span className="font-bold text-white/80">{log.profiles?.full_name || "System"}</span>{" "}
              {log.action}
            </p>
            <p className="text-[10px] text-white/20 mt-0.5">
              <ClientOnlyTimeAgo date={log.created_at} />
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ClientOnlyTimeAgo({ date }: { date: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <span>just now</span>;
  return <span>{formatDistanceToNow(new Date(date), { addSuffix: true })}</span>;
}
