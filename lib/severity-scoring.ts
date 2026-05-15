import type { RawThreatItem, Severity, Confidence } from "./threat-sources/types";

interface ScoringResult {
  severity: Severity;
  confidence: Confidence;
}

/**
 * Classifica severidade e confiança com base nos dados da fonte.
 * Prioridade: CISA KEV > CVSS/EPSS > IOCs > texto/tags.
 */
export function scoreSeverity(item: RawThreatItem): ScoringResult {
  // --- Severity ---

  // CISA KEV = crítico automático
  if (item.inCisaKev || item.exploitedInWild) {
    return { severity: "critical", confidence: "high" };
  }

  // CVSS >= 9.0 = crítico
  if (item.cvssScore !== undefined) {
    if (item.cvssScore >= 9.0) return { severity: "critical", confidence: "high" };
    if (item.cvssScore >= 7.0) return { severity: "high", confidence: "high" };
    if (item.cvssScore >= 4.0) return { severity: "medium", confidence: "medium" };
  }

  // EPSS alto = escalona
  if (item.epssScore !== undefined) {
    if (item.epssScore >= 0.5) return { severity: "critical", confidence: "high" };
    if (item.epssScore >= 0.2) return { severity: "high", confidence: "medium" };
  }

  // Pré-classificação explícita da fonte
  if (item.severity) {
    return { severity: item.severity, confidence: "medium" };
  }

  // Heurística por tags/título/descrição
  const text = `${item.title} ${item.description} ${(item.tags ?? []).join(" ")}`.toLowerCase();

  if (
    /ransomware ativo|exploração ativa|actively exploited|zero.?day confirmado|campanha ativa/.test(text)
  ) {
    return { severity: "critical", confidence: "medium" };
  }

  if (
    /ransomware|apt|phishing em larga escala|exploit público|comprometimento confirmado|backdoor|botnet c2/.test(text)
  ) {
    return { severity: "high", confidence: "medium" };
  }

  if (
    /ioc|indicator|malware|trojan|phishing|vulnerability|vulnerabilidade|cve-/.test(text)
  ) {
    return { severity: "medium", confidence: item.iocs?.length ? "medium" : "low" };
  }

  // Grande volume de IOCs = pelo menos medium
  if ((item.iocs?.length ?? 0) >= 5) {
    return { severity: "medium", confidence: "medium" };
  }

  return { severity: "low", confidence: "low" };
}

/** Mapeia severidade para categoria de conteúdo. */
export function inferCategory(item: RawThreatItem): string {
  const text = `${item.title} ${item.description} ${(item.tags ?? []).join(" ")}`.toLowerCase();

  if (/cve-\d{4}-\d+|vulnerabilidade|nvd|kev/.test(text)) return "Vulnerabilidade";
  if (/ransomware/.test(text)) return "Ransomware";
  if (/phishing|credential|identidade/.test(text)) return "Phishing & Identidade";
  if (/apt|espionagem|nation.?state|state.?sponsored/.test(text)) return "APT & Espionagem";
  if (/malware|trojan|backdoor|rat/.test(text)) return "Malware";
  if (/botnet|c2|command.?and.?control/.test(text)) return "Infraestrutura Maliciosa";
  if (/supply.?chain/.test(text)) return "Supply Chain";
  if (/ddos|denial.?of.?service/.test(text)) return "DDoS";

  return "Inteligência de Ameaças";
}
