"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    }
    setLoading(false);
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#0d0d0d] relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[30%] w-[500px] h-[500px] rounded-full bg-[#8b5cf6]/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm px-4">
        <div className="rounded-2xl bg-[#171717] border border-white/[0.07] shadow-[0_32px_80px_rgba(0,0,0,0.6)] p-8">
          <div className="mb-8 flex flex-col items-center gap-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-[#8b5cf6] flex items-center justify-center">
                <Lock className="text-white" size={14} />
              </div>
              <h1 className="text-lg font-bold tracking-[0.2em] text-white uppercase">
                New Password
              </h1>
            </div>
            <p className="text-sm text-white/40">Set your new account password</p>
          </div>

          {!success ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.1em]" htmlFor="password">
                  New Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:border-white/20 focus:bg-white/[0.06] focus:outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.1em]" htmlFor="confirm">
                  Confirm Password
                </label>
                <input
                  id="confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:border-white/20 focus:bg-white/[0.06] focus:outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 w-full flex items-center justify-center gap-2 rounded-lg bg-[#8b5cf6] hover:bg-[#7c3aed] active:scale-[0.98] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50 shadow-[0_2px_12px_rgba(139,92,246,0.35)]"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : "Update Password"}
              </button>
            </form>
          ) : (
            <div className="text-center py-4 flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                <ShieldCheck className="text-green-500" size={24} />
              </div>
              <h2 className="text-white font-bold mb-2">Password Updated</h2>
              <p className="text-white/40 text-sm mb-6">Your password has been changed successfully. Redirecting to login...</p>
              <div className="w-full h-1 bg-white/[0.05] rounded-full overflow-hidden">
                <div className="h-full bg-green-500 animate-[progress_3s_linear]" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
