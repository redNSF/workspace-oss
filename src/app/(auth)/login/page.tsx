"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthSplash } from "@/components/auth-splash";
import { AppLogo } from "@/components/app-logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHello, setShowHello] = useState(false);
  const [userName, setUserName] = useState<string>("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        // Try to get user name for the splash screen
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", data.user.id)
          .single();
        
        if (profile?.full_name) {
          setUserName(profile.full_name);
        } else {
          setUserName(data.user.email?.split("@")[0] || "User");
        }

        setShowHello(true);
        sessionStorage.setItem("hasSeenHello", "true");
        
        // Delay to show splash
        setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setLoading(false);
    }
  };

  if (showHello) {
    return <AuthSplash type="hello" userName={userName} />;
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#0d0d0d] relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[30%] w-[500px] h-[500px] rounded-full bg-[#8b5cf6]/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[20%] w-[400px] h-[400px] rounded-full bg-white/3 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-sm px-4">
        {/* Card */}
        <div className="rounded-2xl bg-[#171717] border border-white/[0.07] shadow-[0_32px_80px_rgba(0,0,0,0.6)] p-8">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center gap-1">
            <div className="mb-1">
              <AppLogo height={32} />
            </div>
            <p className="text-sm text-white/40">Welcome back</p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.1em]" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder-white/20 focus:border-white/20 focus:bg-white/[0.06] focus:outline-none transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.1em]" htmlFor="password">
                  Password
                </label>
                <Link href="/forgot-password" className="text-[10px] text-white/30 hover:text-[#8b5cf6] transition-colors uppercase tracking-[0.05em] font-medium">
                  Forgot?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
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
              className="mt-1 w-full flex items-center justify-center gap-2 rounded-lg bg-[#8b5cf6] hover:bg-[#7c3aed] active:scale-[0.98] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_2px_12px_rgba(139,92,246,0.35)]"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Sign In <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-[13px]">
            <span className="text-white/30">Don&apos;t have an account? </span>
            <Link href="/signup" className="text-white/70 hover:text-white transition-colors underline underline-offset-2">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
