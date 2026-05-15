import Parser from "rss-parser";
import type { SourceAdapter, RawThreatItem } from "./types";

const parser = new Parser({ timeout: 12_000 });

interface FeedConfig {
  name: string;
  url: string;
  defaultRegions?: string[];
  defaultSectors?: string[];
}

const FEEDS: FeedConfig[] = [
  {
    name: "Microsoft Security Blog",
    url: "https://www.microsoft.com/en-us/security/blog/feed/",
    defaultRegions: ["Global"],
    defaultSectors: ["Corporativo", "Identidade", "Nuvem"],
  },
  {
    name: "Google Mandiant Blog",
    url: "https://www.mandiant.com/resources/blog/rss.xml",
    defaultRegions: ["Global"],
    defaultSectors: ["Corporativo", "Governo", "Infraestrutura Crítica"],
  },
  {
    name: "Palo Alto Unit 42",
    url: "https://unit42.paloaltonetworks.com/feed/",
    defaultRegions: ["Global"],
    defaultSectors: ["Corporativo", "Financeiro", "Saúde"],
  },
  {
    name: "CrowdStrike Blog",
    url: "https://www.crowdstrike.com/blog/feed/",
    defaultRegions: ["Global"],
    defaultSectors: ["Corporativo", "Endpoint", "Governo"],
  },
  {
    name: "CERT.br",
    url: "https://www.cert.br/rss/certbr-rss.xml",
    defaultRegions: ["Brasil"],
    defaultSectors: ["Geral", "PME", "Governo Brasileiro"],
  },
  {
    name: "CTIR Gov",
    url: "https://www.gov.br/ctir/pt-br/assuntos/alertas/RSS",
    defaultRegions: ["Brasil"],
    defaultSectors: ["Governo Brasileiro", "Infraestrutura Crítica"],
  },
];

const SECURITY_KEYWORDS = [
  "ransomware", "phishing", "malware", "vulnerability", "exploit",
  "attack", "breach", "apt", "threat", "cve", "zero-day", "backdoor",
  "trojan", "botnet", "credential", "lateral movement", "supply chain",
  "vulnerabilidade", "ataque", "ameaça", "incidente", "golpe",
];

function isSecurityRelevant(title: string, summary: string): boolean {
  const text = `${title} ${summary}`.toLowerCase();
  return SECURITY_KEYWORDS.some((kw) => text.includes(kw));
}

function extractCvesFromText(text: string): string[] {
  const matches = text.match(/CVE-\d{4}-\d{4,7}/gi) ?? [];
  return [...new Set(matches.map((c) => c.toUpperCase()))];
}

function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, "") + "...";
}

export const rssFeedsAdapter: SourceAdapter = {
  name: "RSS Feeds",

  async fetch(): Promise<RawThreatItem[]> {
    const results: RawThreatItem[] = [];
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h

    for (const feed of FEEDS) {
      try {
        const parsed = await parser.parseURL(feed.url);

        for (const item of (parsed.items ?? []).slice(0, 5)) {
          if (!item.title || !item.link) continue;

          const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
          if (pubDate < cutoff) continue;

          const rawSummary = item.contentSnippet ?? item.content ?? item.summary ?? "";
          const summary = truncate(cleanHtml(rawSummary), 600);

          if (!isSecurityRelevant(item.title, summary)) continue;

          const fullText = `${item.title} ${summary}`;
          const cves = extractCvesFromText(fullText);

          results.push({
            externalId: item.guid ?? item.link,
            title: item.title.trim(),
            description: summary || `Publicação de ${feed.name}: ${item.title}`,
            sourceUrl: item.link,
            sourceName: feed.name,
            publishedAt: pubDate,
            cves,
            iocs: [],
            mitreTechniques: [],
            tags: inferTagsFromTitle(item.title),
            affectedSectors: feed.defaultSectors ?? ["Corporativo"],
            affectedRegions: feed.defaultRegions ?? ["Global"],
          });
        }
      } catch (err) {
        console.warn(`[RSS] Feed "${feed.name}" falhou:`, (err as Error).message);
      }
    }

    return results;
  },
};

function inferTagsFromTitle(title: string): string[] {
  const lower = title.toLowerCase();
  const tags: string[] = [];

  if (/ransomware/.test(lower)) tags.push("ransomware");
  if (/phishing/.test(lower)) tags.push("phishing");
  if (/apt|advanced persistent/.test(lower)) tags.push("apt");
  if (/zero.?day/.test(lower)) tags.push("zero-day");
  if (/supply chain/.test(lower)) tags.push("supply-chain");
  if (/credential|identity/.test(lower)) tags.push("identidade");
  if (/cloud|nuvem/.test(lower)) tags.push("nuvem");
  if (/endpoint/.test(lower)) tags.push("endpoint");
  if (/cve-\d/i.test(title)) tags.push("vulnerabilidade");

  return tags.length > 0 ? tags : ["threat-intel"];
}
