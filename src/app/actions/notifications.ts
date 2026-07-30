"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface NotificationActionInput {
  userId: string;
  itemId: string;
  boardId: string;
}

interface CommentNotificationActionInput extends NotificationActionInput {
  commentId: string;
}

type NotificationActionResult =
  | { success: true }
  | { success: false; error: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasValidIds(values: string[]) {
  return values.every((value) => UUID_PATTERN.test(value));
}

function parseAssigneeIds(value: string | null): string[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function notificationLabel(value: string | null | undefined, fallback: string) {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return (normalized || fallback).slice(0, 160);
}

async function getItemContext(
  itemId: string,
  boardId: string,
  requireEdit: boolean,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, error: "Unauthorized" };
  }

  const permissionFunction = requireEdit
    ? "user_can_edit_item"
    : "user_has_item_access";
  const { data: allowed, error: permissionError } = await supabase.rpc(
    permissionFunction,
    {
      p_item_id: itemId,
      p_user_id: user.id,
    },
  );

  if (permissionError || !allowed) {
    return { ok: false as const, error: "Forbidden" };
  }

  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("id, name, group_id")
    .eq("id", itemId)
    .maybeSingle();

  if (itemError || !item) {
    return { ok: false as const, error: "Item not found" };
  }

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("board_id")
    .eq("id", item.group_id)
    .maybeSingle();

  if (groupError || !group || group.board_id !== boardId) {
    return { ok: false as const, error: "Invalid board context" };
  }

  return { ok: true as const, supabase, user, item };
}

async function recipientCanAccessBoard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  boardId: string,
) {
  const { data, error } = await supabase.rpc("user_has_board_access", {
    p_board_id: boardId,
    p_user_id: userId,
  });

  return !error && data === true;
}

async function insertNotification(
  values: {
    userId: string;
    title: string;
    body: string;
    type: "assignment" | "comment";
    boardId: string;
    sourceKey: string;
  },
): Promise<NotificationActionResult> {
  // Context and recipient authorization are completed with the caller's
  // session before this trusted write. Direct client inserts are denied by RLS.
  const supabase = createAdminClient();
  const { error } = await supabase.from("notifications").insert({
    user_id: values.userId,
    title: values.title,
    body: values.body,
    type: values.type,
    link: `/board/${values.boardId}`,
    read: false,
    source_key: values.sourceKey,
  });

  if (error?.code === "23505") {
    return { success: true };
  }

  if (error) {
    console.error("Error creating authorized notification:", error);
    return { success: false, error: "Failed to create notification" };
  }

  return { success: true };
}

export async function createAssignmentNotification({
  userId,
  itemId,
  boardId,
}: NotificationActionInput): Promise<NotificationActionResult> {
  if (!hasValidIds([userId, itemId, boardId])) {
    return { success: false, error: "Invalid notification context" };
  }

  const context = await getItemContext(itemId, boardId, true);
  if (!context.ok) {
    return { success: false, error: context.error };
  }

  const { supabase, item } = context;
  const { data: personColumns, error: columnsError } = await supabase
    .from("columns")
    .select("id")
    .eq("board_id", boardId)
    .eq("type", "person");

  if (columnsError || !personColumns?.length) {
    return { success: false, error: "Assignment column not found" };
  }

  const { data: assignmentCells, error: cellsError } = await supabase
    .from("cell_values")
    .select("value")
    .eq("item_id", itemId)
    .in(
      "column_id",
      personColumns.map((column) => column.id),
    );

  const isAssigned = (assignmentCells ?? []).some((cell) =>
    parseAssigneeIds(cell.value).includes(userId),
  );

  if (cellsError || !isAssigned) {
    return { success: false, error: "Recipient is not assigned to this item" };
  }

  if (!(await recipientCanAccessBoard(supabase, userId, boardId))) {
    return { success: false, error: "Recipient cannot access this board" };
  }

  return insertNotification({
    userId,
    title: "New Assignment",
    body: `You were assigned to ${notificationLabel(item.name, "an item")}`,
    type: "assignment",
    boardId,
    sourceKey: `assignment:${itemId}`,
  });
}

export async function createCommentNotification({
  userId,
  itemId,
  boardId,
  commentId,
}: CommentNotificationActionInput): Promise<NotificationActionResult> {
  if (!hasValidIds([userId, itemId, boardId, commentId])) {
    return { success: false, error: "Invalid notification context" };
  }

  const context = await getItemContext(itemId, boardId, false);
  if (!context.ok) {
    return { success: false, error: context.error };
  }

  const { supabase, user, item } = context;
  const { data: comment, error: commentError } = await supabase
    .from("comments")
    .select("id, item_id, user_id")
    .eq("id", commentId)
    .maybeSingle();

  if (
    commentError ||
    !comment ||
    comment.item_id !== itemId ||
    comment.user_id !== user.id
  ) {
    return { success: false, error: "Comment not found" };
  }

  if (!(await recipientCanAccessBoard(supabase, userId, boardId))) {
    return { success: false, error: "Recipient cannot access this board" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return insertNotification({
    userId,
    title: "New Comment",
    body: `${notificationLabel(profile?.full_name, "Someone")} commented on ${notificationLabel(item.name, "an item")}`,
    type: "comment",
    boardId,
    sourceKey: `comment:${commentId}`,
  });
}
