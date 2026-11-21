export function sortRecentNews<T extends { publishedAt: string }>(articles: T[]): T[] {
  return [...articles].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
}
export function newsIsStale(lastCollectionAt: string | null, now = new Date()) {
  return !lastCollectionAt || +now - Date.parse(lastCollectionAt) > 3 * 3600000;
}
