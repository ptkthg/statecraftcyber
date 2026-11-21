import { afterEach, expect, it, vi } from 'vitest';
import { generateAiBriefing } from '../lib/ai-briefing';
import { emptyMetrics, Semaphore, withPipeline } from '../lib/pipeline/context';
vi.mock('../lib/cves/enrich-cve', () => ({ enrichCveContext: async () => ({ hasData: false }) }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('classifies an OpenRouter authorization failure without retrying it', async () => {
  vi.stubEnv('GROQ_API_KEY', ''); vi.stubEnv('OPENROUTER_API_KEY', 'test');
  const fetcher = vi.fn(async () => new Response('{}', { status: 401 }));
  vi.stubGlobal('fetch', fetcher);
  const context = { metrics: emptyMetrics(), deadlineAt: Date.now() + 60000, network: new Semaphore(1), lastAiFailure: undefined as string | undefined };
  await withPipeline(context, () => generateAiBriefing({ externalId: 'test', title: 'Source title', description: 'Original source description', sourceName: 'Source', sourceUrl: 'https://example.org' }, 'low', 'summary', 'content'));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(context.lastAiFailure).toBe('authentication_failed');
});
