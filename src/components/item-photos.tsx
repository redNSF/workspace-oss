"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImageIcon, Upload, X, Loader2, ZoomIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ItemPhoto } from "@/types/database";
import { cn } from "@/lib/utils";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

interface ItemPhotosProps {
  itemId: string;
  userId: string;
}

export function ItemPhotos({ itemId, userId }: ItemPhotosProps) {
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load photos ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("item_photos")
        .select("*")
        .eq("item_id", itemId)
        .order("created_at", { ascending: true });
      if (!cancelled) {
        setPhotos((data as ItemPhoto[]) ?? []);
        setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [itemId]);

  // ── Upload ─────────────────────────────────────────────────────────────────
  const uploadFile = useCallback(async (file: File) => {
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("File exceeds the 5 MB limit.");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json() as { url?: string; public_id?: string; error?: string };

      if (!res.ok || !data.url || !data.public_id) {
        throw new Error(data.error ?? "Upload failed");
      }

      // Save to Supabase
      const supabase = createClient();
      const { data: inserted, error: dbError } = await supabase
        .from("item_photos")
        .insert({ item_id: itemId, url: data.url, public_id: data.public_id, uploaded_by: userId })
        .select("*")
        .single();

      if (dbError) throw dbError;
      if (inserted) setPhotos((prev) => [...prev, inserted as ItemPhoto]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [itemId, userId]);

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function deletePhoto(photo: ItemPhoto) {
    // Optimistic removal
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));

    try {
      // Remove from Cloudinary
      await fetch("/api/upload/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_id: photo.public_id }),
      });

      // Remove from Supabase
      const supabase = createClient();
      await supabase.from("item_photos").delete().eq("id", photo.id);
    } catch {
      // Restore on failure
      setPhotos((prev) => [...prev, photo].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ));
    }
  }

  // ── Drag and drop ──────────────────────────────────────────────────────────
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  return (
    <div className="px-6 py-4 border-b border-white/[0.06]">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <ImageIcon size={13} className="text-white/30" />
        <span className="text-[12px] font-semibold text-white/40 uppercase tracking-wider">
          Photos
        </span>
        {photos.length > 0 && (
          <span className="text-[10px] text-white/20 ml-1">({photos.length})</span>
        )}
      </div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20"
          >
            <span className="text-[12px] text-red-400">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-400 transition-colors">
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Photo grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-square rounded-lg bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      ) : photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <AnimatePresence>
            {photos.map((photo) => (
              <motion.div
                key={photo.id}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.15 }}
                className="relative aspect-square rounded-lg overflow-hidden group cursor-pointer bg-white/[0.04]"
                onClick={() => setLightbox(photo.url)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt="Item photo"
                  className="w-full h-full object-cover"
                />
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); setLightbox(photo.url); }}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                      title="View full size"
                    >
                      <ZoomIn size={12} />
                    </button>
                    {photo.uploaded_by === userId && (
                      <button
                        onClick={(e) => { e.stopPropagation(); void deletePhoto(photo); }}
                        className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300 transition-colors"
                        title="Delete photo"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : null}

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={cn(
          "relative flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer",
          dragging
            ? "border-indigo-400/50 bg-indigo-500/10"
            : "border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.04] hover:border-white/[0.12]",
          uploading && "opacity-60 cursor-not-allowed pointer-events-none"
        )}
      >
        {uploading ? (
          <>
            <Loader2 size={14} className="text-indigo-400 animate-spin shrink-0" />
            <span className="text-[12px] text-white/40">Uploading…</span>
          </>
        ) : (
          <>
            <Upload size={14} className={cn("shrink-0 transition-colors", dragging ? "text-indigo-400" : "text-white/25")} />
            <div className="min-w-0">
              <span className={cn("text-[12px] font-medium transition-colors", dragging ? "text-indigo-300" : "text-white/40")}>
                {dragging ? "Drop to upload" : "Upload a photo"}
              </span>
              <span className="text-[10px] text-white/20 ml-2">Max 5 MB</span>
            </div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); }}
        />
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setLightbox(null)}
          >
            <button
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              onClick={() => setLightbox(null)}
            >
              <X size={18} />
            </button>
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 280 }}
              src={lightbox}
              alt="Full size preview"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
