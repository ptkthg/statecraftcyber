import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const read = vi.hoisted(() => vi.fn());
vi.mock('node:fs/promises', () => ({ readFile: read }));
const snapshot = {
  schemaVersion: 1, origin: 'https://statecraftcyber.vercel.app',
  generatedAt: '2026-11-25T12:00:00Z', capturedAt: '2026-11-25T12:00:00Z',
  briefings: { briefings: [], trending: [], latestIocs: [] }, iocs: [], cves: [],
  news: { articles: [], lastCollectionAt: null }, updates: [], lastRun: null,
};
beforeEach(() => { vi.resetModules(); vi.stubEnv('STATECRAFT_DATA_SOURCE', 'snapshot'); read.mockReset(); });
afterEach(() => vi.unstubAllEnvs());
it.each([new Error('ENOENT'), new SyntaxError('invalid JSON'), null])('identifies unreadable snapshots and retries the next read (%s)', async (failure) => {
  if (failure) read.mockRejectedValueOnce(failure);
  else read.mockResolvedValueOnce('{}');
  read.mockResolvedValueOnce(JSON.stringify(snapshot));
  const { getPublishedSnapshot } = await import('../lib/publication/snapshot');
  await expect(getPublishedSnapshot()).rejects.toMatchObject({ name: 'SnapshotUnavailableError' });
  expect(await getPublishedSnapshot()).toMatchObject(snapshot);
  expect(read).toHaveBeenCalledTimes(2);
});
it('shares a successful immutable snapshot between reads', async () => {
  read.mockResolvedValue(JSON.stringify(snapshot));
  const { getPublishedSnapshot } = await import('../lib/publication/snapshot');
  const [first, second] = await Promise.all([getPublishedSnapshot(), getPublishedSnapshot()]);
  expect(first).toBe(second);
  expect(read).toHaveBeenCalledTimes(1);
});
