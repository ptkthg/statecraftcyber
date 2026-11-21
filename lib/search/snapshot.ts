import { snapshotCveEvidence } from "../cves/relationships";
import type { PublishedSnapshot } from "../publication/snapshot";
import { normalizeIoc } from "../threat-intel/normalize-ioc";
import type { EnrichedIoc } from "../types";
import { detectCveId, mergeResults } from "./merge";
import type { SearchResult } from "./types";

const searchText = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function searchSnapshot(snapshot: PublishedSnapshot, query: string) {
  const q = searchText(query);
  if (!q.trim()) return [];
  const terms = q.split(/\s+/);
  const cveId = detectCveId(query);
  const publicSlugs = new Set(snapshot.briefings.briefings.map((briefing) => briefing.slug));
  const publicIocs = snapshot.iocs.filter((ioc) => publicSlugs.has(ioc.briefingSlug));
  const matches = (text: string) => {
    const haystack = searchText(text);
    return terms.every((term) => haystack.includes(term));
  };

  const briefings = snapshot.briefings.briefings.flatMap((briefing): SearchResult[] => {
    const titleMatch = matches(briefing.title);
    if (!titleMatch && !(cveId && briefing.cves.includes(cveId)) &&
      !matches(`${briefing.title} ${briefing.summary} ${briefing.content}`)) return [];
    return [{
      type: "briefing", id: briefing.id, title: briefing.title,
      href: `/threat-briefings/${briefing.slug}`, meta: briefing.severity.toUpperCase(), rank: titleMatch ? 0.9 : 0.4,
    }];
  }).sort((a, b) => b.rank - a.rank).slice(0, 5);

  const news = snapshot.news.articles.flatMap((article): SearchResult[] => {
    const titleMatch = matches(article.title);
    if (!titleMatch && !matches(`${article.title} ${article.summary}`)) return [];
    return [{
      type: "noticia", id: article.slug, title: article.title,
      href: `/noticias/${article.slug}`, meta: article.source, rank: titleMatch ? 0.8 : 0.4,
    }];
  }).sort((a, b) => b.rank - a.rank).slice(0, 5);

  const cves = snapshot.cves.filter((cve) => cve.sourceMetadata?.nvd.status !== "Rejected" &&
    matches([cve.id, cve.description, cve.ptBrDescription ?? "", cve.vulnType, ...cve.affectedProducts].join(" ")),
  ).map((cve): SearchResult => ({
    type: "cve", id: cve.id, title: cve.id, href: `/cves/${cve.id}`,
    meta: cve.severity ?? "N/A", rank: cve.id === cveId ? 1 : 0.3, isMono: true,
  })).sort((a, b) => b.rank - a.rank).slice(0, 5);

  const toIocResult = (ioc: EnrichedIoc, viaCve?: string): SearchResult => ({
    type: "ioc", id: `${ioc.type}:${ioc.value}`, title: ioc.value,
    href: `/iocs?q=${encodeURIComponent(ioc.value)}`,
    meta: viaCve ? `via ${viaCve} · ${ioc.briefingSeverity.toUpperCase()}` :
      `${ioc.type.toUpperCase()} · ${ioc.briefingSeverity.toUpperCase()}`,
    rank: viaCve ? 0.7 : 0.5, isMono: true,
  });
  const iocs = publicIocs.filter((ioc) => [ioc.value, normalizeIoc(ioc.type, ioc.value)]
    .some((value) => searchText(value).includes(q))).slice(0, 5).map((ioc) => toIocResult(ioc));
  const correlatedIocs = cveId ? snapshotCveEvidence(snapshot, cveId).flatMap((report) =>
    publicIocs.filter((ioc) => ioc.briefingSlug === report.slug &&
      report.iocs.some((related) => related.type === ioc.type && related.value === ioc.value),
    )).slice(0, 5).map((ioc) => toIocResult(ioc, cveId)) : [];

  return mergeResults([briefings, iocs, news, cves], correlatedIocs);
}
