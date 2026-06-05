import type { SearchResult } from "./types";

const CVE_PATTERN = /^CVE-\d{4}-\d+$/i;

export function detectCveId(q: string): string | null {
  const trimmed = q.trim();
  return CVE_PATTERN.test(trimmed) ? trimmed : null;
}

export function mergeResults(
  groups: SearchResult[][],
  correlatedIocs: SearchResult[] = []
): SearchResult[] {
  const all = groups.flat().sort((a, b) => b.rank - a.rank);

  if (correlatedIocs.length === 0) {
    return all.slice(0, 20);
  }

  const firstBriefingIdx = all.findIndex((r) => r.type === "briefing");
  const insertAt = firstBriefingIdx === -1 ? 0 : firstBriefingIdx + 1;
  all.splice(insertAt, 0, ...correlatedIocs);

  return all.slice(0, 20);
}
