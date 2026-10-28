import { sourceSkipped, currentContext, metricFor } from "../pipeline/context";
import { fetchWithPolicy as fetch } from "../pipeline/http";
import type { SourceAdapter, RawThreatItem, RawIOC } from "./types";

const OTX_BASE = "https://otx.alienvault.com/api/v1";

interface OtxPulse {
  id: string;
  name: string;
  description: string;
  created: string;
  modified: string;
  tags: string[];
  references: string[];
  industries: string[];
  targeted_countries: string[];
  attack_ids: { id: string; name: string; display_name: string }[];
  indicators: {
    type: string;
    indicator: string;
    description?: string;
  }[];
  malware_families: { display_name: string }[];
  adversary?: string;
}

interface OtxResponse {
  results: OtxPulse[];
  next?: string;
}

const OTX_TYPE_MAP: Record<string, RawIOC["type"]> = {
  IPv4: "ip",
  IPv6: "ip",
  domain: "domain",
  hostname: "domain",
  URL: "url",
  "FileHash-MD5": "hash",
  "FileHash-SHA1": "hash",
  "FileHash-SHA256": "hash",
  email: "email",
};

function mapOtxIndicators(
  indicators: OtxPulse["indicators"],
  pulseName: string,
): RawIOC[] {
  return indicators
    .filter((ind) => OTX_TYPE_MAP[ind.type])
    .slice(0, 20)
    .map((ind) => ({
      type: OTX_TYPE_MAP[ind.type],
      value: ind.indicator,
      confidence: "medium" as const,
      source: `OTX: ${pulseName}`,
    }));
}

export const otxAdapter: SourceAdapter = {
  name: "AlienVault OTX",

  async fetch(): Promise<RawThreatItem[]> {
    const apiKey = process.env.OTX_API_KEY;
    if (!apiKey) {
      sourceSkipped("configuration_missing");
      console.warn("[OTX] OTX_API_KEY não configurada — pulando fonte");
      return [];
    }

    const url = new URL(`${OTX_BASE}/pulses/activity`);
    url.searchParams.set("limit", "10");
    url.searchParams.set("modified_since", getYesterday());

    const res = await fetch(url.toString(), {
      headers: { "X-OTX-API-KEY": apiKey },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`OTX retornou ${res.status}`);

    const data: OtxResponse = await res.json();

    if (data.next) {
      const c = currentContext();
      if (c) {
        const m = metricFor(c);
        m.failures++;
        m.codes.push("source_page_truncated");
      }
    }
    return data.results.map((pulse): RawThreatItem => {
      const iocs = mapOtxIndicators(pulse.indicators ?? [], pulse.name);
      const mitre = (pulse.attack_ids ?? []).map((a) => a.id).filter(Boolean);
      const cves = extractCvesFromText(
        (pulse.description ?? "") + " " + pulse.name,
      );

      return {
        sourceUpdatedAt: pulse.modified ? new Date(pulse.modified) : undefined,
        actors: pulse.adversary ? [pulse.adversary] : [],
        malwareFamilies: (pulse.malware_families ?? []).map(
          (m) => m.display_name,
        ),
        iocSetComplete: (pulse.indicators ?? []).length <= 20,
        originalPayload: pulse,
        externalId: pulse.id,
        title: pulse.name,
        description: pulse.description || `Pulse OTX: ${pulse.name}`,
        sourceUrl: `https://otx.alienvault.com/pulse/${pulse.id}`,
        sourceName: "AlienVault OTX",
        publishedAt: new Date(pulse.created),
        cves,
        iocs,
        mitreTechniques: mitre,
        evidenceSources: [
          {
            id: "otx-pulse",
            name: "AlienVault OTX",
            url: `https://otx.alienvault.com/pulse/${pulse.id}`,
            text: JSON.stringify(pulse),
            techniqueAssertions: (pulse.attack_ids ?? []).map((a) => ({
              id: a.id,
              kind: "reported" as const,
              quote: JSON.stringify(a),
            })),
            retrievedAt: new Date().toISOString(),
            publishedAt: pulse.created,
            origin: "original",
          },
        ],
        mitreEvidence: (pulse.attack_ids ?? []).map((a) => ({
          id: a.id,
          name:
            a.name || a.display_name?.replace(/^T\d{4}(?:\.\d{3})?[: -]+/, ""),
          kind: "reported" as const,
          sourceId: "otx-pulse",
          quote: JSON.stringify(a),
        })),
        tags: [
          ...(pulse.tags ?? []).slice(0, 8),
          ...(pulse.malware_families ?? [])
            .filter((m) => m?.display_name)
            .map((m) => m.display_name.toLowerCase().replace(/\s+/g, "-")),
        ],
        affectedSectors: pulse.industries ?? [],
        affectedRegions:
          (pulse.targeted_countries ?? []).length > 0
            ? pulse.targeted_countries
            : [],
      };
    });
  },
};

function getYesterday(): string {
  return new Date(Date.now() - 86_400_000).toISOString();
}

function extractCvesFromText(text: string): string[] {
  const matches = text.match(/CVE-\d{4}-\d{4,7}/gi) ?? [];
  return [...new Set(matches.map((c) => c.toUpperCase()))];
}
