import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { memoryDatabase } from "./helpers/pipeline-db";
import {
  runPipeline,
  observe,
  processEvent,
  LEASE_KEY,
  nextRetry,
} from "../lib/pipeline/service";
import { emptyMetrics, Semaphore, withPipeline } from "../lib/pipeline/context";
import { generateBriefing } from "../lib/briefing-generator";
import { groundedFixture, NOW } from "./fixtures/intelligence";
import { validateBriefing } from "../lib/intelligence/validation";
import type { RawThreatItem } from "../lib/threat-sources/types";
const preliminary = vi.fn(async (raw: RawThreatItem, slugs: Set<string>) =>
  generateBriefing(raw, slugs),
);
const item = () => groundedFixture().item;
const collect =
  (items: RawThreatItem[], errors: { source: string; error: string }[] = []) =>
  async () => ({ items, errors, sources: items.length ? ["NVD"] : [] });
describe("durable intelligence pipeline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    preliminary.mockClear();
  });
  afterEach(() => vi.useRealTimers());
  const opts = (key: string, items: RawThreatItem[]) => ({
    idempotencyKey: key,
    max: 5,
    autoPublish: true,
    collect: collect(items),
    generate: preliminary,
  });
  it("replays an idempotency key without collecting or generating and does not duplicate on another run", async () => {
    const { db, tables } = memoryDatabase(),
      first = opts("first", [item()]);
    await runPipeline(db, first);
    const collector = vi.fn(first.collect);
    await runPipeline(db, { ...first, collect: collector });
    expect(collector).not.toHaveBeenCalled();
    await runPipeline(db, opts("second", [item()]));
    expect(tables.briefing).toHaveLength(1);
    expect(tables.sourceRecord).toHaveLength(1);
    expect(tables.briefingRevision).toHaveLength(1);
    expect(preliminary).toHaveBeenCalledTimes(1);
  });
  it("preserves first observation, source revisions, article versions and URL on material updates", async () => {
    const { db, tables } = memoryDatabase();
    await runPipeline(db, opts("one", [item()]));
    const slug = tables.briefing[0].slug;
    vi.setSystemTime(new Date(+NOW + 3600000));
    const updated = {
      ...item(),
      description: item().description + " Additional source-confirmed detail.",
      sourceUpdatedAt: new Date(+NOW + 3000000),
    };
    const result = await runPipeline(db, opts("two", [updated]));
    expect(result.metrics).toMatchObject({ created: 0, updated: 1 });
    expect(tables.briefing).toHaveLength(1);
    expect(tables.briefing[0]).toMatchObject({
      slug,
      revision: 2,
      firstObservedAt: NOW,
      lastObservedAt: new Date(+NOW + 3600000),
      sourceUpdatedAt: updated.sourceUpdatedAt,
    });
    expect(tables.sourceRevision).toHaveLength(2);
    expect(tables.briefingRevision[0].snapshot.content).not.toEqual(
      tables.briefingRevision[1].snapshot.content,
    );
  });
  it("records source-only timestamp changes without another AI call", async () => {
    const { db, tables } = memoryDatabase();
    await runPipeline(db, opts("one", [item()]));
    await runPipeline(db, opts("two", [{ ...item(), sourceUpdatedAt: NOW }]));
    expect(tables.sourceRevision).toHaveLength(2);
    expect(preliminary).toHaveBeenCalledTimes(1);
  });
  it("updates a periodic feed across dates, retains partial IOCs, retires only explicitly replaced members", async () => {
    const { db, tables } = memoryDatabase();
    const base = {
      ...item(),
      sourceName: "Test feed",
      sourceUrl: "https://example.org/feed",
      recordKind: "periodic-ioc" as const,
      periodicKey: "family",
      publishedAtOrigin: "retrieval" as const,
      cves: [],
      cvssScore: undefined,
      epssScore: undefined,
    };
    const ioc = (value: string) => ({
      type: "ip" as const,
      value,
      confidence: "low" as const,
      source: "Test feed",
    });
    await runPipeline(
      db,
      opts("one", [
        { ...base, externalId: "day1", iocs: [ioc("203.0.113.1")] },
      ]),
    );
    vi.setSystemTime(new Date(+NOW + 86400000));
    await runPipeline(
      db,
      opts("two", [
        {
          ...base,
          externalId: "day2",
          publishedAt: new Date(),
          iocs: [ioc("203.0.113.2")],
        },
      ]),
    );
    expect(tables.briefing).toHaveLength(1);
    expect(tables.ioc.filter((i) => i.isActive)).toHaveLength(2);
    expect(
      tables.ioc.find((i) => i.value.endsWith(".1")).lastObservedAt,
    ).toEqual(NOW);
    const result = await runPipeline(
      db,
      opts("three", [
        {
          ...base,
          externalId: "day3",
          iocs: [ioc("203.0.113.2")],
          iocSetComplete: true,
        },
      ]),
    );
    expect(tables.ioc.find((i) => i.value.endsWith(".1")).isActive).toBe(false);
    expect(result.metrics).toMatchObject({ indicatorsRemoved: 1 });
    expect(tables.briefingRevision[2].changeSummary.removed).toContain(
      "ip:203.0.113.1",
    );
  });
  it("keeps all collected records durable when generation is capped and drains the backlog", async () => {
    const { db, tables } = memoryDatabase(),
      items = [1, 2, 3].map((n) => ({
        ...item(),
        externalId: "cve-" + n,
        cves: ["CVE-2026-1234" + n],
        title: "Different " + n,
        sourceUrl: "https://example.org/" + n,
      }));
    await runPipeline(db, { ...opts("one", items), max: 1 });
    expect(tables.sourceRecord).toHaveLength(3);
    expect(tables.briefing).toHaveLength(1);
    await runPipeline(db, opts("two", []));
    expect(tables.briefing).toHaveLength(3);
  });
  it("isolates source errors and reports a partial run truthfully", async () => {
    const { db, tables } = memoryDatabase();
    const result = await runPipeline(db, {
      ...opts("one", [item()]),
      collect: collect([item()], [{ source: "OTX", error: "timeout" }]),
    });
    expect(result.status).toBe("partial");
    expect(tables.briefing).toHaveLength(1);
    expect(tables.cronLog[0].success).toBe(false);
  });
  it("quarantines invalid dates and insufficient content before calling AI", async () => {
    const { db, tables } = memoryDatabase();
    await runPipeline(
      db,
      opts("one", [{ ...item(), publishedAt: new Date(+NOW + 3 * 86400000) }]),
    );
    expect(preliminary).not.toHaveBeenCalled();
    expect(tables.sourceRecord[0].qualityIssues).toContainEqual({
      code: "date.invalid",
      field: "publishedAt",
      severity: "error",
    });
    expect(tables.intelligenceEvent[0].status).toBe("quarantined");
  });
  it("does not publish source-only fallback even when AUTO_PUBLISH is enabled", async () => {
    const { db, tables } = memoryDatabase();
    await runPipeline(db, opts("one", [item()]));
    expect(tables.briefing[0]).toMatchObject({
      status: "draft",
      analysisStatus: "preliminary",
    });
  });
  it("publishes a fully grounded extraction atomically with its evidence and IOC inventory", async () => {
    const { db, tables } = memoryDatabase(),
      fixture = groundedFixture();
    const quality = validateBriefing(fixture.item, fixture.briefing, NOW);
    const generate = vi.fn(async () => ({
      ...generateBriefing(fixture.item, new Set()),
      structuredContent: fixture.briefing,
      qualityReport: quality,
      analysisStatus: quality.analysisStatus,
    }));
    await runPipeline(db, { ...opts("one", [fixture.item]), generate });
    expect(tables.briefing[0]).toMatchObject({
      status: "published",
      qualityReport: { publishable: true },
    });
    expect(tables.briefingRevision).toHaveLength(1);
  });
  it("rolls back article, inventory and history together on persistence failure, with bounded retry", async () => {
    const { db, tables, failIoc } = memoryDatabase();
    failIoc();
    await runPipeline(
      db,
      opts("one", [
        {
          ...item(),
          iocs: [
            {
              type: "ip",
              value: "203.0.113.3",
              confidence: "low",
              source: "NVD",
            },
          ],
        },
      ]),
    );
    expect(tables.briefing).toHaveLength(0);
    expect(tables.briefingRevision).toHaveLength(0);
    expect(tables.intelligenceEvent[0]).toMatchObject({
      status: "retry",
      attempts: 1,
      nextAttemptAt: new Date(+NOW + 60000),
    });
    await runPipeline(db, opts("two", []));
    expect(preliminary).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(+NOW + 60000));
    await runPipeline(db, opts("three", []));
    expect(preliminary).toHaveBeenCalledTimes(2);
    expect(nextRetry(3, NOW)).toBeNull();
  });
  it("adopts legacy identity and preserves revision zero and the original slug", async () => {
    const { db, tables } = memoryDatabase();
    const { generateContentHash } = await import("../lib/deduplication");
    await db.briefing.create({
      data: {
        ...generateBriefing(item(), new Set()),
        structuredContent: undefined,
        sourceSnapshot: undefined,
        qualityReport: undefined,
        contentHash: generateContentHash(item()),
        slug: "legacy-url",
      } as never,
    });
    await runPipeline(db, opts("one", [item()]));
    expect(tables.briefing).toHaveLength(1);
    expect(tables.briefing[0].slug).toBe("legacy-url");
    expect(tables.briefingRevision.map((r) => r.revision)).toEqual([0, 1]);
  });
  it("rejects a concurrent execution while a lease is active", async () => {
    const { db } = memoryDatabase();
    let release!: () => void;
    const blocker = new Promise<void>((r) => (release = r));
    let entered!: () => void;
    const ready = new Promise<void>((r) => (entered = r));
    const first = runPipeline(db, {
      ...opts("one", []),
      collect: async () => {
        entered();
        await blocker;
        return { items: [], errors: [], sources: [] };
      },
    });
    await ready;
    expect((await runPipeline(db, opts("two", []))).status).toBe("busy");
    release();
    await first;
  });
  it("fences a generation whose lease was lost before persistence", async () => {
    const { db, tables } = memoryDatabase();
    await db.pipelineLease.create({
      data: {
        key: LEASE_KEY,
        owner: "owner",
        expiresAt: new Date(+NOW + 55000),
      },
    });
    await observe(db, item(), "run", "owner", NOW);
    const metrics = emptyMetrics();
    await expect(
      withPipeline(
        { metrics, deadlineAt: +NOW + 50000, network: new Semaphore(4) },
        () =>
          processEvent(
            db,
            tables.intelligenceEvent[0].id,
            "run",
            "owner",
            true,
            async (raw, slugs) => {
              tables.pipelineLease[0].owner = "replacement";
              return generateBriefing(raw, slugs);
            },
          ),
      ),
    ).rejects.toThrow("pipeline_lease_lost");
    expect(tables.briefing).toHaveLength(0);
    expect(tables.briefingRevision).toHaveLength(0);
  });
  it("does not overwrite a new source revision with an in-flight old generation", async () => {
    const { db, tables } = memoryDatabase();
    await db.pipelineLease.create({
      data: {
        key: LEASE_KEY,
        owner: "owner",
        expiresAt: new Date(+NOW + 55000),
      },
    });
    await observe(db, item(), "run", "owner", NOW);
    await processEvent(
      db,
      tables.intelligenceEvent[0].id,
      "run",
      "owner",
      true,
      async (raw, slugs) => {
        tables.intelligenceEvent[0].revision++;
        return generateBriefing(raw, slugs);
      },
    );
    expect(tables.briefing).toHaveLength(0);
    expect(tables.intelligenceEvent[0].status).toBe("pending");
  });
  it("retains an unconsumed collection batch when the time budget is exhausted and resumes it", async () => {
    const { db, tables } = memoryDatabase();
    await runPipeline(db, {
      ...opts("one", [item()]),
      collect: async () => {
        vi.setSystemTime(new Date(+NOW + 39000));
        return { items: [item()], errors: [], sources: ["NVD"] };
      },
    });
    expect(tables.sourceRecord).toHaveLength(0);
    expect(tables.collectionBatch[0]).toMatchObject({
      complete: false,
      cursor: 0,
    });
    vi.setSystemTime(new Date(+NOW + 40000));
    await runPipeline(db, opts("two", []));
    expect(tables.sourceRecord).toHaveLength(1);
    expect(tables.collectionBatch[0].complete).toBe(true);
    expect(tables.briefing[0].firstObservedAt).toEqual(new Date(+NOW + 39000));
  });
  it("suspends a published assessment on contradictory source updates without losing its validated version", async () => {
    const { db, tables } = memoryDatabase(),
      fixture = groundedFixture(),
      quality = validateBriefing(fixture.item, fixture.briefing, NOW);
    const generate = vi.fn(async () => ({
      ...generateBriefing(fixture.item, new Set()),
      structuredContent: fixture.briefing,
      qualityReport: quality,
      analysisStatus: quality.analysisStatus,
    }));
    await runPipeline(db, { ...opts("one", [fixture.item]), generate });
    expect(tables.briefing[0].status).toBe("published");
    await runPipeline(
      db,
      opts("two", [{ ...item(), metricWarnings: ["source.rejected"] }]),
    );
    expect(tables.briefing[0].status).toBe("draft");
    expect(tables.intelligenceEvent[0].status).toBe("quarantined");
    expect(tables.briefingRevision[0].snapshot.status).toBe("published");
    expect(preliminary).not.toHaveBeenCalled();
  });
  it("keeps an IOC supported by another source when one complete source removes it", async () => {
    const { db, tables } = memoryDatabase(),
      ioc = {
        type: "ip" as const,
        value: "203.0.113.9",
        confidence: "low" as const,
        source: "Original",
      };
    const a = { ...item(), iocs: [ioc], iocSetComplete: true },
      b = {
        ...a,
        externalId: "cisa",
        sourceName: "CISA KEV",
        sourceUrl: "https://www.cisa.gov/kev",
      };
    await runPipeline(db, opts("one", [a, b]));
    await runPipeline(db, opts("two", [{ ...a, iocs: [] }]));
    expect(tables.briefing).toHaveLength(1);
    expect(tables.ioc[0].isActive).toBe(true);
    expect(tables.briefingRevision.at(-1).changeSummary.removed).toEqual([]);
  });
  it("does not let late snapshots roll back a newer source update", async () => {
    const { db, tables } = memoryDatabase();
    await db.pipelineLease.create({
      data: {
        key: LEASE_KEY,
        owner: "owner",
        expiresAt: new Date(+NOW + 55000),
      },
    });
    const recent = {
      ...item(),
      description: item().description + " Newer authoritative update.",
      sourceUpdatedAt: NOW,
    };
    await observe(db, recent, "run", "owner", NOW);
    const old = { ...item(), sourceUpdatedAt: new Date(+NOW - 3600000) };
    const decision = await observe(
      db,
      old,
      "run",
      "owner",
      new Date(+NOW + 1000),
    );
    expect(decision.matchRule).toBe("stale-observation");
    expect(tables.sourceRecord[0].rawPayload.description).toBe(
      recent.description,
    );
    expect(tables.sourceRevision).toHaveLength(1);
    const delayed = await observe(
      db,
      {
        ...item(),
        description: "Late old content without a trustworthy update date.",
      },
      "run",
      "owner",
      new Date(+NOW - 1000),
    );
    expect(delayed.matchRule).toBe("stale-observation");
    expect(tables.sourceRecord[0].lastObservedAt).toEqual(NOW);
  });
});
