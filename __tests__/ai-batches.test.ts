import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
const m = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn(), results: vi.fn(), cancel: vi.fn(), findMany: vi.fn(), dbCreate: vi.fn(), update: vi.fn(), claim: vi.fn(), usage: vi.fn(), release: vi.fn(), normal: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { batches: { create: m.create, retrieve: m.retrieve, results: m.results, cancel: m.cancel } }; } }));
vi.mock('../lib/prisma', () => ({ prisma: { aiBatch: { findMany: m.findMany, create: m.dbCreate, update: m.update, updateMany: m.claim } } }));
vi.mock('../lib/ai/budget', () => ({ authorizeAiCall: async () => true, recordAiUsage: m.usage, releaseAiItem: m.release, settleAiBatchItem: async (item: unknown, batch: string, slugs: string[]) => { await m.release(item); await m.update({ where: { id: batch }, data: { slugs } }); }, withAiItem: async (_: unknown, fn: () => Promise<unknown>) => fn() }));
vi.mock('../lib/ai/claude-client', () => ({ claudeJson: m.normal, claudeModel: () => 'claude-sonnet-5-5', effort: () => 'low', consumeTokens: vi.fn(), tokensAvailable: () => true }));
import { submitAiBatch, pollAiBatches } from '../lib/ai/batches';
const schema = z.object({ texto: z.string() });
const item = (slug: string) => ({ slug, input: { title: slug }, prompt: slug, persona: { system: 'Sistema' }, item: { id: slug, purpose: 'news' as const, itemKey: slug } });
const now = new Date('2026-11-25T15:00:00Z');
beforeEach(() => { vi.clearAllMocks(); m.claim.mockResolvedValue({ count: 1 }); m.normal.mockResolvedValue({ status: 'refused', category: 'cyber', usage: {} }); m.findMany.mockResolvedValue([]); m.create.mockResolvedValue({ id: 'remote' }); m.update.mockResolvedValue({}); });
it('envia um lote sem fallback com schema e custom_id igual ao slug', async () => {
  await submitAiBatch('news', [item('a'), item('b')], schema, now);
  const request = m.create.mock.calls[0][0];
  expect(request.requests.map((r: { custom_id: string }) => r.custom_id)).toEqual(['a', 'b']);
  expect(request.requests[0].params).toMatchObject({ max_tokens: 16000, output_config: { effort: 'low', format: { type: 'json_schema' } }, system: [{ cache_control: { type: 'ephemeral' } }] });
  expect(request.requests[0].params).not.toHaveProperty('fallbacks');
  expect(m.dbCreate.mock.calls[0][0].data.slugs).toEqual(['a', 'b']);
});
it('associa resultados fora de ordem por custom_id, contabiliza e trata recusa/erro/expiração', async () => {
  m.findMany.mockResolvedValue([{ id: 'remote', slugs: ['a','b','c','d'], payload: [item('a'),item('b'),item('c'),item('d')], submittedAt: now, state: 'pending' }]);
  m.retrieve.mockResolvedValue({ processing_status: 'ended' });
  m.results.mockResolvedValue((async function* () {
    yield { custom_id: 'b', result: { type: 'succeeded', message: { model: 'claude-sonnet-5-5', stop_reason: 'refusal', content: [], usage: { input_tokens: 1, output_tokens: 2 } } } };
    yield { custom_id: 'a', result: { type: 'succeeded', message: { model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"texto":"A"}' }], usage: { input_tokens: 1, output_tokens: 2 } } } };
    yield { custom_id: 'c', result: { type: 'errored', error: { error: { type: 'invalid_request_error' } } } };
    yield { custom_id: 'd', result: { type: 'expired' } };
  })());
  const received: unknown[] = [];
  await pollAiBatches<{ title: string }, typeof schema>('news', schema, async (input, result) => { received.push([input.title, result]); return true; }, now);
  expect(received).toMatchObject([['b', { status: 'refused' }], ['a', { status: 'ok', data: { texto: 'A' } }], ['c', { status: 'invalid', reason: 'invalid_request' }], ['d', { status: 'deferred', reason: 'batch_expired' }]]);
  expect(m.usage).toHaveBeenCalledTimes(4);
  expect(m.release).toHaveBeenCalledTimes(4);
  expect(m.normal).toHaveBeenCalledTimes(1);
});
it('lote preso por 24h é cancelado e devolvido à fila', async () => {
  m.findMany.mockResolvedValue([{ id: 'remote', slugs: ['a'], payload: [item('a')], submittedAt: new Date(now.getTime() - 86400001), state: 'pending' }]);
  m.retrieve.mockResolvedValue({ processing_status: 'in_progress' });
  const received: unknown[] = [];
  await pollAiBatches('news', schema, async (_, result) => { received.push(result); return true; }, now);
  expect(received).toMatchObject([{ status: 'deferred', reason: 'batch_expired' }]);
  expect(m.update.mock.calls.at(-1)?.[0].data.state).toBe('expired');
  expect(m.release).toHaveBeenCalledTimes(1);
});
it('outra execução com posse do lote impede um segundo fechamento', async () => {
  m.findMany.mockResolvedValue([{ id: 'remote', slugs: ['a'], payload: [item('a')], submittedAt: now, state: 'pending' }]);
  m.claim.mockResolvedValue({ count: 0 });
  const complete = vi.fn();
  const occupied = await pollAiBatches('news', schema, complete, now);
  expect(occupied.has('a')).toBe(true);
  expect(m.retrieve).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});
it.each([
  { result: { type: 'errored', error: { error: { type: 'api_error' } } }, status: 'deferred', reason: 'batch_errored' },
  { result: { type: 'canceled' }, status: 'deferred', reason: 'batch_canceled' },
  { result: { type: 'expired' }, status: 'deferred', reason: 'batch_expired' },
  { result: { type: 'succeeded', message: { model: 'claude-sonnet-5-5', stop_reason: 'max_tokens', content: [], usage: { input_tokens: 1, output_tokens: 2 } } }, status: 'invalid', reason: 'max_tokens' },
  { result: { type: 'succeeded', message: { model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"texto":42}' }], usage: { input_tokens: 1, output_tokens: 2 } } }, status: 'invalid', reason: 'parsed_output' },
])('trata $reason sem transformar a falha em publicação', async ({ result, status, reason }) => {
  m.findMany.mockResolvedValue([{ id: 'remote', slugs: ['a'], payload: [item('a')], submittedAt: now, state: 'pending' }]);
  m.retrieve.mockResolvedValue({ processing_status: 'ended' });
  m.results.mockResolvedValue((async function* () { yield { custom_id: 'a', result }; })());
  const complete = vi.fn().mockResolvedValue(true);
  await pollAiBatches('news', schema, complete, now);
  expect(complete.mock.calls[0][1]).toMatchObject({ status, reason });
  expect(m.normal).not.toHaveBeenCalled();
});
it('cancelamento expirado reconcilia cobrança tardia sem fechar a pauta antiga', async () => {
  m.findMany.mockResolvedValue([{ id: 'remote', slugs: ['a'], payload: [item('a')], submittedAt: new Date(now.getTime() - 86400001), state: 'expired' }]);
  m.retrieve.mockResolvedValue({ processing_status: 'ended' });
  m.results.mockResolvedValue((async function* () { yield { custom_id: 'a', result: { type: 'succeeded', message: { model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"texto":"A"}' }], usage: { input_tokens: 10, output_tokens: 20 } } } }; })());
  const complete = vi.fn();
  const occupied = await pollAiBatches('news', schema, complete, now);
  expect(occupied.has('a')).toBe(false);
  expect(complete).not.toHaveBeenCalled();
  expect(m.usage.mock.calls[0][2]).toMatchObject({ input_tokens: 10, output_tokens: 20 });
  expect(m.release).toHaveBeenCalledTimes(1);
});
it('tentativa normal de recusa persistida não é repetida ao retomar o editor', async () => {
  const entry = { ...item('a'), fallbackResult: { status: 'ok', data: { texto: 'A' }, model: 'claude-sonnet-5-5', usage: {} } };
  m.findMany.mockResolvedValue([{ id: 'remote', slugs: ['a'], payload: [entry], submittedAt: now, state: 'pending' }]);
  m.retrieve.mockResolvedValue({ processing_status: 'ended' });
  m.results.mockResolvedValue((async function* () { yield { custom_id: 'a', result: { type: 'succeeded', message: { model: 'claude-sonnet-5-5', stop_reason: 'refusal', content: [], usage: { input_tokens: 1, output_tokens: 2 } } } }; })());
  const complete = vi.fn().mockResolvedValue(false);
  await pollAiBatches('news', schema, complete, now);
  expect(m.normal).not.toHaveBeenCalled();
  expect(complete.mock.calls[0][1]).toMatchObject({ status: 'ok', data: { texto: 'A' } });
  expect(m.release).not.toHaveBeenCalled();
});
it('lote recusado pela API (4xx ou 529) devolve as reservas e não fica preso', async () => {
  m.create.mockRejectedValueOnce(Object.assign(new Error('overloaded'), { status: 529, error: { error: { type: 'overloaded_error' } } }));
  await expect(submitAiBatch('news', [item('a'), item('b')], schema, now)).rejects.toThrow('overloaded');
  expect(m.update.mock.calls[0][0].data.state).toBe('rejected');
  expect(m.release).toHaveBeenCalledTimes(2);
});
it('falha sem resposta da API mantém o lote em submitting, porque ele pode existir', async () => {
  m.create.mockRejectedValueOnce(Object.assign(new Error('Connection error.'), { status: undefined }));
  await expect(submitAiBatch('news', [item('a')], schema, now)).rejects.toThrow('Connection');
  expect(m.update).not.toHaveBeenCalled();
  expect(m.release).not.toHaveBeenCalled();
});
it('slug acima de 64 caracteres vira custom_id válido e o resultado volta ao slug certo', async () => {
  const long = 'ai-agents-found-an-unpatched-flaw-after-being-told-to-break--jpesl9';
  await submitAiBatch('news', [item(long)], schema, now);
  const id = m.create.mock.calls[0][0].requests[0].custom_id;
  expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  m.findMany.mockResolvedValue([{ id: 'remote', slugs: [long], payload: [item(long)], submittedAt: now, state: 'pending' }]);
  m.retrieve.mockResolvedValue({ processing_status: 'ended' });
  m.results.mockResolvedValue((async function* () { yield { custom_id: id, result: { type: 'succeeded', message: { model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"texto":"A"}' }], usage: { input_tokens: 1, output_tokens: 2 } } } }; })());
  const received: string[] = [];
  await pollAiBatches<{ title: string }, typeof schema>('news', schema, async input => { received.push(input.title); return true; }, now);
  expect(received).toEqual([long]);
});
