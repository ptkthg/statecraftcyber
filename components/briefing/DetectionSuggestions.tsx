"use client";

import { CopyButton } from "./CopyButton";

interface Props {
  suggestions: string[];
}

export function DetectionSuggestions({ suggestions }: Props) {
  if (suggestions.length === 0) return null;

  return (
    <ul className="space-y-2.5">
      {suggestions.map((s, i) => (
        <li
          key={i}
          className="bg-[#0A0A0A] border border-white/[0.06] rounded-lg px-4 py-3 flex gap-3 items-start group"
        >
          <span className="text-red-500/70 mt-0.5 flex-shrink-0 font-mono text-xs select-none">›</span>
          <p className="text-sm text-[#C0C0C0] leading-relaxed font-mono flex-1">{s}</p>
          <CopyButton text={s} />
        </li>
      ))}
    </ul>
  );
}
