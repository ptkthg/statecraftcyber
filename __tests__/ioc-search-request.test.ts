import { expect, it, vi } from 'vitest';
import { LatestIocRequest } from '../components/iocs/request';

it('cancels the previous search and ignores a response even if fetch ignores abort', async () => {
  const responses: ((response: Response) => void)[] = [];
  const signals: AbortSignal[] = [];
  const fetcher = vi.fn((_url: string, options: RequestInit) => {
    signals.push(options.signal as AbortSignal);
    return new Promise<Response>(resolve => responses.push(resolve));
  });
  const request = new LatestIocRequest(fetcher);
  const success = vi.fn(); const error = vi.fn(); const settled = vi.fn();
  const first = request.run('/first', { success, error, settled });
  const second = request.run('/second', { success, error, settled });
  expect(signals[0].aborted).toBe(true);
  responses[1](Response.json({ results: ['current'] })); await second;
  responses[0](Response.json({ results: ['old'] })); await first;
  expect(success).toHaveBeenCalledExactlyOnceWith({ results: ['current'] });
  expect(settled).toHaveBeenCalledTimes(1);
  expect(error).not.toHaveBeenCalled();
});

it('reports HTTP and network failures without publishing replacement results', async () => {
  const success = vi.fn(); const error = vi.fn(); const settled = vi.fn();
  const request = new LatestIocRequest(vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockRejectedValueOnce(new Error('offline')));
  await request.run('/first', { success, error, settled });
  await request.run('/second', { success, error, settled });
  expect(error).toHaveBeenCalledTimes(2);
  expect(success).not.toHaveBeenCalled();
});
