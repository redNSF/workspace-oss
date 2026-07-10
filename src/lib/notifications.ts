import { createClient } from "@/lib/supabase/client";



export async function logActivity({
  boardId,
  itemId,
  action,
  details,
}: {
  boardId: string;
  itemId?: string;
  action: string;
  details?: Record<string, unknown>;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("activity_log").insert({
    board_id: boardId,
    item_id: itemId || null,
    user_id: user.id,
    action,
    details: details || {},
  });
  if (error) console.error("Error logging activity:", error);
}
