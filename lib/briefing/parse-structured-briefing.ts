import type { StructuredBriefing, Ioc, IocType, Confidence } from "@/lib/types";

const EMPTY_SECTION = "A fonte original não fornece detalhes suficientes para esta seção.";
const NO_FP = "Não há dados suficientes para avaliar falsos positivos desta detecção.";

const IOC_TYPES = new Set<string>(["ip", "domain", "url", "hash", "email", "file", "c2"]);
const CONFIDENCE_VALS = new Set<string>(["high", "medium", "low"]);

// ── Public API ────────────────────────────────────────────────────────────────

export function parseStructuredBriefing(
  raw: string,
  fallback?: Partial<StructuredBriefing>
): StructuredBriefing | null {
  try {
    let json = raw.trim();
    // Strip fenced code blocks that some models still emit
    if (json.startsWith("```")) {
      json = json.replace(/^```(?:json)?\r?\n?/, "").replace(/\r?\n?```$/, "").trim();
    }
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const normalized = buildStructured(parsed, fallback);
    return postProcess(normalized);
  } catch {
    if (!fallback) return null;
    return postProcess(buildStructured({}, fallback));
  }
}

/** Apply deduplication and empty-field handling to an already-parsed struct. */
export function postProcess(b: StructuredBriefing): StructuredBriefing {
  return {
    ...b,
    recommendedActions: dedupeStrings(b.recommendedActions).filter(Boolean),
    detectionSuggestions: dedupeStrings(b.detectionSuggestions).filter(Boolean),
    identifiedIocs: dedupeIocs(b.identifiedIocs),
  };
}

// ── Normalization ─────────────────────────────────────────────────────────────

function buildStructured(
  p: Record<string, unknown>,
  fb?: Partial<StructuredBriefing>
): StructuredBriefing {
  return {
    title:               s(p.title,             fb?.title              ?? "Briefing de Threat Intelligence"),
    executiveSummary:    s(p.executiveSummary,   fb?.executiveSummary   ?? EMPTY_SECTION),
    whatHappened:        s(p.whatHappened,       fb?.whatHappened       ?? EMPTY_SECTION),
    whyItMatters:        s(p.whyItMatters,       fb?.whyItMatters       ?? EMPTY_SECTION),
    whoIsAtRisk:         s(p.whoIsAtRisk,        fb?.whoIsAtRisk        ?? EMPTY_SECTION),
    technicalDetails:    s(p.technicalDetails,   fb?.technicalDetails   ?? EMPTY_SECTION),
    identifiedIocs:      normalizeIocs(p.identifiedIocs,     fb?.identifiedIocs     ?? []),
    relatedCves:         strArr(p.relatedCves,       fb?.relatedCves       ?? []),
    mitreTechniques:     strArr(p.mitreTechniques,   fb?.mitreTechniques   ?? []),
    recommendedActions:  strArr(p.recommendedActions, fb?.recommendedActions ?? []),
    detectionSuggestions:strArr(p.detectionSuggestions, fb?.detectionSuggestions ?? []),
    falsePositiveNotes:  s(p.falsePositiveNotes, fb?.falsePositiveNotes  ?? NO_FP),
    confidenceLevel:     conf(p.confidenceLevel, fb?.confidenceLevel     ?? "medium"),
    confidenceReason:    s(p.confidenceReason,   fb?.confidenceReason   ?? EMPTY_SECTION),
    sourceName:          s(p.sourceName,         fb?.sourceName         ?? ""),
    sourceUrl:           s(p.sourceUrl,          fb?.sourceUrl          ?? ""),
  };
}

function s(v: unknown, fallback: string): string {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return fallback;
}

function strArr(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  const result = v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
  return result.length > 0 ? result : fallback;
}

function conf(v: unknown, fallback: Confidence): Confidence {
  if (typeof v === "string") {
    if (CONFIDENCE_VALS.has(v)) return v as Confidence;
    // Accept Portuguese variants from older prompts
    if (v === "alto" || v === "alta") return "high";
    if (v === "médio" || v === "média") return "medium";
    if (v === "baixo" || v === "baixa") return "low";
  }
  return fallback;
}

function normalizeIocs(v: unknown, fallback: Ioc[]): Ioc[] {
  if (!Array.isArray(v)) return fallback;
  const result: Ioc[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const type = typeof raw.type === "string" ? raw.type.toLowerCase().trim() : "";
    const value = typeof raw.value === "string" ? raw.value.trim() : "";
    if (!IOC_TYPES.has(type) || !value) continue;
    result.push({
      type: type as IocType,
      value,
      confidence: conf(raw.confidence, "medium"),
      source: typeof raw.source === "string" ? raw.source.trim() : undefined,
    });
  }
  return result.length > 0 ? result : fallback;
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((s) => {
    const k = s.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function dedupeIocs(iocs: Ioc[]): Ioc[] {
  const seen = new Set<string>();
  return iocs.filter((ioc) => {
    const k = `${ioc.type}:${ioc.value.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
