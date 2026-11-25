import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), upsert: vi.fn(), writer: vi.fn(), review: vi.fn(), reserve: vi.fn(), batchFind: vi.fn(), batchCreate: vi.fn(), dbBatchCreate: vi.fn(), dbBatchUpdate: vi.fn(), retrieve: vi.fn(), results: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: { newsCache: { findMany: mocks.findMany, upsert: mocks.upsert }, cveCache: { findMany: async () => [] }, aiBatch: { findMany: mocks.batchFind, create: mocks.dbBatchCreate, update: mocks.dbBatchUpdate, updateMany: async () => ({ count: 1 }) } } }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { batches: { create: mocks.batchCreate, retrieve: mocks.retrieve, results: mocks.results } }; } }));
vi.mock('../lib/ai/budget', () => ({ currentAiItem: () => undefined, reserveAiItem: mocks.reserve, authorizeAiCall: async () => true, recordAiUsage: vi.fn(), releaseAiItem: vi.fn(), settleAiBatchItem: vi.fn(), withAiItem: async (_: unknown, fn: () => Promise<unknown>) => fn() }));
vi.mock('../lib/ai/claude-client', async original => ({ ...await original<typeof import('../lib/ai/claude-client')>(), claudeJson: mocks.writer }));
vi.mock('../lib/intelligence/editorial-validation', async original => ({ ...await original<typeof import('../lib/intelligence/editorial-validation')>(), reviewEditorial: mocks.review }));
import { writeNewsBatch } from '../lib/news-writing';
import { articleFields, editorialDraft } from '../lib/intelligence/editorial-validation';
import { PERSONAS, drawJournalist, PROMPT_VERSION } from '../lib/ai/editorial-personas';
import type { NewsArticle } from '../lib/news-feeds';
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
const article = (slug: string, date: string): NewsArticle => ({ id: slug, slug, title: 'Microsoft fixed a flaw.', summary: 'Apply the documented update.', content: 'Microsoft fixed a flaw. Apply the documented update.', source: 'Microsoft', url: 'https://example.org/' + slug, publishedAt: date, sourceRegion: 'Global', type: 'Vulnerabilidade', tags: [], cves: [], importance: 1 });
const draft = { chamada: 'Microsoft corrige falha', linhaFina: 'A correção está disponível.', lide: 'Segundo Microsoft, há uma correção.', corpo: 'Aplique a correção documentada.', porQueImporta: 'Avaliação Statecraft: priorize a correção.', fatosUsados: [{ texto: 'Microsoft corrige falha', trechoDaFonte: 'Microsoft fixed a flaw.' }] };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-25T15:00:00Z')); vi.stubEnv('CLAUDE_USE_BATCH', 'false'); vi.clearAllMocks(); vi.stubEnv('ANTHROPIC_API_KEY', 'mock'); mocks.reserve.mockImplementation(async (_purpose, key) => ({ id: key, purpose: 'news', itemKey: key })); mocks.batchFind.mockResolvedValue([]); mocks.batchCreate.mockResolvedValue({ id: 'batch' }); mocks.findMany.mockResolvedValue([]); mocks.upsert.mockResolvedValue({}); mocks.writer.mockResolvedValue({ status: 'ok', data: draft, model: 'writer', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }); mocks.review.mockImplementation(async (source, candidate, persona, report) => ({ ...report, publishable: true, state: 'published', reason: 'approved', editorDecision: 'publicar' })); });
it('ordena por data, aplica limite e salva conteúdo aprovado com proveniência', async () => {
  await writeNewsBatch([article('old', '2026-11-20'), article('new', '2026-11-25')], { limit: 1 });
  expect(mocks.upsert.mock.calls[0][0]).toMatchObject({ where: { slug: 'new' }, create: { title: draft.chamada, content: draft.lide + '\n\n' + draft.corpo, porQueImporta: draft.porQueImporta, persona: drawJournalist('new', 'Vulnerabilidade').id, desk: drawJournalist('new', 'Vulnerabilidade').name } });
  expect(mocks.writer).toHaveBeenCalledTimes(1);
});
it('preserva texto original no hold e não altera cache em erro transitório', async () => {
  mocks.review.mockImplementation(async (source, candidate, persona, report) => ({ ...report, publishable: false, state: 'hold', reason: 'editor_validation' }));
  await writeNewsBatch([article('held', '2026-11-25')]);
  expect(mocks.upsert.mock.calls[0][0].create.title).toBe('Microsoft fixed a flaw.');
  mocks.upsert.mockClear(); mocks.writer.mockResolvedValue({ status: 'deferred', reason: 'upstream_retry', usage: {} });
  await writeNewsBatch([article('held', '2026-11-25')]);
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it('retoma hold em outra rodada e respeita kill', async () => {
  mocks.findMany.mockResolvedValue([{ slug: 'held', qualityReport: { state: 'hold', attempts: 1 } }, { slug: 'killed', qualityReport: { state: 'kill', checkedAt: new Date().toISOString() } }]);
  await writeNewsBatch([article('held', '2026-11-25'), article('killed', '2026-11-25')]);
  expect(mocks.writer).toHaveBeenCalledTimes(1);
  expect(mocks.upsert.mock.calls[0][0].create.qualityReport.attempts).toBe(2);
});
it('a assinatura da aprovação depende do conteúdo', () => {
  const report = editorialDraft('Fonte', articleFields(draft), PERSONAS["rafael-nogueira"]);
  expect(report.contentDigest).toBeTruthy();
});
it('reabre a pauta quando a fonte de uma matéria aprovada muda', async () => {
  const original = article('updated', '2026-11-25');
  const previous = { ...editorialDraft('Fonte antiga', articleFields(draft), PERSONAS["rafael-nogueira"]), state: 'published', publishable: true };
  mocks.findMany.mockResolvedValue([{ slug: original.slug, qualityReport: previous }]);
  await writeNewsBatch([original]);
  expect(mocks.writer).toHaveBeenCalledTimes(1);
});
it('modo padrão envia um único lote e preserva original até o resultado', async () => {
  vi.unstubAllEnvs(); vi.stubEnv('ANTHROPIC_API_KEY','mock');
  const input = [article('a','2026-11-25'),article('b','2026-11-24')];
  const result = await writeNewsBatch(input);
  expect(mocks.batchCreate).toHaveBeenCalledTimes(1);
  expect(mocks.batchCreate.mock.calls[0][0].requests.map((r: { custom_id: string }) => r.custom_id)).toEqual(['a','b']);
  expect(result[0].title).toBe(input[0].title);
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it('orçamento negado não chama repórter nem envia lote', async () => {
  mocks.reserve.mockResolvedValue(null);
  const result = await writeNewsBatch([article('a','2026-11-25')]);
  expect(result[0].title).toBe('Microsoft fixed a flaw.');
  expect(mocks.writer).not.toHaveBeenCalled();
  expect(mocks.batchCreate).not.toHaveBeenCalled();
});
it.each(['false', 'true'])('reaproveita a persona gravada antes da redação, lote=%s', async mode => {
  vi.stubEnv('CLAUDE_USE_BATCH', mode);
  const saved = Object.values(PERSONAS).find(p => p.id !== 'inteligencia' && p.id !== drawJournalist('saved', 'Vulnerabilidade').id)!;
  mocks.findMany.mockResolvedValue([{ slug: 'saved', persona: saved.id, qualityReport: { state: 'hold', attempts: 1 } }]);
  await writeNewsBatch([article('saved', '2026-11-25')]);
  if (mode === 'false') {
    expect(mocks.writer.mock.calls[0][0].persona.id).toBe(saved.id);
    expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({ persona: saved.id, desk: saved.name, qualityReport: { promptVersion: PROMPT_VERSION, journalistBeat: saved.beat } });
  } else {
    const system = mocks.batchCreate.mock.calls[0][0].requests[0].params.system;
    expect(system[0].text).toBe(saved.system);
  }
});
it('recusa do lote tem uma única tentativa normal e segunda recusa mata a pauta', async () => {
  const input = article('a','2026-11-25');
  mocks.batchFind.mockResolvedValue([{ id: 'batch', state: 'pending', submittedAt: new Date(), slugs: ['a'], payload: [{ slug: 'a', input, persona: PERSONAS["rafael-nogueira"], prompt: 'Fonte', item: { id: 'reservation', purpose: 'news', itemKey: 'a' } }] }]);
  mocks.retrieve.mockResolvedValue({ processing_status: 'ended' });
  mocks.results.mockResolvedValue((async function* () { yield { custom_id: 'a', result: { type: 'succeeded', message: { model: 'claude-sonnet-5-5', stop_reason: 'refusal', content: [], usage: { input_tokens: 1, output_tokens: 1 } } } }; })());
  mocks.writer.mockResolvedValue({ status: 'refused', category: 'cyber', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } });
  await writeNewsBatch([input]);
  expect(mocks.writer).toHaveBeenCalledTimes(1);
  expect(mocks.upsert.mock.calls[0][0].create.qualityReport.state).toBe('kill');
});
it('fonte alterada durante o lote impede editor e publicação obsoleta', async () => {
  const old = article('a','2026-11-25');
  mocks.batchFind.mockResolvedValue([{ id: 'batch', state: 'pending', submittedAt: new Date(), slugs: ['a'], payload: [{ slug: 'a', input: old, persona: PERSONAS["rafael-nogueira"], prompt: 'Fonte', item: { id: 'reservation', purpose: 'news', itemKey: 'a' } }] }]);
  mocks.retrieve.mockResolvedValue({ processing_status: 'ended' });
  mocks.results.mockResolvedValue((async function* () { yield { custom_id: 'a', result: { type: 'succeeded', message: { model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(draft) }], usage: { input_tokens: 1, output_tokens: 1 } } } }; })());
  await writeNewsBatch([{ ...old, summary: 'Changed source.' }]);
  expect(mocks.review).not.toHaveBeenCalled();
  expect(mocks.upsert).not.toHaveBeenCalled();
});
