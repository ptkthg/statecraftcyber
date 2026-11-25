import { expect, it } from 'vitest';
import { newsForPublication, newsEvidence } from '../lib/publication/news';
import { buildPublicSnapshot } from '../lib/publication/export';
import { editorialDraft, articleFields } from '../lib/intelligence/editorial-validation';
import { PERSONAS } from '../lib/ai/editorial-personas';
import type { NewsArticle } from '../lib/news-feeds';
const original: NewsArticle = { id: 'example', slug: 'example', title: 'Microsoft fixed a flaw.', summary: 'Apply the update to protect systems.', content: 'Microsoft fixed a flaw. Apply the update to protect systems.', source: 'Microsoft', url: 'https://example.org/news', publishedAt: '2026-11-25T12:00:00Z', sourceRegion: 'Global', tags: [], cves: [], type: 'Vulnerabilidade', importance: 1 };
const candidate = { chamada: 'Microsoft corrige falha', linhaFina: 'A correção está disponível.', lide: 'Segundo Microsoft, há uma correção.', corpo: 'Aplique a correção documentada.', porQueImporta: 'Avaliação Statecraft: priorize a correção.', fatosUsados: [{ texto: 'Microsoft corrige falha', trechoDaFonte: original.title }] };
const fields = articleFields(candidate);
const report = { ...editorialDraft(newsEvidence(original), fields, PERSONAS["rafael-nogueira"]), publishable: true, state: 'published', editorDecision: 'publicar', claims: Object.values(fields).map(texto => ({ texto, trechoDaFonte: original.content!, situacao: 'apoiada' })) };
const cached = { slug: original.slug, title: candidate.chamada, summary: candidate.linhaFina, content: candidate.lide + '\n\n' + candidate.corpo, porQueImporta: candidate.porQueImporta, persona: 'rafael-nogueira', desk: PERSONAS["rafael-nogueira"].desk, source: original.source, originalUrl: original.url, sourcePublishedAt: new Date(original.publishedAt), sourceSnapshot: JSON.parse(JSON.stringify({ ...original, editorialFields: fields })), qualityReport: JSON.parse(JSON.stringify(report)) };
it('exporta matéria editorial-v1 com avaliação e proveniência sem incluir a reprovada', () => {
  const news = newsForPublication([], [cached, { ...cached, slug: 'rejected', qualityReport: { ...cached.qualityReport, publishable: false } }]);
  const snapshot = buildPublicSnapshot({ briefings: [], iocs: [], cves: [], updates: [], lastRun: null, news });
  expect(snapshot.news.articles).toHaveLength(1);
  expect(snapshot.news.articles[0].journalist).toEqual({ id: 'rafael-nogueira', name: 'Rafael Nogueira', beat: PERSONAS['rafael-nogueira'].beat, initials: 'RN', color: PERSONAS['rafael-nogueira'].color });
  expect(snapshot.news.articles[0]).toMatchObject({ title: candidate.chamada, porQueImporta: candidate.porQueImporta, persona: 'rafael-nogueira', desk: PERSONAS["rafael-nogueira"].desk, contentOrigin: 'automated' });
  expect(newsForPublication([{ ...original, summary: 'Changed source.' }], [cached])[0].contentOrigin).toBe('source');
  expect(newsForPublication([], [{ ...cached, content: 'Alteração sem fechamento.' }])).toEqual([]);
});
it('omite a identidade de persona desconhecida', () => {
  const news = newsForPublication([], [{ ...cached, persona: 'antiga' }]);
  expect(news[0].journalist).toBeUndefined();
  expect(buildPublicSnapshot({ briefings: [], iocs: [], cves: [], updates: [], lastRun: null, news }).news.articles[0].journalist).toBeUndefined();
});
