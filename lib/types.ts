export type Severity = "critical" | "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";

export interface Ioc {
  type: string;
  value: string;
  confidence: string;
  source?: string;
}

export interface LiveIoc extends Ioc {
  sourceName: string;
  briefingSlug: string;
  severity: string;
}

export interface EnrichedIoc extends Ioc {
  briefingSlug: string;
  briefingTitle: string;
  briefingSeverity: string;
  briefingDate: string;
  sourceName: string;
}
