import type { EvidenceSource, TechniqueEvidence } from "../intelligence/types";
export type Severity = "critical" | "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";

export interface RawIOC {
  type: "ip" | "domain" | "url" | "hash" | "email" | "file" | "c2";
  value: string;
  confidence: Confidence;
  source: string;
  sourceUrl?: string;
  lastSeen?: string;
  locallyConfirmed?: boolean;
  sharedInfrastructure?: boolean;
}

export interface RawThreatItem {
  /** Identificador único da fonte */
  externalId: string;
  originalPayload?: unknown;
  recordKind?: "vulnerability" | "periodic-ioc" | "event" | "campaign";
  periodicKey?: string;
  iocSetComplete?: boolean;
  sourceUpdatedAt?: Date;
  vendors?: string[];
  campaigns?: string[];
  actors?: string[];
  malwareFamilies?: string[];
  descriptionOrigin?: "original" | "generated";
  evidenceSources?: EvidenceSource[];
  mitreEvidence?: TechniqueEvidence[];
  title: string;
  description: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt?: Date;
  publishedAtOrigin?: "source" | "retrieval";
  cves?: string[];
  cvssScore?: number;
  metricWarnings?: string[];
  epssScore?: number;
  iocs?: RawIOC[];
  mitreTechniques?: string[];
  tags?: string[];
  affectedProducts?: string[];
  affectedSectors?: string[];
  affectedRegions?: string[];
  /** Pré-classificação sugerida pela fonte */
  severity?: Severity;
  severityOrigin?: "source" | "assessment";
  inCisaKev?: boolean;
  exploitedInWild?: boolean;
}

export interface SourceAdapter {
  name: string;
  fetch(): Promise<RawThreatItem[]>;
}
