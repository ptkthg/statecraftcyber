import type { SourceAdapter, RawThreatItem } from "./types";
import { cisaKevAdapter } from "./cisa-kev";
import { nvdAdapter } from "./nvd";
import { otxAdapter } from "./otx";
import { abusechAdapter } from "./abuse-ch";
import { rssFeedsAdapter } from "./rss-feeds";

export { fetchEpssScores } from "./epss";
export type { RawThreatItem, RawIOC, SourceAdapter, Severity, Confidence } from "./types";

const ALL_ADAPTERS: SourceAdapter[] = [
  cisaKevAdapter,
  nvdAdapter,
  otxAdapter,
  abusechAdapter,
  rssFeedsAdapter,
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

  const results = await Promise.allSettled(
    ALL_ADAPTERS.map((adapter) =>
      adapter
        .fetch()
        .then((items) => ({ source: adapter.name, items }))
        .catch((err: Error) => {
          throw Object.assign(err, { sourceName: adapter.name });
        })
    )
  );

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

  return { items, errors, sources };
}
