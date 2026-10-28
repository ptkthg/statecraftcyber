export interface AffectedProduct {
  vendor: string;
  product: string;
  cpe: string;
  version: string | null;
  startIncluding?: string;
  startExcluding?: string;
  endIncluding?: string;
  endExcluding?: string;
  configuration: string;
  sourceUrl: string;
}
export interface CveReference {
  url: string;
  tags: string[];
  source?: string;
}
export interface FixedVersion {
  package: string;
  ecosystem: string;
  version: string;
  rangeType: string;
  sourceUrl: string;
}
export interface CveSourceMetadata {
  version: "phase3-v1";
  nvd: {
    url: string;
    retrievedAt: string;
    vector: string | null;
    metricSource: string | null;
    status: string | null;
  };
  products: AffectedProduct[];
  references: CveReference[];
  epss: { url: string; date: string | null; retrievedAt: string | null };
  kev: {
    status: boolean | null;
    checkedAt: string | null;
    url: string;
    dateAdded?: string;
    requiredAction?: string;
    dueDate?: string;
    notes?: string;
  };
  fixedVersions: FixedVersion[];
  remediationCheckedAt?: string;
  warnings: string[];
}
export interface PriorityInput {
  cvssScore: number | null;
  epss: number | null;
  inCisaKev: boolean;
  sourceMetadata?: CveSourceMetadata | null;
}
export function operationalPriority(cve: PriorityInput) {
  if (cve.sourceMetadata?.nvd.status === "Rejected")
    return {
      rank: 4,
      label: "Registro rejeitado",
      reason:
        "Registro rejeitado pela fonte; não tratar como vulnerabilidade confirmada.",
      missing: [] as string[],
    };
  const score =
    cve.cvssScore !== null &&
    Number.isFinite(cve.cvssScore) &&
    cve.cvssScore >= 0 &&
    cve.cvssScore <= 10
      ? cve.cvssScore
      : null;
  const epss =
    cve.epss !== null &&
    Number.isFinite(cve.epss) &&
    cve.epss >= 0 &&
    cve.epss <= 1
      ? cve.epss
      : null;
  const exploit =
    cve.sourceMetadata?.references.some((r) => r.tags.includes("Exploit")) ??
    false;
  const missing = [
    ...(score === null ? ["CVSS"] : []),
    ...(epss === null ? ["EPSS"] : []),
    ...(!cve.sourceMetadata?.epss.date && epss !== null
      ? ["data do EPSS"]
      : []),
    ...(cve.sourceMetadata?.kev.status == null
      ? ["consulta atual ao KEV"]
      : []),
  ];
  if (cve.inCisaKev)
    return {
      rank: 0,
      label: "P1 · Avaliação imediata",
      reason:
        "Presença reportada no CISA KEV. Confirmar exposição e aplicar o plano de resposta.",
      missing,
    };
  if (exploit)
    return {
      rank: 1,
      label: "P2 · Avaliação prioritária",
      reason:
        "Referência de exploit catalogada no NVD; não comprova exploração ativa no seu ambiente.",
      missing,
    };
  if (score !== null && score >= 9 && epss !== null && epss >= 0.1)
    return {
      rank: 1,
      label: "P2 · Avaliação prioritária",
      reason:
        "CVSS ≥ 9 e EPSS ≥ 10%, sem confirmação de exploração por esses sinais.",
      missing,
    };
  if ((score !== null && score >= 7) || (epss !== null && epss >= 0.1))
    return {
      rank: 2,
      label: "P3 · Planejar avaliação",
      reason:
        "CVSS ≥ 7 ou EPSS ≥ 10%. Avaliar exposição, ativos e controles locais.",
      missing,
    };
  if (score === null && epss === null)
    return {
      rank: 4,
      label: "Dados insuficientes",
      reason: "Sem CVSS e EPSS aplicáveis para ordenar a avaliação técnica.",
      missing,
    };
  return {
    rank: 3,
    label: "P4 · Acompanhar",
    reason:
      "Sinais disponíveis abaixo dos limiares anteriores; ausência de sinal não demonstra segurança.",
    missing,
  };
}
export function metadataFrom(value: unknown): CveSourceMetadata | null {
  if (!value || typeof value !== "object") return null;
  const m = value as CveSourceMetadata;
  return m.version === "phase3-v1" &&
    Array.isArray(m.products) &&
    Array.isArray(m.references) &&
    m.nvd &&
    m.epss &&
    m.kev &&
    Array.isArray(m.fixedVersions) &&
    Array.isArray(m.warnings)
    ? m
    : null;
}
export function technicalSummary(cve: {
  ptBrDescription?: string | null;
  affectedProducts: string[];
  vulnType: string;
  cweId: string;
  cvssScore: number | null;
}) {
  if (cve.ptBrDescription)
    return cve.ptBrDescription.length <= 240
      ? cve.ptBrDescription
      : cve.ptBrDescription.slice(0, 237).trimEnd() + "…";
  const type =
    cve.vulnType === "Outro" ? "Tipo não classificado" : cve.vulnType;
  return `${type}${cve.cweId ? " (" + cve.cweId + ")" : ""}. ${
    cve.affectedProducts.length
      ? "Produtos reportados: " +
        cve.affectedProducts
          .slice(0, 2)
          .map((p) => p.replaceAll("_", " "))
          .join(", ") +
        "."
      : "Produtos não informados."
  } Resumo de metadados; consulte a descrição original.`;
}
export function versionRange(p: AffectedProduct) {
  const parts = [
    p.version && p.version !== "*" && p.version !== "-"
      ? "Versão " + p.version
      : null,
    p.startIncluding ? "≥ " + p.startIncluding : null,
    p.startExcluding ? "> " + p.startExcluding : null,
    p.endIncluding ? "≤ " + p.endIncluding : null,
    p.endExcluding ? "< " + p.endExcluding : null,
  ].filter(Boolean);
  return parts.join(" · ") || "Faixa não informada";
}
