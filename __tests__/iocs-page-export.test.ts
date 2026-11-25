import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { filterPreviewIocs } from '../lib/live-preview';

const mocks = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock('../lib/live-preview', async original => ({ ...(await original<typeof import('../lib/live-preview')>()), getLivePreview: mocks.preview }));
vi.mock('../lib/security/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.stubGlobal('React', React);
const ioc = { type: 'ip', value: '198.51.100.23', confidence: 'high', briefingSlug: 'briefing', briefingTitle: 'Contexto publicado', briefingSeverity: 'high', briefingDate: '2026-11-25T12:00:00Z' };
beforeEach(() => mocks.preview.mockReset());

it('applies the global search query to the initial input and results', async () => {
  mocks.preview.mockResolvedValue({ capturedAt: '2026-11-25T12:00:00Z', iocs: [ioc, { ...ioc, value: '203.0.113.15' }] });
  const { default: Page } = await import('../app/iocs/page');
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ q: '198.51.100.23' }) }));
  expect(html).toContain('value="198.51.100.23"');
  expect(html).toContain('Contexto publicado');
  expect(html).toContain('Confiança:');
  expect(html).not.toContain('203.0.113.15');
});

it('distinguishes unavailable IOC publication from a valid empty collection', async () => {
  const { default: Page } = await import('../app/iocs/page');
  mocks.preview.mockRejectedValueOnce(new Error('failed'));
  expect(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))).toContain('Fonte de IOCs indisponível');
  mocks.preview.mockResolvedValueOnce({ capturedAt: '2026-11-25T12:00:00Z', iocs: [] });
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  expect(html).toContain('Nenhum IOC');
  expect(html).not.toContain('Fonte de IOCs indisponível');
});

it('reports total and truncation when exporting more than 500 IOCs', async () => {
  mocks.preview.mockResolvedValue({ iocs: Array.from({ length: 501 }, () => ioc) });
  const { GET } = await import('../app/api/iocs/export/route');
  const response = await GET(new NextRequest('https://example.test/api/iocs/export'));
  const data = await response.json();
  expect(data).toMatchObject({ total: 501, truncated: true, limit: 500 });
  expect(data.results).toHaveLength(500);
  expect(filterPreviewIocs(data.results, '198.51.100.23', '').filtered).toHaveLength(500);
});
