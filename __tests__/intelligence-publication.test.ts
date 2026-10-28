import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  fetch: vi.fn(),
  epss: vi.fn(),
}));
vi.mock("@/lib/pipeline/service", () => ({ runPipeline: mocks.run }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/threat-sources", () => ({
  fetchAllSources: mocks.fetch,
  fetchEpssScores: mocks.epss,
}));
describe("cron pipeline boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test");
    vi.stubEnv("AUTO_PUBLISH", "true");
    mocks.run.mockResolvedValue({
      status: "success",
      metrics: { created: 1, updated: 0 },
    });
  });
  afterEach(() => vi.unstubAllEnvs());
  async function run(
    headers: Record<string, string> = { authorization: "Bearer test" },
    query = "",
  ) {
    const { GET } = await import("../app/api/cron/update-briefings/route");
    return GET(
      new NextRequest("https://example.org/api/cron/update-briefings" + query, {
        headers,
      }),
    );
  }
  it("requires exact bearer authentication before collection or database access", async () => {
    expect((await run({ authorization: "test" })).status).toBe(401);
    expect((await run({ authorization: "Bearer wrong" })).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("passes an explicit idempotency key and bounded generation limit", async () => {
    expect(
      (
        await run(
          { authorization: "Bearer test", "idempotency-key": "batch-1" },
          "?max=999",
        )
      ).status,
    ).toBe(200);
    expect(mocks.run.mock.calls[0][1]).toMatchObject({
      idempotencyKey: "batch-1",
      max: 5,
      autoPublish: true,
    });
  });
  it("rejects malformed idempotency keys", async () => {
    expect(
      (
        await run({
          authorization: "Bearer test",
          "idempotency-key": "invalid key",
        })
      ).status,
    ).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("exposes contention as 409 and failed runs as 500", async () => {
    mocks.run
      .mockResolvedValueOnce({ status: "busy" })
      .mockResolvedValueOnce({ status: "failed" });
    expect((await run()).status).toBe(409);
    expect((await run()).status).toBe(500);
  });
  it("fails closed without leaking database errors", async () => {
    mocks.run.mockRejectedValue(new Error("postgres://secret@example.org"));
    const response = await run();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
  it("keeps partial success explicit", async () => {
    mocks.run.mockResolvedValue({ status: "partial", errors: ["OTX:timeout"] });
    const response = await run();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "partial" });
  });
});
