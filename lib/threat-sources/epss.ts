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
export async function fetchEpssScores(
  cveIds: string[]
): Promise<Record<string, number>> {
  if (cveIds.length === 0) return {};

  const url = new URL(EPSS_URL);
  url.searchParams.set("cve", cveIds.join(","));

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return {};

    const data: EpssResponse = await res.json();
    const allowed = new Set(cveIds.map(id => id.toUpperCase()));
    return Object.fromEntries((Array.isArray(data.data) ? data.data : [])
      .filter(e => allowed.has(e.cve) && typeof e.epss === "string" && e.epss.trim() !== "" && Number.isFinite(Number(e.epss)) && Number(e.epss) >= 0 && Number(e.epss) <= 1)
      .map(e => [e.cve, Number(e.epss)]));

  } catch {
    return {};
  }
}
