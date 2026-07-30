"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { GripVertical, MoreHorizontal, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import { StatusCell, type StatusValue } from "./status-cell";
import { PersonCell } from "./person-cell";
import { DateCell } from "./date-cell";
import { ConfirmDeleteModal } from "@/components/modals/confirm-delete-modal";
import type { Item, Column, CellValue } from "@/types/database";

interface ItemRowProps {
  item: Item & { cell_values?: CellValue[] }; // Use item's cell_values
  columns: Column[];
  gridTemplateColumns: string;
  boardId: string;
  isNew?: boolean;
  onSaved?: (id: string, name: string) => void;
  /** Called immediately when item is deleted (optimistic) */
  onDeleted?: (id: string) => void;
  /** When true the row is rendered as a static drag-overlay ghost */
  isDragOverlay?: boolean;
  /** Called when clicking the item name to open the detail panel */
  onOpen?: (item: Item) => void;
  /** Called when a cell value changes so parent can sync its state */
  onCellValueChange?: (itemId: string, columnId: string, value: string | null) => void;
  /** If false, clicking name opens panel instead of inline editing */
  canEdit?: boolean;
  canDelete?: boolean;
}

export function ItemRow({
  item,
  columns,
  gridTemplateColumns,
  boardId,
  isNew = false,
  onSaved,
  onDeleted,
  isDragOverlay = false,
  onOpen,
  onCellValueChange,
  canEdit = true,
  canDelete = true,
}: ItemRowProps) {
  const [name, setName] = useState(item.name);
  const [editing, setEditing] = useState(isNew);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
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

  // Sync internal name state with props (real-time)
  useEffect(() => {
    setName(item.name);
  }, [item.name]);

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: isDragOverlay || !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    gridTemplateColumns,
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const save = useCallback(async () => {
    setEditing(false);
    const trimmed = name.trim() || "Untitled Item";
    if (trimmed === item.name && !isNew) return;
    
    const prevName = item.name;
    setName(trimmed);
    const supabase = createClient();
    const { error } = await supabase.from("items").update({ name: trimmed }).eq("id", item.id);
    
    if (error) {
      console.error("Error saving item name:", error);
      setName(prevName);
      return;
    }
    onSaved?.(item.id, trimmed);
  }, [name, item.id, item.name, isNew, onSaved]);

  async function executeDeleteItem() {
    onDeleted?.(item.id);
    const supabase = createClient();
    const { error } = await supabase.from("items").delete().eq("id", item.id);
    if (error) console.error("Error deleting item:", error);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group/row grid items-stretch border-b border-white/[0.04] bg-[#161616] hover:bg-white/[0.025] transition-colors min-h-[38px] relative"
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className={`flex items-center justify-center transition-colors border-r border-white/[0.04] ${canEdit ? "cursor-grab active:cursor-grabbing text-white/0 group-hover/row:text-white/25 hover:!text-white/50" : "text-white/0"}`}
      >
        <GripVertical size={13} />
      </div>

      {/* Item Name */}
      <div className="flex items-center px-3 border-r border-white/[0.04] min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setName(item.name);
                setEditing(false);
              }
            }}
            className="w-full bg-transparent text-white text-[13px] outline-none border-b border-white/30 focus:border-white/60 py-0.5 transition-colors"
            placeholder="Item name"
          />
        ) : (
          <span
            onClick={() => {
              if (onOpen) onOpen(item);
              else if (canEdit) setEditing(true);
            }}
            className="text-[13px] text-white/80 hover:text-white cursor-pointer truncate transition-colors"
          >
            {name || <span className="text-white/30 italic">Untitled</span>}
          </span>
        )}
      </div>

      {/* Column Cells */}
      {columns.length === 0 ? (
        <div className="border-r border-white/[0.04] flex items-stretch min-w-0" />
      ) : (
        columns.map((col) => {
          const cellValues = item.cell_values ?? [];
          const cell = cellValues.find(
            (cv) => cv.column_id === col.id && cv.item_id === item.id
          );
          return (
            <div
              key={col.id}
              className={`border-r border-white/[0.04] flex items-stretch min-w-0 ${canEdit ? "" : "pointer-events-none"}`}
            >
              {col.type === "status" ? (
                <StatusCell
                  itemId={item.id}
                  boardId={boardId}
                  columnId={col.id}
                  value={(cell?.value as StatusValue) ?? null}
                  onSaved={(iid, cid, val) => onCellValueChange?.(iid, cid, val)}
                />
              ) : col.type === "person" ? (
                <PersonCell
                  itemId={item.id}
                  boardId={boardId}
                  columnId={col.id}
                  value={cell?.value ?? null}
                  onSaved={(iid, cid, val) => onCellValueChange?.(iid, cid, val)}
                />
              ) : col.type === "date" ? (
                <DateCell
                  itemId={item.id}
                  columnId={col.id}
                  value={cell?.value ?? null}
                  onSaved={(iid, cid, val) => onCellValueChange?.(iid, cid, val)}
                />
              ) : (
                <span className="px-3 text-[12px] text-white/20">—</span>
              )}
            </div>
          );
        })
      )}

      {/* More Menu */}
      {!isDragOverlay && canDelete && (
        <div className="flex items-center justify-center relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-md text-white/0 group-hover/row:text-white/30 hover:!text-white/60 hover:bg-white/5 transition-all"
          >
            <MoreHorizontal size={14} />
          </button>

          {showMenu && (
            <div className="absolute right-2 top-[30px] z-50 w-32 rounded-lg border border-white/10 bg-[#1e1e1e] shadow-2xl overflow-hidden p-1">
              <button
                onClick={() => {
                  setShowMenu(false);
                  setShowDeleteModal(true);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12px] font-medium text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </div>
          )}
        </div>
      )}
      {/* Item Delete Modal */}
      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        title="Delete Item"
        description={`Are you sure you want to delete "${name || 'Untitled Item'}"? This action cannot be undone.`}
        onConfirm={executeDeleteItem}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
}
