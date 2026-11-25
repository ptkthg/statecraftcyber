import { Prisma, type PrismaClient } from '@prisma/client';
import { fetchNewsCollection, type NewsArticle } from './news-feeds';
import { newsIsStale, sortRecentNews } from './news-order';
import { fence } from './pipeline/service';
import { getLivePreview } from './live-preview';
import { newsForPublication } from './publication/news';
import { getPublishedSnapshot } from './publication/snapshot';

export async function collectNews(db: PrismaClient, owner: string, runId: string) {
  await db.updateHealth.upsert({ where: { key: 'news' }, create: { key: 'news', runId, lastAttemptAt: new Date(), status: 'running' }, update: { runId, lastAttemptAt: new Date(), status: 'running' } });
  try {
    const result = await fetchNewsCollection();
    if (!result.sources.length) throw new Error('all_news_sources_failed');
    const now = new Date();
    await db.$transaction(async tx => {
      await fence(tx, owner);
      for (const article of result.articles) {
        const data = { payload: JSON.parse(JSON.stringify(article)) as Prisma.InputJsonValue, publishedAt: new Date(article.publishedAt), collectedAt: now };
        await tx.newsArticleRecord.upsert({ where: { slug: article.slug }, create: { slug: article.slug, ...data }, update: data });
      }
      // An empty valid feed is distinct from every feed failing; never delete the archive.
      await tx.updateHealth.update({ where: { key: 'news' }, data: { lastCollectionAt: now, lastSuccessAt: now, status: result.errors.length ? 'partial' : 'success' } });
    }, { timeout: 30000 });
    return result;
  } catch (error) {
    await db.$transaction(async tx => { await fence(tx, owner); await tx.updateHealth.update({ where: { key: 'news' }, data: { status: 'failed' } }); }).catch(() => {});
    throw error;
  }
}

export async function getStoredNews() {
  const published = await getPublishedSnapshot();
  if (published) return { articles: sortRecentNews(published.news.articles), lastCollectionAt: published.news.lastCollectionAt, stale: newsIsStale(published.news.lastCollectionAt) || published.updates.find(u=>u.key==='news')?.status === 'failed' };
  const preview = await getLivePreview();
  if (preview) return { articles: sortRecentNews(preview.news.articles), lastCollectionAt: preview.capturedAt, stale: newsIsStale(preview.capturedAt) };
  const { prisma } = await import('./prisma');
  const [rows, health] = await Promise.all([
    prisma.newsArticleRecord.findMany({ orderBy: [{ publishedAt: 'desc' }, { slug: 'asc' }], take: 500 }),
    prisma.updateHealth.findUnique({ where: { key: 'news' } }),
  ]);
  const articles = rows.map(row => row.payload as unknown as NewsArticle);
  // Read cached enrichment only. Listing pages never wait for the LLM.
  const cached = await prisma.newsCache.findMany({ where: { slug: { in: articles.map(a => a.slug) } } });
  const lastCollectionAt = health?.lastCollectionAt?.toISOString() ?? null;
  return { articles: sortRecentNews(newsForPublication(articles, cached)), lastCollectionAt, stale: newsIsStale(lastCollectionAt) || health?.status === 'failed' };
}

export async function getStoredArticle(slug: string): Promise<NewsArticle | null> {
  const published = await getPublishedSnapshot();
  if (published) return published.news.articles.find(a=>a.slug===slug) ?? null;
  const { prisma } = await import('./prisma');
  const row = await prisma.newsArticleRecord.findUnique({ where: { slug } });
  if (!row) return null;
  const article = row.payload as unknown as NewsArticle;
  const cache = await prisma.newsCache.findUnique({where:{slug}});
  return newsForPublication([article], cache ? [cache] : [])[0];
}
