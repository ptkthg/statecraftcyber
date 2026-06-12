"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { SearchResult } from "@/lib/search/types";

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  briefing: "Briefing",
  ioc: "IOC",
  noticia: "Notícia",
  cve: "CVE",
};

const TYPE_COLOR: Record<SearchResult["type"], string> = {
  briefing: "bg-red-500/20 text-red-400 border-red-500/30",
  ioc: "bg-green-500/20 text-green-400 border-green-500/30",
  noticia: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  cve: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

interface Props {
  result: SearchResult;
  selected: boolean;
  onSelect: () => void;
}

export function SearchResultCard({ result, selected, onSelect }: Props) {
  return (
    <Link
      href={result.href}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
        selected ? "bg-white/10" : "hover:bg-white/5"
      )}
    >
      <span
        className={cn(
          "shrink-0 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider rounded border",
          TYPE_COLOR[result.type]
        )}
      >
        {TYPE_LABEL[result.type]}
      </span>

      <span
        className={cn(
          "flex-1 text-sm truncate",
          result.isMono
            ? "font-mono text-green-400"
            : "text-white"
        )}
      >
        {result.title}
      </span>

      <span className="shrink-0 text-xs text-dim truncate max-w-[140px]">
        {result.meta}
      </span>
    </Link>
  );
}
