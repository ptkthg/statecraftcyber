import type { Confidence, Severity } from "../types";
export type EvidenceKind = "observed" | "reported" | "inferred" | "unavailable";
export interface EvidenceSource {
  id: string;
  name: string;
  url: string;
  text: string;
  publishedAt?: string;
  retrievedAt: string;
  origin: "original" | "generated";
  telemetry?: boolean;
  techniqueAssertions?: { id: string; kind: "reported" | "observed"; quote: string }[];
}
export interface EvidenceClaim {
  field: string;
  kind: EvidenceKind;
  sourceId?: string;
  quote?: string;
}
export interface TechniqueEvidence {
  id: string;
  name?: string;
  kind: Exclude<EvidenceKind, "unavailable">;
  sourceId: string;
  quote: string;
}
export interface ValidatedTechnique extends TechniqueEvidence { name: string; url: string; catalogCommit: string }
export interface ValidationIssue { code: string; field: string; message: string }
export interface RiskAssessment {
  severity: Severity;
  severityBasis: "cvss" | "source" | "unavailable";
  technicalSeverity: Severity | "none" | null;
  cvssScore: number | null;
  exploitationProbability: number | null;
  knownExploitation: boolean;
  operationalPriority: Severity;
  confidence: Confidence;
  confidenceReason: string;
}
export interface QualityReport {
  policyVersion: "phase1-v1";
  analysisStatus: "preliminary" | "enriched" | "validated";
  publishable: boolean;
  checkedAt: string;
  contentType: "vulnerability" | "ioc-report" | "event";
  issues: ValidationIssue[];
  risk: RiskAssessment;
  techniques: ValidatedTechnique[];
  sources: EvidenceSource[];
}