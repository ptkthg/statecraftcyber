import { fetchWithPolicy as fetch } from "../pipeline/http";
export interface KevRecord {
  cveID: string;
  dateAdded?: string;
  requiredAction?: string;
  dueDate?: string;
  notes?: string;
}
export async function fetchKevCatalog(): Promise<{
  entries: Map<string, KevRecord>;
  checkedAt: string;
} | null> {
  try {
    const response = await fetch(
      "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      { signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { vulnerabilities?: KevRecord[] };
    if (
      !Array.isArray(data.vulnerabilities) ||
      !data.vulnerabilities.some((e) => /^CVE-\d{4}-\d{4,}$/.test(e.cveID))
    )
      return null;
    return {
      entries: new Map(
        data.vulnerabilities
          .filter((e) => /^CVE-\d{4}-\d{4,}$/.test(e.cveID))
          .map((e) => [e.cveID, e]),
      ),
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
export interface EpssRecord {
  score: number;
  percentile: number | null;
  date: string | null;
  retrievedAt: string;
}
export async function fetchEpssDated(
  ids: string[],
): Promise<Map<string, EpssRecord>> {
  const result = new Map<string, EpssRecord>(),
    deadline = Date.now() + 12000,
    chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(2, chunks.length) }, async () => {
      while (next < chunks.length && Date.now() < deadline) {
        const chunk = chunks[next++];
        try {
          const response = await fetch(
            "https://api.first.org/data/v1/epss?cve=" + chunk.join(","),
            {
              signal: AbortSignal.timeout(
                Math.max(1, Math.min(7000, deadline - Date.now())),
              ),
            },
          );
          if (!response.ok) continue;
          const data = (await response.json()) as {
            data?: {
              cve: string;
              epss: string;
              percentile: string;
              date?: string;
            }[];
          };
          for (const row of data.data ?? []) {
            const score = Number(row.epss),
              percentile = Number(row.percentile);
            if (
              !chunk.includes(row.cve) ||
              !row.epss?.trim() ||
              !Number.isFinite(score) ||
              score < 0 ||
              score > 1
            )
              continue;
            result.set(row.cve, {
              score,
              percentile:
                row.percentile?.trim() &&
                Number.isFinite(percentile) &&
                percentile >= 0 &&
                percentile <= 1
                  ? percentile
                  : null,
              date:
                row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date)
                  ? row.date
                  : null,
              retrievedAt: new Date().toISOString(),
            });
          }
        } catch {
          /* A missing score is never presented as zero. */
        }
      }
    }),
  );
  return result;
}
