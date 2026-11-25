import type { NewsArticle } from './news-feeds';
/** Compatibilidade com o detalhe legado: toda geração ocorre na coleta. */
export interface EnrichedNews { title: string; summary: string; content: string; fromCache: boolean }
export async function getEnrichedArticle(article: NewsArticle): Promise<EnrichedNews> {
  return { title: article.title, summary: article.summary, content: article.content ?? '', fromCache: article.contentOrigin === 'automated' };
}
