"use client";

import { useMemo, useState, useEffect } from "react";
import { DndContext, DragOverlay, closestCenter, type DragStartEvent, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { upsertCellValue } from "@/lib/supabase/upsert-cell";
import { format, isValid } from "date-fns";
import { STATUS_OPTIONS, type StatusValue } from "./status-cell";
import type { Column, Item, CellValue } from "@/types/database";
import type { GroupWithData } from "./board-client";
import { useToastStore } from "@/lib/store/toast-store";
import { Calendar, User, Plus, MoreHorizontal } from "lucide-react";

interface KanbanBoardProps {
  groups: GroupWithData[];
  columns: Column[];
  cellValues: CellValue[];
  boardId: string;
  userId: string;
  onOpenItem: (item: Item) => void;
  canCreateItems: boolean;
  canEditItems: boolean;
}

const KANBAN_COLUMNS = [
  { label: "No Status", value: null as StatusValue, color: "#666666", bg: "#ffffff08" },
  ...STATUS_OPTIONS,
];

export function KanbanBoard({ groups, columns, cellValues, userId, onOpenItem, canCreateItems, canEditItems }: KanbanBoardProps) {
  useEffect(() => {
    console.log('cellValues sample:', JSON.stringify(cellValues.slice(0, 5)))
    console.log('columns:', JSON.stringify(columns))
    console.log('status column:', JSON.stringify(columns.find(c => c.type === 'status')))
  }, [cellValues, columns]);

  const statusColumn = columns.find((c) => c.type === "status");
  const assigneeColumn = columns.find((c) => c.type === "person");
  const dateColumn = columns.find((c) => c.type === "date");
  const { addToast } = useToastStore();
  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const [addingToStatus, setAddingToStatus] = useState<StatusValue | undefined>(undefined);
  const [newItemName, setNewItemName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultGroupId = groups[0]?.id;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Derive items mapped by status
  const itemsByStatus = useMemo(() => {
    const map = new Map<StatusValue, (Item & { cell_values: CellValue[] })[]>();
    KANBAN_COLUMNS.forEach((col) => map.set(col.value, []));

    if (!statusColumn) return map;

    groups.forEach((group) => {
      group.items.forEach((item) => {
        // Find the status value for this specific item from the flat cellValues array
        const statusCellValue = cellValues.find(
          (cv) => cv.item_id === item.id && cv.column_id === statusColumn.id
        );
        
        const statusVal = (statusCellValue?.value as StatusValue) || null;
        
        // Push to appropriate status column, or "No Status" if unknown
        if (map.has(statusVal)) {
          map.get(statusVal)!.push(item);
        } else {
          map.get(null)!.push(item);
        }
      });
    });

    return map;
  }, [groups, statusColumn, cellValues]);

  const handleDragStart = (event: DragStartEvent) => {
    if (!canEditItems) return;
    const { active } = event;
    const item = groups.flatMap(g => g.items).find(i => i.id === active.id);
    if (item) setActiveItem(item);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!canEditItems) return;
    const { active, over } = event;
    setActiveItem(null);

    if (!over || !statusColumn) return;

    // over.id could be the drop container (status value) or another item
    let newStatus: StatusValue = null;
    const isStatusColumn = KANBAN_COLUMNS.some(c => c.value === over.id || `col-${c.value}` === over.id);
    
    if (isStatusColumn) {
      const parsedStatus = String(over.id).replace('col-', '');
      newStatus = parsedStatus === "null" ? null : (parsedStatus as StatusValue);
    } else {
      // Find the status of the item we dropped over
      const targetItem = groups.flatMap(g => g.items).find(i => i.id === over.id);
      if (targetItem) {
        newStatus = (targetItem.cell_values?.find((cv) => cv.column_id === statusColumn.id)?.value as StatusValue) || null;
      }
    }

    const draggedItem = groups.flatMap(g => g.items).find(i => i.id === active.id);
    if (!draggedItem) return;

    const currentStatus = (draggedItem.cell_values?.find((cv) => cv.column_id === statusColumn.id)?.value as StatusValue) || null;

    if (newStatus !== currentStatus) {
      if (!draggedItem?.id || !statusColumn?.id) {
        console.error("Missing item_id or column_id for status upsert");
        return;
      }
      try {
        const supabase = createClient();
        const { error } = await upsertCellValue(supabase, draggedItem.id, statusColumn.id, newStatus);
        if (error) throw error;
      } catch (error) {
        console.error("Failed to update status in Kanban:", error);
        addToast({ title: "Error", body: "Failed to update item status", type: "default" });
      }
    }
  };

  const handleQuickAdd = async (status: StatusValue) => {
    if (!newItemName.trim() || !defaultGroupId || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      
      // 1. Create the item
      const insertPayload = {
        name: newItemName.trim(),
        group_id: defaultGroupId,
        position: 0,
        created_by: userId,
      };
      console.log('kanban inserting item:', insertPayload);

      if (!insertPayload.group_id || !insertPayload.created_by) {
        console.error('kanban addItem aborted: missing required fields', insertPayload);
        return;
      }

      const { data: item, error: itemError } = await supabase
        .from("items")
        .insert(insertPayload)
        .select()
        .single();
        
      if (itemError) throw itemError;

      // 2. Set the status cell
      if (statusColumn) {
        const { error: cellError } = await supabase
          .from("cell_values")
          .insert({
            item_id: item.id,
            column_id: statusColumn.id,
            value: status
          });
        if (cellError) throw cellError;
      }

      setNewItemName("");
      setAddingToStatus(undefined);
    } catch (error) {
      console.error("Failed to quick add item:", error);
      addToast({ title: "Error", body: "Failed to create item", type: "default" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-x-auto gap-4 pb-4 h-full custom-scrollbar items-start">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {KANBAN_COLUMNS.map((col) => {
          const colItems = itemsByStatus.get(col.value) || [];
          const columnId = `col-${col.value}`;
          return (
            <div key={columnId} className="flex-shrink-0 w-72 bg-[#1a1a1a] rounded-xl border border-white/5 flex flex-col max-h-full">
              <div className="px-4 pl-5 py-3 border-b border-white/5 sticky top-0 bg-[#1a1a1a] rounded-t-xl z-10">
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-0.5 rounded text-[11px] font-semibold"
                    style={{ backgroundColor: col.bg, color: col.color }}
                  >
                    {col.label}
                  </span>
                  <span className="text-white/30 text-[11px] ml-auto">{colItems.length}</span>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-[100px] flex flex-col gap-2">
                <SortableContext id={columnId} items={colItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  {colItems.map((item) => (
                    <KanbanCard
                      key={item.id}
                      item={item}
                      assigneeColumnId={assigneeColumn?.id}
                      dateColumnId={dateColumn?.id}
                      onClick={() => onOpenItem(item)}
                      canEdit={canEditItems}
                    />
                  ))}
                </SortableContext>

                {canCreateItems && (addingToStatus === col.value ? (
                  <div className="bg-[#222222] border border-indigo-500/30 rounded-lg p-2 shadow-xl">
                    <input
                      autoFocus
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      onBlur={() => !newItemName && setAddingToStatus(undefined)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleQuickAdd(col.value);
                        if (e.key === "Escape") setAddingToStatus(undefined);
                      }}
                      placeholder="What needs to be done?"
                      className="w-full bg-transparent text-[13px] text-white outline-none mb-2 px-1"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button 
                        onClick={() => setAddingToStatus(undefined)}
                        className="px-2 py-1 rounded text-[11px] font-medium text-white/30 hover:text-white/60 transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => handleQuickAdd(col.value)}
                        disabled={!newItemName.trim() || isSubmitting}
                        className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-2 py-1 rounded text-[11px] font-bold transition-colors"
                      >
                        {isSubmitting ? "Adding..." : "Add Item"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingToStatus(col.value)}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[12px] text-white/20 hover:text-white/50 hover:bg-white/[0.03] transition-all group mt-1"
                  >
                    <Plus size={14} className="group-hover:scale-110 transition-transform" />
                    Add Item
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <DragOverlay>
          {activeItem && (
            <div className="opacity-90 shadow-2xl rotate-2">
              <KanbanCard
                item={activeItem as any}
                assigneeColumnId={assigneeColumn?.id}
                dateColumnId={dateColumn?.id}
                onClick={() => {}}
                canEdit={false}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function KanbanCard({
  item,
  assigneeColumnId,
  dateColumnId,
  onClick,
  canEdit,
}: {
  item: Item & { cell_values: CellValue[] };
  assigneeColumnId?: string;
  dateColumnId?: string;
  onClick: () => void;
  canEdit: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const dateValue = dateColumnId ? item.cell_values?.find((cv) => cv.column_id === dateColumnId)?.value : null;
  const parsedDate = dateValue ? (() => { try { return JSON.parse(dateValue); } catch { return null; } })() : null;

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const isOverdue = mounted && parsedDate?.end ? new Date(parsedDate.end) < new Date() : false;
  const assigneeValue = assigneeColumnId ? item.cell_values?.find((cv) => cv.column_id === assigneeColumnId)?.value : null;

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 mb-2 cursor-pointer hover:border-[#444] transition-colors group relative"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-sm text-white leading-snug break-words">
          {item.name || "Untitled Item"}
        </span>
        <button className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white transition-opacity shrink-0">
          <MoreHorizontal size={14} />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {assigneeValue && assigneeValue !== "[]" && (
            <div className="flex -space-x-1.5 overflow-hidden">
               <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center border border-[#1a1a1a] text-[10px] font-bold text-indigo-300 shadow-sm">
                  <User size={10} />
               </div>
            </div>
          )}
        </div>

        {parsedDate && (parsedDate.start || parsedDate.end) && (
          <div className={cn(
            "flex items-center gap-1.5 text-[10px] font-medium transition-colors",
            isOverdue ? 'text-red-400' : 'text-white/30'
          )}>
            <Calendar size={11} />
            <span>{(() => {
              try {
                const d = new Date(parsedDate.end || parsedDate.start);
                return isValid(d) ? format(d, "MMM d") : "";
              } catch {
                return "";
              }
            })()}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
