import type { RawThreatItem, RawIOC, Severity, Confidence } from "./threat-sources/types";
import type { StructuredBriefing } from "./types";
import type { QualityReport } from "./intelligence/types";
import { scoreSeverity, inferCategory } from "./severity-scoring";
import { generateSlug, ensureUniqueSlug } from "./deduplication";
import { buildMarkdownFallback, generateAiBriefing } from "./ai-briefing";
import { validateBriefing } from "./intelligence/validation";
import { safeOperationalActions } from "./intelligence/ioc-policy";
export interface GeneratedBriefing {
  title: string; slug: string; summary: string; content: string;
  structuredContent: StructuredBriefing | null;
  severity: Severity; category: string; tags: string[];
  affectedSectors: string[]; affectedRegions: string[];
  sourceName: string; sourceUrl: string; sourcePublishedAt: Date | null;
  iocs: RawIOC[]; cves: string[]; mitreTechniques: string[];
  epssScore: number | null; cvssScore: number | null;
  confidence: Confidence; readingTime: number;
  qualityReport: QualityReport; sourceSnapshot: RawThreatItem;
  analysisStatus: QualityReport["analysisStatus"];
  operationalPriority: Severity; severityBasis: string;
}
function fallback(item: RawThreatItem): { summary: string; content: string } {
  const risk = scoreSeverity(item);
  const summary = item.description;
  // A source excerpt is a preliminary record, never a completed analysis.
  const content = [
    "## Registro preliminar da fonte", item.description,
    "## Limites da análise", "Não há análise validada para este registro. A presença em uma lista não confirma comprometimento.",
    "## Confiança analítica", risk.confidenceReason,
    ...(item.iocs?.length ? ["## Avaliação operacional dos indicadores", ...safeOperationalActions(item.iocs)] : []),
    "## Fonte", item.sourceName + ": " + item.sourceUrl,
  ].join("\n\n");
  return { summary, content };
}
function assemble(item: RawThreatItem, slugs: Set<string>, result: {title:string; summary:string; content:string; structuredContent:StructuredBriefing|null}): GeneratedBriefing {
  const quality = validateBriefing(item, result.structuredContent);
  const risk = quality.risk;
  const slug = ensureUniqueSlug(generateSlug(item.title), slugs);
  slugs.add(slug);
  const structured = result.structuredContent ? { ...result.structuredContent, quality, identifiedIocs: item.iocs ?? [], relatedCves: item.cves ?? [], confidenceLevel: risk.confidence, confidenceReason: risk.confidenceReason, mitreTechniques: quality.techniques.filter(t => t.kind !== "inferred").map(t => t.id), mitreEvidence: item.mitreEvidence ?? [] } : null;
  return {
    ...result, content: structured ? buildMarkdownFallback(structured) : result.content, structuredContent: structured, slug,
    severity: risk.severity, category: inferCategory(item), tags: [...new Set(item.tags ?? [])],
    affectedSectors: item.affectedSectors ?? [], affectedRegions: item.affectedRegions ?? [],
    sourceName: item.sourceName, sourceUrl: item.sourceUrl, sourcePublishedAt: item.publishedAt && item.publishedAtOrigin !== "retrieval" ? new Date(item.publishedAt) : null,
    iocs: item.iocs ?? [], cves: item.cves ?? [],
    mitreTechniques: quality.techniques.filter(t => t.kind !== "inferred").map(t => t.id),
    cvssScore: risk.cvssScore, epssScore: risk.exploitationProbability, confidence: risk.confidence,
    readingTime: Math.max(1, Math.ceil(result.content.split(/\s+/).length / 200)),
    qualityReport: quality, sourceSnapshot: item, analysisStatus: quality.analysisStatus,
    operationalPriority: risk.operationalPriority, severityBasis: risk.severityBasis,
  };
}
export function generateBriefing(item: RawThreatItem, slugs: Set<string>): GeneratedBriefing {
  return assemble(item, slugs, { title: item.title, ...fallback(item), structuredContent: null });
}
export async function generateBriefingAsync(item: RawThreatItem, slugs: Set<string>): Promise<GeneratedBriefing> {
  const base = fallback(item);
  const result = await generateAiBriefing(item, scoreSeverity(item).severity, base.summary, base.content);
  return assemble({ ...item, evidenceSources: result.evidenceSources }, slugs, result);
}