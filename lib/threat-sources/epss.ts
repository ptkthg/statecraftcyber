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
    return Object.fromEntries(
      data.data.map((e) => [e.cve, parseFloat(e.epss)])
    );
  } catch {
    return {};
  }
}
