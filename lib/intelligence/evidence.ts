import { isVerbatimPassage } from "./literal-support";
import { sourceDigest } from "./text-validation";
import type { RawThreatItem } from "../threat-sources/types";
import type { EvidenceSource } from "./types";
export function safeSourceUrl(value: string): boolean {
  try { const u = new URL(value); return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}
export function sourceEvidence(item: RawThreatItem, now = new Date()): EvidenceSource[] {
  const original: EvidenceSource = {
    id: "source", name: item.sourceName, url: item.sourceUrl,
    text: item.title + "\n" + item.description,
    publishedAt: item.publishedAtOrigin !== "retrieval" && item.publishedAt && Number.isFinite(new Date(item.publishedAt).getTime()) ? new Date(item.publishedAt).toISOString() : undefined,
    retrievedAt: now.toISOString(), origin: item.descriptionOrigin ?? "original",
  };
  // Only ingestion/RAG supplies this list. The model may reference IDs, never create sources.
  return [original, ...(item.evidenceSources ?? [])].filter(s => safeSourceUrl(s.url));
}
export function originalQuote(source: EvidenceSource | undefined, quote: unknown): quote is string {
  return !!source && source.origin === "original" && typeof quote === "string" && quote.trim().length >= 12 && isVerbatimPassage(source.text, quote);
}
/** Deterministic proof of support. Paraphrases need a separate semantic review and fail closed. */
export function isExtractive(text: string, sources: EvidenceSource[]): boolean {
  return text.trim().length > 0 && sources.some(s => s.origin === "original" && isVerbatimPassage(s.text, text));
}
/** Stable event identity is separate from changing source contents. */
export function sourceRevision(item: RawThreatItem): string {
  const snapshot = { ...item };
  delete snapshot.evidenceSources;
  if (snapshot.publishedAtOrigin === "retrieval") delete snapshot.publishedAt;
  else if (snapshot.publishedAt && Number.isFinite(new Date(snapshot.publishedAt).getTime())) snapshot.publishedAt = new Date(snapshot.publishedAt);
  return sourceDigest(snapshot);
}
