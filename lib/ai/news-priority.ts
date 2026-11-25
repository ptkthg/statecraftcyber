import type { NewsArticle } from '../news-feeds';
export function prioritizeNews(articles: NewsArticle[], now = new Date(), kev = new Set<string>()): NewsArticle[] {
  const age = (a: NewsArticle) => (now.getTime() - Date.parse(a.publishedAt)) / 3600000;
  const score = (a: NewsArticle) => a.importance + (a.type === 'Alerta Oficial' ? 50 : a.type === 'Vulnerabilidade' && a.cves.some(cve => kev.has(cve)) ? 40 : a.type === 'Ransomware' ? 30 : a.type === 'APT' ? 25 : 0) + (a.sourceRegion === 'Brasil' ? 10 : 0) - age(a) / 6;
  return articles.filter(a => Number.isFinite(age(a)) && age(a) >= 0 && age(a) <= 72).sort((a, b) => score(b) - score(a) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.slug.localeCompare(b.slug));
}
