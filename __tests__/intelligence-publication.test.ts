import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../app/api/cron/update-briefings/route';
afterEach(() => vi.unstubAllEnvs());
it('requires exact bearer authentication before revealing the retired scheduler', async () => {
  vi.stubEnv('CRON_SECRET', 'test');
  for (const authorization of ['test', 'Bearer wrong']) {
    expect((await GET(new NextRequest('https://example.org/api/cron/update-briefings', { headers: { authorization } }))).status).toBe(401);
  }
});
it('rejects requests when the cron secret is absent', async () => {
  vi.stubEnv('CRON_SECRET', '');
  expect((await GET(new NextRequest('https://example.org/api/cron/update-briefings'))).status).toBe(401);
});
it('returns an explicit retirement for both legacy methods, with no collection side effects', async () => {
  vi.stubEnv('CRON_SECRET', 'test');
  for (const handler of [GET, POST]) {
    const response = await handler(new NextRequest('https://example.org/api/cron/update-briefings?max=999', { headers: { authorization: 'Bearer test' } }));
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ error: 'scheduler_retired' });
  }
});
