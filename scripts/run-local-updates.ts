import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { prisma } from '../lib/prisma';
import { runUpdateWorker } from '../lib/pipeline/runner';
import { collectThreats } from '../lib/pipeline/collect';
import { errorCode } from '../lib/pipeline/context';
import { writeNewsBatch } from '../lib/news-writing';
import { createTokenBudget, withTokenBudget } from '../lib/ai/claude-client';
import { fetchCves } from '../lib/cves/fetch-cves';
import { requireLocalDatabase } from '../lib/publication/local-database';
import { logAiBudget } from '../lib/ai/budget';

async function main() {
  if (process.env.STATECRAFT_DATA_SOURCE === 'snapshot') throw new Error('local_database_required');
  const databaseUrl = requireLocalDatabase();
  if (process.env.AUTO_PUBLISH !== 'true') throw new Error('auto_publish_disabled');
  const hasAI = Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim());
  const checkpointer=PostgresSaver.fromConnString(databaseUrl,{schema:'statecraft_checkpoints'});
  const watchdog=setTimeout(()=>{console.error('local_worker_deadline_exceeded');process.exit(2);},18*60000);
  let cveFailed=false;
  let cveEntries: import('../lib/cves/fetch-cves').CveEntry[] = [];
  try {
    // CVE reads in the public site never fetch or write; refresh belongs here.
    try {
      const cves = await fetchCves({ requirePersistence: true });
      cveEntries = cves.cves;
      console.log(JSON.stringify({ stage: 'cve_refresh', count: cves.cves.length, updatedAt: cves.updatedAt }));
    } catch {
      cveFailed = true;
      console.warn('local_cve_refresh_failed');
    }
    const result=await runUpdateWorker(prisma,checkpointer,{
      collect: collectThreats, autoPublish: true, max: 4, generationEnabled: hasAI,
      ...(hasAI && {
        enrichNews: async () => { await (await import('../lib/cves/fetch-cves')).enrichAndSave(cveEntries); await writeNewsBatch((await prisma.newsArticleRecord.findMany({orderBy:{publishedAt:'desc'}})).map(row => row.payload as unknown as import('../lib/news-feeds').NewsArticle)); },
      }),
    });
    console.log(JSON.stringify(result));
    if (!hasAI || !['success','busy'].includes(result.status) || cveFailed) process.exitCode=1;
  } finally {clearTimeout(watchdog);await checkpointer.end();if (process.env.ANTHROPIC_API_KEY?.trim()) await logAiBudget();}
}
withTokenBudget(createTokenBudget(), main).catch(error=>{console.error('local_worker_failed:'+errorCode(error));process.exitCode=2;}).finally(()=>prisma.$disconnect());
