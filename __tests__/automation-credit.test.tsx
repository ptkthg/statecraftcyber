import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import AutomationCredit, { WhyItMatters } from '../components/ui/AutomationCredit';
vi.stubGlobal('React', React);
it('mostra assinatura e selo com link somente em automação', () => {
  const props = { source: 'Microsoft', sourceUrl: 'https://example.org/original', desk: 'Mesa de Vulnerabilidades do Statecraft' };
  const html = renderToStaticMarkup(<AutomationCredit {...props} contentOrigin="automated" />);
  expect(html).toContain(props.desk); expect(html).toContain('Redação automatizada a partir de'); expect(html).toContain('href="https://example.org/original"');
  expect(renderToStaticMarkup(<AutomationCredit {...props} contentOrigin="source" />)).toBe('');
  expect(renderToStaticMarkup(<AutomationCredit {...props} />)).toBe('');
});
it('avaliação só aparece em conteúdo automatizado', () => {
  expect(renderToStaticMarkup(<WhyItMatters contentOrigin="source" text="Avaliação Statecraft: texto." />)).toBe('');
  const html = renderToStaticMarkup(<WhyItMatters contentOrigin="automated" text="Avaliação Statecraft: texto." />);
  expect(html).toContain('Por que importa'); expect(html).toContain('Avaliação Statecraft: texto.'); expect(html).toContain('<aside');
});
