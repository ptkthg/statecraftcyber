import { describe, it, expect } from "vitest";
import { detectCveId, mergeResults } from "@/lib/search/merge";
import type { SearchResult } from "@/lib/search/types";

// ── helpers ────────────────────────────────────────────────────────────────

const makeBriefing = (rank: number): SearchResult => ({
  type: "briefing",
  id: `b-${rank}`,
  title: `Briefing ${rank}`,
  href: `/threat-briefings/briefing-${rank}`,
  meta: "HIGH",
  rank,
});

const makeIoc = (rank: number, meta = "IP · HIGH"): SearchResult => ({
  type: "ioc",
  id: `i-${rank}`,
  title: `192.168.1.${rank}`,
  href: `/iocs?q=192.168.1.${rank}`,
  meta,
  rank,
  isMono: true,
});

// ── detectCveId ────────────────────────────────────────────────────────────

describe("detectCveId", () => {
  it("detects standard CVE ID", () => {
    expect(detectCveId("CVE-2024-12345")).toBe("CVE-2024-12345");
  });

  it("normalizes return value to uppercase", () => {
    expect(detectCveId("cve-2024-12345")).toBe("CVE-2024-12345");
  });

  it("handles 4-digit CVE IDs", () => {
    expect(detectCveId("CVE-2024-1234")).toBe("CVE-2024-1234");
  });

  it("returns null for non-CVE strings", () => {
    expect(detectCveId("ransomware")).toBeNull();
  });

  it("returns null for incomplete CVE pattern", () => {
    expect(detectCveId("CVE-2024")).toBeNull();
  });

  it("trims whitespace and normalizes to uppercase", () => {
    expect(detectCveId("  cve-2024-1234  ")).toBe("CVE-2024-1234");
  });

  it("returns null for CVE IDs with fewer than 4 digits in sequence", () => {
    expect(detectCveId("CVE-2024-123")).toBeNull();
  });
});

// ── mergeResults ───────────────────────────────────────────────────────────

describe("mergeResults", () => {
  it("sorts results by rank descending", () => {
    const result = mergeResults([
      [makeBriefing(0.9), makeBriefing(0.5)],
      [makeIoc(0.7)],
    ]);
    expect(result.map((r) => r.rank)).toEqual([0.9, 0.7, 0.5]);
  });

  it("limits total output to 20", () => {
    const group = Array.from({ length: 15 }, (_, i) => makeBriefing(i / 15));
    const result = mergeResults([group, group]);
    expect(result).toHaveLength(20);
  });

  it("handles empty groups", () => {
    expect(mergeResults([[], [], [], []])).toEqual([]);
  });

  it("inserts correlated IOCs after first briefing", () => {
    const corr = makeIoc(0.7, "via CVE-2024-1234 · HIGH");
    const result = mergeResults(
      [[makeBriefing(0.9), makeBriefing(0.4)], [makeIoc(0.6)]],
      [corr]
    );
    expect(result[0].type).toBe("briefing");
    expect(result[1].meta).toContain("via CVE-2024-1234");
    expect(result[2].type).toBe("ioc");
  });

  it("inserts correlated IOCs at start when no briefings present", () => {
    const corr = makeIoc(0.8, "via CVE-2024-1234 · HIGH");
    const result = mergeResults([[makeIoc(0.5)], []], [corr]);
    expect(result[0].meta).toContain("via CVE");
  });

  it("works without correlated IOCs argument", () => {
    const result = mergeResults([[makeBriefing(0.9)]]);
    expect(result).toHaveLength(1);
  });

  it("multiple correlated IOCs do not exceed the 20-item total cap", () => {
    const corr = Array.from({ length: 10 }, (_, i) =>
      makeIoc(0.8, `via CVE-2024-1234 · HIGH`)
    );
    const groups = [
      Array.from({ length: 10 }, (_, i) => makeBriefing(0.9 - i * 0.05)),
      Array.from({ length: 10 }, (_, i) => makeIoc(0.6 - i * 0.05)),
    ];
    const result = mergeResults(groups, corr);
    expect(result.length).toBeLessThanOrEqual(20);
  });
});
