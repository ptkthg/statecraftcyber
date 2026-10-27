import type { RawThreatItem, Severity } from "./threat-sources/types";
import type { EvidenceSource, RiskAssessment } from "./intelligence/types";
import { sourceEvidence } from "./intelligence/evidence";
export function validScore(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}
export function cvssSeverity(score: number): Severity {
  return score >= 9 ? "critical" : score >= 7 ? "high" : score >= 4 ? "medium" : "low";
}
function primaryHost(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return ["nvd.nist.gov", "services.nvd.nist.gov"].includes(host) ? "nist.gov"
      : (host === "cisa.gov" || host.endsWith(".cisa.gov")) ? "cisa.gov" : null;
  } catch { return null; }
}
export function scoreSeverity(item: RawThreatItem, sources: EvidenceSource[] = sourceEvidence(item), now = new Date()): RiskAssessment {
  const hasCve = (item.cves ?? []).some(id => /^CVE-\d{4}-\d{4,}$/i.test(id));
  const cvssScore = hasCve && validScore(item.cvssScore, 10) ? item.cvssScore : null;
  const probability = hasCve && validScore(item.epssScore, 1) ? item.epssScore : null;
  const technical = cvssScore === null ? null : cvssSeverity(cvssScore);
  const supplied = ["critical","high","medium","low"].includes(item.severity ?? "") ? item.severity : undefined;
  const severity = technical ?? supplied ?? "low";
  const known = hasCve && (item.inCisaKev === true || item.exploitedInWild === true);
  const operationalPriority = known ? "critical" : probability !== null && probability >= .5 && ["low","medium"].includes(severity) ? "high" : severity;
  const usable = sources.filter(s => {
    const age = now.getTime() - new Date(s.publishedAt ?? "").getTime();
    return s.origin === "original" && s.text.trim().length >= 80 && age >= -86400000 && age <= 30 * 86400000;
  });
  const primaries = new Set(usable.map(s => primaryHost(s.url)).filter(Boolean));
  const corroborating = new Set(usable.filter(s => hasCve && item.cves?.some(id => s.text.includes(id))).map(s => primaryHost(s.url)).filter(Boolean));
  const confidence = corroborating.size >= 2 ? "high" : primaries.size >= 1 ? "medium" : "low";
  const confidenceReason = confidence === "high"
    ? "Há registros originais recentes de duas organizações primárias independentes. A confiança não confirma toda afirmação gerada."
    : confidence === "medium"
      ? "Há um registro original recente de fonte primária. Corroboração independente não foi estabelecida."
      : "Procedência primária, contexto suficiente ou temporalidade não foram estabelecidos; relatos comunitários não confirmam comprometimento.";
  return { severity, severityBasis: technical ? "cvss" : supplied && item.severityOrigin !== "assessment" ? "source" : "unavailable", technicalSeverity: cvssScore === 0 ? "none" : technical, cvssScore, exploitationProbability: probability, knownExploitation: known, operationalPriority, confidence, confidenceReason };
}
export function inferCategory(item: RawThreatItem): string {
  if ((item.cves ?? []).some(id => /^CVE-\d{4}-\d{4,}$/i.test(id))) return "Vulnerabilidade";
  const text = (item.title + " " + item.description + " " + (item.tags ?? []).join(" ")).toLowerCase();
  if (/ransomware/.test(text)) return "Ransomware";
  if (/phishing|credential|identidade/.test(text)) return "Phishing & Identidade";
  if (/apt|espionagem|nation.?state|state.?sponsored/.test(text)) return "APT & Espionagem";
  if (/malware|trojan|backdoor/.test(text)) return "Malware";
  if (/botnet|command.?and.?control|\bc2\b/.test(text)) return "Infraestrutura Maliciosa";
  return "Inteligência de Ameaças";
}