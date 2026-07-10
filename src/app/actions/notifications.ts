"use server";

import { createAdminClient } from "@/lib/supabase/admin";

type NotificationType = "assignment" | "comment" | "status_change" | "system";

export async function createNotification({
  userId,
  title,
  body,
  type,
  link,
}: {
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  link: string;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    title,
    body,
    type,
    link,
    read: false,
  });
  if (error) {
    console.error("Error creating notification via admin:", error);
    return { success: false, error: error.message };
  }
  return { success: true };
}
