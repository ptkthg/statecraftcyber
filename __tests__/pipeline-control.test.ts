import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ reprocess: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/pipeline/control", () => ({
  requestReprocessing: mocks.reprocess,
}));
describe("controlled reprocessing API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test");
    mocks.reprocess.mockResolvedValue({ status: "queued", count: 1 });
  });
  afterEach(() => vi.unstubAllEnvs());
  async function request(body: unknown, authorization = "Bearer test") {
    const { POST } = await import("../app/api/admin/pipeline/route");
    return POST(
      new NextRequest("https://example.org/api/admin/pipeline", {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }
  it("requires bearer authentication and never accepts a raw secret", async () => {
    expect((await request({}, "test")).status).toBe(401);
    expect(mocks.reprocess).not.toHaveBeenCalled();
  });
  it("requires the reviewed revision and a meaningful reason", async () => {
    expect((await request({ eventId: "e", reason: "retry" })).status).toBe(400);
    expect(mocks.reprocess).not.toHaveBeenCalled();
  });
  it("queues exactly the requested revision without generating or publishing", async () => {
    expect(
      (
        await request({
          eventId: "e",
          revision: 3,
          reason: "Source evidence corrected",
        })
      ).status,
    ).toBe(202);
    expect(mocks.reprocess.mock.calls[0].slice(1)).toEqual([
      [{ id: "e", revision: 3 }],
      "Source evidence corrected",
    ]);
  });
  it("returns a conflict when the revision changed or a run is active", async () => {
    mocks.reprocess.mockResolvedValue({ status: "busy", count: 0 });
    expect(
      (
        await request({
          eventId: "e",
          revision: 3,
          reason: "Source evidence corrected",
        })
      ).status,
    ).toBe(409);
  });
});
