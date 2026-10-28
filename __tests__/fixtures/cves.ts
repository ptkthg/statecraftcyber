import type { CveEntry } from "../../lib/cves/fetch-cves";
import { fromNvd } from "../../lib/cves/fetch-cves";
import type { NvdRecord } from "../../lib/cves/record";
export function cveRecord(overrides: Partial<NvdRecord> = {}): NvdRecord {
  return {
    id: "CVE-2026-12345",
    published: "2026-10-20T10:00:00Z",
    lastModified: "2026-10-27T12:00:00Z",
    vulnStatus: "Analyzed",
    descriptions: [
      {
        lang: "en",
        value:
          "Synthetic source description. No inference of a confirmed patch from an affected range.",
      },
    ],
    metrics: {
      cvssMetricV31: [
        {
          type: "Primary",
          source: "source@example.org",
          cvssData: {
            baseScore: 7.5,
            baseSeverity: "HIGH",
            vectorString: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
          },
        },
      ],
    },
    weaknesses: [
      { type: "Primary", description: [{ lang: "en", value: "CWE-22" }] },
    ],
    configurations: [
      {
        operator: "AND",
        nodes: [
          {
            operator: "OR",
            cpeMatch: [
              {
                vulnerable: true,
                criteria: "cpe:2.3:a:example:server:*:*:*:*:*:*:*:*",
                versionStartIncluding: "1.0",
                versionEndExcluding: "2.0",
              },
            ],
          },
        ],
      },
    ],
    references: [
      { url: "https://example.org/advisory", tags: ["Vendor Advisory"] },
      { url: "javascript:alert(1)", tags: ["Patch"] },
    ],
    ...overrides,
  };
}
export function cveEntry(overrides: Partial<CveEntry> = {}): CveEntry {
  const entry = fromNvd(cveRecord());
  entry.sourceMetadata!.epss = {
    ...entry.sourceMetadata!.epss,
    date: "2026-10-27",
    retrievedAt: "2026-10-27T12:00:00Z",
  };
  entry.sourceMetadata!.kev = {
    ...entry.sourceMetadata!.kev,
    status: false,
    checkedAt: "2026-10-27T12:00:00Z",
  };
  return { ...entry, epss: 0.02, epssPercentile: 0.8, ...overrides };
}
