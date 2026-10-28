import { mapConcurrent, withSource, currentContext } from "../pipeline/context";
import type { SourceAdapter, RawThreatItem } from "./types";
import { cisaKevAdapter } from "./cisa-kev";
import { nvdAdapter } from "./nvd";
import { otxAdapter } from "./otx";
import { abusechAdapter } from "./abuse-ch";
import { rssFeedsAdapter } from "./rss-feeds";
import { threatfoxAdapter } from "./threatfox";
import { feodoTrackerAdapter } from "./feodo-tracker";
import { cinsScoreAdapter } from "./cins-score";

export { fetchEpssScores } from "./epss";
export type {
  RawThreatItem,
  RawIOC,
  SourceAdapter,
  Severity,
  Confidence,
} from "./types";

const ALL_ADAPTERS: SourceAdapter[] = [
  cisaKevAdapter,
  nvdAdapter,
  otxAdapter,
  abusechAdapter,
  rssFeedsAdapter,
  threatfoxAdapter,
  feodoTrackerAdapter,
  cinsScoreAdapter,
];

export interface FetchResult {
  items: RawThreatItem[];
  errors: { source: string; error: string }[];
  sources: string[];
}

/** Coleta dados de todas as fontes em paralelo, com fallback individual. */
export async function fetchAllSources(): Promise<FetchResult> {
  const errors: { source: string; error: string }[] = [];
  const sources: string[] = [];

  const results = await mapConcurrent(ALL_ADAPTERS, 3, async (adapter) => {
    try {
      return {
        source: adapter.name,
        items: await withSource(adapter.name, () => adapter.fetch()),
      };
    } catch (error) {
      throw Object.assign(
        error instanceof Error ? error : new Error("Source failure"),
        { sourceName: adapter.name },
      );
    }
  });

  const items: RawThreatItem[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      items.push(...result.value.items);
      sources.push(result.value.source);
    } else {
      const err = result.reason as Error & { sourceName?: string };
      const name = err.sourceName ?? "Desconhecida";
      console.error(`[Sources] "${name}" falhou:`, err.message);
      errors.push({ source: name, error: err.message });
    }
  }

  for (const m of Object.values(currentContext()?.metrics.sources ?? {}))
    if (m.status === "partial" || m.status === "failed")
      if (!errors.some((e) => e.source === m.name))
        errors.push({
          source: m.name,
          error: m.codes.join(",") || "partial_source_failure",
        });
  return { items, errors, sources };
}
