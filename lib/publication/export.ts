import type { Briefing, Ioc as StoredIoc, CveCache, UpdateHealth, CronLog } from '@prisma/client';
import { fromStored } from '../cves/fetch-cves';
import type { CveSourceMetadata } from '../cves/assessment';
import type { NewsArticle } from '../news-feeds';
import type { StructuredBriefing, Ioc, Confidence } from '../types';
import type { EvidenceSource, QualityReport } from '../intelligence/types';
import { safeSourceUrl } from '../intelligence/evidence';
import { sortRecentNews } from '../news-order';
import type { PublishedSnapshot, PublishedBriefing } from './snapshot';

export interface SnapshotInput {
  briefings: Briefing[];
  iocs: StoredIoc[];
  cves: CveCache[];
  news: NewsArticle[];
  updates: UpdateHealth[];
  lastRun: CronLog | null;
}
const iso = (date: Date | string | null | undefined) => date && Number.isFinite(new Date(date).getTime()) ? new Date(date).toISOString() : null;
const pick = <T, K extends keyof T>(object: T, keys: readonly K[]): Pick<T,K> => Object.fromEntries(keys.map(key=>[key,object[key]])) as Pick<T,K>;
const publicIoc = (ioc: Ioc): Ioc => ({type:ioc.type,value:ioc.value,confidence:ioc.confidence,...(ioc.source ? {source:ioc.source} : {})});

/** Keep only evidence already cited in the public analysis, never the raw snapshot. */
function publicQuality(q: QualityReport, structured: StructuredBriefing): QualityReport {
  const claims = structured.claims ?? [];
  const techniques = (q.techniques ?? []).map(t=>pick(t,['id','name','kind','sourceId','quote','url','catalogCommit']));
  const sources: EvidenceSource[] = q.sources.map(source=>({
    ...pick(source,['id','name','url','publishedAt','retrievedAt','origin']),
    text: [...new Set([...claims.filter(c=>c.sourceId===source.id).map(c=>c.quote),...techniques.filter(t=>t.sourceId===source.id).map(t=>t.quote)].filter((text):text is string=>typeof text==='string' && source.text.includes(text)))].join('\n'),
  }));
  return {...pick(q,['policyVersion','analysisStatus','publishable','checkedAt','contentType']),issues:[],risk:pick(q.risk,['severity','severityBasis','technicalSeverity','cvssScore','exploitationProbability','knownExploitation','operationalPriority','confidence','confidenceReason']),techniques,sources};
}
function publicStructured(s: StructuredBriefing, q: QualityReport): StructuredBriefing {
  return {...pick(s,['title','executiveSummary','whatHappened','whyItMatters','whoIsAtRisk','technicalDetails','recommendedActions','detectionSuggestions','falsePositiveNotes','confidenceLevel','confidenceReason','sourceName','sourceUrl']),
    relatedCves:[...s.relatedCves],mitreTechniques:[...s.mitreTechniques],identifiedIocs:s.identifiedIocs.map(publicIoc),
    claims:(s.claims ?? []).map(c=>pick(c,['field','kind','sourceId','quote'])),
    mitreEvidence:(s.mitreEvidence ?? []).map(t=>pick(t,['id','name','kind','sourceId','quote'])),quality:publicQuality(q,s)};
}
function publicBriefing(row: Briefing): PublishedBriefing | null {
  const q=row.qualityReport as unknown as QualityReport | null;
  const s=row.structuredContent as unknown as StructuredBriefing | null;
  if (row.status!=='published' || row.analysisStatus!=='validated' || q?.policyVersion!=='phase1-v1' || !q.publishable || q.analysisStatus!=='validated' || q.issues.length || !s || !safeSourceUrl(row.sourceUrl)) return null;
  return {...pick(row,['id','title','slug','summary','content','severity','category','tags','affectedRegions','affectedSectors','sourceName','sourceUrl','cves','mitreTechniques','epssScore','cvssScore','confidence','readingTime','operationalPriority','severityBasis']),
    createdAt:iso(row.createdAt)!,updatedAt:iso(row.updatedAt)!,sourcePublishedAt:iso(row.sourcePublishedAt),
    structuredContent:publicStructured(s,q),iocs:(Array.isArray(row.iocs)?row.iocs as unknown as Ioc[]:[]).map(publicIoc)};
}
function publicMetadata(m: CveSourceMetadata | null | undefined): CveSourceMetadata | null {
  if (!m) return null;
  return {version:'phase3-v1',nvd:pick(m.nvd,['url','retrievedAt','vector','metricSource','status']),
    products:m.products.map(p=>pick(p,['vendor','product','cpe','version','startIncluding','startExcluding','endIncluding','endExcluding','configuration','sourceUrl'])),
    references:m.references.map(r=>pick(r,['url','tags','source'])),epss:pick(m.epss,['url','date','retrievedAt']),
    kev:pick(m.kev,['status','checkedAt','url','dateAdded','requiredAction','dueDate','notes']),
    fixedVersions:m.fixedVersions.map(v=>pick(v,['package','ecosystem','version','rangeType','sourceUrl'])),
    remediationCheckedAt:m.remediationCheckedAt,warnings:[...m.warnings]};
}
function publicNews(article: NewsArticle): NewsArticle | null {
  if (!safeSourceUrl(article.url) || !iso(article.publishedAt) || !article.title || !article.summary) return null;
  return pick(article,['id','slug','title','summary','content','imageUrl','url','source','sourceRegion','publishedAt','tags','cves','importance','type']);
}

export function buildPublicSnapshot(input: SnapshotInput, now=new Date()): PublishedSnapshot {
  const briefings=input.briefings.map(publicBriefing).filter((b):b is PublishedBriefing=>!!b).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  const approved=new Map(briefings.map(b=>[b.id,b]));
  const iocs=input.iocs.filter(i=>i.isActive && approved.has(i.briefingId)).map(i=>{
    const b=approved.get(i.briefingId)!;
    return {type:i.type as Ioc['type'],value:i.value,confidence:i.confidence as Confidence,source:i.sourceName ?? b.sourceName,sourceName:i.sourceName ?? b.sourceName,briefingSlug:b.slug,briefingTitle:b.title,briefingSeverity:b.severity,briefingDate:b.createdAt};
  });
  const updates=input.updates.map(u=>({key:u.key,status:u.status,lastAttemptAt:iso(u.lastAttemptAt),lastCollectionAt:iso(u.lastCollectionAt),lastSuccessAt:iso(u.lastSuccessAt),lastPublicationAt:iso(u.lastPublicationAt)}));
  const cves=input.cves.map(row=>{
    const cve=fromStored(row);
    return {...cve,sourceMetadata:publicMetadata(cve.sourceMetadata),fetchedAt:iso(row.fetchedAt),enrichedAt:iso(row.enrichedAt),dataState:now.getTime()-row.fetchedAt.getTime()>6*3600000?'stale' as const:'fresh' as const};
  }).filter(c=>c.sourceMetadata?.nvd.status!=='Rejected');
  return {schemaVersion:1,generatedAt:now.toISOString(),capturedAt:now.toISOString(),origin:'https://statecraftcyber.vercel.app',
    briefings:{briefings,trending:briefings.filter(b=>['critical','high'].includes(b.severity)).slice(0,5),latestIocs:iocs.slice(0,8).map(i=>({...publicIoc(i),sourceName:i.sourceName,briefingSlug:i.briefingSlug,severity:i.briefingSeverity}))},
    iocs,news:{articles:sortRecentNews(input.news.map(publicNews).filter((a):a is NewsArticle=>!!a)),lastCollectionAt:updates.find(u=>u.key==='news')?.lastCollectionAt ?? null},
    cves,updates,lastRun:input.lastRun ? {...pick(input.lastRun,['success','briefingsCreated','durationMs']),runAt:iso(input.lastRun.runAt)!} : null};
}
