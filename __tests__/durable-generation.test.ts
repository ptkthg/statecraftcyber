import { expect, it, vi } from 'vitest';
import { memoryDatabase } from './helpers/pipeline-db';
import { durableGenerator } from '../lib/pipeline/durable-generation';
import { generateBriefing } from '../lib/briefing-generator';
import { groundedFixture } from './fixtures/intelligence';
it('reuses completed generation if publication was interrupted', async () => {
  const { db, tables } = memoryDatabase();
  tables.pipelineLease.push({ key: 'intelligence-v2', owner: 'worker', expiresAt: new Date(Date.now() + 60000) });
  const { item, briefing } = groundedFixture();
  const generate = vi.fn(async () => ({ ...generateBriefing(item, new Set()), structuredContent: briefing }));
  await durableGenerator(db, 'worker', 'candidate-1', generate)(item, new Set());
  const cached = await durableGenerator(db, 'worker', 'candidate-1', generate)(item, new Set());
  expect(generate).toHaveBeenCalledTimes(1);
  expect(cached.sourcePublishedAt).toBeInstanceOf(Date);
  expect(cached.structuredContent?.title).toBe(briefing.title);
  const collision = await durableGenerator(db, 'worker', 'candidate-1', generate)(item, new Set([cached.slug]));
  expect(collision.slug).not.toBe(cached.slug);
  expect(collision.content).toBe(cached.content);
  expect(generate).toHaveBeenCalledTimes(1);
});
it('does not cache a missing AI result as completed generation', async () => {
  const { db, tables } = memoryDatabase();
  const { item } = groundedFixture();
  const generate = vi.fn(async () => generateBriefing(item, new Set()));
  await durableGenerator(db, 'worker', 'candidate-2', generate)(item, new Set());
  expect(tables.briefingCandidate).toHaveLength(0);
});
