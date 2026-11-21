import { expect, it } from 'vitest';
import { sortRecentNews, newsIsStale } from '../lib/news-order';
it('puts newer articles before older high-importance articles without mutating input', () => {
  const input = [{ slug: 'old', publishedAt: '2026-11-20T00:00:00Z', importance: 9 }, { slug: 'new', publishedAt: '2026-11-21T00:00:00Z', importance: 0 }];
  expect(sortRecentNews(input).map(x => x.slug)).toEqual(['new', 'old']);
  expect(input[0].slug).toBe('old');
});
it('does not mark cached reads as fresh collections', () => {
  expect(newsIsStale('2026-11-20T00:00:00Z', new Date('2026-11-21T00:00:00Z'))).toBe(true);
  expect(newsIsStale(null)).toBe(true);
});
