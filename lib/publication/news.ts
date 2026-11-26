import type { NewsCache } from '@prisma/client';
import type { NewsArticle } from '../news-feeds';
import { validTextReport, validateTextFields } from '../intelligence/text-validation';
import { validEditorialReport, checkEditorialFields } from '../intelligence/editorial-validation';
import { safeSourceUrl } from '../intelligence/evidence';
import { journalistForPersona } from '../journalists';
import { validTranslation } from '../intelligence/translation-validation';
type CachedNews=Pick<NewsCache,'slug'|'title'|'summary'|'content'|'originalUrl'|'source'|'sourceSnapshot'|'qualityReport'|'sourcePublishedAt'> & Partial<Pick<NewsCache,'porQueImporta'|'persona'|'desk'|'translation'>>;
export function plainNewsContent(html:string) {
  return html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,'').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
}
/**
 * Texto da fonte para redação e checagem. Abre com o veículo e a data de publicação, para que a atribuição
 * ("segundo a Dark Reading") e as datas citadas na matéria tenham apoio na própria fonte.
 */
export const newsEvidence=(article:Pick<NewsArticle,'title'|'summary'|'content'> & { publishedAt?: string; source?: string })=>[...(article.source?.trim() ? ['Fonte: '+article.source.trim()] : []),...(article.publishedAt && /^\d{4}-\d{2}-\d{2}/.test(article.publishedAt) ? ['Publicado em '+article.publishedAt.slice(0,10)] : []),article.title,article.summary,article.content ?? ''].map(plainNewsContent).join('\n').slice(0,6000);
function approved(article:NewsArticle,cached:CachedNews):NewsArticle | null {
  const full=newsEvidence(article), fields={title:cached.title,summary:cached.summary,content:cached.content};
  const snapshot = cached.sourceSnapshot as { editorialFields?: Record<string,string> } | null;
  const fieldsApproved = snapshot?.editorialFields;
  if (fieldsApproved && validEditorialReport(cached.qualityReport, full, fieldsApproved) && !checkEditorialFields(full, fieldsApproved).length && cached.title === fieldsApproved.chamada && cached.summary === fieldsApproved.linhaFina && cached.content === fieldsApproved.lide + '\n\n' + fieldsApproved.corpo && cached.porQueImporta === fieldsApproved.porQueImporta) return {...article,...fields,contentOrigin:'automated',porQueImporta:cached.porQueImporta ?? undefined,persona:cached.persona ?? undefined,desk:cached.desk ?? undefined,journalist:journalistForPersona(cached.persona)};
  // Sem matéria completa aprovada, vale a tradução de chamada e resumo pelo Haiku; o corpo segue o texto da fonte.
  if (validTranslation(cached.translation, full)) return {...article,title:cached.translation.titulo,summary:cached.translation.resumo,contentOrigin:'translated'};
  if (validTextReport(cached.qualityReport,full) && validateTextFields(full,fields).publishable) return {...article,...fields,contentOrigin:'automated'};
  const preview=article.title+'\n'+article.summary;
  if (validTextReport(cached.qualityReport,preview) && validateTextFields(preview,{title:cached.title,summary:cached.summary}).publishable) return {...article,title:cached.title,summary:cached.summary,contentOrigin:'automated'};
  return null;
}
export function newsForPublication(originals:NewsArticle[],cache:CachedNews[]):NewsArticle[] {
  const indexed=new Map(cache.map(row=>[row.slug,row]));
  const articles=new Map(originals.map(article=>{
    const raw:NewsArticle={...article,contentOrigin:'source',journalist:undefined};
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
