import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import ErrorPage from '../app/error';
import NotFound from '../app/not-found';
import Loading from '../app/loading';
const html = (node: ReactElement) => renderToStaticMarkup(node);
it('offers recovery without disclosing internal errors', () => {
  const reset = vi.fn();
  const node = ErrorPage({ error: new Error('SECRET DATABASE URL'), reset });
  const rendered = html(node);
  expect(rendered).not.toContain('SECRET DATABASE URL');
  expect(rendered).toContain('Tentar de novo');
  expect(rendered).toContain('href="/"');
  const findButton = (element: ReactElement): ReactElement | undefined => {
    if (element.type === 'button') return element;
    const children = (element.props as { children?: unknown }).children;
    return (Array.isArray(children) ? children : [children]).flatMap(child => child && typeof child === 'object' && 'type' in child ? [findButton(child as ReactElement)] : []).find(Boolean);
  };
  (findButton(node)!.props as { onClick: () => void }).onClick();
  expect(reset).toHaveBeenCalledOnce();
});
it('keeps unknown routes navigable and announces loading accessibly', () => {
  expect(html(createElement(NotFound))).toContain('href="/"');
  expect(html(createElement(Loading))).toContain('role="status"');
});
