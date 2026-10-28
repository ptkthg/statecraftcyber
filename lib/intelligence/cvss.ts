import { cvssSeverity, validScore } from "../severity-scoring";
export interface NvdMetric {
  type?: string;
  source?: string;
  baseSeverity?: string;
  cvssData: {
    baseScore: number;
    baseSeverity?: string;
    vectorString?: string;
    version?: string;
  };
}
export interface NvdMetrics {
  cvssMetricV40?: NvdMetric[];
  cvssMetricV31?: NvdMetric[];
  cvssMetricV30?: NvdMetric[];
  cvssMetricV2?: NvdMetric[];
}
export function selectNvdCvss(metrics: NvdMetrics | undefined) {
  const candidates = [
    ["4.0", metrics?.cvssMetricV40],
    ["3.1", metrics?.cvssMetricV31],
    ["3.0", metrics?.cvssMetricV30],
    ["2.0", metrics?.cvssMetricV2],
  ] as const;
  for (const [version, values] of candidates) {
    const valid =
      values?.filter((m) => validScore(m.cvssData?.baseScore, 10)) ?? [];
    const metric = valid.find((m) => m.type === "Primary") ?? valid[0];
    if (!metric) continue;
    const score = metric.cvssData.baseScore;
    const severity = cvssSeverity(score);
    const reported = metric.cvssData.baseSeverity ?? metric.baseSeverity;
    const warnings =
      reported &&
      reported.toLowerCase() !== severity &&
      !(score === 0 && reported === "NONE")
        ? ["CVSS source severity disagrees with the numeric score"]
        : [];
    return { score, version, severity, warnings };
  }
  return { score: null, version: "", severity: null, warnings: [] } as const;
}
