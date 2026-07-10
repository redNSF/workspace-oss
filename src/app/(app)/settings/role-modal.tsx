"use client";

import { useState, useEffect } from "react";
import { X, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Role, AvailablePermission, RolePermission } from "@/types/database";

const COLOR_OPTIONS = [
  "#8b5cf6", "#3b82f6", "#22c55e",
  "#f59e0b", "#ef4444", "#ec4899",
];

interface RoleModalProps {
  role?: Role; // undefined → create mode
  onClose: () => void;
  onSaved: () => void;
}

export function RoleModal({ role, onClose, onSaved }: RoleModalProps) {
  const isEdit = !!role;

  const [name, setName] = useState(role?.name ?? "");
  const [color, setColor] = useState(role?.color ?? COLOR_OPTIONS[0]);
  const [availablePerms, setAvailablePerms] = useState<AvailablePermission[]>([]);
  const [enabledPerms, setEnabledPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available permissions + existing role_permissions (edit mode)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: perms } = await supabase
        .from("available_permissions")
        .select("*")
        .order("category", { ascending: true });

      if (!cancelled) setAvailablePerms((perms as AvailablePermission[]) ?? []);

      if (isEdit && role) {
        const { data: existing } = await supabase
          .from("role_permissions")
          .select("permission, enabled")
          .eq("role_id", role.id);

        const enabled = new Set<string>(
          (existing as RolePermission[])
            ?.filter((rp) => rp.enabled)
            .map((rp) => rp.permission) ?? []
        );
        if (!cancelled) setEnabledPerms(enabled);
      }

      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isEdit, role]);

  function togglePerm(key: string) {
    setEnabledPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();

    let roleId = role?.id;

    if (isEdit && role) {
      const { error: ue } = await supabase
        .from("roles")
        .update({ name: name.trim(), color })
        .eq("id", role.id);
      if (ue) { setError(ue.message); setSaving(false); return; }
    } else {
      const { data, error: ie } = await supabase
        .from("roles")
        .insert({ name: name.trim(), color })
        .select()
        .single();
      if (ie || !data) { setError(ie?.message ?? "Insert failed"); setSaving(false); return; }
      roleId = (data as Role).id;
    }

    // Upsert role_permissions for every available permission
    const upserts = availablePerms.map((p) => ({
      role_id: roleId!,
      permission: p.key,
      enabled: enabledPerms.has(p.key),
    }));

    if (upserts.length > 0) {
      const { error: pe } = await supabase
        .from("role_permissions")
        .upsert(upserts, { onConflict: "role_id,permission" });
      if (pe) { setError(pe.message); setSaving(false); return; }
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  // Group permissions by category
  const grouped = availablePerms.reduce<Record<string, AvailablePermission[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg bg-[#1a1a1a] border border-white/[0.08] rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] shrink-0">
          <h2 className="text-[15px] font-semibold text-white">
            {isEdit ? "Edit Role" : "Create Role"}
          </h2>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/70 hover:bg-white/[0.06] p-1.5 rounded-lg transition-all"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-white/35 uppercase tracking-wider">
              Role Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Developer"
              className="bg-white/[0.04] border border-white/[0.1] focus:border-white/30 rounded-lg px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/20 outline-none transition-colors"
            />
          </div>

          {/* Color */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold text-white/35 uppercase tracking-wider">
              Color
            </label>
            <div className="flex gap-2.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full transition-all relative"
                  style={{ backgroundColor: c }}
                >
                  {color === c && (
                    <span className="absolute inset-0 rounded-full ring-2 ring-white ring-offset-2 ring-offset-[#1a1a1a]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Permissions */}
          <div className="flex flex-col gap-3">
            <label className="text-[11px] font-semibold text-white/35 uppercase tracking-wider">
              Permissions
            </label>

            {loading ? (
              <div className="space-y-2 animate-pulse">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-8 bg-white/[0.04] rounded-lg" />
                ))}
              </div>
            ) : Object.keys(grouped).length === 0 ? (
              <p className="text-[12px] text-white/25">
                No permissions defined in <code>available_permissions</code> table yet.
              </p>
            ) : (
              Object.entries(grouped).map(([category, perms]) => (
                <div key={category}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1.5">
                    {category}
                  </p>
                  <div className="flex flex-col gap-1">
                    {perms.map((p) => (
                      <label
                        key={p.key}
                        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-colors"
                      >
                        <span className="text-[13px] text-white/70">{p.label}</span>
                        {/* Toggle switch */}
                        <button
                          type="button"
                          onClick={() => togglePerm(p.key)}
                          className={`relative w-9 h-5 rounded-full transition-colors ${
                            enabledPerms.has(p.key) ? "bg-[#8b5cf6]" : "bg-white/[0.12]"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                              enabledPerms.has(p.key) ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </label>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {error && (
            <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/[0.06] shrink-0 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[13px] text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-50 text-white text-[13px] font-semibold transition-colors"
          >
            <Save size={13} />
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Role"}
          </button>
        </div>
      </div>
    </div>
  );
}
