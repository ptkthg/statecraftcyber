import { describe, it, expect, vi, afterEach } from "vitest";
import { nvdAdapter } from "../lib/threat-sources/nvd";
import { rssFeedsAdapter } from "../lib/threat-sources/rss-feeds";
import { fetchEpssScores } from "../lib/threat-sources/epss";
import {
  emptyMetrics,
  Semaphore,
  withPipeline,
  withSource,
} from "../lib/pipeline/context";
describe("source integration contracts", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("collects modified low-severity and rejected CVEs instead of discarding important updates", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          totalResults: 2,
          vulnerabilities: [
            {
              cve: {
                id: "CVE-2026-12345",
                published: "2026-10-01T00:00:00Z",
                lastModified: "2026-10-28T00:00:00Z",
                vulnStatus: "Analyzed",
                descriptions: [{ lang: "en", value: "Source report" }],
                metrics: {
                  cvssMetricV31: [
                    {
                      type: "Primary",
                      source: "nvd@nist.gov",
                      cvssData: {
                        version: "3.1",
                        baseScore: 3.2,
                        baseSeverity: "LOW",
                      },
                    },
                  ],
                },
              },
            },
            {
              cve: {
                id: "CVE-2026-12346",
                published: "2026-10-01T00:00:00Z",
                lastModified: "2026-10-28T00:00:00Z",
                vulnStatus: "Rejected",
                descriptions: [
                  { lang: "en", value: "Rejected original record" },
                ],
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const items = await nvdAdapter.fetch();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      sourceUpdatedAt: new Date("2026-10-28T00:00:00Z"),
      originalPayload: { id: "CVE-2026-12345" },
    });
    expect(items[1].metricWarnings).toContain("source.rejected");
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.has("lastModStartDate")).toBe(true);
    expect(url.searchParams.has("pubStartDate")).toBe(false);
  });
  it("bounds EPSS request sizes and preserves results from successful chunks", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const cves = url.searchParams.get("cve")!.split(",");
      expect(cves.length).toBeLessThanOrEqual(100);
      return Response.json({ data: cves.map((cve) => ({ cve, epss: ".05" })) });
    });
    vi.stubGlobal("fetch", fetcher);
    const cves = Array.from(
      { length: 205 },
      (_, i) => "CVE-2026-" + (10000 + i),
    );
    expect(Object.keys(await fetchEpssScores(cves))).toHaveLength(205);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("keeps valid RSS items when another feed cannot be parsed and records the failed feed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) =>
        String(input).includes("microsoft")
          ? new Response(
              `<rss version="2.0"><channel><title>Source</title><item><title>Malware report</title><link>https://example.org/report</link><description>Original technical source evidence</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`,
            )
          : new Response("malformed xml"),
      ),
    );
    const context = {
      metrics: emptyMetrics(),
      network: new Semaphore(4),
      deadlineAt: Date.now() + 10000,
    };
    const items = await withPipeline(context, () =>
      withSource("RSS Feeds", () => rssFeedsAdapter.fetch()),
    );
    expect(items).toHaveLength(1);
    expect(items[0].originalPayload).toBeDefined();
    expect(context.metrics.sources["RSS Feeds"].status).toBe("partial");
    expect(
      Object.values(context.metrics.sources).filter(
        (m) => m.status === "failed",
      ).length,
    ).toBe(7);
  });
});
