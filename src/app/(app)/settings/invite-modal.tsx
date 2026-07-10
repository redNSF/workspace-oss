"use client";

import { useState } from "react";
import { X, Send, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { UserRole, Workspace, Role } from "@/types/database";

interface InviteModalProps {
  workspaces: Workspace[];
  userId: string;
  roles: Role[];
  onClose: () => void;
}

export function InviteModal({ workspaces, userId, roles, onClose }: InviteModalProps) {
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<string>(roles.length > 0 ? roles[0].id : "");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !workspaceId) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();

    // 1. Insert invitation record
    const { error: inviteError } = await supabase.from("invitations").insert({
      email: email.trim(),
      role: null, // Legacy field
      role_id: roleId,
      workspace_id: workspaceId,
      invited_by: userId,
      status: "pending",
    });

    if (inviteError) {
      setError(inviteError.message);
      setLoading(false);
      return;
    }

    // 2. Trigger Supabase Auth email (signUp with redirect)
    await supabase.auth.signUp({
      email: email.trim(),
      password: crypto.randomUUID(), // random password — user will reset via email link
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { role_id: roleId, workspace_id: workspaceId },
      },
    });

    setSuccess(true);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md bg-[#1a1a1a] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div>
            <h2 className="text-[16px] font-semibold text-white">Invite Team Member</h2>
            <p className="text-[12px] text-white/30 mt-0.5">
              They&apos;ll receive an email to join your workspace
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/70 hover:bg-white/[0.06] p-1.5 rounded-lg transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {success ? (
          /* Success state */
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
              <CheckCircle size={24} className="text-green-400" />
            </div>
            <p className="text-[15px] font-semibold text-white mb-1">Invite sent!</p>
            <p className="text-[13px] text-white/40">
              An invitation was sent to{" "}
              <span className="text-white/70 font-medium">{email}</span>
            </p>
            <button
              onClick={onClose}
              className="mt-6 px-5 py-2 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-[13px] text-white/70 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-white/40 uppercase tracking-wider">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full bg-white/[0.04] border border-white/[0.1] focus:border-white/30 rounded-lg px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/20 outline-none transition-colors"
              />
            </div>

            {/* Role */}
            {roles.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-white/40 uppercase tracking-wider">
                  Role
                </label>
                <select
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="w-full bg-[#222] border border-white/[0.1] focus:border-white/30 rounded-lg px-3.5 py-2.5 text-[13px] text-white outline-none transition-colors appearance-none cursor-pointer"
                >
                  {roles.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Workspace */}
            {workspaces.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-white/40 uppercase tracking-wider">
                  Workspace
                </label>
                <select
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  className="w-full bg-[#222] border border-white/[0.1] focus:border-white/30 rounded-lg px-3.5 py-2.5 text-[13px] text-white outline-none transition-colors appearance-none cursor-pointer"
                >
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-50 text-white text-[13px] font-semibold transition-colors mt-1"
            >
              <Send size={13} />
              {loading ? "Sending..." : "Send Invite"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
