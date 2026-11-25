import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import PageHeader from '@/components/PageHeader';
import CveExplorer from '@/components/cves/CveExplorer';

describe('compact editorial header', () => {
  it('shows the collection instant in Sao Paulo with explicit timezone', () => {
    const html = renderToStaticMarkup(createElement(PageHeader, { eyebrow:'Dados', title:'CVEs', description:'Contexto', capturedAt:'2026-11-25T15:00:00Z' }));
    expect(html).toContain('Dados de');
    expect(html).toContain('12:00');
    expect(html).toContain('horário de Brasília');
    expect(html).not.toContain('<img');
  });
  it('does not invent a date when unavailable', () => {
    const html = renderToStaticMarkup(createElement(PageHeader, { eyebrow:'Dados', title:'CVEs', description:'Contexto' }));
    expect(html).not.toContain('Dados de');
  });
});
it('keeps secondary CVE filters collapsed and distinguishes source unavailability', () => {
  const html = renderToStaticMarkup(createElement(CveExplorer, { initialData:{cves:[],total:0,page:1,totalPages:1,limit:12,updatedAt:null,coverage:'Indisponível',types:[],available:false} }));
  expect(html).toMatch(/<details[^>]*>/);
  expect(html).toContain('Mais filtros');
  expect(html).toContain('Dados indisponíveis');
  expect(html).not.toContain('Nenhum resultado nesta combinação');
});
