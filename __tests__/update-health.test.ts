import { expect, it } from 'vitest';
import { updateHealth, hasSuccessfulCollection } from '../lib/pipeline/health';

const now = new Date('2026-11-21T12:00:00Z');
it('degrades a recently attempted pipeline without a successful collection', () => {
  expect(updateHealth({ lastAttemptAt: now, lastCollectionAt: new Date(+now - 4 * 3600000), lastPublicationAt: null, status: 'failed' }, now)).toMatchObject({ stale: true, status: 'degraded' });
});
it('accepts a fresh collection with no new items without inventing a publication', () => {
  expect(updateHealth({ lastAttemptAt: now, lastCollectionAt: now, lastPublicationAt: null, status: 'success' }, now)).toMatchObject({ stale: false, status: 'ok', publicationWarning: true });
});
it('reports partial failures while collection remains fresh', () => {
  expect(updateHealth({ lastAttemptAt: now, lastCollectionAt: now, lastPublicationAt: now, status: 'partial' }, now)).toMatchObject({ stale: false, status: 'partial' });
});
it('detects first-run and missing pipeline history', () => {
  expect(updateHealth(null, now)).toMatchObject({ stale: true, status: 'degraded' });
});
it('detects an expired interrupted execution even if its last collection was recent', () => {
  expect(updateHealth({ lastAttemptAt: new Date(+now - 17 * 60000), lastCollectionAt: new Date(+now - 17 * 60000), lastPublicationAt: now, status: 'running' }, now)).toMatchObject({ stale: false, status: 'degraded' });
});
it('does not treat skipped optional sources or an empty failed aggregator as a successful collection', () => {
  expect(hasSuccessfulCollection(['OTX', 'RSS'], { OTX: { status: 'skipped', requests: 0, collected: 0 }, RSS: { status: 'partial', requests: 0, collected: 0 }, feed: { status: 'failed', requests: 3, collected: 0 } })).toBe(false);
  expect(hasSuccessfulCollection(['NVD'], { NVD: { status: 'success', requests: 1, collected: 0 } })).toBe(true);
});
it('does not let successful news or enrichment requests hide threat collection failure', () => {
  expect(hasSuccessfulCollection(['RSS', 'OTX'], {
    RSS: { status: 'partial', requests: 0, collected: 0 },
    'RSS / broken': { status: 'failed', requests: 3, collected: 0 },
    OTX: { status: 'skipped', requests: 0, collected: 0 },
    'HTTP / news.example': { status: 'success', requests: 1, collected: 0 },
    'FIRST EPSS': { status: 'success', requests: 1, collected: 20 },
  })).toBe(false);
});
