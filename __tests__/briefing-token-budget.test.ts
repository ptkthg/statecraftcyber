import { afterEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ create: vi.fn(async (request: Record<string, unknown>) => { void request; return { choices: [{ message: { content: '{}' } }] }; }) }));
vi.mock('groq-sdk', () => ({ default: class { chat = { completions: api }; } }));
import { generateAiBriefing } from '../lib/ai-briefing';
afterEach(() => vi.unstubAllEnvs());
it.each(['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'])('allows a complete evidence JSON without unsupported reasoning options for %s', async (model) => {
  vi.stubEnv('GROQ_API_KEY', 'test');
  vi.stubEnv('GROQ_MODEL', model);
  vi.stubEnv('OPENROUTER_API_KEY', '');
  await generateAiBriefing({ externalId: 'test', title: 'Source title', description: 'Original source description', sourceName: 'Source', sourceUrl: 'https://example.org' }, 'low', 'summary', 'content');
  expect(api.create).toHaveBeenLastCalledWith(expect.objectContaining({ max_completion_tokens: 6000 }));
  const request = api.create.mock.calls.at(-1)![0] as Record<string, unknown>;
  expect(request.reasoning_effort).toBe(model.startsWith('openai/gpt-oss-') ? 'low' : undefined);
  expect(request.max_tokens).toBeUndefined();
});
