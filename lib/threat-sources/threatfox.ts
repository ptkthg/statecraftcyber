import type { SourceAdapter, RawThreatItem, RawIOC, Confidence, Severity } from "./types";

const THREATFOX_API = "https://threatfox-api.abuse.ch/api/v1/";

export interface ThreatFoxEntry {
  ioc_value: string;
  ioc_type: string;
  threat_type: string;
  malware: string;
  malware_printable: string | null;
  confidence_level: number;
  first_seen: string;
  tags: string[] | null;
}

interface ThreatFoxResponse {
  query_status: string;
  data: ThreatFoxEntry[];
}

const TYPE_MAP: Record<string, RawIOC["type"]> = {
  ip_port: "ip",
  domain: "domain",
  url: "url",
  md5_hash: "hash",
  sha256_hash: "hash",
};

export function mapConfidence(level: number): Confidence {
  if (level >= 75) return "high";
  if (level >= 50) return "medium";
  return "low";
}

export function mapThreatFoxIoc(entry: ThreatFoxEntry): RawIOC | null {
  const type = TYPE_MAP[entry.ioc_type];
  if (!type) return null;
  const value =
    entry.ioc_type === "ip_port" ? entry.ioc_value.split(":")[0] : entry.ioc_value;
  return { type, value, confidence: mapConfidence(entry.confidence_level), source: "ThreatFox" };
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function buildThreatFoxItems(entries: ThreatFoxEntry[], now: Date): RawThreatItem[] {
  const byFamily = new Map<string, ThreatFoxEntry[]>();
  for (const e of entries) {
    if (!TYPE_MAP[e.ioc_type]) continue;
    const key = e.malware_printable ?? e.malware;
    if (!byFamily.has(key)) byFamily.set(key, []);
    byFamily.get(key)!.push(e);
  }

  const topFamilies = [...byFamily.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5);

  const date = now.toISOString().slice(0, 10);
  const items: RawThreatItem[] = [];

  for (const [family, familyEntries] of topFamilies) {
    const iocs = familyEntries
      .slice(0, 20)
      .map(mapThreatFoxIoc)
      .filter((i): i is RawIOC => i !== null);
    if (!iocs.length) continue;

    const severity: Severity = familyEntries.some(
      (e) => e.threat_type === "botnet_cc" || e.threat_type === "payload_delivery"
    )
      ? "high"
      : "medium";

    const slug = slugify(family);
    const types = [...new Set(iocs.map((i) => i.type))].join(", ");

    items.push({
      externalId: `threatfox-${slug}-${date}`,
      title: `ThreatFox: ${iocs.length} Indicadores Ativos de ${family}`,
      description: `${iocs.length} indicadores de comprometimento da família ${family} coletados do ThreatFox nas últimas 24 horas. Tipos: ${types}.`,
      sourceUrl: `https://threatfox.abuse.ch/browse/malware/${slug}/`,
      sourceName: "abuse.ch / ThreatFox",
      publishedAt: now,
      cves: [],
      iocs,
      severity,
      tags: [slug, "malware", "ioc-feed", "threatfox"],
      affectedSectors: ["Geral"],
      affectedRegions: ["Global"],
    });
  }

  return items;
}

export const threatfoxAdapter: SourceAdapter = {
  name: "abuse.ch / ThreatFox",

  async fetch(): Promise<RawThreatItem[]> {
    const authKey = process.env.ABUSE_CH_AUTH_KEY;
    const res = await fetch(THREATFOX_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authKey ? { "Auth-Key": authKey } : {}),
      },
      body: JSON.stringify({ query: "get_iocs", days: 1 }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`ThreatFox retornou ${res.status}`);

    const data: ThreatFoxResponse = await res.json();
    if (data.query_status !== "ok" || !data.data?.length) return [];

    return buildThreatFoxItems(data.data, new Date());
  },
};
