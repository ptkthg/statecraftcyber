"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import { useSearch } from "./useSearch";
import { SearchResultCard } from "./SearchResult";

export function SearchOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const { results, total, loading, error } = useSearch(query);

  useEffect(() => {
    setSelectedIdx(-1);
  }, [results]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setSelectedIdx(-1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onOpen = () => setIsOpen(true);
    window.addEventListener("open-search", onOpen);
    return () => window.removeEventListener("open-search", onOpen);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && selectedIdx >= 0 && results[selectedIdx]) {
      router.push(results[selectedIdx].href);
      handleClose();
    }
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
        else setIsOpen(true);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed top-[18%] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-2xl z-50 bg-raised border border-white/10 rounded-xl shadow-2xl overflow-hidden focus:outline-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          onKeyDown={handleKeyDown}
          aria-label="Busca global"
        >
          <Dialog.Title className="sr-only">Busca global</Dialog.Title>

          {/* Input row */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10">
            <Search size={16} className="shrink-0 text-dim" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar CVEs, IOCs, briefings, notícias…"
              className="flex-1 bg-transparent text-sm text-white placeholder-dim outline-none"
              aria-label="Termo de busca"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="shrink-0 text-dim hover:text-white transition-colors"
                aria-label="Limpar busca"
              >
                <X size={14} aria-hidden />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs text-dim bg-raised border border-white/10 rounded font-mono">
              ESC
            </kbd>
          </div>

          {/* Results area */}
          <div className="max-h-[420px] overflow-y-auto p-2">
            {query.length < 2 && (
              <p className="px-4 py-8 text-sm text-dim text-center">
                Digite para buscar CVEs, IOCs, briefings e notícias…
              </p>
            )}

            {query.length >= 2 && loading && (
              <div className="space-y-1 p-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 rounded-lg bg-white/5 animate-pulse"
                  />
                ))}
              </div>
            )}

            {query.length >= 2 && !loading && error && (
              <p className="px-4 py-8 text-sm text-brand-soft text-center">{error}</p>
            )}

            {query.length >= 2 && !loading && !error && results.length === 0 && (
              <p className="px-4 py-8 text-sm text-dim text-center">
                Nenhum resultado para{" "}
                <span className="text-white font-mono">&quot;{query}&quot;</span>
              </p>
            )}

            {results.length > 0 && (
              <>
                <p className="px-4 pt-2 pb-1 text-xs text-dim">
                  {total} resultado{total !== 1 ? "s" : ""}
                </p>
                {results.map((result, idx) => (
                  <SearchResultCard
                    key={`${result.type}-${result.id}`}
                    result={result}
                    selected={selectedIdx === idx}
                    onSelect={handleClose}
                  />
                ))}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-white/10 text-xs text-dim">
            <span className="flex items-center gap-1.5">
              <kbd className="px-1 py-0.5 bg-raised border border-white/10 rounded font-mono">↑↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1 py-0.5 bg-raised border border-white/10 rounded font-mono">↵</kbd>
              abrir
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1 py-0.5 bg-raised border border-white/10 rounded font-mono">ESC</kbd>
              fechar
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
