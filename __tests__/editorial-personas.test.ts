import { expect, it } from 'vitest';
import { drawJournalist, DRAW_WEIGHTS, JOURNALISTS } from '../lib/ai/editorial-personas';
import type { ArticleType } from '../lib/news-feeds';

it.each(Object.keys(DRAW_WEIGHTS) as ArticleType[])('sorteio de %s é estável e respeita os pesos em 5.000 slugs', type => {
  const counts: Record<string, number> = {};
  for (let i = 0; i < 5000; i++) {
    const slug = `noticia-${i}`;
    const journalist = drawJournalist(slug, type);
    expect(drawJournalist(slug, type)).toBe(journalist);
    expect(JOURNALISTS).toHaveProperty(journalist.id);
    counts[journalist.id] = (counts[journalist.id] ?? 0) + 1;
  }
  for (const [id, weight] of Object.entries(DRAW_WEIGHTS[type])) {
    expect(Math.abs((counts[id] ?? 0) / 50 - weight)).toBeLessThanOrEqual(3);
  }
});
