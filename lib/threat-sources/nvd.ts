import { currentContext, metricFor } from "../pipeline/context";
import { fetchWithPolicy as fetch } from "../pipeline/http";
import { selectNvdCvss, type NvdMetrics } from "../intelligence/cvss";
import type { SourceAdapter, RawThreatItem } from "./types";

const NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";

interface NvdCve {
  cve: {
    id: string;
    published: string;
    lastModified: string;
    vulnStatus: string;
    descriptions: { lang: string; value: string }[];
    metrics?: NvdMetrics;
    configurations?: {
      nodes: {
        cpeMatch: { criteria: string; vulnerable: boolean }[];
      }[];
    }[];
    references?: { url: string; source: string }[];
    weaknesses?: { description: { lang: string; value: string }[] }[];
  };
}

interface NvdResponse {
  vulnerabilities: NvdCve[];
  totalResults: number;
}

function getDescription(cve: NvdCve["cve"]): string {
  const en = cve.descriptions.find((d) => d.lang === "en");
  return en?.value ?? "Sem descrição disponível.";
}

function getCvss(cve: NvdCve["cve"]): number | undefined {
  return selectNvdCvss(cve.metrics).score ?? undefined;
}

function extractAffectedProducts(cve: NvdCve["cve"]): string[] {
  const products = new Set<string>();
  for (const config of cve.configurations ?? []) {
    for (const node of config.nodes) {
      for (const match of node.cpeMatch) {
        if (match.vulnerable) {
          // CPE format: cpe:2.3:a:vendor:product:version:...
          const parts = match.criteria.split(":");
          if (parts.length >= 5) {
            products.add(`${parts[3]} ${parts[4]}`);
          }
        }
      }
    }
  }
  return [...products].slice(0, 5);
}

export const nvdAdapter: SourceAdapter = {
  name: "NVD",

  async fetch(): Promise<RawThreatItem[]> {
    const apiKey = process.env.NVD_API_KEY;
    const headers: HeadersInit = { Accept: "application/json" };
    if (apiKey) headers["apiKey"] = apiKey;

    // CVEs publicadas ou modificadas nas últimas 24h, CVSS >= 7.0
    const yesterday = new Date(Date.now() - 86_400_000);
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, ".000");

    const url = new URL(NVD_URL);
    url.searchParams.set("lastModStartDate", fmt(yesterday));
    url.searchParams.set("lastModEndDate", fmt(now));
    url.searchParams.set("resultsPerPage", "2000"); // sem filtro de severidade — filtramos localmente (HIGH + CRITICAL)

    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) throw new Error(`NVD retornou ${res.status}`);

    const data: NvdResponse = await res.json();

    if (data.totalResults > data.vulnerabilities.length) {
      const c = currentContext();
      if (c) {
        const m = metricFor(c);
        m.failures++;
        m.codes.push("source_page_truncated");
      }
    }
    return data.vulnerabilities // Include changed scores and rejected records so earlier assessments can be invalidated.
      .map((v): RawThreatItem => {
        const cve = v.cve;
        const cvss = getCvss(cve);
        const description = getDescription(cve);
        const products = extractAffectedProducts(cve);

        return {
          originalPayload: cve,
          vendors: [
            ...new Set(
              (cve.configurations ?? []).flatMap((c) =>
                c.nodes.flatMap((n) =>
                  n.cpeMatch
                    .filter((m) => m.vulnerable)
                    .map((m) => m.criteria.split(":")[3]),
                ),
              ),
            ),
          ].filter(Boolean),
          recordKind: "vulnerability",
          sourceUpdatedAt: new Date(cve.lastModified),
          externalId: cve.id,
          title: `${cve.id}: Vulnerabilidade reportada`,
          description,
          sourceUrl: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
          sourceName: "NVD",
          publishedAt: new Date(cve.published),
          cves: [cve.id],
          cvssScore: cvss,
          metricWarnings: [
            ...selectNvdCvss(cve.metrics).warnings,
            ...(cve.vulnStatus === "Rejected" ? ["source.rejected"] : []),
          ],
          iocs: [],
          mitreTechniques: [],
          tags: [
            "vulnerabilidade",
            "nvd",
            cvss === undefined
              ? "cvss-indisponivel"
              : cvss >= 9
                ? "cvss-crítico"
                : cvss >= 7
                  ? "cvss-alto"
                  : cvss >= 4
                    ? "cvss-medio"
                    : "cvss-baixo",
          ].filter(Boolean) as string[],
          affectedProducts: products,
          affectedSectors: [],
          affectedRegions: [],
        };
      });
  },
};
