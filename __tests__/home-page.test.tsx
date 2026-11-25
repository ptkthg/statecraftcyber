import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { readSnapshot, preview, findBriefings, readNews } = vi.hoisted(() => ({ readSnapshot: vi.fn(), preview: vi.fn(), findBriefings: vi.fn(), readNews: vi.fn() }));
vi.mock('@/lib/publication/snapshot', () => ({ getPublishedSnapshot: readSnapshot }));
vi.mock('@/lib/live-preview', () => ({ getLivePreview: preview }));
vi.mock('@/lib/prisma', () => ({ prisma: { briefing: { findMany: findBriefings } } }));
vi.mock('@/lib/news-store', () => ({ getStoredNews: readNews }));
vi.mock('@/components/editorial/EditorialHero', () => ({ default: ({ title }: { title: React.ReactNode }) => <header><h1>{title}</h1></header> }));
import HomePage from '@/app/page';
const articles = Array.from({ length: 6 }, (_, i) => ({ slug: `news-${i}`, title: `Notícia ${i}`, summary: 'Resumo', source: 'Fonte', publishedAt: '2026-11-25T10:00:00Z' }));
const snapshot = { capturedAt: '2026-11-25T10:30:00Z', briefings: { briefings: [] }, news: { articles }, cves: [{ published: '2026-11-24T10:00:00Z', cvssScore: 9.5, inCisaKev: true }, { published: '2026-11-20T10:00:00Z', cvssScore: 9.5, inCisaKev: true }, { published: '2026-11-24T10:00:00Z', cvssScore: 4, inCisaKev: false }] };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-25T12:00:00Z')); readSnapshot.mockResolvedValue(snapshot); preview.mockResolvedValue(snapshot); findBriefings.mockResolvedValue([]); readNews.mockResolvedValue({ articles }); });
afterEach(() => vi.useRealTimers());
it('omits the briefing section when no briefing is published and puts news before campaigns and editorias', async () => {
  const html = renderToStaticMarkup(await HomePage());
  expect(html).not.toContain('BRIEFING EM DESTAQUE');
  expect(html).not.toContain('Nenhum briefing publicado');
  expect(html).toContain('Notícia 5');
  expect(html.indexOf('NOTÍCIAS RECENTES')).toBeLessThan(html.indexOf('CAMPANHAS DOCUMENTADAS'));
  expect(html.indexOf('CAMPANHAS DOCUMENTADAS')).toBeLessThan(html.indexOf('EDITORIAS'));
});
it('renders real critical and KEV snapshot counts with matching filters and the collection timestamp', async () => {
  const html = renderToStaticMarkup(await HomePage());
  expect(html).toContain('/cves?severity=CRITICAL&amp;window=72h&amp;sort=recent');
  expect(html).toMatch(/>1<\/strong>[\s\S]*CVEs críticas/);
  expect(html).toMatch(/>2<\/strong>[\s\S]*CISA KEV/);
  expect(html).toContain('25/11/2026');
  expect(html).toContain('horário de Brasília');
});
it('distinguishes source failure from an empty published archive without falling back to the database', async () => {
  readSnapshot.mockRejectedValue(new Error('snapshot unavailable'));
  preview.mockRejectedValue(new Error('snapshot unavailable'));
  const html = renderToStaticMarkup(await HomePage());
  expect(html).toContain('Fonte de dados indisponível');
  expect(html).not.toContain('Nenhuma notícia publicada');
  expect(findBriefings).not.toHaveBeenCalled();
});
