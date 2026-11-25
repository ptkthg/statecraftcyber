import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { JOURNALISTS } from '../lib/ai/editorial-personas';
import { journalistForPersona } from '../lib/journalists';
import JournalistByline from '../components/ui/JournalistByline';
import NewsExplorer from '../components/news/NewsExplorer';
import RedacaoPage from '../app/redacao/page';
import type { NewsArticle } from '../lib/news-feeds';

vi.stubGlobal('React', React);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const journalist = journalistForPersona('helena-duarte')!;
const props = { journalist, source: 'Fonte', sourceUrl: 'https://example.org/original' };
const journalists = Object.keys(JOURNALISTS).map(id => journalistForPersona(id)!);

it('identifica a persona, usa monograma acessível e mantém o crédito da automação', () => {
  const html = renderToStaticMarkup(<JournalistByline {...props} contentOrigin="automated" />);
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('HD');
  expect(html).toContain('Helena Duarte');
  expect(html).toContain(journalist.beat);
  expect(html).toContain('Persona editorial do Statecraft');
  expect(html).toContain('Redação automatizada a partir de');
  expect(html).toContain('href="https://example.org/original"');
  expect(html).not.toContain('<img');
  for (const contentOrigin of [undefined, 'source'] as const) {
    expect(renderToStaticMarkup(<JournalistByline {...props} contentOrigin={contentOrigin} />)).toBe('');
  }
  expect(renderToStaticMarkup(<JournalistByline {...props} contentOrigin="automated" compact />)).toContain('journalist-byline--compact');
});
it('persona desconhecida mantém apenas o crédito da automação', () => {
  const html = renderToStaticMarkup(<JournalistByline {...props} journalist={undefined} contentOrigin="automated" />);
  expect(html).toContain('Redação automatizada');
  expect(html).not.toContain('journalist-monogram');
});
it('filtra pelo jornalista da URL e exclui conteúdo original mesmo com identidade residual', () => {
  const base: NewsArticle = { id: 'a', slug: 'a', title: 'Falha crítica afeta servidores', summary: 'Resumo', source: 'Fonte', url: props.sourceUrl, publishedAt: '2026-11-25T12:00:00Z', sourceRegion: 'Global', tags: [], cves: [], importance: 1, type: 'Vulnerabilidade' };
  const articles: NewsArticle[] = [
    { ...base, contentOrigin: 'automated', journalist },
    { ...base, id: 'b', slug: 'b', title: 'Falha crítica em outro servidor', contentOrigin: 'automated', journalist: journalists[1] },
    { ...base, id: 'c', slug: 'c', title: 'Falha crítica da fonte original', contentOrigin: 'source', journalist },
  ];
  const html = renderToStaticMarkup(<NewsExplorer initialArticles={articles} journalists={journalists} initialJournalist={journalist.id} initialTab="contexto" />);
  expect(html).toContain('Falha crítica afeta servidores');
  expect(html).not.toContain('Falha crítica em outro servidor');
  expect(html).not.toContain('Falha crítica da fonte original');
  expect(html).toContain('name="jornalista"');
  expect(html).toContain('value="helena-duarte" selected');
  const all = renderToStaticMarkup(<NewsExplorer initialArticles={articles} journalists={journalists} initialTab="contexto" />);
  expect(all).toContain('Falha crítica da fonte original');
  for (const p of journalists) expect(html).toContain(p.name);
});
it('apresenta os seis personagens, fluxo e aviso de ficção sem fotos', () => {
  const html = renderToStaticMarkup(<RedacaoPage />);
  expect(html).toContain('Nossa redação');
  for (const p of journalists) expect(html).toContain(p.name);
  expect(html).toContain('Mesa de Inteligência');
  expect(html).toContain('Os nomes são personagens editoriais fictícios, sem relação com jornalistas reais.');
  expect(html).toContain('Claude Sonnet 5.5');
  expect(html).not.toContain('<img');
  for (const path of ['app/sitemap.ts', 'scripts/lib/publication-deploy.mjs', 'components/layout/Footer.tsx', 'app/metodologia/page.tsx']) {
    expect(readFileSync(path, 'utf8')).toContain('/redacao');
  }
});
