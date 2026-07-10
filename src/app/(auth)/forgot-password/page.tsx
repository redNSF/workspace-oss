"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage("Check your email for the reset link.");
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
            <Link href="/login" className="self-start flex items-center gap-2 text-white/40 hover:text-white transition-colors text-xs mb-4">
              <ArrowLeft size={14} /> Back to login
            </Link>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-[#8b5cf6] flex items-center justify-center">
                <Mail className="text-white" size={14} />
              </div>
              <h1 className="text-lg font-bold tracking-[0.2em] text-white uppercase">
                Reset Password
              </h1>
            </div>
            <p className="text-sm text-white/40 text-center">Enter your email to receive a reset link</p>
          </div>

          {!message ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.1em]" htmlFor="email">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:border-white/20 focus:bg-white/[0.06] focus:outline-none transition-all"
                  placeholder="you@example.com"
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
                {loading ? <Loader2 size={16} className="animate-spin" /> : "Send Reset Link"}
              </button>
            </form>
          ) : (
            <div className="text-center py-4">
              <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-6 text-sm text-green-400 mb-6">
                {message}
              </div>
              <Link href="/login" className="text-[#8b5cf6] hover:underline text-sm">
                Return to login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
