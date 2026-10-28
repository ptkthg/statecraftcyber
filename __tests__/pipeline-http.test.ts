import { describe, it, expect, vi } from "vitest";
import { fetchWithPolicy, retryAfterMs } from "../lib/pipeline/http";
import {
  aiStarted,
  aiFinished,
  emptyMetrics,
  mapConcurrent,
  Semaphore,
  withPipeline,
  withSource,
} from "../lib/pipeline/context";
const context = () => ({
  metrics: emptyMetrics(),
  deadlineAt: Date.now() + 20000,
  network: new Semaphore(2),
});
describe("bounded HTTP policy and metrics", () => {
  it("retries 429 with Retry-After and records source latency, requests and rate limiting", async () => {
    const c = context(),
      sleep = vi.fn(async () => {}),
      fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          new Response("slow", {
            status: 429,
            headers: { "retry-after": "1" },
          }),
        )
        .mockResolvedValueOnce(Response.json({ ok: true }));
    const response = await withPipeline(c, () =>
      withSource("NVD", async () => [
        await fetchWithPolicy("https://example.org", {}, { fetcher, sleep }),
      ]),
    );
    expect(await response[0].json()).toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(c.metrics.sources.NVD).toMatchObject({
      status: "success",
      requests: 2,
      retries: 1,
      rateLimits: 1,
      collected: 1,
    });
  });
  it("backs off on transient failure, caps attempts, and does not retry a paid POST", async () => {
    const sleep = vi.fn(async () => {}),
      fetcher = vi
        .fn()
        .mockRejectedValueOnce(new Error("network"))
        .mockResolvedValueOnce(Response.json({ ok: true }));
    await fetchWithPolicy(
      "https://example.org",
      {},
      { fetcher, sleep, baseDelayMs: 400 },
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(400);
    const paid = vi
      .fn()
      .mockResolvedValue(new Response("bad", { status: 503 }));
    expect(
      (
        await fetchWithPolicy(
          "https://example.org",
          { method: "POST" },
          { fetcher: paid, sleep },
        )
      ).status,
    ).toBe(503);
    expect(paid).toHaveBeenCalledTimes(1);
  });
  it("does not retry early when Retry-After exceeds the execution budget", async () => {
    const c = context(),
      fetcher = vi
        .fn()
        .mockResolvedValue(
          new Response("limited", {
            status: 429,
            headers: { "retry-after": "3600" },
          }),
        );
    const res = await withPipeline(c, () =>
      fetchWithPolicy("https://example.org", {}, { fetcher }),
    );
    expect(res.status).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("records parsing errors once without hiding failures", async () => {
    const c = context();
    await expect(
      withPipeline(c, () =>
        withSource("RSS", async () => {
          const response = await fetchWithPolicy(
            "https://example.org",
            {},
            {
              fetcher: vi.fn().mockResolvedValue(new Response("invalid-json")),
            },
          );
          return [await response.json()];
        }),
      ),
    ).rejects.toThrow();
    expect(c.metrics.sources.RSS).toMatchObject({
      status: "failed",
      parseErrors: 1,
    });
  });
  it("limits actual concurrent requests and returns isolated worker failures", async () => {
    const c = context();
    let active = 0,
      peak = 0;
    const fetcher = vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return Response.json({});
    });
    await withPipeline(c, () =>
      Promise.all(
        Array.from({ length: 7 }, () =>
          fetchWithPolicy("https://example.org", {}, { fetcher }),
        ),
      ),
    );
    expect(peak).toBe(2);
    const results = await mapConcurrent([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("bad");
      return n;
    });
    expect(results.map((r) => r.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
  });
  it("honors cancellation while queued and prevents expired executions from requesting", async () => {
    const semaphore = new Semaphore(1),
      release = await semaphore.acquire(),
      controller = new AbortController();
    const waiting = semaphore.acquire(controller.signal);
    controller.abort();
    await expect(waiting).rejects.toThrow();
    release();
    (await semaphore.acquire())();
    const c = { ...context(), deadlineAt: Date.now() - 1 },
      fetcher = vi.fn();
    await expect(
      withPipeline(c, () =>
        fetchWithPolicy("https://example.org", {}, { fetcher }),
      ),
    ).rejects.toThrow("deadline");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("records actual token usage and marks absent usage rather than inventing consumption", async () => {
    const c = context();
    await withPipeline(c, async () => {
      aiStarted();
      aiFinished({ prompt_tokens: 123, completion_tokens: 45 });
      aiStarted();
      aiFinished();
      aiStarted();
      aiFinished(undefined, "rate_limit");
    });
    expect(c.metrics.ai).toMatchObject({
      requests: 3,
      successful: 2,
      failed: 1,
      inputTokens: 123,
      outputTokens: 45,
      usageKnown: 1,
      usageUnknown: 1,
    });
  });
  it("parses Retry-After seconds and dates", () => {
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs("bad")).toBeNull();
    expect(
      retryAfterMs(
        "Thu, 01 Jan 2026 00:00:01 GMT",
        Date.parse("2026-01-01T00:00:00Z"),
      ),
    ).toBe(1000);
  });
});
