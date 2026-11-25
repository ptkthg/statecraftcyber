import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { budgetDb } from './helpers/budget-db';
const m = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof budgetDb> }));
vi.mock('../lib/prisma', () => ({ prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => m.db.$transaction(fn), aiReservation: { updateMany: (query: Parameters<ReturnType<typeof budgetDb>['aiReservation']['updateMany']>[0]) => m.db.aiReservation.updateMany(query) } } }));
import { reserveAiItem, releaseAiItem, recordAiUsage, authorizeAiCall } from '../lib/ai/budget';
const now = new Date('2026-11-25T15:00:00Z');
beforeEach(() => { m.db = budgetDb(); vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv('AI_BUDGET_START', '2026-11-25'); vi.stubEnv('AI_BUDGET_USD', '5'); vi.stubEnv('AI_BUDGET_DAYS', '20'); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it('execuções concorrentes não gastam a reserva da mesma cota duas vezes', async () => {
  const first = await reserveAiItem('news', 'mesma', now);
  expect(first).not.toBeNull();
  expect(await reserveAiItem('news', 'mesma', now)).toBeNull();
  const admitted = await Promise.all(Array.from({ length: 30 }, (_, i) => reserveAiItem('news', String(i), now)));
  expect(admitted.filter(Boolean)).toHaveLength(14);
  expect(m.db.reservations.reduce((s,r) => s + Number(r.reservedUsd),0)).toBeCloseTo(.18);
});
it('troca reserva por consumo real uma única vez inclusive cache e desconto de lote', async () => {
  const item = (await reserveAiItem('news', 'a', now))!;
  const usage = { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 };
  await recordAiUsage(item, 'claude-sonnet-5-5', usage, true, 'lote:a');
  await recordAiUsage(item, 'claude-sonnet-5-5', usage, true, 'lote:a');
  expect(m.db.ledger).toHaveLength(1);
  expect(m.db.ledger[0].costUsd).toBeCloseTo(.00605);
  expect(m.db.reservations[0].reservedUsd).toBeCloseTo(.00595);
  await releaseAiItem(item);
  expect(m.db.reservations[0]).toMatchObject({ state: 'settled', reservedUsd: 0 });
});
it('crédito esgotado não admite chamadas e novas variáveis reabrem a cota', async () => {
  m.db.ledger.push({ occurredAt: now, costUsd: 5, purpose: 'cve', itemKey: 'antiga' });
  expect(await reserveAiItem('news', 'nova', now)).toBeNull();
  vi.stubEnv('AI_BUDGET_START', '2026-11-26'); vi.setSystemTime(new Date('2026-11-26T15:00:00Z'));
  expect(await reserveAiItem('news', 'nova', new Date())).not.toBeNull();
});
it('teto absoluto inclui responsabilidade de outros lotes', async () => {
  const a = (await reserveAiItem('news','a',now))!, b = (await reserveAiItem('news','b',now))!;
  expect(await authorizeAiCall(a, 4.9, now)).toBe(true);
  expect(await authorizeAiCall(b, .2, now)).toBe(false);
});
it('falha ambígua mantém cobertura mesmo após devolver a pauta à fila', async () => {
  const item = (await reserveAiItem('news','a',now))!;
  expect(await authorizeAiCall(item, .2, now)).toBe(true);
  await releaseAiItem(item);
  expect(m.db.reservations[0]).toMatchObject({ state: 'awaiting_usage', liabilityUsd: .2, reservedUsd: 0 });
  expect(await authorizeAiCall(item, .1, now)).toBe(false);
});
it('histórico agrega tentativas da mesma matéria antes de escolher as últimas 50', async () => {
  for (let i=0; i<4; i++) m.db.ledger.push({ occurredAt: new Date('2026-11-24T12:00:00Z'), costUsd: .05, purpose: 'news', itemKey: 'mesma', reservationId: String(i) });
  // Uma matéria de US$ 0,20 não cabe nos US$ 0,18 reservados a notícias hoje.
  expect(await reserveAiItem('news','nova',now)).toBeNull();
});
it('reserva de 20% e limites de três briefings e cinco CVEs por dia', async () => {
  vi.stubEnv('AI_BUDGET_USD','50');
  for (let i=0; i<3; i++) { const item = await reserveAiItem('briefing',String(i),now); expect(item).not.toBeNull(); await releaseAiItem(item!); }
  expect(await reserveAiItem('briefing','quarta',now)).toBeNull();
  for (let i=0; i<5; i++) { const item = await reserveAiItem('cve',String(i),now); expect(item).not.toBeNull(); await releaseAiItem(item!); }
  expect(await reserveAiItem('cve','sexta',now)).toBeNull();
});
