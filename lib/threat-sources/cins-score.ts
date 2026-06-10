import type { SourceAdapter, RawThreatItem } from "./types";

const CINS_URL = "https://cinsscore.com/list/ci-badguys.txt";
const MAX_IPS = 50;

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isValidIpv4(line: string): boolean {
  const match = IPV4_RE.exec(line);
  if (!match) return false;
  return match.slice(1).every((octet) => Number(octet) <= 255);
}

export function parseCinsIps(text: string, limit = MAX_IPS): string[] {
  const ips: string[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!isValidIpv4(line)) continue;
    ips.push(line);
    if (ips.length >= limit) break;
  }
  return ips;
}

export function buildCinsItem(ips: string[], now: Date): RawThreatItem | null {
  if (!ips.length) return null;

  return {
    externalId: `cins-score-${now.toISOString().slice(0, 10)}`,
    title: `CINS Score: ${ips.length} IPs Maliciosos da Blocklist Comunitária`,
    description: `${ips.length} endereços IP listados na blocklist CINS (Critical Intelligence Network Score) como fontes ativas de tráfego malicioso.`,
    sourceUrl: "https://cinsscore.com/",
    sourceName: "CINS Score",
    publishedAt: now,
    cves: [],
    iocs: ips.map((ip) => ({
      type: "ip" as const,
      value: ip,
      confidence: "medium" as const,
      source: "CINS Score",
    })),
    severity: "medium",
    tags: ["blocklist", "ip", "cins", "ioc-feed"],
    affectedSectors: ["Geral"],
    affectedRegions: ["Global"],
  };
}

export const cinsScoreAdapter: SourceAdapter = {
  name: "CINS Score",

  async fetch(): Promise<RawThreatItem[]> {
    const res = await fetch(CINS_URL, {
      method: "GET",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`CINS Score retornou ${res.status}`);

    const text = await res.text();
    const item = buildCinsItem(parseCinsIps(text), new Date());
    return item ? [item] : [];
  },
};
