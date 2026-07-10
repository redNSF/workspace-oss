"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface CreateBoardModalProps {
  workspaceId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const COLORS = [
  { value: "#8b5cf6", label: "Purple" },
  { value: "#e03131", label: "Red" },
  { value: "#2f9e44", label: "Green" },
  { value: "#1971c2", label: "Blue" },
  { value: "#f08c00", label: "Orange" },
  { value: "#0c8599", label: "Teal" },
];

export function CreateBoardModal({ workspaceId, onClose, onSuccess }: CreateBoardModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0].value);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { error } = await supabase.from("boards").insert({
      name: name.trim(),
      workspace_id: workspaceId,
      color,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      onSuccess();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl bg-[#242424] border border-white/10 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold text-base">New Board</h2>
          <button
            onClick={onClose}
            className="text-[#aaa] hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#aaa] uppercase tracking-wider" htmlFor="board-name">
              Board Name
            </label>
            <input
              id="board-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              placeholder="e.g. Client Projects"
              className="rounded-md border border-white/10 bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-white/30 focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/30 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-[#aaa] uppercase tracking-wider">
              Accent Color
            </label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => setColor(c.value)}
                  className={cn(
                    "w-7 h-7 rounded-full transition-all border-2",
                    color === c.value
                      ? "border-white scale-110"
                      : "border-transparent hover:scale-105"
                  )}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <div className="flex gap-2 justify-end mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-[#aaa] hover:text-white hover:bg-white/10 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-1.5 text-sm font-semibold text-white rounded-md transition-colors disabled:opacity-50"
              style={{ backgroundColor: color }}
            >
              {loading ? "Creating..." : "Create Board"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
