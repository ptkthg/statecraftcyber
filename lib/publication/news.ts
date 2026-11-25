import type { NewsCache } from '@prisma/client';
import type { NewsArticle } from '../news-feeds';
import { validTextReport, validateTextFields } from '../intelligence/text-validation';
import { safeSourceUrl } from '../intelligence/evidence';
type CachedNews=Pick<NewsCache,'slug'|'title'|'summary'|'content'|'originalUrl'|'source'|'sourceSnapshot'|'qualityReport'|'sourcePublishedAt'>;
export function plainNewsContent(html:string) {
  return html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,'').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
}
const evidence=(article:Pick<NewsArticle,'title'|'summary'|'content'>)=>[article.title,article.summary,plainNewsContent(article.content ?? '')].join('\n');
function approved(article:NewsArticle,cached:CachedNews):NewsArticle | null {
  const full=evidence(article), fields={title:cached.title,summary:cached.summary,content:cached.content};
  if (validTextReport(cached.qualityReport,full) && validateTextFields(full,fields).publishable) return {...article,...fields,contentOrigin:'automated'};
  const preview=article.title+'\n'+article.summary;
  if (validTextReport(cached.qualityReport,preview) && validateTextFields(preview,{title:cached.title,summary:cached.summary}).publishable) return {...article,title:cached.title,summary:cached.summary,contentOrigin:'automated'};
  return null;
}
export function newsForPublication(originals:NewsArticle[],cache:CachedNews[]):NewsArticle[] {
  const indexed=new Map(cache.map(row=>[row.slug,row]));
  const articles=new Map(originals.map(article=>{
    const raw:NewsArticle={...article,contentOrigin:'source'};
    return [article.slug,indexed.has(article.slug) ? approved(raw,indexed.get(article.slug)!) ?? raw : raw];
  }));
  for (const row of cache) {
    if (articles.has(row.slug)) continue;
    const source=row.sourceSnapshot as Partial<NewsArticle> | null;
    const publishedAt=source?.publishedAt ?? row.sourcePublishedAt?.toISOString();
    if (!source || typeof source.title!=='string' || typeof source.summary!=='string' || !publishedAt || !Number.isFinite(Date.parse(publishedAt)) || !safeSourceUrl(row.originalUrl)) continue;
    const original:NewsArticle={id:row.slug,slug:row.slug,title:source.title,summary:source.summary,content:typeof source.content==='string'?source.content:'',url:row.originalUrl,source:row.source,sourceRegion:'Global',publishedAt,tags:[],cves:[],importance:0,type:'Ameaça'};
    const article=approved(original,row);
    if (article) articles.set(row.slug,article);
  }
  return [...articles.values()];
}
