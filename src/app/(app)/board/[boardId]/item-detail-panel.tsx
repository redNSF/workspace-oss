"use client";

import { useState, useEffect, useRef, useCallback, type ClipboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Send,
  MessageSquare,
  Activity,
  Bold,
  Heading2,
  List,
  Underline,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { upsertCellValue } from "@/lib/supabase/upsert-cell";
import { logActivity } from "@/lib/notifications";
import { createCommentNotification } from "@/app/actions/notifications";
import { formatDistanceToNow } from "date-fns";
import { StatusCell, type StatusValue } from "./status-cell";
import { PersonCell } from "./person-cell";
import { DateCell } from "./date-cell";
import { ConfirmDeleteModal } from "@/components/modals/confirm-delete-modal";
import { ItemPhotos } from "@/components/item-photos";
import type { Item, Column, CellValue, Group, Comment } from "@/types/database";

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const DESCRIPTION_ALLOWED_TAGS = new Set([
  "B",
  "BR",
  "DIV",
  "H2",
  "LI",
  "OL",
  "P",
  "STRONG",
  "U",
  "UL",
]);

function normalizeDescriptionHtml(html: string) {
  return html.trim();
}

function sanitizeDescriptionHtml(html: string) {
  if (!html) return "";
  if (typeof window === "undefined") return html;

  const parsed = new DOMParser().parseFromString(html, "text/html");

  function cleanNode(node: Node) {
    Array.from(node.childNodes).forEach(cleanNode);

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;
    if (!DESCRIPTION_ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      element.removeAttribute(attribute.name);
    });
  }

  Array.from(parsed.body.childNodes).forEach(cleanNode);
  return normalizeDescriptionHtml(parsed.body.innerHTML);
}

function getDescriptionText(html: string) {
  if (!html) return "";
  if (typeof document === "undefined") {
    return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  }

  const container = document.createElement("div");
  container.innerHTML = html;
  return (container.textContent ?? "").replace(/\u00a0/g, " ").trim();
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface ItemDetailPanelProps {
  item: Item;
  group: Group;
  boardId: string;
  boardName: string;
  columns: Column[];
  cellValues: CellValue[];
  userId: string;
  canEditItems: boolean;
  canCreateComments: boolean;
  canDeleteComments: boolean;
  onClose: () => void;
  onNameChange?: (id: string, name: string) => void;
  onDescriptionChange?: (id: string, description: string | null) => void;
  /** Called after any cell is saved so the board row updates immediately */
  onCellValueChange?: (itemId: string, columnId: string, value: string | null) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ItemDetailPanel({
  item,
  group,
  boardId,
  boardName,
  columns,
  cellValues: initialCellValues,
  userId,
  canEditItems,
  canCreateComments,
  canDeleteComments,
  onClose,
  onNameChange,
  onDescriptionChange,
  onCellValueChange,
}: ItemDetailPanelProps) {
  // ── Current user name (for comment avatar) ─────────────────────────────────
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createClient();
    supabase.from("profiles").select("full_name").eq("id", userId).single()
      .then(({ data }) => { if (data) setCurrentUserName(data.full_name); });
  }, [userId]);

  // ── Item name editing ──────────────────────────────────────────────────────
  const [name, setName] = useState(item.name);
  const [editingName, setEditingName] = useState(false);
  const nameRef = useRef<HTMLTextAreaElement>(null);
  const [description, setDescription] = useState(item.description ?? "");
  const [descriptionStatus, setDescriptionStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [descriptionFocused, setDescriptionFocused] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingName && nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
    }
  }, [editingName]);

  useEffect(() => {
    const nextDescription = sanitizeDescriptionHtml(item.description ?? "");
    setDescription(nextDescription);
    if (descriptionRef.current) {
      descriptionRef.current.innerHTML = nextDescription;
    }
    setDescriptionStatus("idle");
  }, [item.id, item.description]);

  const saveName = useCallback(async () => {
    if (!canEditItems) return;
    setEditingName(false);
    const trimmed = name.trim() || "Untitled Item";
    if (trimmed === item.name) return;
    
    const prevName = item.name;
    setName(trimmed);
    const supabase = createClient();
    const { error } = await supabase.from("items").update({ name: trimmed }).eq("id", item.id);
    
    if (error) {
      setName(prevName);
      return;
    }
    
    logActivity({
      boardId,
      itemId: item.id,
      action: `renamed item to "${trimmed}"`
    });

    onNameChange?.(item.id, trimmed);
  }, [name, item.id, item.name, boardId, onNameChange, canEditItems]);

  // ── Cell values ────────────────────────────────────────────────────────────
  const updateDescriptionFromEditor = useCallback(() => {
    const editor = descriptionRef.current;
    if (!editor) return description;

    const nextDescription = sanitizeDescriptionHtml(editor.innerHTML);
    if (nextDescription !== editor.innerHTML) {
      editor.innerHTML = nextDescription;
    }
    setDescription(nextDescription);
    setDescriptionStatus("idle");
    return nextDescription;
  }, [description]);

  const saveDescription = useCallback(async (overrideDescription?: string) => {
    if (!canEditItems) return;
    const sanitized = sanitizeDescriptionHtml(overrideDescription ?? description);
    const nextDescription = getDescriptionText(sanitized) ? sanitized : null;
    const previousDescription = sanitizeDescriptionHtml(item.description ?? "") || null;
    if (nextDescription === previousDescription) return;

    setDescriptionStatus("saving");
    const supabase = createClient();
    const { error } = await supabase
      .from("items")
      .update({ description: nextDescription })
      .eq("id", item.id);

    if (error) {
      console.error("Error saving item description:", error);
      setDescriptionStatus("error");
      return;
    }

    setDescriptionStatus("saved");
    setDescription(nextDescription ?? "");
    if (descriptionRef.current) {
      descriptionRef.current.innerHTML = nextDescription ?? "";
    }
    onDescriptionChange?.(item.id, nextDescription);
    logActivity({
      boardId,
      itemId: item.id,
      action: nextDescription ? "updated description" : "cleared description",
    });
  }, [description, item.id, item.description, boardId, onDescriptionChange, canEditItems]);

  function selectNodeContents(node: Node) {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function getDescriptionRange() {
    const editor = descriptionRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return null;
    return range;
  }

  function insertDescriptionNode(node: HTMLElement) {
    const editor = descriptionRef.current;
    if (!editor) return;

    const range = getDescriptionRange();
    if (range) {
      range.deleteContents();
      range.insertNode(node);
    } else {
      editor.append(node);
    }

    selectNodeContents(node);
    updateDescriptionFromEditor();
  }

  function insertInlineDescriptionNode(tagName: "strong" | "u", placeholder: string) {
    const range = getDescriptionRange();
    const node = document.createElement(tagName);
    if (range && !range.collapsed) {
      node.append(range.extractContents());
    } else {
      node.textContent = placeholder;
    }

    insertDescriptionNode(node);
  }

  function insertHeadingDescriptionNode() {
    const range = getDescriptionRange();
    const node = document.createElement("h2");
    if (range && !range.collapsed) {
      node.append(range.extractContents());
    } else {
      node.textContent = "Heading";
    }

    insertDescriptionNode(node);
  }

  function insertListDescriptionNode() {
    const range = getDescriptionRange();
    const selectedText = range && !range.collapsed ? range.toString() : "List item";
    const lines = selectedText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const list = document.createElement("ul");
    const firstItem = document.createElement("li");

    (lines.length ? lines : ["List item"]).forEach((line, index) => {
      const itemNode = index === 0 ? firstItem : document.createElement("li");
      itemNode.textContent = line;
      list.append(itemNode);
    });

    insertDescriptionNode(list);
    selectNodeContents(firstItem);
  }

  function runDescriptionCommand(command: string, value?: string) {
    const editor = descriptionRef.current;
    if (!editor || typeof document === "undefined") return;

    editor.focus();
    const previousHtml = editor.innerHTML;
    const commandWorked = document.execCommand(command, false, value);
    if (commandWorked || previousHtml !== editor.innerHTML) {
      updateDescriptionFromEditor();
      return;
    }

    if (command === "bold") {
      insertInlineDescriptionNode("strong", "bold text");
    } else if (command === "underline") {
      insertInlineDescriptionNode("u", "underlined text");
    } else if (command === "formatBlock") {
      insertHeadingDescriptionNode();
    } else if (command === "insertUnorderedList") {
      insertListDescriptionNode();
    }

    updateDescriptionFromEditor();
  }

  function handleDescriptionPaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    window.requestAnimationFrame(updateDescriptionFromEditor);
  }

  const descriptionIsEmpty = !getDescriptionText(description);

  const [cellValues, setCellValues] = useState<CellValue[]>(initialCellValues);

  // Re-sync when parent updates (e.g. realtime subscription updates board state)
  useEffect(() => {
    setCellValues(initialCellValues);
  }, [initialCellValues]);

  const getCell = (colId: string) =>
    cellValues.find((cv) => cv.column_id === colId && cv.item_id === item.id);

  /** Called by StatusCell / PersonCell after a successful DB save */
  function handleCellSaved(itemId: string, colId: string, value: string | null) {
    setCellValues((prev) => {
      const idx = prev.findIndex((cv) => cv.column_id === colId && cv.item_id === itemId);
      const updated = { item_id: itemId, column_id: colId, value, id: prev[idx]?.id ?? colId } as CellValue;
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });
    // Propagate up so the board row re-renders immediately
    onCellValueChange?.(itemId, colId, value);
  }

  async function saveCellValue(colId: string, value: string | null) {
    if (!item.id || !colId) {
      console.error("Missing itemId or colId for item-detail-panel upsert");
      return;
    }
    const supabase = createClient();
    // Capture previous state for rollback
    const prevCell = cellValues.find((cv) => cv.column_id === colId && cv.item_id === item.id);
    const prevValue = prevCell?.value ?? null;

    // Optimistic update first so the panel feels instant
    handleCellSaved(item.id, colId, value);
    const { data, error } = await upsertCellValue(supabase, item.id, colId, value);

    if (error) {
      // Rollback on error
      handleCellSaved(item.id, colId, prevValue);
      return;
    }

    if (data) {
      const colTitle = columns.find((c) => c.id === colId)?.title || "column";
      logActivity({ boardId, itemId: item.id, action: `updated ${colTitle}`, details: { value } });
      // Reconcile with DB-returned row (has correct id)
      setCellValues((prev) => {
        const exists = prev.findIndex((cv) => cv.column_id === colId && cv.item_id === item.id);
        if (exists >= 0) {
          const next = [...prev];
          next[exists] = data as CellValue;
          return next;
        }
        return [...prev, data as CellValue];
      });
    }
  }

  // ── Comments ───────────────────────────────────────────────────────────────
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCommentsLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("comments")
        .select("*, profiles(full_name)")
        .eq("item_id", item.id)
        .order("created_at", { ascending: true });
      if (!cancelled) {
        setComments((data as Comment[]) ?? []);
        setCommentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [item.id]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  async function submitComment() {
    const body = newComment.trim();
    if (!canCreateComments || !body || submitting) return;
    setSubmitting(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("comments")
      .insert({ item_id: item.id, user_id: userId, body })
      .select("*, profiles(full_name)")
      .single();
    if (!error && data) {
      logActivity({
        boardId,
        itemId: item.id,
        action: "added a comment"
      });

      // Notify assignees
      const personCol = columns.find(c => c.type === "person");
      if (personCol) {
        const cell = cellValues.find(cv => cv.column_id === personCol.id);
        if (cell?.value) {
          try {
            const assigneeIds = JSON.parse(cell.value);
            if (Array.isArray(assigneeIds)) {
              await Promise.all(
                assigneeIds
                  .filter((uid) => uid !== userId)
                  .map((uid) =>
                    createCommentNotification({
                      userId: uid,
                      itemId: item.id,
                      boardId,
                      commentId: data.id,
                    })
                  )
              );
            }
          } catch {}
        }
      }

      setComments((prev) => [...prev, data as Comment]);
      setNewComment("");
    }
    setSubmitting(false);
  }

  async function deleteComment(id: string) {
    const target = comments.find((comment) => comment.id === id);
    if (!target || (target.user_id !== userId && !canDeleteComments)) return;
    const supabase = createClient();
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (!error) {
      setComments((prev) => prev.filter((c) => c.id !== id));
      logActivity({
        boardId,
        itemId: item.id,
        action: "deleted a comment"
      });
    }
  }

  async function saveEditComment(id: string) {
    if (!editingCommentBody.trim()) return;
    const supabase = createClient();
    const updatedBody = editingCommentBody;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("comments")
      .update({ body: updatedBody, updated_at: now })
      .eq("id", id);
    
    if (!error) {
      setComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, body: updatedBody, updated_at: now } : c))
      );
      setEditingCommentId(null);
      setEditingCommentBody("");
      logActivity({
        boardId,
        itemId: item.id,
        action: "edited a comment"
      });
    }
  }

  // ── Keyboard: close on Escape ──────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="panel-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        key="panel"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="fixed top-0 right-0 bottom-0 z-50 w-[420px] bg-[#1a1a1a] border-l border-white/[0.07] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-white/[0.06]">
          {/* Close */}
          <div className="flex items-start justify-between mb-3">
            <div className="text-[11px] text-white/25 uppercase tracking-wider font-medium">
              {boardName} / {group.name}
            </div>
            <button
              onClick={onClose}
              className="text-white/30 hover:text-white/70 hover:bg-white/[0.06] p-1.5 rounded-lg transition-all"
            >
              <X size={15} />
            </button>
          </div>

          {/* Editable item name */}
          {editingName ? (
            <textarea
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  saveName();
                }
                if (e.key === "Escape") {
                  setName(item.name);
                  setEditingName(false);
                }
              }}
              rows={2}
              className="w-full bg-white/[0.04] border border-white/20 focus:border-white/40 rounded-lg px-3 py-2 text-white text-[18px] font-semibold leading-snug outline-none resize-none transition-colors"
              placeholder="Item name"
            />
          ) : (
            <h2
              onClick={() => canEditItems && setEditingName(true)}
              className={`text-[18px] font-semibold text-white leading-snug rounded-lg px-2 py-1.5 -mx-2 transition-colors ${canEditItems ? "cursor-text hover:bg-white/[0.04]" : ""}`}
            >
              {name || <span className="text-white/30 italic font-normal">Untitled</span>}
            </h2>
          )}

          {/* Description */}
          <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.025] overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] px-2 py-1.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); runDescriptionCommand("formatBlock", "h2"); }}
                  className="h-7 w-7 rounded-md text-[var(--description-toolbar-icon)] hover:text-[var(--description-toolbar-icon-hover)] hover:bg-white/[0.07] transition-colors flex items-center justify-center"
                  title="Header"
                >
                  <Heading2 size={14} />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); runDescriptionCommand("bold"); }}
                  className="h-7 w-7 rounded-md text-[var(--description-toolbar-icon)] hover:text-[var(--description-toolbar-icon-hover)] hover:bg-white/[0.07] transition-colors flex items-center justify-center"
                  title="Bold"
                >
                  <Bold size={14} />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); runDescriptionCommand("underline"); }}
                  className="h-7 w-7 rounded-md text-[var(--description-toolbar-icon)] hover:text-[var(--description-toolbar-icon-hover)] hover:bg-white/[0.07] transition-colors flex items-center justify-center"
                  title="Underline"
                >
                  <Underline size={14} />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); runDescriptionCommand("insertUnorderedList"); }}
                  className="h-7 w-7 rounded-md text-[var(--description-toolbar-icon)] hover:text-[var(--description-toolbar-icon-hover)] hover:bg-white/[0.07] transition-colors flex items-center justify-center"
                  title="Bullet"
                >
                  <List size={14} />
                </button>
              </div>
              <span className="text-[10px] text-white/30 font-medium">
                {descriptionStatus === "saving" && "Saving..."}
                {descriptionStatus === "saved" && "Saved"}
                {descriptionStatus === "error" && "Not saved"}
              </span>
            </div>
            <div className="relative">
              {descriptionIsEmpty && !descriptionFocused && (
                <span className="pointer-events-none absolute left-3 top-2.5 text-[13px] text-white/20">
                  Add a task description...
                </span>
              )}
              <div
                ref={descriptionRef}
                contentEditable={canEditItems}
                suppressContentEditableWarning
                role="textbox"
                aria-label="Task description"
                aria-multiline="true"
                onInput={updateDescriptionFromEditor}
                onPaste={handleDescriptionPaste}
                onFocus={() => setDescriptionFocused(true)}
                onBlur={() => {
                  setDescriptionFocused(false);
                  const nextDescription = updateDescriptionFromEditor();
                  void saveDescription(nextDescription);
                }}
                className="min-h-[108px] w-full bg-transparent px-3 py-2.5 text-[13px] text-white/75 outline-none leading-relaxed [&_h2]:mb-2 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:text-white [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_u]:underline"
              />
            </div>
          </div>

        </div>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Column values */}
          <div className="px-6 py-4 border-b border-white/[0.06]">
            <div className="flex flex-col gap-0.5">
              {columns.map((col) => {
                const cell = getCell(col.id);
                return (
                  <div
                    key={col.id}
                    className="flex items-start min-h-[36px] rounded-lg hover:bg-white/[0.03] transition-colors -mx-2 px-2 py-1"
                  >
                    <span className="w-28 shrink-0 text-[12px] text-white/35 font-medium pt-1.5">
                      {col.title}
                    </span>

                    {col.type === "status" && (
                      <div className={`flex-1 flex items-center ${canEditItems ? "" : "pointer-events-none"}`}>
                        <StatusCell
                          itemId={item.id}
                          boardId={boardId}
                          columnId={col.id}
                          value={(cell?.value as StatusValue) ?? null}
                          onSaved={(iid, cid, val) => handleCellSaved(iid, cid, val)}
                        />
                      </div>
                    )}

                    {col.type === "person" && (
                      <div className={`flex-1 flex items-start ${canEditItems ? "" : "pointer-events-none"}`}>
                        <PersonCell
                          itemId={item.id}
                          boardId={boardId}
                          columnId={col.id}
                          value={cell?.value ?? null}
                          onSaved={(iid, cid, val) => handleCellSaved(iid, cid, val)}
                          variant="detail"
                        />
                      </div>
                    )}

                    {col.type === "date" && (
                      <div className={`flex-1 flex items-center ${canEditItems ? "" : "pointer-events-none"}`}>
                        <DateCell
                          itemId={item.id}
                          columnId={col.id}
                          value={cell?.value ?? null}
                          onSaved={(iid, cid, val) => handleCellSaved(iid, cid, val)}
                        />
                      </div>
                    )}

                    {col.type === "text" && (
                      <input
                        defaultValue={cell?.value ?? ""}
                        onBlur={(e) => {
                          if (e.target.value !== (cell?.value ?? ""))
                            saveCellValue(col.id, e.target.value);
                        }}
                        placeholder="—"
                        className="flex-1 bg-transparent text-[13px] text-white/70 placeholder:text-white/20 outline-none border-b border-transparent hover:border-white/20 focus:border-white/40 py-0.5 transition-colors"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Photos */}
          <ItemPhotos itemId={item.id} userId={userId} canUpload={canEditItems} />

          {/* Comments */}
          <div className="px-6 py-5">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={13} className="text-white/30" />
              <span className="text-[12px] font-semibold text-white/40 uppercase tracking-wider">
                Comments
              </span>
            </div>

            {commentsLoading ? (
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-7 h-7 rounded-full bg-white/[0.07] shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 w-24 bg-white/[0.07] rounded" />
                      <div className="h-3 w-full bg-white/[0.05] rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : comments.length === 0 ? (
              <p className="text-[12px] text-white/20 mb-4">No comments yet. Be the first!</p>
            ) : (
              <div className="space-y-4 mb-4">
                {comments.map((c) => {
                  const userName = c.profiles?.full_name ?? "User";
                  return (
                    <div key={c.id} className="flex gap-3 group">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                        {initials(c.profiles?.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between mb-0.5">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[12px] font-semibold text-white/70">
                              {userName}
                            </span>
                            <span className="text-[10px] text-white/25">
                              <ClientOnlyDate iso={c.created_at} />
                            </span>
                            {c.updated_at && (
                              <span className="text-[9px] text-white/20 italic ml-1">
                                (edited)
                              </span>
                            )}
                          </div>
                          {(c.user_id === userId || canDeleteComments) && (
                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2 transition-opacity">
                              {c.user_id === userId && (
                                <button
                                  onClick={() => {
                                    setEditingCommentId(c.id);
                                    setEditingCommentBody(c.body);
                                  }}
                                  className="text-[10px] text-white/30 hover:text-white/70 transition-colors"
                                >
                                  Edit
                                </button>
                              )}
                              <button
                                onClick={() => setCommentToDelete(c.id)}
                                className="text-[10px] text-white/30 hover:text-red-400 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                        {editingCommentId === c.id ? (
                          <div className="mt-1 flex flex-col gap-2">
                            <textarea
                              value={editingCommentBody}
                              onChange={(e) => setEditingCommentBody(e.target.value)}
                              className="w-full bg-white/[0.04] border border-white/20 focus:border-white/40 rounded-lg px-3 py-2 text-[13px] text-white/80 outline-none resize-none transition-colors"
                              rows={2}
                            />
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => setEditingCommentId(null)}
                                className="text-[11px] text-white/40 hover:text-white/70 transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => saveEditComment(c.id)}
                                className="bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium px-3 py-1 rounded-md transition-colors"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[13px] text-white/60 leading-relaxed break-words">
                            {c.body}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={commentsEndRef} />
              </div>
            )}

            {/* New comment input */}
            {canCreateComments && <div className="flex gap-2.5 mt-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                {initials(currentUserName)}
              </div>
              <div className="flex-1 flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 focus-within:border-white/25 transition-colors">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitComment();
                    }
                  }}
                  placeholder="Write a comment..."
                  className="flex-1 bg-transparent text-[13px] text-white/80 placeholder:text-white/20 outline-none py-2"
                />
                <button
                  onClick={submitComment}
                  disabled={!newComment.trim() || submitting}
                  className="text-white/25 hover:text-white/60 disabled:opacity-30 transition-colors"
                >
                  <Send size={13} />
                </button>
              </div>
            </div>}
          </div>

          {/* Activity feed */}
          <div className="px-6 pb-8">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={13} className="text-white/30" />
              <span className="text-[12px] font-semibold text-white/40 uppercase tracking-wider">
                Activity
              </span>
            </div>
            
            <ActivityFeed itemId={item.id} />
          </div>

        </div>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={!!commentToDelete}
        title="Delete Comment"
        description="Are you sure you want to delete this comment? This action cannot be undone."
        onCancel={() => setCommentToDelete(null)}
        onConfirm={() => {
          if (commentToDelete) deleteComment(commentToDelete);
        }}
      />
    </AnimatePresence>
  );
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

function ClientOnlyDate({ iso }: { iso: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <span>...</span>;
  return <span>{new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}</span>;
}
