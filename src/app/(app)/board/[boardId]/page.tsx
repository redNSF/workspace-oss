import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

import { BoardClient } from "./board-client";
import type { Column, Profile } from "@/types/database";

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
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin";

  if (!isAdmin) {
    const { data: accessData } = await supabase
      .from("board_access")
      .select("board_id")
      .eq("user_id", user.id)
      .eq("board_id", boardId)
      .single();

    let hasAccess = !!accessData;

    if (!hasAccess) {
      const { data: cellData } = await supabase
        .from("cell_values")
        .select("item_id, columns!inner(type)")
        .ilike("value", `%${user.id}%`)
        .eq("columns.type", "person");

      if (cellData && cellData.length > 0) {
        const itemIds = [...new Set(cellData.map(c => c.item_id).filter(Boolean))];
        const { data: itemsData } = await supabase
          .from("items")
          .select("group_id, groups(board_id)")
          .in("id", itemIds);

        if (itemsData) {
          const assignedBoardIds = itemsData.map((i: any) => i.groups?.board_id).filter(Boolean);
          if (assignedBoardIds.includes(boardId)) {
            hasAccess = true;
          }
        }
      }
    }

    if (!hasAccess) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-[#111111] text-white">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold">You don't have access to this board</h1>
          </div>
        </div>
      );
    }
  }

  // ── Board ─────────────────────────────────────────────────────────────────────
  const { data: board, error: boardError } = await supabase
    .from("boards")
    .select("*, workspaces(name)")
    .eq("id", boardId)
    .single();

  if (boardError || !board) notFound();

  // ── Columns — auto-create defaults if none exist ──────────────────────────────
  let { data: columns, error: fetchError } = await supabase
    .from("columns")
    .select("*")
    .eq("board_id", boardId)
    .order("position", { ascending: true });

  if (fetchError) {
    console.error("Columns fetch error:", fetchError);
  }

  if (!columns || columns.length === 0) {
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
  } else {
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
  const workspaceName =
    (board.workspaces as { name: string } | null)?.name ?? "Workspace";

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
      />
    </div>
  );
}
