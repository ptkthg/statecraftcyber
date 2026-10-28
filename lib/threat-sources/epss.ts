import { mapConcurrent } from "../pipeline/context";
import { fetchWithPolicy as fetch } from "../pipeline/http";
const EPSS_URL = "https://api.first.org/data/v1/epss";

interface EpssEntry {
  cve: string;
  epss: string;
  percentile: string;
}

interface EpssResponse {
  data: EpssEntry[];
}

/** Busca scores EPSS para uma lista de CVEs. */
async function fetchBatch(cveIds: string[]): Promise<Record<string, number>> {
  if (cveIds.length === 0) return {};

  const url = new URL(EPSS_URL);
  url.searchParams.set("cve", cveIds.join(","));

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return {};

    const data: EpssResponse = await res.json();
    const allowed = new Set(cveIds.map((id) => id.toUpperCase()));
    return Object.fromEntries(
      (Array.isArray(data.data) ? data.data : [])
        .filter(
          (e) =>
            allowed.has(e.cve) &&
            typeof e.epss === "string" &&
            e.epss.trim() !== "" &&
            Number.isFinite(Number(e.epss)) &&
            Number(e.epss) >= 0 &&
            Number(e.epss) <= 1,
        )
        .map((e) => [e.cve, Number(e.epss)]),
    );
  } catch {
    return {};
  }
}

/** Bound FIRST query size and reuse the shared request concurrency/deadline. */
export async function fetchEpssScores(
  cveIds: string[],
): Promise<Record<string, number>> {
  const ids = [...new Set(cveIds.map((id) => id.toUpperCase()))].filter((id) =>
    /^CVE-\d{4}-\d{4,}$/.test(id),
  );
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  const results = await mapConcurrent(chunks, 2, fetchBatch);
  return Object.assign(
    {},
    ...results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
  );
}
