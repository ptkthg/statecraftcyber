import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EnrichedIoc, LiveIoc, Severity } from "@/lib/types";
import type { NewsArticle } from "@/lib/news-feeds";

export interface PreviewBriefing {
  id: string;
  title: string;
  slug: string;
  summary: string;
  severity: Severity;
  category: string;
  tags: string[];
  sourceName: string;
  sourceUrl: string;
  cves: string[];
  createdAt: string;
  readingTime: number;
}

export interface LivePreviewSnapshot {
  capturedAt: string;
  origin: string;
  briefings: {
    briefings: PreviewBriefing[];
    trending: PreviewBriefing[];
    latestIocs: LiveIoc[];
  };
  iocs: EnrichedIoc[];
  news: { articles: NewsArticle[] };
}

/** A local, read-only QA mode. It is never enabled on Vercel. */
export async function getLivePreview(): Promise<LivePreviewSnapshot | null> {
  if (process.env.STATECRAFT_LIVE_PREVIEW !== "1" || process.env.VERCEL) return null;
  const file = join(process.cwd(), ".qa", "live-preview.json");
  return JSON.parse(await readFile(file, "utf8")) as LivePreviewSnapshot;
}

export function filterPreviewIocs(iocs: EnrichedIoc[], query: string, type: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = iocs.filter((ioc) =>
    (!type || ioc.type === type) && (!normalizedQuery || ioc.value.toLocaleLowerCase().includes(normalizedQuery))
  );
  const byType = iocs.reduce<Record<string, number>>((counts, ioc) => {
    counts[ioc.type] = (counts[ioc.type] ?? 0) + 1;
    return counts;
  }, {});
  return { filtered, stats: { total: iocs.length, byType } };
}
