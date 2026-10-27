import type { StructuredBriefing } from "../types";
import type { RawThreatItem } from "../threat-sources/types";
import type { EvidenceClaim, QualityReport, ValidationIssue } from "./types";
import { originalQuote, sourceEvidence, safeSourceUrl } from "./evidence";
import { scoreSeverity, validScore } from "../severity-scoring";
import { validateTechnique } from "./mitre";
export const POLICY_VERSION = "phase1-v1" as const;
const REQUIRED = ["executiveSummary", "whatHappened", "whyItMatters", "whoIsAtRisk", "technicalDetails"] as const;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const generic = (value: string) => /^(a fonte original nao fornece|nao ha dados suficientes|informacoes? (indisponiveis|nao disponiveis)|sem (dados|informacoes)|monitore logs|mantenha.*atualizados)/.test(normalize(value));
export function validateBriefing(item: RawThreatItem, briefing: StructuredBriefing | null, now = new Date()): QualityReport {
  const sources = sourceEvidence(item, now);
  const risk = scoreSeverity(item, sources, now);
  const issues: ValidationIssue[] = [];
  const add = (code: string, field: string, message: string) => issues.push({ code, field, message });
  const contentType = (item.cves?.length ?? 0) > 0 ? "vulnerability" : item.iocs?.length ? "ioc-report" : "event";
  if (!safeSourceUrl(item.sourceUrl) || !item.sourceName.trim() || !item.description.trim()) add("source.missing", "source", "Fonte original, descrição e URL rastreável são obrigatórias.");
  if (sources.some(s => s.origin === "generated") || item.descriptionOrigin === "generated") add("source.generated", "source", "Resumo gerado anteriormente não pode ser reutilizado como evidência original.");
  if (item.publishedAtOrigin === "retrieval" || !item.publishedAt || !Number.isFinite(new Date(item.publishedAt).getTime()) || new Date(item.publishedAt).getTime() > now.getTime() + 86400000) add("source.date", "sourcePublishedAt", "Temporalidade original ausente ou inválida.");
  if (item.cvssScore !== undefined && (risk.cvssScore === null || !validScore(item.cvssScore,10))) add("metrics.cvss", "cvssScore", "CVSS exige CVE identificada e pontuação finita entre 0 e 10.");
  if (item.epssScore !== undefined && (risk.exploitationProbability === null || !validScore(item.epssScore,1))) add("metrics.epss", "epssScore", "EPSS exige CVE identificada e probabilidade entre 0 e 1.");
  if ((item.cves?.length ?? 0) > 1 && (item.cvssScore !== undefined || item.epssScore !== undefined)) add("metrics.ambiguous", "cves", "Uma pontuação escalar não pode ser atribuída a várias CVEs.");
  for (const cve of item.cves ?? []) if (!/^CVE-\d{4}-\d{4,}$/.test(cve)) add("cve.invalid", "cves", "Identificador CVE inválido.");
  if (new Set(sources.map(s => s.id)).size !== sources.length) add("source.duplicate_id","sources","IDs de evidência duplicados são ambíguos.");
  for (const warning of item.metricWarnings ?? []) add("metrics.source_contradiction","cvssScore",warning);
  if (risk.severityBasis === "unavailable") add("severity.unavailable","severity","A fonte não informou severidade técnica ou classificação explícita; uma avaliação do adapter não pode substituí-la.");
  const techniques: QualityReport["techniques"] = [];
  for (const mapping of item.mitreEvidence ?? []) {
    const result = validateTechnique(mapping, sources);
    issues.push(...result.issues);
    if (result.technique) techniques.push(result.technique);
    if (mapping.kind === "inferred") add("mitre.inferred", "mitreTechniques", "Associação inferida não é técnica observada ou reportada e requer revisão semântica.");
  }
  for (const id of item.mitreTechniques ?? []) if (!techniques.some(t => t.id === id)) add("mitre.unsupported", "mitreTechniques", "Técnica sem associação verificável: " + id);
  let complete = !!briefing;
  if (!briefing) add("content.missing", "structuredContent", "Geração ausente, inválida ou fallback; manter como preliminar.");
  if (briefing) {
    if (briefing.title.trim().length < 10) { complete = false; add("content.title","title","Título ausente ou insuficiente."); }
    for (const id of briefing.relatedCves) if (!item.cves?.includes(id)) add("cve.generated","relatedCves","CVE gerada não consta da fonte.");
    for (const ioc of briefing.identifiedIocs) if (!item.iocs?.some(raw => raw.type === ioc.type && raw.value === ioc.value)) add("ioc.generated","identifiedIocs","IOC gerado não consta da fonte.");
    const values: Record<string,string> = { title: briefing.title, executiveSummary: briefing.executiveSummary, whatHappened: briefing.whatHappened, whyItMatters: briefing.whyItMatters, whoIsAtRisk: briefing.whoIsAtRisk, technicalDetails: briefing.technicalDetails, falsePositiveNotes: briefing.falsePositiveNotes };
    briefing.recommendedActions.forEach((v,i) => values["recommendedActions."+i] = v);
    briefing.detectionSuggestions.forEach((v,i) => values["detectionSuggestions."+i] = v);
    for (const field of REQUIRED) if (values[field].trim().length < 30 || generic(values[field])) { complete = false; add("content.incomplete", field, "Seção essencial vazia, genérica ou insuficiente."); }
    const core = REQUIRED.map(key => normalize(values[key]));
    if (new Set(core).size !== core.length) { complete = false; add("content.repeated", "structuredContent", "Seções essenciais repetem o mesmo conteúdo."); }
    if ((contentType !== "event" && !briefing.recommendedActions.length) || (contentType !== "vulnerability" && !briefing.detectionSuggestions.length)) { complete = false; add("content.actions", "recommendedActions", "Ações ou detecções fundamentadas obrigatórias para este tipo de conteúdo."); }
    if (contentType === "ioc-report" && (!briefing.falsePositiveNotes.trim() || generic(briefing.falsePositiveNotes))) { complete = false; add("content.false_positives", "falsePositiveNotes", "Relato de IOCs exige contexto concreto para falsos positivos."); }
    if (briefing.sourceName !== item.sourceName || briefing.sourceUrl !== item.sourceUrl) add("source.mismatch", "sourceUrl", "A IA alterou a origem do conteúdo.");
    if (briefing.confidenceLevel !== risk.confidence) add("confidence.contradiction", "confidenceLevel", "Confiança declarada diverge dos critérios de procedência e temporalidade.");
    const claims = briefing.claims ?? [];
    for (const [field,value] of Object.entries(values)) {
      if (!value.trim()) continue;
      const matching = claims.filter(c => c.field === field);
      if (matching.length !== 1) { add("claim.missing", field, "Afirmação sem uma evidência única e rastreável."); continue; }
      const claim: EvidenceClaim = matching[0];
      const source = sources.find(s => s.id === claim.sourceId);
      if (claim.kind === "unavailable") { add("claim.unavailable_assertion", field, "Informação indisponível não pode conter uma afirmação factual."); continue; }
      if (!originalQuote(source, claim.quote)) { add("claim.unsupported", field, "Trecho não existe no snapshot original ou é demasiado curto para justificar a afirmação."); continue; }
      if (claim.kind === "observed" && !source?.telemetry) add("claim.not_observed", field, "Relato de terceiros não constitui observação própria.");
      if (claim.kind === "inferred") {
        if (!value.startsWith("Avaliação analítica:")) add("claim.unlabelled_inference", field, "Avaliação analítica precisa estar explicitamente rotulada.");
        add("claim.semantic_review", field, "Inferência armazenada, mas não verificável automaticamente por correspondência textual.");
      } else if (!["reported","observed"].includes(claim.kind) || claim.quote!.trim() !== value.trim()) {
        add("claim.semantic_review", field, "Paráfrase ou detalhe novo não pode ser validado apenas pela presença de uma citação; requer revisão semântica.");
      }
    }
    const text = Object.values(values).join("\n");
    if (contentType !== "vulnerability" && /\bCVSS\b[^.\n]{0,30}\d/i.test(text)) add("metrics.not_applicable","cvssScore","Evento sem vulnerabilidade identificada não pode receber pontuação CVSS.");
    for (const match of text.matchAll(/\bCVSS(?:\s+(?:score|base))?\s*[:=]\s*(\d+(?:[.,]\d+)?)/gi)) {
      if (risk.cvssScore === null || Number(match[1].replace(",",".")) !== risk.cvssScore) add("metrics.contradiction","cvssScore","Pontuação CVSS no texto diverge da fonte estruturada.");
    }
    for (const match of text.matchAll(/\bEPSS\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*%/gi)) {
      const value = Number(match[1].replace(",","."));
      const decimals = match[1].split(/[.,]/)[1]?.length ?? 0;
      if (risk.exploitationProbability === null || Number((risk.exploitationProbability * 100).toFixed(Math.min(decimals,12))) !== value) add("metrics.contradiction","epssScore","EPSS no texto diverge da probabilidade estruturada.");
    }
    for (const id of new Set(text.match(/\bT\d{4}(?:\.\d{3})?\b/g) ?? [])) if (!techniques.some(t => t.id === id && t.kind !== "inferred")) add("mitre.prose_unsupported", "technicalDetails", "Técnica introduzida no texto sem evidência: " + id);
    for (const id of new Set(text.match(/CVE-\d{4}-\d{4,}/g) ?? [])) if (!item.cves?.includes(id)) add("cve.unsupported", "technicalDetails", "CVE não consta da fonte: " + id);
    const severityWords: Record<string,string> = { critica:"critical", critico:"critical", alta:"high", alto:"high", media:"medium", medio:"medium", baixa:"low", baixo:"low" };
    for (const match of normalize(text).matchAll(/severidade\s+(?:tecnica\s+)?(critica|critico|alta|alto|media|medio|baixa|baixo)\b/g)) if (severityWords[match[1]] !== risk.severity) add("severity.contradiction","severity","Severidade no texto contradiz a classificação canônica.");
    for (const match of normalize(text).matchAll(/confianca\s+(alta|media|baixa)\b/g)) if (severityWords[match[1]] !== risk.confidence) add("confidence.contradiction","confidenceLevel","Confiança no texto contradiz o critério canônico.");
    if (/revis[aã]o humana|validado por analistas|revisado por especialistas/i.test(text)) add("review.unsupported","content","Não há evidência de revisão humana nesta execução automática.");
    for (const action of briefing.recommendedActions) if (/bloque|block|isole|isolar|desativ/i.test(action)) {
      add("action.operational_review","recommendedActions","Bloqueio ou contenção gerados exigem validação operacional local; não são autorizados para publicação automática.");
    }
    if ((briefing.mitreTechniques ?? []).some(id => !techniques.some(t => t.id === id))) add("mitre.generated","mitreTechniques","A IA introduziu um mapeamento sem evidência de ingestão.");
  }
  return { policyVersion: POLICY_VERSION, analysisStatus: !complete ? "preliminary" : issues.length ? "enriched" : "validated", publishable: complete && issues.length === 0, checkedAt: now.toISOString(), contentType, issues, risk, techniques, sources };
}
export function publicationStatus(autoPublish: boolean, quality: QualityReport): "published" | "draft" {
  return autoPublish && quality.policyVersion === POLICY_VERSION && quality.publishable && quality.analysisStatus === "validated" && quality.issues.length === 0 ? "published" : "draft";
}