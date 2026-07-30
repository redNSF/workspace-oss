"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { Plus, ChevronDown, ChevronRight, GripVertical, MoreHorizontal, Trash2 } from "lucide-react";
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
import { createClient } from "@/lib/supabase/client";
import { ItemRow } from "./item-row";
import { ConfirmDeleteModal } from "@/components/modals/confirm-delete-modal";
import type { Group, Item, Column, CellValue } from "@/types/database";

// ── Props ──────────────────────────────────────────────────────────────────────
interface GroupSectionProps {
  group: Group;
  items: (Item & { cell_values: CellValue[] })[]; // Use lifted items
  columns: Column[];
  userId: string;
  boardId: string;
  isNewGroup?: boolean;
  onOpenItem?: (item: Item) => void;
  onItemsChange?: (items: (Item & { cell_values: CellValue[] })[]) => void; // New callback
  /** Called immediately when this group is deleted (optimistic) */
  onGroupDeleted?: (groupId: string) => void;
  onRescue?: () => void;
  canCreateItems?: boolean;
  canEditItems?: boolean;
  canDeleteItems?: boolean;
  canManageGroup?: boolean;
  /** useSortable props injected from parent (for group-level drag) */
  dragHandleProps?: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
    setNodeRef: (node: HTMLElement | null) => void;
    style: React.CSSProperties;
    isDragging: boolean;
  };
}

export function GroupSection({
  group,
  items,
  columns,
  userId,
  boardId,
  isNewGroup = false,
  onOpenItem,
  onItemsChange,
  onGroupDeleted,
  onRescue,
  canCreateItems = true,
  canEditItems = true,
  canDeleteItems = true,
  canManageGroup = true,
  dragHandleProps,
}: GroupSectionProps) {
  const groupColor = group.color ?? "#8b5cf6";

  // ── Group name editing ──────────────────────────────────────────────────────
  const [groupName, setGroupName] = useState(group.name);
  const [editingName, setEditingName] = useState(isNewGroup && canManageGroup);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  const saveGroupName = useCallback(async () => {
    setEditingName(false);
    const trimmed = groupName.trim() || "New Group";
    if (trimmed === group.name) return;

    const prevName = group.name;
    setGroupName(trimmed);
    const supabase = createClient();
    const { error } = await supabase.from("groups").update({ name: trimmed }).eq("id", group.id);

    if (error) {
      console.error("Error updating group name:", error);
      setGroupName(prevName);
    }
  }, [groupName, group.id, group.name]);
  async function executeDeleteGroup() {
    onGroupDeleted?.(group.id);
    const supabase = createClient();
    const { error } = await supabase.from("groups").delete().eq("id", group.id);
    if (error) console.error("Error deleting group:", error);
  }

  // ── Items ───────────────────────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const itemsDndId = useId();

  async function addItem() {
    if (addingItem) return;
    setAddingItem(true);
    const supabase = createClient();
    
    const nextPosition = items.length + 1;

    const insertPayload = {
      name: "",
      group_id: group.id,
      position: nextPosition,
      created_by: userId,
    };

    console.log('inserting item:', insertPayload);

    // Guard: abort if any required field is missing
    if (!insertPayload.group_id || !insertPayload.created_by) {
      console.error('addItem aborted: missing required fields', {
        group_id: insertPayload.group_id,
        created_by: insertPayload.created_by,
      });
      setAddingItem(false);
      return;
    }
    
    // Optimistic insert
    const tempId = `temp-${Date.now()}`;
    const optimisticItem: Item & { cell_values: any[] } = {
      id: tempId,
      name: "",
      description: null,
      group_id: group.id,
      position: nextPosition,
      created_at: new Date().toISOString(),
      created_by: userId,
      cell_values: [],
    };
    
    const newItemsWithOptimistic = [...items, optimisticItem];
    onItemsChange?.(newItemsWithOptimistic);

    const { data, error } = await supabase
      .from("items")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("Error adding item:", error);
      console.log('insert error:', JSON.stringify(error));
      // Revert on error
      onItemsChange?.(items);
    } else if (data) {
      console.log('item inserted successfully:', data);
      // Real-time will handle the sync, but we can update locally for snappiness
      onItemsChange?.(newItemsWithOptimistic.map(i => 
        i.id === tempId ? { ...(data as Item), cell_values: [] } : i
      ) as (Item & { cell_values: CellValue[] })[]);
    }
    setAddingItem(false);
  }

  function handleItemDragStart(event: DragStartEvent) {
    setActiveItemId(event.active.id as string);
  }

  async function handleItemDragEnd(event: DragEndEvent) {
    setActiveItemId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);

    // Optimistic update
    const reorderedWithPositions = reordered.map((item, idx) => ({
      ...item,
      position: idx + 1,
    }));
    onItemsChange?.(reorderedWithPositions);

    // Persist new positions via batch upsert
    const supabase = createClient();
    const updates = reorderedWithPositions.map((item) => ({
      id: item.id,
      position: item.position,
      group_id: group.id,
      name: item.name,
      created_by: item.created_by,
    }));

    const { error } = await supabase
      .from("items")
      .upsert(updates, { onConflict: "id" });
      
    if (error) {
      console.error("Error updating item positions:", error);
      // Revert on error
      onItemsChange?.(items);
    }
  }

  const activeItem = activeItemId ? items.find((i) => i.id === activeItemId) : null;
  const COL_WIDTH = 150;
  const DRAG_HANDLE_WIDTH = 32;
  const MORE_MENU_WIDTH = 48;

  // Build grid template columns - always include at least one column slot for alignment
  const gridTemplateColumns = `${DRAG_HANDLE_WIDTH}px 1fr ${
    columns.length > 0 
      ? columns.map(() => `${COL_WIDTH}px`).join(" ") 
      : `${COL_WIDTH}px`
  } ${MORE_MENU_WIDTH}px`;

  return (
    <div
      ref={dragHandleProps?.setNodeRef}
      className="mb-5"
      style={{
        opacity: dragHandleProps?.isDragging ? 0.4 : 1,
        ...dragHandleProps?.style,
      }}
    >
      {/* Group Header */}
      <div
        className="flex items-center gap-1.5 px-2 py-2 bg-[#1a1a1a] rounded-t-lg border border-white/[0.06] border-b-0"
        style={{ borderLeftColor: groupColor, borderLeftWidth: 3 }}
      >
        {/* Group drag handle */}
        <div
          {...(canManageGroup ? dragHandleProps?.attributes : {})}
          {...(canManageGroup ? dragHandleProps?.listeners : {})}
          className={canManageGroup
            ? "cursor-grab active:cursor-grabbing text-white/20 hover:text-white/50 p-0.5 transition-colors"
            : "text-white/10 p-0.5"}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <GripVertical size={13} />
        </div>

        <button
          onClick={() => setCollapsed((p) => !p)}
          className="text-white/30 hover:text-white/60 transition-colors p-0.5 rounded"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>

        {editingName ? (
          <input
            ref={nameInputRef}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onBlur={saveGroupName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveGroupName();
              if (e.key === "Escape") { setGroupName(group.name); setEditingName(false); }
            }}
            className="flex-1 bg-transparent text-[13px] font-semibold outline-none border-b border-white/30 focus:border-white/60 transition-colors"
            style={{ color: groupColor }}
          />
        ) : (
          <span
            onClick={() => canManageGroup && setEditingName(true)}
            className={`text-[13px] font-semibold transition-opacity ${canManageGroup ? "cursor-text hover:opacity-80" : ""}`}
            style={{ color: groupColor }}
          >
            {groupName}
          </span>
        )}

        <span className="text-[11px] text-white/25 ml-1 shrink-0">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>

        {/* Group More Menu */}
        {canManageGroup && <div className="ml-auto flex items-center relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded text-white/20 hover:text-white/60 hover:bg-white/5 transition-all"
          >
            <MoreHorizontal size={14} />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-white/10 bg-[#1e1e1e] shadow-2xl overflow-hidden p-1">
              <button
                onClick={() => {
                  setShowMenu(false);
                  setShowDeleteModal(true);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12px] font-medium text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
              >
                <Trash2 size={12} />
                Delete Group
              </button>
            </div>
          )}
        </div>}
      </div>

      {/* Table */}
      {!collapsed && (
        <div className="rounded-b-lg border border-white/[0.06] border-t-0 bg-[#161616] overflow-x-auto overflow-y-hidden">
          {/* Sticky column headers */}
          <div 
            className="sticky top-0 z-10 grid items-stretch bg-[#1a1a1a] border-b border-white/[0.06] min-h-[34px]"
            style={{ gridTemplateColumns }}
          >
            {/* Drag-handle gutter */}
            <div className="flex items-center justify-center border-r border-white/[0.04]" />
            
            {/* Name col */}
            <div className="px-3 flex items-center border-r border-white/[0.04] min-w-0">
              <span className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
                Item
              </span>
            </div>
            
            {columns.length === 0 ? (
              <div className="flex items-center px-4">
                <button
                  onClick={onRescue}
                  className="text-[10px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest transition-colors flex items-center gap-1.5"
                >
                  <Plus size={12} />
                  Restore Default Columns
                </button>
              </div>
            ) : (
              columns.map((col) => (
                <div
                  key={col.id}
                  className="border-r border-white/[0.04] flex items-center justify-center px-2 min-w-0"
                >
                  <span className="text-[11px] font-semibold text-white/30 uppercase tracking-wider truncate">
                    {col.title}
                  </span>
                </div>
              ))
            )}

            {/* More menu placeholder */}
            <div className="flex items-center justify-center" />
          </div>

          {/* Sortable items */}
          <DndContext
            id={itemsDndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleItemDragStart}
            onDragEnd={handleItemDragEnd}
          >
            <SortableContext
              items={items.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              {items.length === 0 && (
                <div className="py-5 text-center text-[12px] text-white/20">
                  No items yet
                </div>
              )}
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  columns={columns}
                  gridTemplateColumns={gridTemplateColumns}
                  boardId={boardId}
                  onOpen={onOpenItem}
                  canEdit={canEditItems}
                  canDelete={canDeleteItems}
                  onDeleted={(id) => onItemsChange?.(items.filter(i => i.id !== id))}
                  onSaved={(id, name) => {
                    const newItems = items.map(i => i.id === id ? { ...i, name } : i);
                    onItemsChange?.(newItems);
                  }}
                  onCellValueChange={(itemId, columnId, value) => {
                    const newItems = items.map(i => {
                      if (i.id !== itemId) return i;
                      const existingValues = i.cell_values ?? [];
                      const idx2 = existingValues.findIndex(cv => cv.column_id === columnId);
                      let newValues;
                      if (idx2 >= 0) {
                        newValues = existingValues.map(cv =>
                          cv.column_id === columnId ? { ...cv, value } : cv
                        );
                      } else {
                        newValues = [...existingValues, { id: columnId, item_id: itemId, column_id: columnId, value }];
                      }
                      return { ...i, cell_values: newValues };
                    });
                    onItemsChange?.(newItems as (Item & { cell_values: CellValue[] })[]);
                  }}
                />
              ))}
            </SortableContext>

            <DragOverlay>
              {activeItem && (
                <ItemRow
                  item={activeItem}
                  columns={columns}
                  gridTemplateColumns={gridTemplateColumns}
                  boardId={boardId}
                  isDragOverlay
                />
              )}
            </DragOverlay>
          </DndContext>

          {/* Add Item */}
          {canCreateItems && (
            <div
              className="grid items-center cursor-pointer hover:bg-white/[0.03] transition-colors border-t border-white/[0.04] min-h-[38px]"
              style={{ gridTemplateColumns }}
              onClick={addItem}
            >
              <div className="flex justify-center border-r border-white/[0.04] h-full items-center">
                <Plus size={13} className="text-white/25" />
              </div>
              <div className="px-3 flex items-center h-full">
                <span className="text-[12px] text-white/25 hover:text-white/50 transition-colors">
                  Add item
                </span>
              </div>
              {/* Spacer for other columns */}
              {columns.length === 0 ? (
                <div className="border-r border-white/[0.04] h-full" />
              ) : (
                columns.map((col) => (
                  <div key={col.id} className="border-r border-white/[0.04] h-full" />
                ))
              )}
              <div className="h-full" />
            </div>
          )}
        </div>
      )}

      {/* Group Delete Modal */}
      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        title="Delete Group"
        description={`Are you sure you want to delete "${groupName}" and all of its items? This action cannot be undone.`}
        onConfirm={executeDeleteGroup}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
}
