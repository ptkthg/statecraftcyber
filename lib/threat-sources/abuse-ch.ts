import type { SourceAdapter, RawThreatItem, RawIOC } from "./types";

const URLHAUS_API = "https://urlhaus-api.abuse.ch/v1/urls/recent/limit/50/";
const MALWARE_BAZAAR_API = "https://mb-api.abuse.ch/api/v1/";

interface UrlHausEntry {
  id: string;
  url: string;
  url_status: string;
  date_added: string;
  threat: string;
  tags: string[] | null;
  urlhaus_link: string;
  reporter: string;
}

interface UrlHausResponse {
  query_status: string;
  urls: UrlHausEntry[];
}

interface MalwareBazaarEntry {
  sha256_hash: string;
  md5_hash: string;
  file_name: string;
  file_type: string;
  first_seen: string;
  tags: string[];
  signature: string | null;
  reporter: string;
}

interface MalwareBazaarResponse {
  query_status: string;
  data: MalwareBazaarEntry[];
}

export const abusechAdapter: SourceAdapter = {
  name: "abuse.ch",

  async fetch(): Promise<RawThreatItem[]> {
    const results: RawThreatItem[] = [];

    try {
      results.push(...(await fetchUrlHaus()));
    } catch (e) {
      console.error("[abuse.ch] URLhaus falhou:", e);
    }

    try {
      results.push(...(await fetchMalwareBazaar()));
    } catch (e) {
      console.error("[abuse.ch] MalwareBazaar falhou:", e);
    }

    return results;
  },
};

async function fetchUrlHaus(): Promise<RawThreatItem[]> {
  const authKey = process.env.ABUSE_CH_AUTH_KEY;
  const res = await fetch(URLHAUS_API, {
    method: "GET",
    headers: authKey ? { "Auth-Key": authKey } : {},
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`URLhaus retornou ${res.status}`);

  const data: UrlHausResponse = await res.json();
  if (data.query_status !== "ok" || !data.urls?.length) return [];

  // Agrupar por tipo de ameaça
  const byThreat = new Map<string, UrlHausEntry[]>();
  for (const url of data.urls) {
    const key = url.threat || "malware";
    if (!byThreat.has(key)) byThreat.set(key, []);
    byThreat.get(key)!.push(url);
  }

  const items: RawThreatItem[] = [];
  for (const [threat, urls] of byThreat) {
    const iocs: RawIOC[] = urls.slice(0, 15).map((u) => ({
      type: "url" as const,
      value: u.url,
      confidence: u.url_status === "online" ? "high" : "medium",
      source: "URLhaus",
    }));

    const tags = [
      ...new Set(urls.flatMap((u) => u.tags ?? [])),
    ].slice(0, 8);

    items.push({
      externalId: `urlhaus-${threat}-${new Date().toISOString().slice(0, 10)}`,
      title: `Infraestrutura de ${formatThreat(threat)}: ${iocs.length} URLs Maliciosas Ativas`,
      description: `O URLhaus (abuse.ch) identificou ${iocs.length} URLs ativas distribuindo ${formatThreat(threat)} nas últimas 24 horas. ${urls.filter((u) => u.url_status === "online").length} URLs permanecem online.`,
      sourceUrl: "https://urlhaus.abuse.ch/browse/",
      sourceName: "abuse.ch / URLhaus",
      publishedAt: new Date(),
      cves: [],
      iocs,
      mitreTechniques: ["T1583.008", "T1071.001"],
      tags: ["urlhaus", "ioc", "malware", ...tags],
      affectedSectors: ["Geral"],
      affectedRegions: ["Global"],
    });
  }

  return items;
}

async function fetchMalwareBazaar(): Promise<RawThreatItem[]> {
  const authKey = process.env.ABUSE_CH_AUTH_KEY;
  const res = await fetch(MALWARE_BAZAAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(authKey ? { "Auth-Key": authKey } : {}),
    },
    body: "query=get_recent&selector=time",
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`MalwareBazaar retornou ${res.status}`);

  const data: MalwareBazaarResponse = await res.json();
  if (data.query_status !== "ok" || !data.data?.length) return [];

  // Agrupar por família de malware
  const bySignature = new Map<string, MalwareBazaarEntry[]>();
  for (const sample of data.data.slice(0, 30)) {
    const key = sample.signature ?? "unknown";
    if (!bySignature.has(key)) bySignature.set(key, []);
    bySignature.get(key)!.push(sample);
  }

  const items: RawThreatItem[] = [];
  for (const [sig, samples] of bySignature) {
    if (sig === "unknown") continue;

    const iocs: RawIOC[] = samples.slice(0, 10).map((s) => ({
      type: "hash" as const,
      value: s.sha256_hash,
      confidence: "high" as const,
      source: "MalwareBazaar",
    }));

    items.push({
      externalId: `bazaar-${sig.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`,
      title: `Nova Amostra de ${sig} Identificada no MalwareBazaar`,
      description: `${samples.length} nova(s) amostra(s) da família ${sig} foram submetidas ao MalwareBazaar. Tipos de arquivo: ${[...new Set(samples.map((s) => s.file_type))].join(", ")}.`,
      sourceUrl: `https://bazaar.abuse.ch/browse.php?search=tag:${encodeURIComponent(sig)}`,
      sourceName: "abuse.ch / MalwareBazaar",
      publishedAt: new Date(samples[0].first_seen),
      cves: [],
      iocs,
      mitreTechniques: ["T1204", "T1059"],
      tags: ["malware", "bazaar", sig.toLowerCase().replace(/\s+/g, "-")],
      affectedSectors: ["Geral"],
      affectedRegions: ["Global"],
      severity: "high",
    });
  }

  return items;
}

function formatThreat(threat: string): string {
  const map: Record<string, string> = {
    malware: "Malware",
    botnet_cc: "Botnet C2",
    phishing: "Phishing",
  };
  return map[threat] ?? threat.replace(/_/g, " ");
}
