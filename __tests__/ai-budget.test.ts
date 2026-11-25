import { afterEach, expect, it, vi } from 'vitest';
import { calculateQuota, budgetConfig } from '../lib/ai/budget-policy';
import { usageCost } from '../lib/ai/pricing';
import { prioritizeNews } from '../lib/ai/news-priority';
import type { NewsArticle } from '../lib/news-feeds';
afterEach(() => vi.unstubAllEnvs());
const config = { usd: 5, days: 20, start: '2026-11-01' };
it('calcula primeiro e último dia, sobra e teto com margem de segurança', () => {
  expect(calculateQuota(config, '2026-11-01', 0, 0, 0, 0).remaining).toBeCloseTo(.225);
  expect(calculateQuota(config, '2026-11-20', 4.2, .1, 0, 0).remaining).toBeCloseTo(.3);
  expect(calculateQuota(config, '2026-11-20', 1, 0, 0, 0).remaining).toBeCloseTo(.5);
});
it('desconta reservas e bloqueia esgotamento e fim do período, recarga reabre', () => {
  expect(calculateQuota(config, '2026-11-01', 0, 0, .12, .12).remaining).toBeCloseTo(.105);
  expect(calculateQuota(config, '2026-11-20', 5, 0, 0, 0).remaining).toBe(0);
  expect(calculateQuota(config, '2026-11-21', 0, 0, 0, 0).remaining).toBe(0);
  expect(calculateQuota({ ...config, start: '2026-11-21' }, '2026-11-21', 0, 0, 0, 0).remaining).toBeCloseTo(.225);
});
it('configuração inválida falha fechada e não cria crédito novo', () => {
  vi.stubEnv('AI_BUDGET_USD', '-1');
  expect(() => budgetConfig()).toThrow();
});
it('calcula preço incluindo escrita, leitura de cache e desconto de lote', () => {
  const usage = { input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 3000, cache_creation_input_tokens: 4000 };
  expect(usageCost('claude-sonnet-5-5', usage, false)).toBeCloseTo(.0323);
  expect(usageCost('claude-sonnet-5-5', usage, true)).toBeCloseTo(.01615);
  expect(usageCost('claude-haiku-5-5', usage, false)).toBeCloseTo(.001615);
  expect(() => usageCost('modelo-desconhecido', usage, false)).toThrow();
});
it('prioriza alerta, KEV, ransomware, APT e Brasil com decaimento; exclui mais de 72h', () => {
  const now = new Date('2026-11-25T15:00:00Z');
  const article = (slug: string, extra: Partial<NewsArticle> = {}) => ({ slug, importance: 1, type: 'Malware', sourceRegion: 'Global', cves: [], publishedAt: '2026-11-25T14:00:00Z', ...extra }) as NewsArticle;
  expect(prioritizeNews([article('velha', { publishedAt: '2026-11-22T14:59:59Z', importance: 100 }), article('comum'), article('br', { sourceRegion: 'Brasil' }), article('apt', { type: 'APT' }), article('ransom', { type: 'Ransomware' }), article('kev', { type: 'Vulnerabilidade', cves: ['CVE-2026-1234'] }), article('alerta', { type: 'Alerta Oficial' })], now, new Set(['CVE-2026-1234'])).map(a => a.slug)).toEqual(['alerta', 'kev', 'ransom', 'apt', 'br', 'comum']);
});
