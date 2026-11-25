import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { buildPublicSnapshot } from '../lib/publication/export';
import { parsePublishedSnapshot, snapshotMode } from '../lib/publication/snapshot';
import { PUBLIC_BRIEFING_WHERE, PUBLIC_IOC_WHERE } from '../lib/intelligence/publication';
import type { NewsArticle } from '../lib/news-feeds';
import { newsForPublication } from '../lib/publication/news';
import { requireLocalDatabase } from '../lib/publication/local-database';

async function main() {
  if (snapshotMode()) throw new Error('export_requires_local_database');
  requireLocalDatabase();
  const input=await prisma.$transaction(async tx=>{
    const [briefings,iocs,cves,rows,cached,updates,lastRun]=await Promise.all([
      tx.briefing.findMany({where:PUBLIC_BRIEFING_WHERE,orderBy:{createdAt:'desc'}}),
      tx.ioc.findMany({where:PUBLIC_IOC_WHERE,orderBy:{createdAt:'desc'}}),
      tx.cveCache.findMany({orderBy:{published:'desc'}}),
      tx.newsArticleRecord.findMany({orderBy:{publishedAt:'desc'}}),
      tx.newsCache.findMany({select:{slug:true,title:true,summary:true,content:true,originalUrl:true,source:true,sourceSnapshot:true,qualityReport:true,sourcePublishedAt:true,porQueImporta:true,persona:true,desk:true}}),
      tx.updateHealth.findMany(),tx.cronLog.findFirst({orderBy:{runAt:'desc'}}),
    ]);
    const news=newsForPublication(rows.map(row=>row.payload as unknown as NewsArticle),cached);
    return {briefings,iocs,cves,news,updates,lastRun};
  },{isolationLevel:'RepeatableRead',timeout:120000});
  const snapshot=parsePublishedSnapshot(buildPublicSnapshot(input));
  if (!snapshot.news.articles.length && !snapshot.cves.length && !snapshot.briefings.briefings.length) throw new Error('empty_publication_blocked');
  const text=JSON.stringify(snapshot);
  if (Buffer.byteLength(text)>80*1024*1024) throw new Error('publication_exceeds_size_budget');
  const directory=join(process.cwd(),'data/publication');
  await mkdir(directory,{recursive:true});
  const temporary=join(directory,'snapshot-'+randomUUID()+'.tmp');
  await writeFile(temporary,text,{encoding:'utf8',flag:'wx'});
  await rename(temporary,join(directory,'current.json'));
  console.log(JSON.stringify({generatedAt:snapshot.generatedAt,sha256:createHash('sha256').update(text).digest('hex'),bytes:Buffer.byteLength(text),briefings:snapshot.briefings.briefings.length,iocs:snapshot.iocs.length,news:snapshot.news.articles.length,cves:snapshot.cves.length}));
}
main().catch(error=>{console.error('publication_export_failed:'+ (error instanceof Error && /^[a-z_]+$/.test(error.message)?error.message:'database_or_snapshot_error'));process.exitCode=2;}).finally(()=>prisma.$disconnect());
