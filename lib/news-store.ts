import { Prisma, type PrismaClient } from '@prisma/client';
import { fetchNewsCollection, type NewsArticle } from './news-feeds';
import { newsIsStale, sortRecentNews } from './news-order';
import { fence } from './pipeline/service';
import { getLivePreview } from './live-preview';
import { validTextReport, validateTextFields } from './intelligence/text-validation';

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
  const preview = await getLivePreview();
  if (preview) return { articles: sortRecentNews(preview.news.articles), lastCollectionAt: preview.capturedAt, stale: newsIsStale(preview.capturedAt) };
  const { prisma } = await import('./prisma');
  const [rows, health] = await Promise.all([
    prisma.newsArticleRecord.findMany({ orderBy: [{ publishedAt: 'desc' }, { slug: 'asc' }], take: 500 }),
    prisma.updateHealth.findUnique({ where: { key: 'news' } }),
  ]);
  const articles = rows.map(row => row.payload as unknown as NewsArticle);
  // Read cached enrichment only. Listing pages never wait for the LLM.
  const cached = await prisma.newsCache.findMany({ where: { slug: { in: articles.map(a => a.slug) } }, select: { slug: true, title: true, summary: true, qualityReport: true } });
  const translations = new Map(cached.filter(row => {
    const original = articles.find(a => a.slug === row.slug);
    return original && validTextReport(row.qualityReport, original.title + '\n' + original.summary) && validateTextFields(original.title + '\n' + original.summary, { title: row.title, summary: row.summary }).publishable;
  }).map(row => [row.slug, row]));
  const lastCollectionAt = health?.lastCollectionAt?.toISOString() ?? null;
  return { articles: sortRecentNews(articles.map(a => { const t = translations.get(a.slug); return t ? { ...a, title: t.title, summary: t.summary } : a; })), lastCollectionAt, stale: newsIsStale(lastCollectionAt) || health?.status === 'failed' };
}

export async function getStoredArticle(slug: string): Promise<NewsArticle | null> {
  const { prisma } = await import('./prisma');
  const row = await prisma.newsArticleRecord.findUnique({ where: { slug } });
  return row ? row.payload as unknown as NewsArticle : null;
}
