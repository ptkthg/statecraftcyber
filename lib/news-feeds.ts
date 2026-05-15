import Parser from "rss-parser";

export type ArticleType =
  | "Vulnerabilidade"
  | "Ransomware"
  | "Phishing"
  | "APT"
  | "Malware"
  | "Vazamento"
  | "Supply Chain"
  | "Ataque"
  | "Alerta Oficial"
  | "Ameaça";

export interface NewsArticle {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content?: string;
  imageUrl?: string;
  url: string;
  source: string;
  sourceRegion: "Brasil" | "Global";
  publishedAt: string;
  tags: string[];
  cves: string[];
  importance: number;
  type: ArticleType;
}

export interface FeedConfig {
  name: string;
  url: string;
  region: "Brasil" | "Global";
}

export const FEEDS: FeedConfig[] = [
  // ── Threat Research / Vendor Labs ────────────────────────────────────────────
  { name: "Microsoft Security Blog", url: "https://www.microsoft.com/en-us/security/blog/feed/",                  region: "Global" },
  { name: "Google Mandiant Blog",    url: "https://www.mandiant.com/resources/blog/rss.xml",                      region: "Global" },
  { name: "Palo Alto Unit 42",       url: "https://unit42.paloaltonetworks.com/feed/",                            region: "Global" },
  { name: "CrowdStrike Blog",        url: "https://www.crowdstrike.com/blog/feed/",                               region: "Global" },
  { name: "Cisco Talos",             url: "https://blog.talosintelligence.com/feeds/posts/default",               region: "Global" },
  { name: "Securelist",              url: "https://securelist.com/feed/",                                         region: "Global" },
  { name: "Check Point Research",    url: "https://research.checkpoint.com/feed/",                                region: "Global" },
  { name: "Malwarebytes Labs",       url: "https://blog.malwarebytes.com/feed/",                                  region: "Global" },
  // ── Notícias gerais de segurança ─────────────────────────────────────────────
  { name: "The Hacker News",         url: "https://feeds.feedburner.com/TheHackersNews",                          region: "Global" },
  { name: "BleepingComputer",        url: "https://www.bleepingcomputer.com/feed/",                               region: "Global" },
  { name: "Krebs on Security",       url: "https://krebsonsecurity.com/feed/",                                    region: "Global" },
  { name: "Dark Reading",            url: "https://www.darkreading.com/rss.xml",                                  region: "Global" },
  // ── Governo / CERT ───────────────────────────────────────────────────────────
  { name: "CISA Alerts",             url: "https://www.cisa.gov/uscert/ncas/alerts.xml",                          region: "Global" },
  { name: "SANS ISC",                url: "https://isc.sans.edu/rssfeed.xml",                                     region: "Global" },
  { name: "CERT.br",                 url: "https://www.cert.br/rss/certbr-rss.xml",                               region: "Brasil" },
  { name: "CTIR Gov",                url: "https://www.gov.br/ctir/pt-br/assuntos/alertas/RSS",                   region: "Brasil" },
  // ── Brasil ───────────────────────────────────────────────────────────────────
  { name: "Tempest Security",        url: "https://www.tempest.com.br/feed/",                                     region: "Brasil" },
  { name: "TI Safe",                 url: "https://www.tisafe.com/blog/feed/",                                    region: "Brasil" },
  { name: "ANPD",                    url: "https://www.gov.br/anpd/pt-br/RSS",                                    region: "Brasil" },
];

type RssItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  guid?: string;
  contentSnippet?: string;
  content?: string;
  enclosure?: { url?: string; type?: string };
  mediaContent?: { $?: { url?: string } } | Array<{ $?: { url?: string } }>;
  mediaThumbnail?: { $?: { url?: string } };
};

const parser = new Parser<Record<string, unknown>, RssItem>({
  timeout: 12_000,
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
    ],
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 60);
}

function shortHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 6);
}

export function generateArticleSlug(title: string, url: string): string {
  return `${slugify(title)}-${shortHash(url)}`;
}

function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
}

export function sanitizeContent(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed[^>]*>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript:/gi, "");
}

function extractImage(item: RssItem): string | undefined {
  if (item.enclosure?.url && item.enclosure.type?.startsWith("image/")) return item.enclosure.url;
  const mc = item.mediaContent;
  if (mc) {
    if (Array.isArray(mc)) { const u = mc[0]?.$?.url; if (u) return u; }
    else if (!Array.isArray(mc) && mc.$?.url) return mc.$.url;
  }
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;
  const m = (item.content ?? "").match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m?.[1] && !m[1].startsWith("data:")) return m[1];
  return undefined;
}

function extractCves(text: string): string[] {
  const m = text.match(/CVE-\d{4}-\d{4,7}/gi) ?? [];
  return [...new Set(m.map((c) => c.toUpperCase()))];
}

function scoreImportance(title: string, cves: string[], region: "Brasil" | "Global"): number {
  let s = 0;
  const l = title.toLowerCase();
  s += Math.min(cves.length * 2, 4);
  if (/zero.?day/.test(l)) s += 3;
  if (/ransomware/.test(l)) s += 3;
  if (/apt|advanced persistent/.test(l)) s += 2;
  if (/critical|crítico/.test(l)) s += 2;
  if (/exploit(ed|ing)?/.test(l)) s += 2;
  if (/supply chain/.test(l)) s += 2;
  if (/breach|vazamento|leaked/.test(l)) s += 1;
  if (/attack|ataque/.test(l)) s += 1;
  if (/vuln|vulnerab/.test(l)) s += 1;
  if (/alert|alerta|warning/.test(l)) s += 1;
  if (region === "Brasil") s += 1;
  return s;
}

const OFFICIAL_ALERT_SOURCES = new Set([
  "CERT.br", "CTIR Gov", "CISA Alerts", "SANS ISC", "ANPD",
]);

export function classifyType(title: string, cves: string[], source: string): ArticleType {
  const l = title.toLowerCase();
  if (OFFICIAL_ALERT_SOURCES.has(source))        return "Alerta Oficial";
  if (/ransomware/.test(l))                       return "Ransomware";
  if (/phishing|spear.?phishing/.test(l))         return "Phishing";
  if (/apt|advanced persistent|nation.?state|espionage|espionagem/.test(l)) return "APT";
  if (/supply.?chain/.test(l))                    return "Supply Chain";
  if (cves.length > 0 || /zero.?day|cve-|patch|vuln|vulnerab|exploit/.test(l)) return "Vulnerabilidade";
  if (/malware|trojan|backdoor|rat\b|rootkit|botnet|infostealer|stealer/.test(l)) return "Malware";
  if (/breach|leak|vazamento|exposed|data.?theft|roubo de dado/.test(l))    return "Vazamento";
  if (/ddos|attack|ataque|campaign|campanha|incident|incidente/.test(l))    return "Ataque";
  return "Ameaça";
}

function inferTags(title: string): string[] {
  const l = title.toLowerCase();
  const tags: string[] = [];
  if (/ransomware/.test(l)) tags.push("ransomware");
  if (/phishing/.test(l)) tags.push("phishing");
  if (/apt|advanced persistent/.test(l)) tags.push("apt");
  if (/zero.?day/.test(l)) tags.push("zero-day");
  if (/supply chain/.test(l)) tags.push("supply-chain");
  if (/malware|trojan|backdoor/.test(l)) tags.push("malware");
  if (/cve-\d/i.test(title)) tags.push("vulnerabilidade");
  if (/cloud|nuvem/.test(l)) tags.push("nuvem");
  if (/credential|identity/.test(l)) tags.push("identidade");
  return tags;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchNewsArticles(maxAgeDays = 3): Promise<NewsArticle[]> {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  const results: NewsArticle[] = [];

  await Promise.allSettled(
    FEEDS.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        for (const item of (parsed.items ?? []).slice(0, 10)) {
          if (!item.title || !item.link) continue;
          const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
          if (pubDate < cutoff) continue;

          const rawSummary = item.contentSnippet ?? cleanHtml(item.content ?? "");
          const summary = rawSummary.slice(0, 500) || item.title;
          const cves = extractCves(`${item.title} ${summary}`);

          results.push({
            id: item.guid ?? item.link,
            slug: generateArticleSlug(item.title, item.link),
            title: item.title.trim(),
            summary,
            content: item.content,
            imageUrl: extractImage(item),
            url: item.link,
            source: feed.name,
            sourceRegion: feed.region,
            publishedAt: pubDate.toISOString(),
            tags: inferTags(item.title),
            cves,
            importance: scoreImportance(item.title, cves, feed.region),
            type: classifyType(item.title, cves, feed.name),
          });
        }
      } catch {
        // feed offline — skip silently
      }
    })
  );

  return results.sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}
