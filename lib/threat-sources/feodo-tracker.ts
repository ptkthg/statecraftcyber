import type { SourceAdapter, RawThreatItem, RawIOC } from "./types";

const FEODO_API = "https://feodotracker.abuse.ch/downloads/ipblocklist.json";

export interface FeodoEntry {
  ip_address: string;
  port: number;
  status: string;
  malware: string;
  first_seen: string;
  last_online?: string;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function buildFeodoItems(entries: FeodoEntry[], now: Date): RawThreatItem[] {
  const online = entries.filter((e) => e.status === "online");

  const byFamily = new Map<string, FeodoEntry[]>();
  for (const e of online) {
    if (!byFamily.has(e.malware)) byFamily.set(e.malware, []);
    byFamily.get(e.malware)!.push(e);
  }

  const topFamilies = [...byFamily.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5);

  const date = now.toISOString().slice(0, 10);
  const items: RawThreatItem[] = [];

  for (const [family, familyEntries] of topFamilies) {
    const iocs: RawIOC[] = familyEntries.slice(0, 20).map((e) => ({
      type: "ip" as const,
      value: e.ip_address,
      confidence: "high" as const,
      source: "Feodo Tracker",
    }));

    items.push({
      externalId: `feodo-${slugify(family)}-${date}`,
      title: `Feodo Tracker: ${iocs.length} Servidores C2 Ativos de ${family}`,
      description: `${iocs.length} endereços IP identificados como servidores de comando e controle ativos da botnet ${family} pelo Feodo Tracker.`,
      sourceUrl: "https://feodotracker.abuse.ch/browse/",
      sourceName: "abuse.ch / Feodo Tracker",
      publishedAt: now,
      cves: [],
      iocs,
      severity: "high",
      mitreTechniques: ["T1071", "T1090"],
      tags: [slugify(family), "botnet", "c2", "feodo-tracker"],
      affectedSectors: ["Geral"],
      affectedRegions: ["Global"],
    });
  }

  return items;
}

export const feodoTrackerAdapter: SourceAdapter = {
  name: "abuse.ch / Feodo Tracker",

  async fetch(): Promise<RawThreatItem[]> {
    const res = await fetch(FEODO_API, {
      method: "GET",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`Feodo Tracker retornou ${res.status}`);

    const data: FeodoEntry[] = await res.json();
    if (!Array.isArray(data) || !data.length) return [];

    return buildFeodoItems(data, new Date());
  },
};
