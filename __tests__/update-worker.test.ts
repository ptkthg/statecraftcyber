import { expect, it, vi } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import { memoryDatabase } from './helpers/pipeline-db';
import { runUpdateWorker } from '../lib/pipeline/runner';
import { groundedFixture, NOW } from './fixtures/intelligence';
import { generateBriefing } from '../lib/briefing-generator';
import { validateBriefing } from '../lib/intelligence/validation';

it('advances the generation queue, records a rejected draft, and releases its lease', async () => {
  const { db, tables } = memoryDatabase();
  const item = groundedFixture().item;
  const result = await runUpdateWorker(db, new MemorySaver(), {
    collect: async () => ({ items: [item], sources: ['fixture'], errors: [] }),
    collectNews: async () => {},
    generate: async (raw, slugs) => generateBriefing(raw, slugs),
    autoPublish: true,
  });
  expect(result.status).toBe('partial');
  expect(tables.briefing).toHaveLength(1);
  expect(tables.briefing[0].status).toBe('draft');
  expect(tables.pipelineRun[0]).toMatchObject({ status: 'partial', stage: 'complete' });
  expect(tables.updateHealth.find(r => r.key === 'briefings').lastCollectionAt).toBeInstanceOf(Date);
  expect(tables.pipelineLease).toHaveLength(0);
});

it('records total source failure as interrupted and resumes the same run', async () => {
  const { db, tables } = memoryDatabase();
  const saver = new MemorySaver();
  const collect = vi.fn().mockRejectedValueOnce(new Error('network down')).mockResolvedValue({ items: [], sources: ['fixture'], errors: [] });
  const options = { collect, collectNews: async () => {}, autoPublish: true };
  await expect(runUpdateWorker(db, saver, options)).rejects.toThrow('network down');
  expect(tables.updateHealth[0].lastCollectionAt).toBeUndefined();
  await runUpdateWorker(db, saver, options);
  expect(tables.pipelineRun).toHaveLength(1);
  expect(tables.pipelineRun[0].status).toBe('success');
});

it('does not start another collector while another worker holds the lease', async () => {
  const { db, tables } = memoryDatabase();
  tables.pipelineLease.push({ key: 'intelligence-v2', owner: 'another', expiresAt: new Date(Date.now() + 60000) });
  const collect = vi.fn();
  expect(await runUpdateWorker(db, new MemorySaver(), { collect, autoPublish: true })).toMatchObject({ status: 'busy' });
  expect(collect).not.toHaveBeenCalled();
});
it('still generates after collection exceeds the old serverless time budget', async () => {
  vi.useFakeTimers();
  const start = new Date('2026-11-21T12:00:00Z');
  vi.setSystemTime(start);
  try {
    const { db, tables } = memoryDatabase();
    const item = groundedFixture().item;
    const generate = vi.fn(async (raw: Parameters<typeof generateBriefing>[0], slugs: Set<string>) => generateBriefing(raw, slugs));
    await runUpdateWorker(db, new MemorySaver(), {
      collect: async () => {
        vi.setSystemTime(new Date(+start + 60000));
        tables.pipelineLease[0].expiresAt = new Date(+start + 16 * 60000);
        return { items: [item], errors: [], sources: ['fixture'] };
      },
      collectNews: async () => {}, generate, autoPublish: true,
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(tables.briefing).toHaveLength(1);
  } finally { vi.useRealTimers(); }
});
it('does not spend every generation slot on records already blocked by source metadata', async () => {
  const { db, tables } = memoryDatabase();
  const item = groundedFixture().item;
  const blocked = Array.from({ length: 4 }, (_, i) => {
    const cve = 'CVE-2026-' + (20001 + i);
    return { ...item, externalId: 'blocked-' + i, title: cve + ' source report', sourceUrl: 'https://nvd.nist.gov/vuln/detail/' + cve, cves: [cve], cvssScore: undefined, epssScore: undefined };
  });
  const generate = vi.fn(async (raw: Parameters<typeof generateBriefing>[0], slugs: Set<string>) => generateBriefing(raw, slugs));
  await runUpdateWorker(db, new MemorySaver(), { collect: async () => ({ items: [...blocked, item], sources: ['fixture'], errors: [] }), collectNews: async () => {}, generate, autoPublish: true });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0][0].cves).toEqual(item.cves);
  expect(tables.intelligenceEvent.filter(row => row.status === 'quarantined')).toHaveLength(4);
  expect(tables.sourceRecord).toHaveLength(5);
});

it('collects and keeps pending observations while enrichment is unavailable', async () => {
  const { db, tables } = memoryDatabase();
  const saver = new MemorySaver();
  const fixture = groundedFixture();
  const quality = validateBriefing(fixture.item, fixture.briefing, NOW);
  await runUpdateWorker(db, saver, {
    collect: async () => ({ items: [fixture.item], sources: ['fixture'], errors: [] }),
    collectNews: async () => {}, autoPublish: true,
    generate: async (raw, slugs) => ({ ...generateBriefing(raw, slugs), structuredContent: fixture.briefing, qualityReport: quality, analysisStatus: quality.analysisStatus }),
  });
  const { content, revision } = tables.briefing[0];
  expect(tables.briefing[0].status).toBe('published');

  const updated = { ...fixture.item, description: fixture.item.description + '\nAdditional original detail from the source.' };
  const collect = vi.fn(async () => ({ items: [updated], sources: ['fixture'], errors: [] }));
  const collectNews = vi.fn(async () => {});
  const generate = vi.fn(async (raw: Parameters<typeof generateBriefing>[0], slugs: Set<string>) => generateBriefing(raw, slugs));
  const enrichNews = vi.fn(async () => {});
  const result = await runUpdateWorker(db, saver, { collect, collectNews, generate, enrichNews, autoPublish: true, generationEnabled: false });

  expect(collect).toHaveBeenCalledOnce();
  expect(collectNews).toHaveBeenCalledOnce();
  expect(generate).not.toHaveBeenCalled();
  expect(enrichNews).not.toHaveBeenCalled();
  expect(result.status).toBe('partial');
  expect(tables.sourceRevision).toHaveLength(2);
  expect(tables.briefing[0]).toMatchObject({ status: 'published', content, revision });
  expect(tables.intelligenceEvent[0]).toMatchObject({ status: 'pending', attempts: 0 });
  expect(tables.pipelineRun[1]).toMatchObject({ status: 'partial', errors: ['ai:enrichment_unavailable'] });
});

it('leaves work pending when resuming a saved generation queue without AI', async () => {
  const { db, tables } = memoryDatabase();
  const saver = new MemorySaver();
  const collect = vi.fn(async () => ({ items: [groundedFixture().item], sources: ['fixture'], errors: [] }));
  const generate = vi.fn(async (raw: Parameters<typeof generateBriefing>[0], slugs: Set<string>) => generateBriefing(raw, slugs));
  const options = { collect, collectNews: async () => {}, generate, autoPublish: true };
  vi.spyOn(db.intelligenceEvent, 'findUniqueOrThrow').mockRejectedValueOnce(new Error('worker interrupted'));
  await expect(runUpdateWorker(db, saver, options)).rejects.toThrow('worker interrupted');
  expect(tables.intelligenceEvent[0].status).toBe('pending');

  const result = await runUpdateWorker(db, saver, { ...options, generationEnabled: false });

  expect(collect).toHaveBeenCalledOnce();
  expect(generate).not.toHaveBeenCalled();
  expect(result.status).toBe('partial');
  expect(tables.briefing).toHaveLength(0);
  expect(tables.intelligenceEvent[0]).toMatchObject({ status: 'pending', attempts: 0 });
  expect(tables.pipelineRun[0].errors).toContain('ai:enrichment_unavailable');
});
