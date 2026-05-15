export type Severity = "critical" | "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";

export interface RawIOC {
  type: "ip" | "domain" | "url" | "hash" | "email" | "file" | "c2";
  value: string;
  confidence: Confidence;
  source: string;
}

export interface RawThreatItem {
  /** Identificador único da fonte */
  externalId: string;
  title: string;
  description: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt?: Date;
  cves?: string[];
  cvssScore?: number;
  epssScore?: number;
  iocs?: RawIOC[];
  mitreTechniques?: string[];
  tags?: string[];
  affectedProducts?: string[];
  affectedSectors?: string[];
  affectedRegions?: string[];
  /** Pré-classificação sugerida pela fonte */
  severity?: Severity;
  inCisaKev?: boolean;
  exploitedInWild?: boolean;
}

export interface SourceAdapter {
  name: string;
  fetch(): Promise<RawThreatItem[]>;
}
