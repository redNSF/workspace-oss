"use client";

import { useEffect, useState, useRef, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, User, Layout, ListTodo } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSearchStore } from "@/store/search-store";
import { useToastStore } from "@/lib/store/toast-store";

interface SearchResult {
  id: string;
  type: "board" | "item" | "member";
  title: string;
  subtitle: string;
  href: string;
  icon: React.ElementType;
}

function HighlightText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight.trim()) {
    return <span>{text}</span>;
  }
  const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span key={i} className="text-indigo-400 font-semibold">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

function ResultSection({
  title,
  items,
  query,
  onSelect,
}: {
  title: string;
  items: SearchResult[];
  query: string;
  onSelect: (href: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <h3 className="px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30 mb-2">
        {title}
      </h3>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <button
                onClick={() => onSelect(item.href)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.06] transition-colors text-left group"
              >
                <div className="w-8 h-8 rounded-md bg-white/[0.04] group-hover:bg-white/[0.08] flex items-center justify-center shrink-0 transition-colors">
                  <Icon size={14} className="text-white/50 group-hover:text-white/80" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-medium text-white/80 group-hover:text-white truncate">
                    <HighlightText text={item.title} highlight={query} />
                  </span>
                  <span className="text-[11px] text-white/40 truncate">
                    {item.subtitle}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const { isOpen, closeSearch, toggleSearch } = useSearchStore();
  const { addToast } = useToastStore();
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    boards: SearchResult[];
    items: SearchResult[];
    members: SearchResult[];
  }>({ boards: [], items: [], members: [] });

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleSearch();
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [toggleSearch]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults({ boards: [], items: [], members: [] });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const performSearch = useCallback(async (searchQuery: string) => {
    setLoading(true);
    const supabase = createClient();
    const term = `%${searchQuery}%`;

    try {
      const [boardsRes, itemsRes, membersRes] = await Promise.all([
        supabase
          .from("boards")
          .select("id, name, workspaces!inner(name)")
          .ilike("name", term)
          .limit(3),
        supabase
          .from("items")
          .select("id, name, groups!inner(name, boards!inner(id, name))")
          .ilike("name", term)
          .limit(3),
        supabase
          .from("profiles")
          .select("id, full_name, role")
          .ilike("full_name", term)
          .limit(3),
      ]);

      const formattedBoards: SearchResult[] = (boardsRes.data || []).map((b: any) => ({
        id: b.id,
        type: "board",
        title: b.name,
        subtitle: Array.isArray(b.workspaces) ? b.workspaces[0]?.name : b.workspaces?.name || "Workspace",
        href: `/board/${b.id}`,
        icon: Layout,
      }));

      const formattedItems: SearchResult[] = (itemsRes.data || []).map((i: any) => {
        const group = Array.isArray(i.groups) ? i.groups[0] : i.groups;
        const board = group?.boards ? (Array.isArray(group.boards) ? group.boards[0] : group.boards) : null;
        return {
          id: i.id,
          type: "item",
          title: i.name,
          subtitle: board && group ? `${board.name} • ${group.name}` : "Unknown location",
          href: `/board/${board?.id}?item=${i.id}`,
          icon: ListTodo,
        };
      });

      const formattedMembers: SearchResult[] = (membersRes.data || []).map((m: any) => ({
        id: m.id,
        type: "member",
        title: m.full_name || m.email || "Unknown User",
        subtitle: m.role || "Member",
        href: "/settings",
        icon: User,
      }));

      setResults({
        boards: formattedBoards,
        items: formattedItems,
        members: formattedMembers,
      });
    } catch (error) {
      console.error("Search error:", error);
      addToast({ title: "Error", body: "Failed to perform search", type: "default" });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length > 0) {
        performSearch(query);
      } else {
        setResults({ boards: [], items: [], members: [] });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const handleSelect = (href: string) => {
    closeSearch();
    startTransition(() => {
      router.push(href);
    });
  };

  const hasResults =
    results.boards.length > 0 ||
    results.items.length > 0 ||
    results.members.length > 0;

  const showNoResults = query.trim().length > 0 && !loading && !hasResults;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            onClick={closeSearch}
          />
          <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] pointer-events-none px-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="w-full max-w-2xl bg-[#1e1e1e] rounded-xl shadow-2xl border border-white/10 overflow-hidden pointer-events-auto flex flex-col max-h-[80vh]"
            >
              <div className="flex items-center gap-3 px-4 py-4 border-b border-white/[0.06]">
                <Search size={20} className="text-white/40 shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search items, boards, workspaces..."
                  className="flex-1 bg-transparent border-none outline-none text-[15px] text-white placeholder:text-white/30"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") closeSearch();
                  }}
                />
                {loading && <Loader2 size={16} className="text-white/30 animate-spin shrink-0" />}
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <kbd className="px-1.5 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.05] text-[10px] font-sans text-white/40">esc</kbd>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                {query.trim().length === 0 ? (
                  <div className="py-12 text-center text-white/30 text-[13px]">
                    Type to start searching across your workspace...
                  </div>
                ) : (
                  <>
                    <ResultSection title="Boards" items={results.boards} query={query} onSelect={handleSelect} />
                    <ResultSection title="Items" items={results.items} query={query} onSelect={handleSelect} />
                    <ResultSection title="Members" items={results.members} query={query} onSelect={handleSelect} />

                    {showNoResults && (
                      <div className="py-12 text-center text-white/30 text-[13px]">
                        No results found for &quot;{query}&quot;
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
