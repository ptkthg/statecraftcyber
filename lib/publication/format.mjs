export const PUBLIC_ORIGIN='https://statecraftcyber.vercel.app';
const date=value=>typeof value==='string' && Number.isFinite(Date.parse(value));
const optionalDate=value=>value===null || date(value);
function validSecondaryLists(v) {
  const trending=v.briefings.briefings.filter(b=>['critical','high'].includes(b.severity)).slice(0,5);
  const latest=v.iocs.slice(0,8).map(i=>({type:i.type,value:i.value,confidence:i.confidence,...(i.source?{source:i.source}:{}),sourceName:i.sourceName,briefingSlug:i.briefingSlug,severity:i.briefingSeverity}));
  return JSON.stringify(v.briefings.trending)===JSON.stringify(trending) && JSON.stringify(v.briefings.latestIocs)===JSON.stringify(latest);
}
export function validPublicationSnapshot(v) {
  return !!v && typeof v==='object' && v.schemaVersion===1 && v.origin===PUBLIC_ORIGIN && date(v.generatedAt) && date(v.capturedAt) &&
    Array.isArray(v.briefings?.briefings) && Array.isArray(v.briefings.trending) && Array.isArray(v.briefings.latestIocs) &&
    v.briefings.briefings.every(b=>b && typeof b.slug==='string' && typeof b.title==='string' && date(b.createdAt) && b.structuredContent?.quality?.policyVersion==='phase1-v1' && b.structuredContent.quality.analysisStatus==='validated' && b.structuredContent.quality.publishable===true) &&
    Array.isArray(v.iocs) && v.iocs.every(i=>i && typeof i.value==='string' && v.briefings.briefings.some(b=>b.slug===i.briefingSlug)) &&
    Array.isArray(v.news?.articles) && optionalDate(v.news.lastCollectionAt) && v.news.articles.every(a=>a && typeof a.slug==='string' && typeof a.title==='string' && typeof a.summary==='string' && typeof a.url==='string' && date(a.publishedAt)) &&
    Array.isArray(v.cves) && v.cves.every(c=>c && /^CVE-\d{4}-\d{4,}$/.test(c.id) && typeof c.description==='string' && date(c.published) && date(c.lastModified) && optionalDate(c.fetchedAt) && ['fresh','stale'].includes(c.dataState)) &&
    Array.isArray(v.updates) && v.updates.every(u=>u && typeof u.key==='string' && typeof u.status==='string' && optionalDate(u.lastAttemptAt) && optionalDate(u.lastCollectionAt) && optionalDate(u.lastSuccessAt) && optionalDate(u.lastPublicationAt)) &&
    (v.lastRun===null || !!v.lastRun && date(v.lastRun.runAt) && typeof v.lastRun.success==='boolean') && validSecondaryLists(v);
}
