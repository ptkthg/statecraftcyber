import type { StructuredBriefing, Ioc, IocType, Confidence } from "@/lib/types";
import type { EvidenceClaim } from "@/lib/intelligence/types";
const IOC_TYPES = new Set(["ip", "domain", "url", "hash", "email", "file", "c2"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);
const KINDS = new Set(["observed", "reported", "inferred", "unavailable"]);
const text = (v: unknown, fb = "") => typeof v === "string" ? v.trim() : fb;
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((e): e is string => typeof e === "string").map(e => e.trim()).filter(Boolean) : [];
export function parseStructuredBriefing(raw: string, fallback: Partial<StructuredBriefing> = {}): StructuredBriefing | null {
  try {
    const json = raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/, "").replace(/\s*\x60\x60\x60$/, "");
    const p: unknown = JSON.parse(json);
    if (!p || typeof p !== "object" || Array.isArray(p)) return null;
    const v = p as Record<string, unknown>;
    const textFields = ["title","executiveSummary","whatHappened","whyItMatters","whoIsAtRisk","technicalDetails","falsePositiveNotes","confidenceReason","sourceName","sourceUrl"];
    if (textFields.some(key => v[key] !== undefined && typeof v[key] !== "string")) return null;
    if (["recommendedActions","detectionSuggestions","relatedCves","mitreTechniques"].some(key => v[key] !== undefined && (!Array.isArray(v[key]) || (v[key] as unknown[]).some(value => typeof value !== "string")))) return null;
    if (v.confidenceLevel !== undefined && !CONFIDENCE.has(String(v.confidenceLevel))) return null;
    if (v.claims !== undefined && (!Array.isArray(v.claims) || v.claims.some((c: unknown) => {
      if (!c || typeof c !== "object") return true;
      const r = c as Record<string,unknown>;
      return typeof r.field !== "string" || !KINDS.has(String(r.kind)) || (r.quote !== undefined && typeof r.quote !== "string") || (r.sourceId !== undefined && typeof r.sourceId !== "string");
    }))) return null;
    const iocs: Ioc[] = [];
    if (Array.isArray(v.identifiedIocs)) for (const candidate of v.identifiedIocs) {
      if (!candidate || typeof candidate !== "object") continue;
      const c = candidate as Record<string,unknown>;
      if (!IOC_TYPES.has(String(c.type)) || typeof c.value !== "string") continue;
      iocs.push({ type: c.type as IocType, value: c.value, confidence: CONFIDENCE.has(String(c.confidence)) ? c.confidence as Confidence : "low" });
    }
    return postProcess({
      title: text(v.title, fallback.title ?? ""),
      executiveSummary: text(v.executiveSummary, fallback.executiveSummary ?? ""),
      whatHappened: text(v.whatHappened), whyItMatters: text(v.whyItMatters),
      whoIsAtRisk: text(v.whoIsAtRisk), technicalDetails: text(v.technicalDetails),
      recommendedActions: strings(v.recommendedActions), detectionSuggestions: strings(v.detectionSuggestions),
      falsePositiveNotes: text(v.falsePositiveNotes),
      confidenceLevel: CONFIDENCE.has(String(v.confidenceLevel)) ? v.confidenceLevel as Confidence : "low",
      confidenceReason: text(v.confidenceReason),
      sourceName: text(v.sourceName, fallback.sourceName ?? ""), sourceUrl: text(v.sourceUrl, fallback.sourceUrl ?? ""),
      identifiedIocs: iocs, relatedCves: strings(v.relatedCves), mitreTechniques: strings(v.mitreTechniques),
      claims: (v.claims ?? []) as EvidenceClaim[],
    });
  } catch {
    // Invalid/truncated JSON is never converted into a completed analysis.
    return null;
  }
}
export function postProcess(b: StructuredBriefing): StructuredBriefing {
  const unique = (values: string[]) => [...new Map(values.filter(Boolean).map(v => [v.toLowerCase().replace(/\s+/g," ").trim(), v])).values()];
  return { ...b,
    recommendedActions: unique(b.recommendedActions),
    detectionSuggestions: unique(b.detectionSuggestions),
    identifiedIocs: [...new Map(b.identifiedIocs.map(i => [i.type + ":" + i.value.toLowerCase(), i])).values()],
  };
}