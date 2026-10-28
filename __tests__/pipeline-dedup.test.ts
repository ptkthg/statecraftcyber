import { describe, it, expect } from "vitest";
import {
  prepareRecord,
  indicatorKey,
  indicatorDelta,
  materialFingerprint,
} from "../lib/pipeline/normalize";
import { compareEvents, chooseMatch } from "../lib/pipeline/dedup";
import { groundedFixture, NOW } from "./fixtures/intelligence";
const source = () => ({
  ...groundedFixture().item,
  recordKind: "event" as const,
});
const profile = (
  overrides: Partial<import("../lib/threat-sources/types").RawThreatItem> = {},
) => prepareRecord({ ...source(), ...overrides }, NOW).profile;
describe("deterministic normalization and event matching", () => {
  it("preserves URL paths, query values and case, while normalizing the host", () => {
    expect(
      indicatorKey({ type: "url", value: "https://EXAMPLE.org/A?q=X" }),
    ).toBe("url:https://example.org/A?q=X");
    expect(
      indicatorKey({ type: "url", value: "https://example.org/a?q=X" }),
    ).not.toBe(
      indicatorKey({ type: "url", value: "https://example.org/A?q=X" }),
    );
    expect(indicatorKey({ type: "url", value: "javascript:bad" })).toBeNull();
  });
  it("normalizes indicators deterministically without erasing source or last-seen evidence", () => {
    const ioc = {
      type: "domain" as const,
      value: "EXAMPLE.org.",
      confidence: "low" as const,
      source: "Source",
      sourceUrl: "https://example.org/report",
      lastSeen: "2026-10-26",
    };
    const a = prepareRecord({ ...source(), iocs: [ioc, ioc] }, NOW);
    expect(a.raw.iocs).toHaveLength(1);
    expect(a.raw.iocs![0]).toMatchObject({ ...ioc, value: "example.org" });
    expect(a.original.iocs![0].value).toBe("EXAMPLE.org.");
  });
  it("never infers removals from partial observations", () => {
    const a = {
        type: "ip" as const,
        value: "203.0.113.1",
        confidence: "low" as const,
        source: "test",
      },
      b = { ...a, value: "203.0.113.2" };
    expect(indicatorDelta([a], [b], false)).toMatchObject({
      removed: [],
      removalsKnown: false,
      effective: [a, b],
    });
    expect(indicatorDelta([a], [b], true).removed).toEqual(["ip:203.0.113.1"]);
  });
  it("keeps timestamps out of material fingerprints but includes changed metric values", () => {
    expect(materialFingerprint(source())).toBe(
      materialFingerprint({ ...source(), sourceUpdatedAt: NOW }),
    );
    expect(materialFingerprint(source())).not.toBe(
      materialFingerprint({ ...source(), epssScore: 0.8 }),
    );
  });
  it("flags invalid references, dates, metric scope, IOC confidence and invalid MITRE mentions", () => {
    const p = prepareRecord(
      {
        ...source(),
        sourceUrl: "javascript:bad",
        sourceUpdatedAt: new Date("2020-01-01"),
        cves: [],
        cvssScore: 99,
        description: "Unsupported technique T9999",
        iocs: [
          {
            type: "ip",
            value: "not-an-ip",
            confidence: "wrong" as never,
            source: "test",
          },
        ],
      },
      NOW,
    );
    expect(p.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        "reference.invalid",
        "date.update_before_publication",
        "metric.invalid",
        "metric.cvss_scope",
        "ioc.invalid",
        "ioc.confidence_invalid",
        "mitre.invalid_mention",
      ]),
    );
  });
  it("records technique mentions as mentions without inventing behavioral evidence", () => {
    const p = prepareRecord(
      { ...source(), description: "The report mentions T1059.001." },
      NOW,
    );
    expect(
      p.entities.find((e) => e.kind === "technique-mention"),
    ).toMatchObject({
      value: "T1059.001",
      origin: "mention",
      sourceUrl: source().sourceUrl,
    });
    expect(p.raw.mitreEvidence).toBeUndefined();
  });
  it("uses one canonical native vulnerability identity across NVD and CISA", () => {
    const a = prepareRecord(groundedFixture().item, NOW).profile,
      b = prepareRecord(
        {
          ...groundedFixture().item,
          sourceName: "CISA KEV",
          sourceUrl: "https://www.cisa.gov/kev",
        },
        NOW,
      ).profile;
    expect(compareEvents(a, b)).toMatchObject({
      merge: true,
      rule: "canonical-identity",
    });
  });
  it("does not group articles just because they mention the same CVE or source", () => {
    expect(
      compareEvents(
        profile(),
        profile({
          sourceUrl: "https://example.org/distinct",
          title: "New incident at another organization",
          description:
            "Completely distinct event with new compromise and remediation evidence.",
        }),
      ).merge,
    ).toBe(false);
  });
  it("rejects disjoint campaigns and CVEs, missing dates and events outside 72 hours", () => {
    const a = profile();
    expect(
      compareEvents(
        a,
        profile({
          cves: ["CVE-2026-99999"],
          title: "Another report",
          description: "Another vulnerability",
        }),
      ).merge,
    ).toBe(false);
    expect(compareEvents(a, { ...a, publishedAt: null }).merge).toBe(false);
    expect(
      compareEvents(a, {
        ...a,
        publishedAt: new Date(+NOW + 10 * 86400000).toISOString(),
      }).merge,
    ).toBe(false);
    expect(
      compareEvents({ ...a, campaigns: ["one"] }, { ...a, campaigns: ["two"] }),
    ).toMatchObject({ merge: false, rule: "disjoint-campaigns" });
  });
  it("detects exact syndication across distinct URLs and rejects ambiguous anchored matches", () => {
    const a = profile(),
      b = { ...a, url: "https://second.org/article" };
    expect(compareEvents(a, b)).toMatchObject({
      merge: true,
      rule: "exact-syndication",
    });
    const c = { ...b, bodyDigest: "different" };
    expect(
      chooseMatch(a, [
        { id: "1", profile: c },
        { id: "2", profile: { ...c, url: "https://third.org/article" } },
      ]),
    ).toMatchObject({ match: null, rule: "ambiguous-candidates" });
  });
  it("matches periodic families across daily identifiers without merging distinct families", () => {
    const a = profile({
        recordKind: "periodic-ioc",
        periodicKey: "family-a",
        externalId: "day1",
      }),
      b = profile({
        recordKind: "periodic-ioc",
        periodicKey: "family-a",
        externalId: "day2",
      });
    expect(compareEvents(a, b).merge).toBe(true);
    expect(
      compareEvents(
        a,
        profile({ recordKind: "periodic-ioc", periodicKey: "family-b" }),
      ).merge,
    ).toBe(false);
  });
  it("records incomplete fields and textual IOC mentions without promoting them to confirmed indicators", () => {
    const missing = prepareRecord({ externalId: "missing" } as never, NOW);
    expect(missing.issues.map((i) => i.code)).toContain("required.title");
    const parsed = prepareRecord(
      {
        ...source(),
        description:
          "Source mentions 203.0.113.23 and https://example.org/Payload?q=X as references.",
      },
      NOW,
    );
    expect(
      parsed.entities.find((e) => e.value === "ip:203.0.113.23"),
    ).toMatchObject({ kind: "indicator-mention", origin: "mention" });
    expect(parsed.raw.iocs).toEqual([]);
  });
  it("quarantines invalid structured MITRE assertions using the official validator", () => {
    const parsed = prepareRecord(
      {
        ...source(),
        mitreEvidence: [
          {
            id: "T9999",
            name: "Invented",
            kind: "reported",
            sourceId: "source",
            quote: "T9999",
          },
        ],
      },
      NOW,
    );
    expect(parsed.issues).toContainEqual({
      code: "mitre.invalid",
      field: "mitreEvidence",
      severity: "error",
    });
  });
});
