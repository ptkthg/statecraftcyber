import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
const { preview, findBriefings } = vi.hoisted(() => ({ preview: vi.fn(), findBriefings: vi.fn() }));
vi.mock('@/lib/live-preview', () => ({ getLivePreview: preview }));
vi.mock('@/lib/prisma', () => ({ prisma: { briefing: { findMany: findBriefings } } }));
vi.mock('@/components/editorial/EditorialHero', () => ({ default: () => <header data-large-hero="true" /> }));
import ThreatBriefingsPage from '@/app/threat-briefings/page';
beforeEach(() => { vi.clearAllMocks(); preview.mockResolvedValue({ capturedAt: '2026-11-25T10:00:00Z', briefings: { briefings: [], latestIocs: [] }, iocs: [] }); });
it('uses a compact index heading with snapshot collection time', async () => {
  const html = renderToStaticMarkup(await ThreatBriefingsPage({ searchParams: Promise.resolve({}) }));
  expect(html).not.toContain('data-large-hero');
  expect(html).toContain('Threat Briefings');
  expect(html).toContain('25/11/2026');
});
it('keeps unavailable source distinct from an empty briefing archive', async () => {
  preview.mockRejectedValue(new Error('unavailable'));
  const html = renderToStaticMarkup(await ThreatBriefingsPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain('Arquivo de briefings indisponível');
  expect(html).not.toContain('Nenhum briefing publicado');
  expect(html).not.toContain('Nenhum IOC disponível');
  expect(findBriefings).not.toHaveBeenCalled();
});
