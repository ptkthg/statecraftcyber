import React from 'react';
import { renderToStaticMarkup, renderToPipeableStream } from 'react-dom/server';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { linkifyCves } from '../lib/news-html';
import { toCsv } from '../components/iocs/export';

const mocks = vi.hoisted(() => ({ news: vi.fn(), preview: vi.fn() }));
vi.mock('../lib/news-store', () => ({ getStoredNews: mocks.news, getStoredArticle: vi.fn() }));
vi.mock('../lib/live-preview', () => ({ getLivePreview: mocks.preview }));
vi.stubGlobal('React', React);

beforeEach(() => { mocks.news.mockReset(); mocks.preview.mockReset(); mocks.preview.mockResolvedValue(null); });
afterEach(() => vi.unstubAllEnvs());

it('links CVEs in text while preserving attributes and existing nested links', () => {
  const html = '<p title="CVE-2026-12345 > detail">CVE-2026-12345 <a href="/CVE-2026-12345"><b>CVE-2026-12345</b></a></p>';
  const result = linkifyCves(html);
  expect(result).toContain('title="CVE-2026-12345 > detail"');
  expect(result).toContain('<a href="/CVE-2026-12345"><b>CVE-2026-12345</b></a>');
  expect(result.match(/nvd\.nist\.gov/g)).toHaveLength(1);
});

it('escapes quotes, commas and line breaks in every CSV field', () => {
  const result = toCsv([{ type: 'ip', value: '198.51.100.23', confidence: 'high', briefingSeverity: 'low', briefingSlug: 'slug,"quoted"', sourceName: 'Vendor,"A"\nLine', briefingTitle: 'Title', briefingDate: '' }]);
  expect(result).toContain('"slug,""quoted"""');
  expect(result).toContain('"Vendor,""A""\nLine"');
});

it('renders news source failure separately from an empty archive', async () => {
  const { default: Page } = await import('../app/noticias/page');
  mocks.news.mockRejectedValueOnce(new Error('database unavailable'));
  const failed = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  expect(failed).toContain('Fonte de notícias indisponível');
  expect(failed).not.toContain('database unavailable');
  mocks.news.mockResolvedValueOnce({ articles: [], lastCollectionAt: null, stale: false });
  const empty = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  expect(empty).toContain('Nenhuma notícia publicada');
  expect(empty).not.toContain('Fonte de notícias indisponível');
});

it('renders an article source failure instead of a not-found page', async () => {
  mocks.preview.mockRejectedValue(new Error('unavailable'));
  const { default: Page, generateMetadata } = await import('../app/noticias/[slug]/page');
  expect(renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: 'example' }) }))).toContain('Fonte de notícias indisponível');
  expect(await generateMetadata({ params: Promise.resolve({ slug: 'example' }) })).toMatchObject({ robots: { index: false } });
});

it('publishes article metadata with original date, canonical and source attribution', async () => {
  mocks.preview.mockResolvedValue({ news: { articles: [{ slug: 'example', title: 'Alerta publicado', summary: 'Resumo da fonte', source: 'Fornecedor', contentOrigin: 'source', publishedAt: '2026-11-25T12:00:00Z', tags: [], type: 'Alerta Oficial' }] } });
  const { generateMetadata } = await import('../app/noticias/[slug]/page');
  expect(await generateMetadata({ params: Promise.resolve({ slug: 'example' }) })).toMatchObject({ title: 'Alerta publicado', alternates: { canonical: '/noticias/example' }, openGraph: { type: 'article', publishedTime: '2026-11-25T12:00:00Z', authors: ['Fornecedor'] } });
});

it.each([
  { origin: 'source', credit: 'Por <strong class="text-dim">Fornecedor</strong>', authors: ['Fornecedor'] },
  { origin: 'automated', credit: 'Statecraft · síntese automatizada', authors: ['Statecraft'] },
  { origin: undefined, credit: 'Conteúdo publicado pela Statecraft; fonte: Fornecedor', authors: undefined },
])('credits snapshot provenance $origin without inventing authorship or announcing generation', async ({ origin, credit, authors }) => {
  vi.stubEnv('STATECRAFT_DATA_SOURCE', 'snapshot');
  const article = { id: 'example', slug: 'example', title: 'Alerta publicado', summary: 'Resumo da fonte', content: '<p>Texto original publicado pelo fornecedor.</p>', contentOrigin: origin, source: 'Fornecedor', publishedAt: '2026-11-25T12:00:00Z', tags: [], cves: [], importance: 0, sourceRegion: 'Global', url: 'https://vendor.example/advisory', type: 'Alerta Oficial' };
  mocks.news.mockResolvedValue({ articles: [article] });
  const { default: Page, generateMetadata } = await import('../app/noticias/[slug]/page');
  const element = await Page({ params: Promise.resolve({ slug: 'example' }) });
  const html = await new Promise<string>((resolve, reject) => {
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    const rendered = renderToPipeableStream(element, { onAllReady() { rendered.pipe(stream); }, onError: reject });
  });
  expect(html).toContain('Texto original publicado pelo fornecedor.');
  expect(html).toContain(credit);
  const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'example' }) });
  expect(metadata.openGraph?.authors).toEqual(authors);
  expect(html).not.toContain('IA Statecraft');
  expect(html).not.toContain('Gerando notícia');
});
