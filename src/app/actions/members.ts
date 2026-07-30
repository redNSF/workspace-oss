"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function requireMemberManagementPermission(permission: "remove_members" | "manage_roles") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, role_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "admin") {
    return user;
  }

  if (!profile?.role_id) {
    throw new Error("Forbidden");
  }

  const { data: rolePermission } = await supabase
    .from("role_permissions")
    .select("enabled")
    .eq("role_id", profile.role_id)
    .eq("permission", permission)
    .maybeSingle();

  if (!rolePermission?.enabled) {
    throw new Error("Forbidden");
  }

  return user;
}

export async function removeMemberAction(userId: string) {
  try {
    const currentUser = await requireMemberManagementPermission("remove_members");
    if (currentUser.id === userId) {
      return { success: false, error: "You cannot remove yourself." };
    }

    const supabase = createAdminClient();

    // Delete the auth user first and let the profiles FK cascade clean up the
    // application identity. Deleting the profile first could leave an active
    // authentication account with no profile if the second operation failed.
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    
    if (authError) {
      console.error("Admin delete error:", JSON.stringify(authError));
      return { success: false, error: JSON.stringify(authError) };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error("Server action error:", error);
    return { success: false, error: error.message || "Failed to remove member" };
  }
}

export async function updateMemberRoleAction(memberId: string, roleId: string | null) {
  try {
    const currentUser = await requireMemberManagementPermission("manage_roles");
    if (currentUser.id === memberId) {
      return { success: false, error: "You cannot change your own role." };
    }

    const supabase = createAdminClient();

    // 1. If roleId is provided, fetch the role name to sync the legacy 'role' column for backwards compatibility
    let legacyRole: "admin" | null = null;
    if (roleId) {
      const { data: roleData } = await supabase
        .from("roles")
        .select("name")
        .eq("id", roleId)
        .single();
      
      if (roleData?.name?.toLowerCase() === "admin") {
        legacyRole = "admin";
      }
    }

    // 2. Update the profile
    const { error } = await supabase
      .from("profiles")
      .update({ 
        role_id: roleId,
        role: legacyRole 
      })
      .eq("id", memberId);

    if (error) {
      console.error("Error updating role:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Server action error:", error);
    return { success: false, error: error.message || "Failed to update role" };
  }
}
