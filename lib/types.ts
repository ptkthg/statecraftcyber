export type Severity = "critical" | "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";
export type IocType = "ip" | "domain" | "url" | "hash" | "email" | "file" | "c2";

export interface Ioc {
  type: IocType;
  value: string;
  confidence: Confidence;
  source?: string;
}

export interface LiveIoc extends Ioc {
  sourceName: string;
  briefingSlug: string;
  severity: Severity;
}

export interface EnrichedIoc extends Ioc {
  briefingSlug: string;
  briefingTitle: string;
  briefingSeverity: Severity;
  briefingDate: string;
  sourceName: string;
}

// ── Structured briefing content ───────────────────────────────────────────────

export interface StructuredBriefing {
  title: string;
  executiveSummary: string;
  whatHappened: string;
  whyItMatters: string;
  whoIsAtRisk: string;
  technicalDetails: string;
  /** IOCs extracted from the source. Never AI-invented. */
  identifiedIocs: Ioc[];
  relatedCves: string[];
  mitreTechniques: string[];
  recommendedActions: string[];
  detectionSuggestions: string[];
  falsePositiveNotes: string;
  confidenceLevel: Confidence;
  confidenceReason: string;
  sourceName: string;
  sourceUrl: string;
}
