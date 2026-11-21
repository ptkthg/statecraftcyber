import { afterEach, expect, it, vi } from 'vitest';
import { memoryDatabase } from './helpers/pipeline-db';
import { LEASE_KEY } from '../lib/pipeline/service';
const mocks = vi.hoisted(() => ({ collect: vi.fn() }));
vi.mock('../lib/news-feeds', () => ({ fetchNewsCollection: mocks.collect }));
import { collectNews } from '../lib/news-store';
afterEach(() => vi.resetAllMocks());
it('preserves stored articles and the collection timestamp when all sources fail', async () => {
  const { db, tables } = memoryDatabase();
  const previous = new Date('2026-11-20T12:00:00Z');
  tables.pipelineLease.push({ key: LEASE_KEY, owner: 'worker', expiresAt: new Date(Date.now() + 60000) });
  tables.newsArticleRecord.push({ slug: 'existing', payload: { title: 'Existing' } });
  tables.updateHealth.push({ key: 'news', lastCollectionAt: previous });
  mocks.collect.mockResolvedValue({ articles: [], errors: ['feed:failed'], sources: [] });
  await expect(collectNews(db, 'worker', 'run')).rejects.toThrow('all_news_sources_failed');
  expect(tables.newsArticleRecord).toHaveLength(1);
  expect(tables.updateHealth[0]).toMatchObject({ status: 'failed', lastCollectionAt: previous });
});
it('updates a corrected source article in place and preserves its original publication date', async () => {
  const { db, tables } = memoryDatabase();
  tables.pipelineLease.push({ key: LEASE_KEY, owner: 'worker', expiresAt: new Date(Date.now() + 60000) });
  const article = { slug: 'same', title: 'Corrected source title', publishedAt: '2026-11-20T12:00:00.000Z' };
  tables.newsArticleRecord.push({ slug: 'same', payload: { ...article, title: 'Old title' } });
  mocks.collect.mockResolvedValue({ articles: [article], errors: [], sources: ['valid-feed'] });
  await collectNews(db, 'worker', 'run');
  expect(tables.newsArticleRecord).toHaveLength(1);
  expect(tables.newsArticleRecord[0].payload.title).toBe(article.title);
  expect(tables.newsArticleRecord[0].publishedAt).toEqual(new Date(article.publishedAt));
});
it('records a successful empty feed without deleting the archived articles', async () => {
  const { db, tables } = memoryDatabase();
  tables.pipelineLease.push({ key: LEASE_KEY, owner: 'worker', expiresAt: new Date(Date.now() + 60000) });
  tables.newsArticleRecord.push({ slug: 'existing' });
  mocks.collect.mockResolvedValue({ articles: [], errors: [], sources: ['valid-feed'] });
  await collectNews(db, 'worker', 'run');
  expect(tables.newsArticleRecord).toHaveLength(1);
  expect(tables.updateHealth[0]).toMatchObject({ status: 'success', lastCollectionAt: expect.any(Date) });
});
