import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
vi.mock('../lib/ai/budget', () => ({ currentAiItem: () => undefined, reserveAiItem: async () => ({ id: 'test', purpose: 'news', itemKey: 'test' }), authorizeAiCall: async () => true, recordAiUsage: vi.fn(), releaseAiItem: vi.fn() }));
import { claudeJson, createTokenBudget, withTokenBudget } from '../lib/ai/claude-client';
import { PERSONAS } from '../lib/ai/editorial-personas';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it.each([{ stop_reason: 'refusal', stop_details: { category: 'cyber' }, text: 'I cannot help with this request.', status: 'refused' }, { stop_reason: 'max_tokens', stop_details: null, text: '{"texto":', status: 'invalid' }])('trata resposta HTTP real $stop_reason antes de interpretar JSON', async result => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'mock');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: result.stop_reason, stop_details: result.stop_details, stop_sequence: null, content: [{ type: 'text', text: result.text }], usage: { input_tokens: 12, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 3 } }), { status: 200, headers: { 'content-type': 'application/json' } })));
  const budget = createTokenBudget(20);
  const response = await withTokenBudget(budget, () => claudeJson({ schema: z.object({ texto: z.string() }), persona: PERSONAS["marina-tavares"], prompt: 'Fonte' }));
  expect(response.status).toBe(result.status); expect(budget.used).toBe(20);
  if (response.status === 'refused') expect(response.category).toBe('cyber');
});
it('editor no SDK real não envia o header beta de fallback nem parâmetros proibidos', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'mock');
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'msg_editor', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn', stop_sequence: null, content: [{ type: 'text', text: '{"texto":"Conferido"}' }], usage: { input_tokens: 12, output_tokens: 5 } }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  expect((await claudeJson({ role: 'editor', schema: z.object({ texto: z.string() }), persona: PERSONAS["marina-tavares"], prompt: 'Fonte' })).status).toBe('ok');
  const request = fetch.mock.calls[0][1];
  expect(new Headers(request.headers).get('anthropic-beta')).toBeNull();
  const body = JSON.parse(request.body);
  for (const key of ['fallbacks','temperature','thinking','betas']) expect(body).not.toHaveProperty(key);
});
