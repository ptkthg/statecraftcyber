import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';
vi.mock('../lib/ai/budget', () => ({ currentAiItem: () => undefined, reserveAiItem: async () => ({ id: 'test', purpose: 'news', itemKey: 'test' }), authorizeAiCall: async () => true, recordAiUsage: mocks.record, releaseAiItem: vi.fn() }));
const mocks = vi.hoisted(() => ({ parse: vi.fn(), record: vi.fn() }));
vi.mock('@anthropic-ai/sdk', async (original) => {
  const actual = await original<typeof import('@anthropic-ai/sdk')>();
  class Client { static APIError = actual.default.APIError; static RateLimitError = actual.default.RateLimitError; static APIConnectionError = actual.default.APIConnectionError; beta = { messages: { parse: mocks.parse } }; messages = { parse: mocks.parse }; }
  return { ...actual, default: Client };
});
import Anthropic from '@anthropic-ai/sdk';
import { claudeJson, createTokenBudget, withTokenBudget } from '../lib/ai/claude-client';
import { PERSONAS } from '../lib/ai/editorial-personas';
const schema = z.object({ texto: z.string() });
const options = { schema, persona: PERSONAS["marina-tavares"], prompt: 'Fonte original' };
const usage = { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 };
describe('cliente Claude', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.record.mockResolvedValue(undefined); mocks.parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: { texto: 'Texto' }, usage }); });
  it('envia parâmetros compatíveis e contabiliza cache no teto', async () => {
    const budget = createTokenBudget(100);
    await withTokenBudget(budget, async () => {
      expect((await claudeJson(options)).status).toBe('ok');
      expect((await claudeJson(options)).status).toBe('deferred');
    });
    expect(mocks.parse).toHaveBeenCalledTimes(1);
    const request = mocks.parse.mock.calls[0][0];
    expect(request).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 16000, fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'], system: [{ cache_control: { type: 'ephemeral' } }], output_config: { effort: 'low' } });
    for (const key of ['temperature', 'top_p', 'top_k', 'thinking']) expect(request).not.toHaveProperty(key);
    expect(budget.used).toBe(100);
  });
  it('editor Haiku usa esforço médio sem beta, fallback, temperatura ou thinking', async () => {
    await claudeJson({ ...options, role: 'editor' });
    const request = mocks.parse.mock.calls[0][0];
    expect(request).toMatchObject({ model: 'claude-haiku-5-5', output_config: { effort: 'medium' } });
    for (const key of ['betas', 'fallbacks', 'temperature', 'thinking']) expect(request).not.toHaveProperty(key);
  });
  it('trata recusa antes de acessar a saída', async () => {
    mocks.parse.mockResolvedValue({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, usage, get parsed_output() { throw new Error('Não ler'); } });
    expect(await claudeJson(options)).toMatchObject({ status: 'refused', category: 'cyber' });
  });
  it.each([{ stop_reason: 'max_tokens', parsed_output: { texto: 'Parcial' } }, { stop_reason: 'end_turn', parsed_output: null }])('recusa saída inválida %j', async (result) => {
    mocks.parse.mockResolvedValue({ ...result, usage });
    expect((await claudeJson(options)).status).toBe('invalid');
  });
  it('adia 429 sem recorrer a outro provedor', async () => {
    mocks.parse.mockRejectedValue(new Anthropic.RateLimitError(429, { error: { message: 'limite' } }, 'limite', new Headers()));
    expect((await claudeJson(options)).status).toBe('deferred');
  });
  it('falha de contabilização depois da resposta propaga e não vira uso zero', async () => {
    mocks.record.mockRejectedValue(new Error('ledger indisponível'));
    await expect(claudeJson(options)).rejects.toThrow('ledger indisponível');
    expect(mocks.record.mock.calls[0][2]).toEqual(usage);
  });
});
