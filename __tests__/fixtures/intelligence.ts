import type { StructuredBriefing } from "../../lib/types";
import type { RawThreatItem } from "../../lib/threat-sources/types";
// Synthetic test data, never an assertion about a real vulnerability.
export const NOW = new Date("2026-10-27T12:00:00Z");
export function groundedFixture() {
  const fields = {
    title: "CVE-2026-12345: Example Server denial of service report",
    executiveSummary: "O fornecedor reportou negação de serviço no Example Server.",
    whatHappened: "O processamento de requisições específicas encerra o processo afetado.",
    whyItMatters: "A interrupção do serviço limita o acesso aos recursos hospedados.",
    whoIsAtRisk: "Instalações do Example Server na versão descrita no aviso estão expostas.",
    technicalDetails: "A rotina de processamento não impõe limite ao tamanho da requisição.",
    falsePositiveNotes: "Atividades autorizadas de teste podem reproduzir estes eventos.",
  };
  const action = "Consulte a tabela de versões afetadas no aviso original do fornecedor.";
  const detection = "Correlacione os registros de falha do processo com os horários das requisições.";
  const item: RawThreatItem = {
    externalId: "fixture-001", title: fields.title,
    description: [...Object.values(fields).slice(1), action, detection].join("\n"),
    sourceName: "NVD", sourceUrl: "https://nvd.nist.gov/vuln/detail/CVE-2026-12345",
    publishedAt: new Date("2026-10-26T12:00:00Z"), cves: ["CVE-2026-12345"],
    cvssScore: 7.5, epssScore: 0.01, iocs: [], mitreTechniques: [],
  };
  const briefing: StructuredBriefing = {
    ...fields, identifiedIocs: [], relatedCves: [...item.cves!], mitreTechniques: [],
    recommendedActions: [action], detectionSuggestions: [detection],
    confidenceLevel: "medium", confidenceReason: "Será calculada pelo servidor.",
    sourceName: item.sourceName, sourceUrl: item.sourceUrl,
    claims: [...Object.keys(fields), "recommendedActions.0", "detectionSuggestions.0"].map(field => ({
      field, kind: "reported", sourceId: "source",
      quote: field === "recommendedActions.0" ? action : field === "detectionSuggestions.0" ? detection : fields[field as keyof typeof fields],
    })),
  };
  return { item, briefing };
}