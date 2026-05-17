import { describe, it, expect } from "vitest";
import {
  generateContentHash,
  filterNewItems,
  generateSlug,
  ensureUniqueSlug,
} from "../lib/deduplication";
import type { RawThreatItem } from "../lib/threat-sources/types";

function makeItem(overrides: Partial<RawThreatItem> = {}): RawThreatItem {
  return {
    externalId: "test-id-1",
    title: "Test Threat",
    description: "Test description",
    sourceName: "test-source",
    sourceUrl: "https://example.com",
    severity: "high",
    cves: [],
    ...overrides,
  };
}

describe("generateContentHash", () => {
  it("returns a 64-character hex string", () => {
    const hash = generateContentHash(makeItem());
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic for the same input", () => {
    const a = generateContentHash(makeItem());
    const b = generateContentHash(makeItem());
    expect(a).toBe(b);
  });

  it("differs for different externalIds", () => {
    const a = generateContentHash(makeItem({ externalId: "id-a" }));
    const b = generateContentHash(makeItem({ externalId: "id-b" }));
    expect(a).not.toBe(b);
  });

  it("differs for different sources", () => {
    const a = generateContentHash(makeItem({ sourceName: "source-a" }));
    const b = generateContentHash(makeItem({ sourceName: "source-b" }));
    expect(a).not.toBe(b);
  });

  it("CVE order does not affect the hash", () => {
    const a = generateContentHash(makeItem({ cves: ["CVE-2024-1", "CVE-2024-2"] }));
    const b = generateContentHash(makeItem({ cves: ["CVE-2024-2", "CVE-2024-1"] }));
    expect(a).toBe(b);
  });
});

describe("filterNewItems", () => {
  it("removes items already in the DB", () => {
    const item = makeItem();
    const hash = generateContentHash(item);
    expect(filterNewItems([item], new Set([hash]))).toHaveLength(0);
  });

  it("passes through items not in the DB", () => {
    const item = makeItem();
    const result = filterNewItems([item], new Set());
    expect(result).toHaveLength(1);
    expect(result[0].item).toBe(item);
  });

  it("deduplicates duplicates within the same batch", () => {
    const item = makeItem();
    expect(filterNewItems([item, item], new Set())).toHaveLength(1);
  });

  it("attaches the hash to each result", () => {
    const item = makeItem();
    const result = filterNewItems([item], new Set());
    expect(result[0].hash).toHaveLength(64);
  });
});

describe("generateSlug", () => {
  it("converts a title to a URL-safe slug", () => {
    expect(generateSlug("Hello World!")).toBe("hello-world");
  });

  it("removes accents from characters", () => {
    expect(generateSlug("Vulnerabilidade Crítica")).toBe("vulnerabilidade-critica");
  });

  it("collapses multiple spaces and dashes", () => {
    expect(generateSlug("a  b---c")).toBe("a-b-c");
  });

  it("strips leading and trailing dashes", () => {
    expect(generateSlug("---hello---")).toBe("hello");
  });

  it("truncates to 100 characters", () => {
    const long = "a".repeat(150);
    expect(generateSlug(long)).toHaveLength(100);
  });
});

describe("ensureUniqueSlug", () => {
  it("returns the base slug when it is not taken", () => {
    expect(ensureUniqueSlug("my-slug", new Set())).toBe("my-slug");
  });

  it("appends -2 when the base slug is already taken", () => {
    expect(ensureUniqueSlug("my-slug", new Set(["my-slug"]))).toBe("my-slug-2");
  });

  it("increments until a unique slug is found", () => {
    const taken = new Set(["slug", "slug-2", "slug-3"]);
    expect(ensureUniqueSlug("slug", taken)).toBe("slug-4");
  });
});
