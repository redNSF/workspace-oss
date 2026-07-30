import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

import { BoardClient } from "./board-client";
import type { BoardCapabilities } from "./board-client";
import type { Column } from "@/types/database";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface BoardPageProps {
  params: Promise<{ boardId: string }>;
}

const DEFAULT_COLUMNS_DATA = [
  { title: "Status",    type: "status", position: 0 },
  { title: "Assignee",  type: "person", position: 1 },
  { title: "Due Date",  type: "date",   position: 2 },
];

export default async function BoardPage({ params }: BoardPageProps) {
  const { boardId } = await params;
  const supabase = await createClient();

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  // ── Access Check ────────────────────────────────────────────────────────────
  // ── Board ─────────────────────────────────────────────────────────────────────
  const { data: board, error: boardError } = await supabase
    .from("boards")
    .select("*, workspaces(name, owner_id)")
    .eq("id", boardId)
    .single();

  if (boardError || !board) notFound();

  // The board query is protected by RLS and is the canonical visibility check.
  // Mutation capabilities come from the same helpers used by database policies.
  const [
    instanceAdminResult,
    manageBoardResult,
    editBoardResult,
    createItemsResult,
    editItemsResult,
    deleteItemsResult,
    deleteBoardResult,
    createCommentsResult,
    deleteCommentsResult,
  ] = await Promise.all([
    supabase.rpc("is_instance_admin", { p_user_id: user.id }),
    supabase.rpc("user_can_manage_board", { p_board_id: boardId, p_user_id: user.id }),
    supabase.rpc("user_can_edit_board", { p_board_id: boardId, p_user_id: user.id }),
    supabase.rpc("user_has_permission", { p_user_id: user.id, p_permission: "create_items" }),
    supabase.rpc("user_has_permission", { p_user_id: user.id, p_permission: "edit_items" }),
    supabase.rpc("user_has_permission", { p_user_id: user.id, p_permission: "delete_items" }),
    supabase.rpc("user_has_permission", { p_user_id: user.id, p_permission: "delete_boards" }),
    supabase.rpc("user_has_permission", { p_user_id: user.id, p_permission: "create_comments" }),
    supabase.rpc("user_has_permission", { p_user_id: user.id, p_permission: "delete_comments" }),
  ]);

  const workspace = board.workspaces as { name: string; owner_id: string } | null;
  const canEditBoard = editBoardResult.data === true;
  const capabilities: BoardCapabilities = {
    canManageBoard: manageBoardResult.data === true,
    canShareBoard: instanceAdminResult.data === true || workspace?.owner_id === user.id,
    canDeleteBoard: deleteBoardResult.data === true,
    canCreateItems: canEditBoard && createItemsResult.data === true,
    canEditItems: canEditBoard && editItemsResult.data === true,
    canDeleteItems: deleteItemsResult.data === true,
    canCreateComments: createCommentsResult.data === true,
    canDeleteComments: deleteCommentsResult.data === true,
  };

  // ── Columns — auto-create defaults if none exist ──────────────────────────────
  let { data: columns, error: fetchError } = await supabase
    .from("columns")
    .select("*")
    .eq("board_id", boardId)
    .order("position", { ascending: true });

  if (fetchError) {
    console.error("Columns fetch error:", fetchError);
  }

  if ((!columns || columns.length === 0) && capabilities.canManageBoard) {
    const rows = DEFAULT_COLUMNS_DATA.map((c) => ({ ...c, board_id: boardId }));
    const { error: insertError } = await supabase.from("columns").insert(rows);
    
    if (insertError) {
      console.error("Columns insert error:", insertError);
    }
    
    // Re-fetch to be absolutely sure we get the data (handles RLS/select timing)
    const { data: refetched, error: refetchError } = await supabase
      .from("columns")
      .select("*")
      .eq("board_id", boardId)
      .order("position", { ascending: true });
      
    if (refetchError) {
      console.error("Columns re-fetch error:", refetchError);
    }
    columns = refetched ?? [];
  } else if (columns && columns.length > 0 && capabilities.canManageBoard) {
    // Ensure Status, Assignee, and Due Date columns always exist
    const missing = DEFAULT_COLUMNS_DATA.filter(
      (def) => !columns!.some((c) => c.type === def.type)
    );
    
    if (missing.length > 0) {
      const rows = missing.map((m) => ({ ...m, board_id: boardId }));
      const { error: missingError } = await supabase.from("columns").insert(rows);
      
      if (missingError) {
        console.error("Missing columns insert error:", missingError);
      }
      
      const { data: refetched } = await supabase
        .from("columns")
        .select("*")
        .eq("board_id", boardId)
        .order("position", { ascending: true });
      columns = refetched ?? [];
    }
  }

  // ── Groups + Items + Cell Values ───────────────────────────────────────────────
  const { data: groups } = await supabase
    .from("groups")
    .select(`
      *,
      items (
        *,
        cell_values (*)
      )
    `)
    .eq("board_id", boardId)
    .order("position", { ascending: true });

  // Sort items within each group by position
  const sortedGroups = (groups ?? []).map((g) => ({
    ...g,
    items: [...(g.items ?? [])].sort(
      (a: { position: number }, b: { position: number }) => a.position - b.position
    ),
  }));

  const accentColor = board.color ?? "#8b5cf6";
  const workspaceName = workspace?.name ?? "Workspace";

  return (
    <div className="flex flex-col h-full bg-[#111111] text-white overflow-hidden">
      {/* Board Content — delegated to client */}
      <BoardClient
        key={boardId}
        boardId={boardId}
        boardName={board.name}
        boardDescription={board.description}
        workspaceName={workspaceName}
        accentColor={accentColor}
        initialGroups={sortedGroups}
        columns={(columns ?? []) as Column[]}
        userId={user.id}
        capabilities={capabilities}
      />
    </div>
  );
}
