"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Camera, UserPlus, Trash2, Shield, Save, Plus, Pencil, Users, Sun, Moon, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { InviteModal } from "./invite-modal";
import { RoleModal } from "./role-modal";
import { bustPermissionCache } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/lib/store/toast-store";
import { ACTIVITY_STATUS_OPTIONS, getActivityStatusMeta, type ActivityStatus } from "@/lib/profile-customization";
import type { Profile, Workspace, Role } from "@/types/database";
import { removeMemberAction, updateMemberRoleAction } from "@/app/actions/members";
import { useThemeStore } from "@/store/theme-store";

// ── Shared helpers ─────────────────────────────────────────────────────────────
function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function Avatar({ name, avatarUrl, activityStatus, size = "sm" }: { name: string | null; avatarUrl?: string | null; activityStatus?: string | null; size?: "sm" | "lg" }) {
  const status = getActivityStatusMeta(activityStatus);
  const sizeClass = size === "lg" ? "w-20 h-20 text-2xl" : "w-9 h-9 text-[12px]";
  const dotClass = size === "lg" ? "w-4 h-4 border-2" : "w-2.5 h-2.5 border";
  return (
    <div className={cn("relative rounded-full shrink-0", sizeClass)}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name ? `${name} profile picture` : "Profile picture"}
          className="h-full w-full rounded-full object-cover border border-white/10"
        />
      ) : (
        <div className={cn("h-full w-full rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold", sizeClass)}>
          {initials(name)}
        </div>
      )}
      {status.value !== "active" && (
        <span
          className={cn("absolute bottom-0 right-0 rounded-full border-[#111111]", dotClass, status.dotClass)}
          title={status.label}
        />
      )}
    </div>
  );
}

async function fileToProfilePicture(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file");
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  const size = 320;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare image");

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - sourceSize) / 2;
  const sourceY = (image.naturalHeight - sourceSize) / 2;
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function RoleDot({ color }: { color: string }) {
  return <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />;
}

function getResolvedRole(profile: Profile, allRoles: Role[]): { name: string; color: string } | null {
  const customRole = profile.roles ?? allRoles.find((r) => r.id === profile.role_id);
  if (customRole) return { name: customRole.name, color: customRole.color };
  
  if (profile.role) {
    return {
      name: profile.role.charAt(0).toUpperCase() + profile.role.slice(1),
      color: profile.role === "admin" ? "#8b5cf6" : "#6b7280"
    };
  }
  
  return null;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface SettingsClientProps {
  currentUser: Profile;
  workspaces: Workspace[];
  initialMembers: Profile[];
  canManageRoles: boolean;
  canInviteMembers: boolean;
}

type Tab = "team" | "profile" | "roles" | "appearance";

// ── Component ─────────────────────────────────────────────────────────────────
export function SettingsClient({
  currentUser,
  workspaces,
  initialMembers,
  canManageRoles,
  canInviteMembers,
}: SettingsClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("profile");
  const [showInvite, setShowInvite] = useState(false);
  const { addToast } = useToastStore();

  // ── Admin verification ────────────────────────────────────────────────────
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);

  // ── Roles data (shared across tabs) ───────────────────────────────────────
  const [roles, setRoles] = useState<Role[]>([]);
  const loadRoles = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("roles").select("*").order("name");
    setRoles((data as Role[]) ?? []);
  }, []);
  useEffect(() => { void loadRoles(); }, [loadRoles]);

  // Check admin status on mount
  useEffect(() => {
    async function checkAdminRole() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch only scalar fields to avoid join errors from missing FK relationships or RLS blocks
      const { data, error } = await supabase
        .from('profiles')
        .select('role, role_id')
        .eq('id', user.id)
        .single();

      if (error) {
        // Silently ignore — user may not yet have a profile row
        return;
      }

      const isLegacyAdmin = data?.role === 'admin';
      setIsAdmin(isLegacyAdmin);
      if (data?.role_id) {
        // Store role_id so the effect below can resolve it once roles are loaded
        setPendingRoleId(data.role_id);
      }
    }
    void checkAdminRole();
  }, []);

  // Resolve custom-role admin status once roles are loaded
  useEffect(() => {
    if (!pendingRoleId || roles.length === 0) return;
    const role = roles.find(r => r.id === pendingRoleId);
    if (role?.name === 'Admin') setIsAdmin(true);
  }, [pendingRoleId, roles]);


  const [members, setMembers] = useState<Profile[]>(initialMembers);
  const [membersLoading, setMembersLoading] = useState(false);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    const supabase = createClient();

    // Query profiles directly to avoid triggering a 403 Forbidden log on the view
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*');

    if (profileError) {
      console.error('Error loading members (code):', profileError.code);
      console.error('Error loading members (message):', profileError.message);
      console.error('Error loading members (details):', profileError.details);
      console.error('Error loading members (hint):', profileError.hint);
      setMembersLoading(false);
      return;
    }

    const fetchedData = (profileData ?? []) as Profile[];
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const includesUser = authUser ? fetchedData.some(p => p.id === authUser.id) : true;

    if (!includesUser && authUser) {
      const { data: myProfile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();
      
      if (error) {
        console.error("Error fetching my profile:", error);
      } else if (myProfile) {
        fetchedData.push(myProfile as Profile);
      }
    }
    
    // Preserve emails from previous state (like the server-side initial load that bypasses RLS)
    setMembers(prev => {
      return fetchedData.map(newProfile => {
        const existing = prev.find(p => p.id === newProfile.id);
        return {
          ...newProfile,
          email: existing?.email ?? newProfile.email ?? null
        };
      });
    });
    
    setMembersLoading(false);
  }, []);

  // ── Tab Change Effect ─────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === "team") {
      void loadMembers();
    }
  }, [tab, loadMembers]);

  async function removeMember(id: string) {
    if (!confirm("Remove this member? This cannot be undone.")) return;
    try {
      // Call the server action which handles both profile and auth deletion
      const result = await removeMemberAction(id);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      // Update local state only if server action succeeded
      setMembers((prev) => prev.filter((m) => m.id !== id));
      addToast({ title: "Success", body: "Member removed", type: "default" });
    } catch (error: any) {
      console.error("Error removing member:", error);
      addToast({ 
        title: "Failed to remove member", 
        body: error.message || "Something went wrong — please try again", 
        type: "default" 
      });
    }
  }

  async function assignRole(memberId: string, roleId: string | null) {
    try {
      const result = await updateMemberRoleAction(memberId, roleId);
      if (!result.success) throw new Error(result.error);

      setMembers((prev) =>
        prev.map((m) => {
          if (m.id !== memberId) return m;
          const newRole = roleId ? roles.find((r) => r.id === roleId) ?? null : null;
          return { ...m, role_id: roleId, roles: newRole };
        })
      );
      
      if (memberId === currentUser.id) {
        bustPermissionCache();
      }
      
      router.refresh();
      addToast({ title: "Success", body: "Role updated", type: "default" });
    } catch (error) {
      console.error("Error assigning role:", error);
      addToast({ title: "Error", body: getErrorMessage(error, "Failed to update role"), type: "default" });
    }
  }

  // ── My Profile tab ─────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState(currentUser.full_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatar_url ?? "");
  const [activityStatus, setActivityStatus] = useState<ActivityStatus>(currentUser.activity_status ?? "active");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Direct explicit fetch for My Profile tab on mount
  useEffect(() => {
    let cancelled = false;
    async function loadUserProfile() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Error fetching user profile:", error);
      } else if (!cancelled && profileData) {
        setFullName(profileData.full_name || "");
        setAvatarUrl(profileData.avatar_url || "");
        if (profileData.activity_status) {
          setActivityStatus(profileData.activity_status as ActivityStatus);
        }
      }
    }
    void loadUserProfile();
    return () => { cancelled = true; };
  }, []);

  async function handleAvatarFile(file: File | undefined) {
    if (!file) return;
    setAvatarLoading(true);
    setSaveMsg(null);
    try {
      const nextAvatar = await fileToProfilePicture(file);
      setAvatarUrl(nextAvatar);
    } catch (error) {
      console.error("Error preparing profile picture:", error);
      addToast({ title: "Profile picture failed", body: error instanceof Error ? error.message : "Try another image", type: "default" });
    } finally {
      setAvatarLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function saveProfile() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const supabase = createClient();
      const nextProfile = {
        full_name: fullName.trim() || null,
        avatar_url: avatarUrl || null,
        activity_status: activityStatus,
      };
      
      const { error } = await supabase
        .from("profiles")
        .update(nextProfile)
        .eq("id", currentUser.id);

      if (error) {
        if (error.code === "42703" && error.message.includes("activity_status")) {
          const { error: fallbackError } = await supabase
            .from("profiles")
            .update({ full_name: nextProfile.full_name, avatar_url: nextProfile.avatar_url })
            .eq("id", currentUser.id);
          if (fallbackError) throw fallbackError;
          setSaveMsg("Profile saved. Run the status SQL to enable activity status.");
        } else {
          throw error;
        }
      } else {
        setSaveMsg("Profile updated");
      }
      
      setMembers((prev) => 
        prev.map((m) => m.id === currentUser.id ? { ...m, ...nextProfile } : m)
      );
      router.refresh();
    } catch (error) {
      console.error("Error updating profile:", error);
      setSaveMsg("Failed to update profile");
      addToast({ title: "Error", body: "Something went wrong — please try again", type: "default" });
    }
    
    setSaving(false);
    setTimeout(() => setSaveMsg(null), 3000);
  }

  // ── Roles tab ──────────────────────────────────────────────────────────────
  const [editingRole, setEditingRole] = useState<Role | undefined>(undefined);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleMemberCounts, setRoleMemberCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const m of members) {
      if (m.role_id) counts[m.role_id] = (counts[m.role_id] ?? 0) + 1;
    }
    setRoleMemberCounts(counts);
  }, [members]);

  async function deleteRole(roleId: string, memberCount: number) {
    if (memberCount > 0) {
      alert(`This role is assigned to ${memberCount} members. Reassign them before deleting.`);
      return;
    }

    if (!confirm("Are you sure you want to delete this role? Members with this role will have no role assigned.")) {
      return;
    }

    try {
      const supabase = createClient();

      const { error: error1 } = await supabase
        .from("profiles")
        .update({ role_id: null })
        .eq("role_id", roleId);
      if (error1) throw error1;

      const { error: error2 } = await supabase
        .from("roles")
        .delete()
        .eq("id", roleId);
      if (error2) throw error2;

      setRoles((prev) => prev.filter((r) => r.id !== roleId));
      setMembers((prev) =>
        prev.map((m) => (m.role_id === roleId ? { ...m, role_id: null, roles: null } : m))
      );
    } catch (error) {
      console.error("Error deleting role:", error);
      addToast({ title: "Error", body: "Something went wrong — please try again", type: "default" });
    }
  }

  const { theme, setTheme } = useThemeStore();

  const TABS: { id: Tab; label: string; show: boolean }[] = [
    { id: "profile",    label: "My Profile",   show: true },
    { id: "team",       label: "Team Members", show: isAdmin },
    { id: "roles",      label: "Roles",        show: isAdmin },
    { id: "appearance", label: "Appearance",   show: true },
  ];

  return (
    <div className="flex flex-col h-full bg-[#111111] text-white overflow-hidden">
      {/* Page header */}
      <div className="px-10 pt-10 pb-6 shrink-0 border-b border-white/[0.04]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/25 mb-1.5">
              Settings
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Team & Account
            </h1>
          </div>

          {/* Context-sensitive CTA */}
          {tab === "team" && canInviteMembers && (
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-[13px] font-semibold transition-colors shadow-lg shadow-purple-900/30"
            >
              <UserPlus size={14} />
              Invite Member
            </button>
          )}
          {tab === "roles" && (
            isAdmin ? (
              <button
                onClick={() => { setEditingRole(undefined); setShowRoleModal(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-[13px] font-semibold transition-colors shadow-lg shadow-purple-900/30"
              >
                <Plus size={14} />
                Create Role
              </button>
            ) : (
              <span className="text-[13px] text-white/40 italic">You don't have permission to manage roles</span>
            )
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 mt-6">
          {TABS.filter((t) => t.show).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-4 py-1.5 rounded-md text-[13px] font-medium transition-all",
                tab === t.id
                  ? "bg-white/[0.08] text-white"
                  : "text-white/35 hover:text-white/65 hover:bg-white/[0.04]"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-10 py-8">

        {/* ── Team Members ─────────────────────────────────────────────────── */}
        {tab === "team" && (
          <div className="max-w-3xl">
            {membersLoading ? (
              <div className="flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] animate-pulse">
                    <div className="w-9 h-9 rounded-full bg-white/[0.07]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-32 bg-white/[0.07] rounded" />
                      <div className="h-2.5 w-48 bg-white/[0.05] rounded" />
                    </div>
                    <div className="h-5 w-24 bg-white/[0.06] rounded" />
                  </div>
                ))}
              </div>
            ) : members.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-4">
                  <Shield size={20} className="text-white/20" />
                </div>
                <p className="text-white/30 text-sm">No team members yet</p>
                {canInviteMembers && (
                  <button
                    onClick={() => setShowInvite(true)}
                    className="mt-4 text-[13px] text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    Invite your first member
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.05] transition-colors group"
                  >
                    <Avatar name={member.full_name} avatarUrl={member.avatar_url} activityStatus={member.activity_status} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[14px] font-medium text-white/80 truncate">
                          {member.full_name ?? "Unnamed"}
                        </span>
                        {member.id === currentUser.id && (
                          <span className="text-[10px] text-white/25">(you)</span>
                        )}
                      </div>
                      {member.email && (
                        <span className="text-[12px] text-white/30 truncate">{member.email}</span>
                      )}
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={cn("w-1.5 h-1.5 rounded-full", getActivityStatusMeta(member.activity_status).dotClass)} />
                        <span className="text-[10px] font-medium text-white/25">
                          {getActivityStatusMeta(member.activity_status).label}
                        </span>
                      </div>
                    </div>

                    {/* Role dropdown */}
                    {canManageRoles && member.id !== currentUser.id ? (
                      <select
                        value={member.role_id ?? ""}
                        onChange={(e) => assignRole(member.id, e.target.value || null)}
                        className="bg-[#222] border border-white/[0.08] text-[12px] text-white/60 rounded-lg px-2.5 py-1 outline-none cursor-pointer hover:border-white/20 transition-colors appearance-none"
                      >
                        <option value="">No role</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    ) : getResolvedRole(member, roles) ? (
                      <span
                        className="px-2.5 py-0.5 rounded text-[11px] font-semibold"
                        style={{
                          color: getResolvedRole(member, roles)!.color,
                          backgroundColor: `${getResolvedRole(member, roles)!.color}22`,
                        }}
                      >
                        {getResolvedRole(member, roles)!.name}
                      </span>
                    ) : null}

                    {canManageRoles && member.id !== currentUser.id && (
                      <button
                        onClick={() => removeMember(member.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="Remove member"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── My Profile ───────────────────────────────────────────────────── */}
        {tab === "profile" && (
          <div className="max-w-2xl">
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-5">
                <div className="relative">
                  <Avatar name={fullName} avatarUrl={avatarUrl} activityStatus={activityStatus} size="lg" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarLoading}
                    className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#8b5cf6] text-white shadow-lg shadow-purple-950/30 border border-white/15 hover:bg-[#7c3aed] transition-colors disabled:opacity-60"
                    title="Change profile picture"
                  >
                    <Camera size={14} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { void handleAvatarFile(e.target.files?.[0]); }}
                  />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-white">
                    {fullName || "Unnamed"}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className={cn("w-2 h-2 rounded-full", getActivityStatusMeta(activityStatus).dotClass)} />
                    <span className="text-[12px] text-white/35">{getActivityStatusMeta(activityStatus).label}</span>
                  </div>
                  {getResolvedRole(currentUser, roles) && (
                    <div
                      className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold"
                      style={{
                        color: getResolvedRole(currentUser, roles)!.color,
                        backgroundColor: `${getResolvedRole(currentUser, roles)!.color}22`,
                      }}
                    >
                      <RoleDot color={getResolvedRole(currentUser, roles)!.color} />
                      {getResolvedRole(currentUser, roles)!.name}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.08] text-[12px] font-medium text-white/55 hover:text-white transition-colors"
                    >
                      <Camera size={12} />
                      {avatarUrl ? "Change photo" : "Add photo"}
                    </button>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrl("")}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-white/35 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                      >
                        <X size={12} />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 p-5 bg-white/[0.03] border border-white/[0.05] rounded-2xl">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-white/35 uppercase tracking-wider">Full Name</label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                    className="bg-white/[0.04] border border-white/[0.1] focus:border-white/30 rounded-lg px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/20 outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-white/35 uppercase tracking-wider">Email</label>
                  <input
                    value={currentUser.email ?? ""}
                    readOnly
                    className="bg-white/[0.02] border border-white/[0.06] rounded-lg px-3.5 py-2.5 text-[13px] text-white/35 cursor-not-allowed outline-none"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold text-white/35 uppercase tracking-wider">Activity</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ACTIVITY_STATUS_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setActivityStatus(option.value)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                          activityStatus === option.value
                            ? "border-white/25 bg-white/[0.07]"
                            : "border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.045] hover:border-white/15"
                        )}
                      >
                        <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", option.dotClass)} />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-white/75">{option.label}</span>
                          <span className="block text-[11px] text-white/28 truncate">{option.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-white/35 uppercase tracking-wider">Role</label>
                  <div className="flex items-center gap-2 px-3.5 py-2.5 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                    {getResolvedRole(currentUser, roles) ? (
                      <>
                        <RoleDot color={getResolvedRole(currentUser, roles)!.color} />
                        <span className="text-[13px]" style={{ color: getResolvedRole(currentUser, roles)!.color }}>
                          {getResolvedRole(currentUser, roles)!.name}
                        </span>
                      </>
                    ) : (
                      <span className="text-[13px] text-white/25">No role assigned</span>
                    )}
                    <span className="text-[12px] text-white/20 ml-1">· Assigned by admin</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-50 text-white text-[13px] font-semibold transition-colors"
                >
                  <Save size={13} />
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                {saveMsg && <span className="text-[12px] text-green-400">{saveMsg}</span>}
              </div>
            </div>
          </div>
        )}

        {/* ── Roles ────────────────────────────────────────────────────────── */}
        {tab === "roles" && (
          <div className="max-w-4xl">
            {roles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-4">
                  <Shield size={20} className="text-white/20" />
                </div>
                <p className="text-white/30 text-sm mb-4">No custom roles yet</p>
                {isAdmin ? (
                  <button
                    onClick={() => { setEditingRole(undefined); setShowRoleModal(true); }}
                    className="text-[13px] text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    Create your first role
                  </button>
                ) : (
                  <span className="text-[13px] text-white/40 italic">You don't have permission to manage roles</span>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {roles.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-col gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <RoleDot color={r.color} />
                      <span className="text-[14px] font-semibold text-white flex-1 truncate">
                        {r.name}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-white/30 text-[12px]">
                        <Users size={12} />
                        {roleMemberCounts[r.id] ?? 0} member{roleMemberCounts[r.id] !== 1 ? "s" : ""}
                      </div>
                      {isAdmin ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditingRole(r); setShowRoleModal(true); }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-white/35 hover:text-white/70 hover:bg-white/[0.07] transition-all"
                          >
                            <Pencil size={11} />
                            Edit
                          </button>
                          <button
                            onClick={() => deleteRole(r.id, roleMemberCounts[r.id] ?? 0)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            title="Delete role"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-white/40 italic">You don't have permission to manage roles</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* ── Appearance ─────────────────────────────────────────────────────── */}
        {tab === "appearance" && (
          <div className="max-w-xl">
            <p className="text-[13px] text-white/40 mb-6">
              Choose your preferred appearance. Your preference is saved locally.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {/* Midnight card */}
              <button
                onClick={() => setTheme("midnight")}
                className={cn(
                  "relative flex flex-col rounded-2xl border-2 overflow-hidden transition-all text-left group",
                  theme === "midnight"
                    ? "border-[#8b5cf6] shadow-[0_0_0_4px_rgba(139,92,246,0.15)]"
                    : "border-white/[0.08] hover:border-white/20"
                )}
              >
                {/* Preview */}
                <div className="h-28 bg-[#111111] p-3 flex flex-col gap-1.5 relative overflow-hidden">
                  <div className="w-full h-2 rounded bg-[#1a1a1a]" />
                  <div className="flex gap-1.5">
                    <div className="w-10 h-16 rounded bg-[#141414] shrink-0" />
                    <div className="flex-1 flex flex-col gap-1">
                      <div className="h-2 rounded bg-[#1a1a1a] w-3/4" />
                      <div className="h-2 rounded bg-[#1a1a1a] w-1/2" />
                      <div className="mt-1 h-4 rounded bg-[#8b5cf6]/40 w-16" />
                    </div>
                  </div>
                  {theme === "midnight" && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#8b5cf6] flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">✓</span>
                    </div>
                  )}
                </div>
                {/* Label */}
                <div className="px-3 py-2.5 bg-[#1a1a1a] flex items-center gap-2">
                  <Moon size={14} className="text-indigo-400" />
                  <span className="text-[13px] font-semibold text-white">Midnight</span>
                  {theme === "midnight" && (
                    <span className="ml-auto text-[10px] text-[#8b5cf6] font-bold uppercase tracking-wider">Active</span>
                  )}
                </div>
              </button>

              {/* Sunshine card */}
              <button
                onClick={() => setTheme("sunshine")}
                className={cn(
                  "relative flex flex-col rounded-2xl border-2 overflow-hidden transition-all text-left group",
                  theme === "sunshine"
                    ? "border-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.15)]"
                    : "border-white/[0.08] hover:border-amber-400/40"
                )}
              >
                {/* Preview */}
                <div className="h-28 bg-[#FDF9EC] p-3 flex flex-col gap-1.5 relative overflow-hidden">
                  <div className="w-full h-2 rounded bg-[#F0E5C4]" />
                  <div className="flex gap-1.5">
                    <div className="w-10 h-16 rounded bg-[#FBF6E4] shrink-0" />
                    <div className="flex-1 flex flex-col gap-1">
                      <div className="h-2 rounded bg-[#F0E5C4] w-3/4" />
                      <div className="h-2 rounded bg-[#F0E5C4] w-1/2" />
                      <div className="mt-1 h-4 rounded bg-amber-400/60 w-16" />
                    </div>
                  </div>
                  {theme === "sunshine" && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">✓</span>
                    </div>
                  )}
                </div>
                {/* Label */}
                <div className="px-3 py-2.5 bg-[#F0E5C4] flex items-center gap-2">
                  <Sun size={14} className="text-amber-600" />
                  <span className="text-[13px] font-semibold text-[#2D2100]">Sunshine</span>
                  {theme === "sunshine" && (
                    <span className="ml-auto text-[10px] text-amber-600 font-bold uppercase tracking-wider">Active</span>
                  )}
                </div>
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Invite Modal */}
      {showInvite && (
        <InviteModal
          workspaces={workspaces}
          userId={currentUser.id}
          roles={roles}
          onClose={() => { setShowInvite(false); void loadMembers(); }}
        />
      )}

      {/* Role Modal */}
      {showRoleModal && (
        <RoleModal
          role={editingRole}
          onClose={() => setShowRoleModal(false)}
          onSaved={() => { void loadRoles(); void loadMembers(); }}
        />
      )}
    </div>
  );
}
