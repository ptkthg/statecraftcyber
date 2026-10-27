import { isVerbatimPassage } from "./literal-support";
import { createHash } from "node:crypto";
export function sourceDigest(source: unknown): string {
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}
export interface TextReport {
  policyVersion: "phase1-v1";
  publishable: boolean;
  sourceDigest: string;
  issues: { code: string; field: string }[];
}
/** No semantic entailment model is used: only literal source-bound text can pass automatically. */
export function validateTextFields(source: string, fields: Record<string,string>): TextReport {
  const issues: TextReport["issues"] = [];
  for (const [field, value] of Object.entries(fields)) {
    if (value.trim() && !isVerbatimPassage(source, value)) issues.push({ code: "claim.semantic_review", field });
  }
  if (!source.trim() || !Object.values(fields).some(v => v.trim())) issues.push({ code: "content.missing", field: "content" });
  return { policyVersion: "phase1-v1", sourceDigest: sourceDigest(source), publishable: issues.length === 0, issues };
}
export function validTextReport(report: unknown, source: string): boolean {
  if (!report || typeof report !== "object") return false;
  const r = report as Partial<TextReport>;
  return r.policyVersion === "phase1-v1" && r.publishable === true && r.sourceDigest === sourceDigest(source);
}