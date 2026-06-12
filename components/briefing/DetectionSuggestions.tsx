"use client";

import { CopyButton } from "./CopyButton";

interface Props {
  suggestions: string[];
}

// Heuristic: treat as code/query if it contains SIEM/query syntax markers
function isQueryLike(s: string): boolean {
  return /index=|EventID\s*=|event_id\s*=|\|\s*(where|search|eval|stats|table)\b|SELECT\s+\w|FROM\s+\w|process_name\s*=|CommandLine\s*=|source_ip|dest_ip|\bAND\b|\bOR\b|\bNOT\b|sigma:|kibana:|splunk:|spl:|kql:|siem:|log\.level|event\.type:|winlog\.|_exists_:|hunt:|detection:|\brule\b.{0,20}:|source\.ip|destination\.ip/.test(s);
}

export function DetectionSuggestions({ suggestions }: Props) {
  if (suggestions.length === 0) return null;

  return (
    <ul className="space-y-2.5">
      {suggestions.map((s, i) => {
        const isCode = isQueryLike(s);
        return (
          <li
            key={i}
            className="bg-canvas border border-white/[0.06] rounded-lg px-4 py-3 flex gap-3 items-start"
          >
            <span className="text-dim mt-0.5 flex-shrink-0 font-mono text-xs select-none">›</span>
            <p className={`text-sm text-body leading-relaxed flex-1 ${isCode ? "font-mono" : ""}`}>{s}</p>
            <CopyButton text={s} />
          </li>
        );
      })}
    </ul>
  );
}
