import type { SearchResult } from "./types";

const CVE_PATTERN = /^CVE-\d{4}-\d{4,}$/i;

export function detectCveId(q: string): string | null {
  const trimmed = q.trim();
  return CVE_PATTERN.test(trimmed) ? trimmed.toUpperCase() : null;
}

export function mergeResults(
  groups: SearchResult[][],
  correlatedIocs: SearchResult[] = []
): SearchResult[] {
  const all = groups.flat().sort((a, b) => b.rank - a.rank);

  // Correlated IOCs are prioritized by inserting them immediately after the first
  // briefing regardless of their rank — this ensures CVE correlation is always visible.
  if (correlatedIocs.length === 0) {
    return all.slice(0, 20);
  }

  const firstBriefingIdx = all.findIndex((r) => r.type === "briefing");
  const insertAt = firstBriefingIdx === -1 ? 0 : firstBriefingIdx + 1;
  all.splice(insertAt, 0, ...correlatedIocs);

  return all.slice(0, 20);
}
