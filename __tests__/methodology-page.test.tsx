
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
const { snapshot } = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock('@/lib/publication/snapshot', () => ({ getPublishedSnapshot: snapshot }));
import Page, { metadata } from '@/app/metodologia/page';
beforeEach(() => { snapshot.mockResolvedValue({ capturedAt: '2026-11-25T15:00:00Z' }); });
it('documents the published snapshot workflow with its collection date and current models', async () => {
  const rendered = renderToStaticMarkup(await Page());
  expect(rendered).toContain('Dados de');
  expect(rendered).toContain('12:00');
  expect(rendered).toContain('computador do operador');
  expect(rendered).toContain('openai/gpt-oss-120b');
  expect(rendered).toContain('anthropic/claude-3.5-haiku');
  expect(rendered).not.toContain('LLaMA');
  expect(rendered).not.toContain('cron-job.org');
  expect(metadata.title).toBe('Metodologia');
  expect(metadata.alternates?.canonical).toBe('/metodologia');
});
it('preserves the static methodology when the published source cannot be read', async () => {
  snapshot.mockRejectedValue(new Error('snapshot unavailable'));
  const rendered = renderToStaticMarkup(await Page());
  expect(rendered).toContain('Pipeline de processamento');
  expect(rendered).not.toContain('page-header-date');
});
