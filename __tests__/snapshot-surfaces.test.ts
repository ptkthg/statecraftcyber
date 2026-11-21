import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET as search } from "../app/api/search/route";
import { GET as health } from "../app/api/health/route";
import { POST as reprocess } from "../app/api/admin/pipeline/route";
import { POST as regenerate } from "../app/api/admin/regenerate/route";
import { POST as revalidate } from "../app/api/admin/revalidate/route";
import sitemap from "../app/sitemap";
import { getCveDetail } from "../lib/cves/get-cve-detail";
import { InvalidCveFilter, queryCves } from "../lib/cves/query";
import { relatedCveEvidence } from "../lib/cves/relationships";
import { getHomeStats } from "../lib/home-stats";
import type { PublishedBriefing, PublishedSnapshot } from "../lib/publication/snapshot";
import { cveEntry } from "./fixtures/cves";

const mocks = vi.hoisted(() => ({ db: vi.fn(), fetch: vi.fn(), snapshot: vi.fn() }));
vi.mock("../lib/prisma", () => ({ prisma: new Proxy({}, { get: mocks.db }) }));
vi.mock("../lib/publication/snapshot", async (original) => ({
  ...(await original<typeof import("../lib/publication/snapshot")>()),
  getPublishedSnapshot: mocks.snapshot,
}));

const now = "2026-10-27T13:00:00.000Z";
const collected = "2026-10-27T12:00:00.000Z";
const stale = "2026-10-20T12:00:00.000Z";
const id = "CVE-2026-12345";
const fixture = (): PublishedSnapshot => ({
  schemaVersion: 1,
  generatedAt: now,
  capturedAt: now,
  origin: "local-snapshot",
  lastRun: { runAt: collected, success: true, briefingsCreated: 0, durationMs: 200 },
  updates: ["briefings", "news"].map((key) => ({
    key, status: "success", lastAttemptAt: collected, lastCollectionAt: collected,
    lastSuccessAt: collected, lastPublicationAt: key === "news" ? collected : null,
  })),
  briefings: { briefings: [], trending: [], latestIocs: [] },
  iocs: [],
  cves: [
    { ...cveEntry(), fetchedAt: stale, enrichedAt: null, dataState: "fresh" },
    { ...cveEntry({ id: "CVE-2026-12346", epss: 0.08, published: collected }), fetchedAt: collected, enrichedAt: null, dataState: "fresh" },
  ],
  news: { lastCollectionAt: collected, articles: [{
    id: "article", slug: "advisory", title: "Correção publicada", summary: "O fornecedor publicou um aviso",
    tags: [], cves: [id], sourceRegion: "Global", url: "https://example.org/advisory",
    source: "Example", publishedAt: collected, importance: 50, type: "Alerta Oficial",
  }] },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
  vi.stubEnv("STATECRAFT_DATA_SOURCE", "snapshot");
  vi.stubEnv("CRON_SECRET", "fixture-cron-secret");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.db.mockImplementation(() => { throw new Error("Prisma accessed during snapshot request"); });
  mocks.fetch.mockRejectedValue(new Error("Network accessed during snapshot request"));
  mocks.snapshot.mockResolvedValue(fixture());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  expect(mocks.db.mock.calls.length).toBe(0);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("filters, sorts and paginates snapshot CVEs using the collection date", async () => {
  const params = new URLSearchParams("q=travessia_de_caminho&product=example_server&severity=HIGH&epssMin=4&kev=no&sort=epss&page=3&limit=1");
  expect(await queryCves(params)).toMatchObject({ cves: [{ id: "CVE-2026-12346" }], total: 1, totalPages: 1, page: 1, updatedAt: collected });
  await expect(queryCves(new URLSearchParams("limit=100"))).rejects.toBeInstanceOf(InvalidCveFilter);
});

it("serves stale CVE detail with original dates and returns null for missing records", async () => {
  expect(await getCveDetail(id.toLowerCase())).toMatchObject({ id, fetchedAt: stale, dataState: "stale" });
  expect(await getCveDetail("CVE-2026-12346")).toMatchObject({ fetchedAt: collected, dataState: "fresh" });
  expect(await getCveDetail("CVE-2026-12347")).toBeNull();
});

it("searches available public CVEs and news without fabricating IOC correlations", async () => {
  const snapshot = fixture();
  snapshot.iocs.push({ type: "ip", value: "203.0.113.1", confidence: "high", briefingSlug: "hidden-briefing", briefingTitle: "Hidden briefing", briefingSeverity: "high", briefingDate: collected, sourceName: "Example" });
  mocks.snapshot.mockResolvedValue(snapshot);
  const request = (q: string) => new NextRequest(`http://localhost/api/search?q=${encodeURIComponent(q)}`);
  const cves = await search(request(id.toLowerCase()));
  expect(cves.status).toBe(200);
  expect(await cves.json()).toMatchObject({ total: 1, results: [{ id, href: `/cves/${id}` }] });
  const news = await search(request("correcao fornecedor"));
  expect(await news.json()).toMatchObject({ total: 1, results: [{ href: "/noticias/advisory" }] });
});

it("returns only relationships supported by validated public structured data", async () => {
  const snapshot = fixture();
  const sourceUrl = "https://example.org/report";
  const quote = "The source reported technique T1059.001 in this event.";
  const briefing = {
    slug: "published-report", title: "Published report", sourceUrl, createdAt: collected, cves: [id],
    structuredContent: {
      relatedCves: [id],
      identifiedIocs: [{ type: "ip", value: "203.0.113.1", confidence: "high" }],
      quality: {
        policyVersion: "phase1-v1", analysisStatus: "validated", publishable: true, issues: [],
        techniques: [
          { id: "T1059.001", kind: "reported", sourceId: "source", quote },
          { id: "T1059.003", kind: "inferred", sourceId: "source", quote },
          { id: "T1059.004", kind: "reported", sourceId: "source", quote: "An unsupported passage." },
        ],
        sources: [{ id: "source", origin: "original", url: sourceUrl, text: quote }],
      },
    },
  } as unknown as PublishedBriefing;
  snapshot.briefings.briefings = [briefing, { ...briefing, slug: "no-proof", structuredContent: null }];
  snapshot.iocs = ["203.0.113.1", "203.0.113.2"].map((value) => ({
    type: "ip", value, confidence: "high", source: sourceUrl,
    briefingSlug: briefing.slug, briefingTitle: briefing.title, briefingSeverity: "high", briefingDate: collected, sourceName: "Example",
  }));
  mocks.snapshot.mockResolvedValue(snapshot);
  const relationships = await relatedCveEvidence(id);
  expect(relationships).toHaveLength(1);
  expect(relationships[0].techniques.map((t) => t.id)).toEqual(["T1059.001"]);
  expect(relationships[0].iocs.map((ioc) => ioc.value)).toEqual(["203.0.113.1"]);
});

it("reports original pipeline timestamps and the optional database separately", async () => {
  const response = await health();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({
    status: "ok", source: "local-snapshot", database: "not_required", snapshotGeneratedAt: now,
    pipelines: { briefings: { lastCollectionAt: collected, lastSuccessAt: collected, lastPublicationAt: null } },
    briefings: { published: 0 }, cron: { lastRun: collected },
  });
});

it.each(["collection", "snapshot"])("degrades health when the %s becomes stale", async (kind) => {
  const snapshot = fixture();
  if (kind === "snapshot") snapshot.generatedAt = stale;
  else snapshot.updates[0].lastCollectionAt = stale;
  mocks.snapshot.mockResolvedValue(snapshot);
  const response = await health();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ source: "local-snapshot", status: "degraded" });
});

it("reports an unavailable publication without falling back to the database", async () => {
  mocks.snapshot.mockRejectedValue(new Error("Invalid snapshot"));
  const response = await health();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ source: "local-snapshot", database: "not_required", status: "degraded" });
  await expect(queryCves(new URLSearchParams())).rejects.toThrow("Invalid snapshot");
});

it("derives sitemap and home statistics from public records when no briefing passed the gate", async () => {
  expect(await getHomeStats()).toMatchObject({ briefingsTotal: 0, latestBriefingSlug: null, cvesToday: 1, lastRunAt: new Date(collected) });
  const routes = await sitemap();
  expect(routes).toEqual(expect.arrayContaining([
    expect.objectContaining({ url: "https://statecraftcyber.vercel.app/noticias/advisory", lastModified: collected }),
    expect.objectContaining({ url: `https://statecraftcyber.vercel.app/cves/${id}` }),
  ]));
  expect(routes.some((route) => route.url.includes("/threat-briefings/"))).toBe(false);
});

it.each([reprocess, regenerate, revalidate])("preserves admin authorization and directs mutations to local processing", async (handler) => {
  const request = (headers?: HeadersInit) => new NextRequest("http://localhost/api/admin/action", { method: "POST", headers });
  expect((await handler(request())).status).toBe(401);
  const response = await handler(request({ authorization: "Bearer fixture-cron-secret" }));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "local_processing" });
});
