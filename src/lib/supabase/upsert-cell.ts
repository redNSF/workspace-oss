import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Safely upsert a cell_value by doing a select → insert/update.
 * This avoids PostgREST 500 errors that can occur with `.upsert()`
 * when RLS policies or triggers conflict with the merge-duplicates header.
 */
export async function upsertCellValue(
  supabase: SupabaseClient,
  itemId: string,
  columnId: string,
  value: string | null
): Promise<{ data: any; error: any }> {
  if (!itemId || !columnId) {
    console.error("upsertCellValue: missing itemId or columnId", { itemId, columnId });
    return { data: null, error: { message: "Missing itemId or columnId" } };
  }

  // 1. Check if the row already exists
  const { data: existing, error: selectError } = await supabase
    .from("cell_values")
    .select("id")
    .eq("item_id", itemId)
    .eq("column_id", columnId)
    .maybeSingle();

  if (selectError) {
    console.error("upsertCellValue select error:", selectError);
    return { data: null, error: selectError };
  }

  if (existing) {
    // 2a. Row exists → update it
    const { data, error } = await supabase
      .from("cell_values")
      .update({ value })
      .eq("id", existing.id)
      .select()
      .single();
    return { data, error };
  } else {
    // 2b. Row doesn't exist → insert it
    const { data, error } = await supabase
      .from("cell_values")
      .insert({ item_id: itemId, column_id: columnId, value })
      .select()
      .single();
    return { data, error };
  }
}
