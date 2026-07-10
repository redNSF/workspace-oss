import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "./settings-client";
import type { Profile, Workspace } from "@/types/database";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
import { APP_NAME } from "@/lib/config";

export const metadata = { title: `Settings · ${APP_NAME}` };

// Replicates usePermissions logic server-side (before RLS-safe client is available)
async function getServerPermissions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roleId: string | null,
  legacyRole: string | null
): Promise<Set<string>> {
  const ROLE_DEFAULTS: Record<string, string[]> = {
    admin: [
      "create_boards", "edit_boards", "delete_boards",
      "create_items", "edit_items", "delete_items",
      "create_comments", "delete_comments",
      "invite_members", "remove_members",
      "create_workspaces", "manage_roles",
    ],
  };

  if (roleId) {
    const { data } = await supabase
      .from("role_permissions")
      .select("permission, enabled")
      .eq("role_id", roleId);
    const perms = new Set<string>();
    for (const rp of data ?? []) {
      if (rp.enabled) perms.add(rp.permission);
    }
    return perms;
  }

  const defaults = legacyRole ? (ROLE_DEFAULTS[legacyRole] ?? []) : ROLE_DEFAULTS.admin;
  return new Set(defaults);
}

export default async function SettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Current user's profile ─────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("*, roles(*)")
    .eq("id", user.id)
    .maybeSingle();

  const currentUser: Profile = {
    ...(profile ?? {
      id: user.id,
      full_name: null,
      avatar_url: null,
      activity_status: "active",
      updated_at: null,
      role: null,
      role_id: null,
      roles: null,
    }),
    email: user.email ?? null,
  };

  // ── Permissions ────────────────────────────────────────────────────────────
  const perms = await getServerPermissions(
    supabase,
    currentUser.role_id ?? null,
    currentUser.role ?? null
  );

  // ── Fetch ALL profiles server-side (bypasses RLS on client) ───────────────
  // The server Supabase client uses the service role key so RLS is bypassed,
  const { data: allProfiles } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name", { ascending: true });

  // Merge email into the current user's profile row and ensure currentUser is included
  const initialMembers: Profile[] = [];
  let userIncluded = false;
  
  for (const p of (allProfiles ?? [])) {
    if (p.id === user.id) {
      userIncluded = true;
      initialMembers.push({ ...p, email: user.email ?? null } as Profile);
    } else {
      initialMembers.push(p as Profile);
    }
  }

  if (!userIncluded) {
    initialMembers.push(currentUser);
  }

  // ── Workspaces for the invite modal ───────────────────────────────────────
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, name, owner_id, created_at")
    .order("created_at", { ascending: true });

  return (
    <SettingsClient
      currentUser={currentUser}
      workspaces={(workspaces as Workspace[]) ?? []}
      initialMembers={initialMembers}
      canManageRoles={perms.has("manage_roles")}
      canInviteMembers={perms.has("invite_members")}
    />
  );
}
