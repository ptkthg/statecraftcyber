import { afterEach, expect, it, vi } from 'vitest';
import { memoryDatabase } from './helpers/pipeline-db';
import { runPipeline } from '../lib/pipeline/service';
import { generateBriefing } from '../lib/briefing-generator';
import { durableGenerator } from '../lib/pipeline/durable-generation';
import { groundedFixture, NOW } from './fixtures/intelligence';
import { editorialDraft } from '../lib/intelligence/editorial-validation';
import { PERSONAS } from '../lib/ai/editorial-personas';
afterEach(() => vi.useRealTimers());
it('retém briefing em hold por duas novas rodadas e depois encerra tentativas', async () => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  const { db, tables } = memoryDatabase(), { item } = groundedFixture();
  const generate = vi.fn(async () => {
    const result = generateBriefing(item, new Set());
    result.qualityReport.editorialReport = { ...editorialDraft(item.description, {}, PERSONAS.inteligencia), state: 'hold', reason: 'editor_validation' };
    return result;
  });
  for (let run = 0; run < 4; run++) {
    await runPipeline(db, { idempotencyKey: 'hold-' + run, max: 1, autoPublish: true, collect: async () => ({ items: [item], errors: [], sources: ['NVD'] }), generate });
    vi.advanceTimersByTime(3600000);
  }
  expect(generate).toHaveBeenCalledTimes(3);
  expect(tables.intelligenceEvent[0].status).toBe('quarantined');
  expect(tables.briefing[0].qualityReport.editorialReport).toMatchObject({ state: 'hold', attempts: 3 });
});
it('não cacheia candidato cujo fechamento foi retido', async () => {
  const { db, tables } = memoryDatabase(), { item, briefing } = groundedFixture();
  tables.pipelineLease.push({ key: 'intelligence-v2', owner: 'worker', expiresAt: new Date(Date.now() + 60000) });
  const result = { ...generateBriefing(item, new Set()), structuredContent: briefing };
  result.qualityReport.editorialReport = { ...editorialDraft(item.description, {}, PERSONAS.inteligencia), state: 'hold' };
  await durableGenerator(db, 'worker', 'held-candidate', vi.fn(async () => result))(item, new Set());
  expect(tables.briefingCandidate).toHaveLength(0);
});
it('briefing descartado fica sete dias fora da geração', async () => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  const { db, tables } = memoryDatabase(), { item } = groundedFixture();
  const generate = vi.fn(async () => {
    const result = generateBriefing(item, new Set());
    result.qualityReport.editorialReport = { ...editorialDraft(item.description, {}, PERSONAS.inteligencia), state: 'kill', reason: 'refusal:cyber' };
    return result;
  });
  const run = (key: string) => runPipeline(db, { idempotencyKey: key, max: 1, autoPublish: true, collect: async () => ({ items: [item], errors: [], sources: ['NVD'] }), generate });
  await run('kill-1'); vi.advanceTimersByTime(86400000); await run('kill-2');
  expect(generate).toHaveBeenCalledTimes(1);
  expect(tables.briefing[0].qualityReport.editorialReport.reason).toBe('refusal:cyber');
  vi.advanceTimersByTime(6 * 86400000); await run('kill-3');
  expect(generate).toHaveBeenCalledTimes(2);
});
it('preserva briefing publicado e retenta atualização retida pelo editor', async () => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  const { db, tables } = memoryDatabase(), { item, briefing } = groundedFixture();
  const { validateBriefing } = await import('../lib/intelligence/validation');
  const initial = { ...generateBriefing(item, new Set()), structuredContent: briefing, qualityReport: validateBriefing(item, briefing, NOW), analysisStatus: 'validated' as const };
  // O teste isola o agendamento de substituição da política já testada em separado.
  initial.qualityReport.publishable = true; initial.qualityReport.issues = []; initial.qualityReport.analysisStatus = 'validated';
  const generate = vi.fn(async (): Promise<import("../lib/briefing-generator").GeneratedBriefing> => initial);
  const run = (key: string, raw = item) => runPipeline(db, { idempotencyKey: key, max: 1, autoPublish: true, collect: async () => ({ items: [raw], errors: [], sources: ['NVD'] }), generate });
  await run('replacement-1');
  expect(tables.briefing[0].status).toBe('published');
  const changed = { ...item, description: item.description + '\nNew source detail.' };
  generate.mockImplementation(async () => {
    const held = generateBriefing(changed, new Set());
    held.qualityReport.editorialReport = { ...editorialDraft(changed.description, {}, PERSONAS.inteligencia), state: 'hold', reason: 'deferred:upstream_retry' };
    return held;
  });
  vi.advanceTimersByTime(3600000); await run('replacement-2', changed);
  expect(tables.briefing[0].status).toBe('published');
  expect(tables.intelligenceEvent[0].status).toBe('retry');
  expect(tables.intelligenceEvent[0].attempts).toBe(0);
  expect(tables.briefingCandidate[0].payload.qualityReport.editorialReport.reason).toBe('deferred:upstream_retry');
});
