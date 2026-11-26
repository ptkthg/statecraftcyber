import { z } from 'zod';
import { checkEditorialFields, type EditorialReport } from './editorial-validation';
import { sourceDigest } from './text-validation';
import type { TokenUsage } from '../ai/token-usage';

/**
 * Política `traducao-v1`: chamada e resumo traduzidos pelo Haiku para toda notícia sem matéria completa.
 * Checagem determinística (CVE, número, versão, URL, nome próprio e estilo precisam existir na fonte) e
 * digests da fonte e do texto, para que uma tradução nunca sobreviva a uma mudança na fonte.
 */
export const translationSchema = z.object({ titulo: z.string(), resumo: z.string() });
export type Translation = z.infer<typeof translationSchema>;
export interface TranslationRecord extends Translation {
  policyVersion: 'traducao-v1'; publishable: boolean; sourceDigest: string; contentDigest: string;
  issues: EditorialReport['issues']; reason: string; model: string; checkedAt: string; attempts: number; usage: TokenUsage;
}
export const TRANSLATION_LIMITS = { titulo: 140, resumo: 450 } as const;
export const MAX_TRANSLATION_ATTEMPTS = 2;
const fields = (t: Translation) => ({ titulo: t.titulo, resumo: t.resumo });

export function checkTranslation(source: string, translation: Translation): EditorialReport['issues'] {
  const issues = checkEditorialFields(source, fields(translation));
  for (const [field, max] of Object.entries(TRANSLATION_LIMITS)) {
    const text = translation[field as keyof Translation];
    if (!text.trim() || text.length > max) issues.push({ code: 'content.length', field });
  }
  return issues;
}

export function translationRecord(source: string, translation: Translation, extra: Pick<TranslationRecord, 'model' | 'attempts' | 'usage'>, now = new Date()): TranslationRecord {
  const issues = checkTranslation(source, translation);
  return { policyVersion: 'traducao-v1', ...fields(translation), publishable: issues.length === 0, sourceDigest: sourceDigest(source), contentDigest: sourceDigest(fields(translation)), issues, reason: issues.length ? 'deterministic_validation' : 'approved', checkedAt: now.toISOString(), ...extra };
}

/** Só publica tradução aprovada, da mesma fonte e com o mesmo texto que foi checado. */
export function validTranslation(record: unknown, source: string): record is TranslationRecord {
  if (!record || typeof record !== 'object') return false;
  const r = record as TranslationRecord;
  return r.policyVersion === 'traducao-v1' && r.publishable === true && typeof r.titulo === 'string' && typeof r.resumo === 'string'
    && r.sourceDigest === sourceDigest(source) && r.contentDigest === sourceDigest(fields(r)) && checkTranslation(source, r).length === 0;
}

/** Uma tradução reprovada para a mesma fonte só é tentada de novo até o limite. */
export function canRetryTranslation(record: unknown, source: string): boolean {
  if (!record || typeof record !== 'object') return true;
  const r = record as Partial<TranslationRecord>;
  return r.sourceDigest !== sourceDigest(source) || (r.attempts ?? 0) < MAX_TRANSLATION_ATTEMPTS;
}
