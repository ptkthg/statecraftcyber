import { describe, expect, it } from 'vitest';
import { checkTranslation, translationRecord, validTranslation, canRetryTranslation } from '../lib/intelligence/translation-validation';
import { newsEvidence, newsForPublication } from '../lib/publication/news';
import type { NewsArticle } from '../lib/news-feeds';
import type { Prisma } from '@prisma/client';

const article: NewsArticle = {
  id: 'kev', slug: 'kev-fictional', title: 'Agency Adds Two Known Exploited Vulnerabilities to Catalog',
  summary: 'The agency added CVE-2026-0001 and CVE-2026-0002, affecting Contoso Gateway 4.2, based on evidence of active exploitation.',
  content: '', url: 'https://example.org/kev', source: 'Example Advisories', sourceRegion: 'Global',
  publishedAt: '2026-11-25T12:00:00Z', tags: [], cves: ['CVE-2026-0001', 'CVE-2026-0002'], importance: 5, type: 'Alerta Oficial',
};
const source = newsEvidence(article);
const faithful = { titulo: 'Agência inclui duas vulnerabilidades exploradas no catálogo Known Exploited Vulnerabilities', resumo: 'A agência adicionou a CVE-2026-0001 e a CVE-2026-0002, que afetam o Contoso Gateway 4.2, com base em evidência de exploração ativa.' };
const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const record = (t = faithful) => JSON.parse(JSON.stringify(translationRecord(source, t, { model: 'claude-haiku-5-5', attempts: 1, usage })));
const cacheRow = (translation: Prisma.JsonValue) => ({ slug: article.slug, title: article.title, summary: article.summary, content: '', originalUrl: article.url, source: article.source, sourceSnapshot: JSON.parse(JSON.stringify(article)), qualityReport: null, sourcePublishedAt: new Date(article.publishedAt), translation });

describe('política traducao-v1', () => {
  it('aprova tradução fiel, com nomes, CVEs e versões copiados da fonte', () => {
    expect(checkTranslation(source, faithful)).toEqual([]);
    expect(validTranslation(record(), source)).toBe(true);
  });
  it('reprova CVE, número, versão ou nome que a fonte não traz', () => {
    expect(checkTranslation(source, { ...faithful, resumo: faithful.resumo.replace('CVE-2026-0002', 'CVE-2026-9999') }).map(i => i.code)).toContain('entity.identifier');
    expect(checkTranslation(source, { ...faithful, titulo: 'Agência inclui três vulnerabilidades exploradas em 12 produtos' }).map(i => i.code)).toContain('entity.number');
    expect(checkTranslation(source, { ...faithful, resumo: faithful.resumo + ' O grupo Lazarus explora as falhas.' }).map(i => i.code)).toContain('entity.name');
  });
  it('aceita país e sigla traduzidos só quando o equivalente em inglês está na fonte', () => {
    const intl = newsEvidence({ ...article, title: 'Italy and Switzerland warn of AI-driven attacks', summary: 'Agencies in Italy and Switzerland warn of attacks driven by AI agents.' });
    expect(checkTranslation(intl, { titulo: 'Itália e Suíça alertam para ataques conduzidos por IA', resumo: 'Agências da Itália e da Suíça alertam para ataques conduzidos por agentes de IA.' })).toEqual([]);
    expect(checkTranslation(intl, { titulo: 'Itália e Alemanha alertam para ataques conduzidos por IA', resumo: 'Agências da Itália alertam para ataques.' }).map(i => i.code)).toContain('entity.name');
    expect(checkTranslation(intl, { titulo: 'Itália alerta para ataques da Coreia do Norte', resumo: 'Agências da Itália alertam para ataques.' }).map(i => i.code)).toContain('entity.name');
  });
  it('reprova estilo proibido, texto vazio e texto longo demais', () => {
    expect(checkTranslation(source, { ...faithful, titulo: 'Agência inclui falhas exploradas no catálogo!' }).map(i => i.code)).toContain('style.prohibited');
    expect(checkTranslation(source, { ...faithful, resumo: '' }).map(i => i.code)).toContain('content.length');
    expect(checkTranslation(source, { ...faithful, titulo: 'a'.repeat(141) }).map(i => i.code)).toContain('content.length');
  });
  it('não aceita tradução de outra versão da fonte nem texto alterado depois da checagem', () => {
    const changed = newsEvidence({ ...article, summary: article.summary + ' Updated.' });
    expect(validTranslation(record(), changed)).toBe(false);
    expect(validTranslation({ ...record(), titulo: 'Outro título' }, source)).toBe(false);
    expect(validTranslation({ ...record(), publishable: false }, source)).toBe(false);
  });
  it('tenta de novo uma tradução reprovada só até o limite, salvo se a fonte mudar', () => {
    const held = { ...record(), publishable: false };
    expect(canRetryTranslation(null, source)).toBe(true);
    expect(canRetryTranslation({ ...held, attempts: 1 }, source)).toBe(true);
    expect(canRetryTranslation({ ...held, attempts: 2 }, source)).toBe(false);
    expect(canRetryTranslation({ ...held, attempts: 2 }, newsEvidence({ ...article, title: 'New title' }))).toBe(true);
  });
});

describe('publicação de notícias traduzidas', () => {
  it('publica chamada e resumo traduzidos, com o corpo da fonte e origem "translated"', () => {
    const [published] = newsForPublication([article], [cacheRow(record())]);
    expect(published).toMatchObject({ title: faithful.titulo, summary: faithful.resumo, content: article.content, contentOrigin: 'translated' });
    expect(published.journalist).toBeUndefined();
  });
  it('volta ao texto original quando a tradução não vale para a fonte atual', () => {
    const changed = { ...article, summary: article.summary + ' Updated.' };
    expect(newsForPublication([changed], [cacheRow(record())])[0]).toMatchObject({ title: changed.title, summary: changed.summary, contentOrigin: 'source' });
    expect(newsForPublication([article], [cacheRow({ ...record(), resumo: 'Texto inventado.' })])[0].contentOrigin).toBe('source');
  });
  it('mantém a notícia traduzida que saiu do feed, a partir do snapshot da fonte', () => {
    expect(newsForPublication([], [cacheRow(record())])[0]).toMatchObject({ slug: article.slug, title: faithful.titulo, contentOrigin: 'translated' });
  });
});
