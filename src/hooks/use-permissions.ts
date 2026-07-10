"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";

// ── Fallback permissions for legacy string roles ───────────────────────────────
const ROLE_DEFAULTS: Record<string, string[]> = {
  admin: [
    "create_boards", "edit_boards", "delete_boards",
    "create_items", "edit_items", "delete_items",
    "create_comments", "delete_comments",
    "invite_members", "remove_members",
    "create_workspaces",
    "manage_roles",
  ],
};

// ── Module-level permission cache and state ───────────────────────────────────
let _cachedPerms: Set<string> | null = null;
let _fetching: Promise<Set<string>> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(l => l());
}

let realtimeChannel: any = null;
let currentUserId: string | null = null;

function setupRealtime(userId: string) {
  if (realtimeChannel && currentUserId === userId) return;
  if (realtimeChannel) {
    createClient().removeChannel(realtimeChannel);
  }
  
  currentUserId = userId;
  const supabase = createClient();
  realtimeChannel = supabase.channel(`profile_changes_${userId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
      (payload) => {
        // If profile changes (e.g. role_id), refetch
        fetchPermissions(true);
      }
    )
    .subscribe();
}

async function fetchPermissions(force = false): Promise<Set<string>> {
  if (force) {
    _cachedPerms = null;
  }
  if (_fetching) return _fetching;
  if (_cachedPerms) return _cachedPerms;

  _fetching = (async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Set<string>();

      setupRealtime(user.id);

      // 1. Fetch profile including joined custom role
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, role_id")
        .eq("id", user.id)
        .maybeSingle();

      const perms = new Set<string>();

      if (profile?.role_id) {
        // 2a. Fetch custom role permissions
        const { data: rolePerms } = await supabase
          .from("role_permissions")
          .select("permission, enabled")
          .eq("role_id", profile.role_id);

        for (const rp of rolePerms ?? []) {
          if (rp.enabled) perms.add(rp.permission);
        }
      } else if (profile?.role) {
        // 2b. Fall back to hardcoded defaults
        const defaults = ROLE_DEFAULTS[profile.role] ?? [];
        defaults.forEach((p) => perms.add(p));
      }

      _cachedPerms = perms;
      notify();
      return perms;
    } finally {
      _fetching = null;
    }
  })();

  return _fetching;
}

/** Bust the cache — call after role changes or force refresh */
export function bustPermissionCache() {
  _cachedPerms = null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
interface UsePermissionsReturn {
  can: (permission: string) => boolean;
  permissions: Set<string>;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function usePermissions(): UsePermissionsReturn {
  const pathname = usePathname();
  const [permissions, setPermissions] = useState<Set<string>>(() => _cachedPerms ?? new Set());
  const [loading, setLoading] = useState(!_cachedPerms);

  // Sync state with global updates
  useEffect(() => {
    const handler = () => {
      if (_cachedPerms) {
        setPermissions(new Set(_cachedPerms));
        setLoading(false);
      }
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  // Bust cache and refetch on path change to avoid stale cache indefinitely
  useEffect(() => {
    bustPermissionCache();
    fetchPermissions().then((perms) => {
      setPermissions(new Set(perms));
      setLoading(false);
    });
  }, [pathname]);

  const refetch = useCallback(async () => {
    setLoading(true);
    await fetchPermissions(true);
  }, []);

  const can = useCallback((permission: string) => permissions.has(permission), [permissions]);
  
  return { can, permissions, loading, refetch };
}
