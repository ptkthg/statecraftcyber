import type { EvidenceClaim, EvidenceSource } from '../intelligence/types';
import { originalQuote } from '../intelligence/evidence';

export interface EvidenceExcerpt { id: string; sourceId: string; text: string }
const fields = ['executiveSummary', 'whatHappened', 'whyItMatters', 'whoIsAtRisk', 'technicalDetails', 'falsePositiveNotes'] as const;
const lists = ['recommendedActions', 'detectionSuggestions'] as const;

/** Model selects immutable passages instead of retyping quotes and source IDs. */
export function evidenceExcerpts(sources: EvidenceSource[]): EvidenceExcerpt[] {
  const result: EvidenceExcerpt[] = [];
  for (const source of sources) {
    const passages = new Set([
      ...source.text.split(/\n\s*\n/),
      ...source.text.split('\n'),
      ...source.text.split(/(?<=[.!?])\s+/),
      ...source.text.split('\n').flatMap(line => line.split(/(?<=[.!?])\s+/)),
    ].map(text => text.trim()));
    for (const text of passages) {
      if (text.length > 6000 || !originalQuote(source, text)) continue;
      result.push({ id: `e${result.length}`, sourceId: source.id, text });
      if (result.length >= 200) return result;
    }
  }
  return result;
}

export function expandExcerptSelection(raw: string, excerpts: EvidenceExcerpt[]): Record<string, unknown> | null {
  try {
    const selection: unknown = JSON.parse(raw);
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return null;
    const data = selection as Record<string, unknown>;
    if (fields.some(field => typeof data[field] !== 'string') || lists.some(field => !Array.isArray(data[field]))) return null;
    const lookup = new Map(excerpts.map(e => [e.id, e]));
    const claims: EvidenceClaim[] = [];
    const result: Record<string, unknown> = { claims };
    const expand = (id: unknown, field: string) => {
      if (id === '' || id === null || id === undefined) return '';
      if (typeof id !== 'string' || !lookup.has(id)) throw new Error('Unknown evidence excerpt');
      const excerpt = lookup.get(id)!;
      claims.push({field, kind:'reported', sourceId:excerpt.sourceId, quote:excerpt.text});
      return excerpt.text;
    };
    for (const field of fields) result[field] = expand(data[field], field);
    for (const field of lists) {
      const ids = data[field] ?? [];
      if (!Array.isArray(ids) || ids.some(id=>typeof id !== 'string' || !lookup.has(id))) return null;
      result[field] = [...new Set(ids)].map((id, i) => expand(id, `${field}.${i}`));
    }
    return result;
  } catch { return null; }
}
