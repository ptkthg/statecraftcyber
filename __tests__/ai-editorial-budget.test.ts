import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CveEntry } from '../lib/cves/fetch-cves';
import { groundedFixture } from './fixtures/intelligence';
const m = vi.hoisted(() => ({ create: vi.fn(), reserve: vi.fn(), writer: vi.fn(), find: vi.fn(), save: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { batches: { create: m.create } }; } }));
vi.mock('../lib/prisma', () => ({ prisma: { aiBatch: { findMany: async () => [], create: vi.fn(), update: vi.fn() }, cveCache: { findMany: async () => [], findUnique: m.find, updateMany: m.save } } }));
vi.mock('../lib/ai/budget', () => ({ reserveAiItem: m.reserve, authorizeAiCall: async () => true, releaseAiItem: vi.fn(), recordAiUsage: vi.fn(), withAiItem: async (_: unknown, fn: () => Promise<unknown>) => fn() }));
vi.mock('../lib/ai/claude-client', async original => ({ ...await original<typeof import('../lib/ai/claude-client')>(), claudeJson: m.writer }));
import { enrichAndSave } from '../lib/cves/fetch-cves';
import { generateClaudeBriefing } from '../lib/ai/claude-briefing';
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('ANTHROPIC_API_KEY','mock'); vi.stubEnv('CLAUDE_USE_BATCH','true'); m.reserve.mockImplementation(async (purpose, itemKey) => ({ id: itemKey, purpose, itemKey })); m.create.mockResolvedValue({ id: 'batch' }); });
afterEach(() => vi.unstubAllEnvs());
it('somente CVEs novas com CVSS >= 9 ou KEV entram em um único lote', async () => {
  const cve = (id: string, cvssScore: number, inCisaKev = false, ptBrDescription: string | null = null) => ({ id, cvssScore, inCisaKev, ptBrDescription, description: 'Original description.', lastModified: '2026-11-25T12:00:00Z' }) as CveEntry;
  await enrichAndSave([cve('CVE-2026-0001',8), cve('CVE-2026-0002',9), cve('CVE-2026-0003',5,true), cve('CVE-2026-0004',10,false,'Já traduzida')]);
  expect(m.create.mock.calls[0][0].requests.map((r: { custom_id: string }) => r.custom_id)).toEqual(['CVE-2026-0002','CVE-2026-0003']);
  expect(m.create).toHaveBeenCalledTimes(1);
  expect(m.save).not.toHaveBeenCalled();
});
it('briefing sem reserva fica retido e não chama o repórter', async () => {
  m.reserve.mockResolvedValue(null);
  const result = await generateClaudeBriefing(groundedFixture().item);
  expect(result.briefing).toBeNull();
  expect(result.editorialReport).toMatchObject({ state: 'hold', reason: 'deferred:period_budget' });
  expect(m.writer).not.toHaveBeenCalled();
});
it('repórter do briefing recebe no máximo 6.000 caracteres de fonte limpa', async () => {
  m.writer.mockResolvedValue({ status: 'deferred', reason: 'token_budget', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } });
  await generateClaudeBriefing({ ...groundedFixture().item, description: '<p>' + 'Fonte '.repeat(3000) + '</p>' });
  const prompt = m.writer.mock.calls[0][0].prompt;
  const data = JSON.parse(prompt.slice(prompt.indexOf('{')));
  expect(data.fontes.reduce((sum: number, source: { text: string }) => sum + source.text.length,0)).toBe(6000);
  expect(data.fontes.some((source: { text: string }) => /<[^>]+>/.test(source.text))).toBe(false);
});
