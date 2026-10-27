import type { RawThreatItem } from "../threat-sources/types";
import { parseStructuredBriefing } from "../briefing/parse-structured-briefing";
import { buildMarkdownFallback } from "../ai-briefing";
import { validateBriefing } from "./validation";
export interface StoredIntelligence {
  title: string; summary: string; content: string;
  severity: string; confidence: string; sourceName: string; sourceUrl: string;
  sourceSnapshot: unknown; structuredContent: unknown;
}
export function auditStoredBriefing(row: StoredIntelligence, now = new Date()) {
  const snapshot = row.sourceSnapshot as RawThreatItem | null;
  const hasOriginal = snapshot && typeof snapshot.title === "string" && typeof snapshot.description === "string" && typeof snapshot.sourceUrl === "string" && typeof snapshot.sourceName === "string";
  const item: RawThreatItem = hasOriginal ? { ...snapshot, publishedAt: snapshot.publishedAt ? new Date(snapshot.publishedAt) : undefined } : {
    externalId:"legacy",title:row.title,description:row.summary,sourceName:row.sourceName,sourceUrl:row.sourceUrl,descriptionOrigin:"generated",
  };
  const content = hasOriginal ? parseStructuredBriefing(JSON.stringify(row.structuredContent)) : null;
  const report = validateBriefing(item,content,now);
  if (!hasOriginal) report.issues.push({code:"source.legacy",field:"sourceSnapshot",message:"Registro legado sem fonte capturada: recolha o original antes de validar."});
  if (row.severity !== report.risk.severity || row.confidence !== report.risk.confidence) report.issues.push({code:"metadata.contradiction",field:"classification",message:"Metadados persistidos divergem dos critérios canônicos."});
  if (content && (row.title !== content.title || row.summary !== content.executiveSummary || row.content !== buildMarkdownFallback(content))) report.issues.push({code:"metadata.content_mismatch",field:"content",message:"Texto público e estrutura analisada divergem."});
  if (row.sourceName !== item.sourceName || row.sourceUrl !== item.sourceUrl) report.issues.push({code:"metadata.source_mismatch",field:"sourceUrl",message:"Origem exibida não corresponde à origem capturada."});
  if (report.issues.length) {
    report.publishable = false;
    report.analysisStatus = report.analysisStatus === "validated" ? "enriched" : report.analysisStatus;
  }
  return report;
}