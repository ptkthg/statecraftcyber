import { PERSONAS } from './ai/editorial-personas';
import type { NewsArticle } from './news-feeds';

/** Identidade pública derivada do id persistido; nunca envia os prompts ao site. */
export function journalistForPersona(id?: string | null): NewsArticle['journalist'] {
  if (!id || !Object.hasOwn(PERSONAS, id)) return undefined;
  const { name, beat, initials, color } = PERSONAS[id as keyof typeof PERSONAS];
  return { id, name, beat, initials, color };
}
