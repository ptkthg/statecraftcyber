import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import BriefingExplorer, { type BriefingItem } from '@/components/threat/BriefingExplorer';
import { IocTable } from '@/components/briefing/IocTable';

it('shows a single featured briefing in Todos without claiming the filter is empty', () => {
  const briefing: BriefingItem = { id: 'one', slug: 'one', title: 'Único briefing publicado', summary: 'Resumo', severity: 'high', category: 'APT', tags: [], sourceName: 'Fonte', sourceUrl: 'https://example.com', cves: [], iocs: [], createdAt: '2026-11-25T10:00:00Z' };
  const html = renderToStaticMarkup(<BriefingExplorer initialBriefings={[briefing]} initialTrending={[]} initialIocs={[]} />);
  expect(html).toContain('Único briefing publicado');
  expect(html).not.toContain('Nenhum briefing corresponde');
});

it('requires validation before blocking indicators', () => {
  const html = renderToStaticMarkup(<IocTable iocs={[{ type: 'ip', value: '198.51.100.23', confidence: 'low' }]} />);
  expect(html).toContain('Valide');
  expect(html).toContain('antes de bloquear');
  expect(html).not.toContain('Adicione ao SIEM');
});
