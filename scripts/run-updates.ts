import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { prisma } from '../lib/prisma';
import { runUpdateWorker } from '../lib/pipeline/runner';
import { collectThreats } from '../lib/pipeline/collect';
import { errorCode } from '../lib/pipeline/context';
import { writeNewsBatch } from '../lib/news-writing';
import { translateNewsBatch } from '../lib/news-translation';
import { createTokenBudget, withTokenBudget } from '../lib/ai/claude-client';
import { logAiBudget } from '../lib/ai/budget';
async function main() {
  for (const key of ['DATABASE_URL', 'CRON_SECRET', 'SITE_ORIGIN']) if (!process.env[key]) throw new Error('missing_configuration:' + key);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.GROQ_API_KEY && !process.env.OPENROUTER_API_KEY) throw new Error('missing_ai_credentials');
  if (process.env.AUTO_PUBLISH !== 'true') throw new Error('auto_publish_disabled');
  const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!, { schema: 'statecraft_checkpoints' });
  const watchdog = setTimeout(() => { console.error('worker_deadline_exceeded'); process.exit(1); }, 15 * 60000);
  try {
    const result = await runUpdateWorker(prisma, checkpointer, {
      collect: collectThreats, autoPublish: true, max: 4,
      enrichNews: async () => { const news = (await prisma.newsArticleRecord.findMany({orderBy:{publishedAt:'desc'}})).map(row => row.payload as unknown as import('../lib/news-feeds').NewsArticle); await translateNewsBatch(news); await writeNewsBatch(news); },
      verify: async () => {
        const origin = new URL(process.env.SITE_ORIGIN!);
        const response = await fetch(new URL('/api/admin/revalidate', origin), { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.CRON_SECRET }, signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('revalidation_failed');
        const recent = await prisma.briefing.findMany({ where: { status: 'published', updatedAt: { gte: new Date(Date.now() - 15 * 60000) } }, take: 4, select: { slug: true } });
        for (const briefing of recent) {
          const page = await fetch(new URL('/threat-briefings/' + encodeURIComponent(briefing.slug), origin), { signal: AbortSignal.timeout(20000), cache: 'no-store' });
          if (!page.ok) throw new Error('publication_not_visible');
        }
        const api = await fetch(new URL('/api/briefings', origin), { signal: AbortSignal.timeout(20000), cache: 'no-store' });
        if (!api.ok || !Array.isArray((await api.json()).briefings)) throw new Error('public_api_unavailable');
      },
    });
    console.log(JSON.stringify(result));
    if (!['success', 'busy'].includes(result.status)) process.exitCode = 1;
  } finally { clearTimeout(watchdog); await checkpointer.end(); if (process.env.ANTHROPIC_API_KEY?.trim()) await logAiBudget(); }
}
withTokenBudget(createTokenBudget(), main).catch(error => { console.error('update_worker_failed:' + errorCode(error)); process.exitCode = 1; }).finally(() => prisma.$disconnect());
