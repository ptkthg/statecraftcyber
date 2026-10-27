import catalog from "../../data/mitre-enterprise.json";
import type { EvidenceSource, TechniqueEvidence, ValidatedTechnique, ValidationIssue } from "./types";
type Technique = { name: string; url: string; revoked: boolean; deprecated: boolean };
export const ATTACK_CATALOG = catalog;
export function getTechnique(id: string): Technique | null {
  if (!/^T\d{4}(?:\.\d{3})?$/.test(id)) return null;
  const technique = (catalog.techniques as Record<string, Technique>)[id];
  return technique && !technique.revoked && !technique.deprecated ? technique : null;
}
export function validateTechnique(mapping: TechniqueEvidence, sources: EvidenceSource[]): { technique?: ValidatedTechnique; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const reject = (code: string, message: string) => issues.push({code, field: "mitreTechniques", message});
  const official = getTechnique(mapping.id);
  if (!official) reject("mitre.invalid", "ID inexistente, revogado, descontinuado ou fora do catálogo Enterprise.");
  if (official && mapping.name && mapping.name !== official.name) reject("mitre.name_mismatch", "Nome incompatível com o ID oficial.");
  const source = sources.find(s => s.id === mapping.sourceId && s.origin === "original");
  if (!source || !mapping.quote?.trim() || !source.text.includes(mapping.quote)) reject("mitre.unsupported", "Associação sem trecho verificável da fonte.");
  if (!["observed", "reported", "inferred"].includes(mapping.kind)) reject("mitre.kind", "Tipo de evidência inválido.");
  if (mapping.kind !== "inferred" && !new RegExp("\\b" + mapping.id.replace(".", "\\.") + "(?![\\d.])").test(mapping.quote ?? "")) reject("mitre.not_reported", "A fonte não associa explicitamente este ID ao evento; a associação é apenas inferida.");
  if (mapping.kind !== "inferred" && !source?.techniqueAssertions?.some(a => a.id === mapping.id && a.kind === mapping.kind && a.quote === mapping.quote)) reject("mitre.association_unverified", "Uma menção textual não comprova aplicação ao evento; exige associação estruturada capturada da fonte ou revisão semântica.");
  if (mapping.kind === "observed" && !source?.telemetry) reject("mitre.not_observed", "Relato externo não constitui observação própria.");
  if (issues.length || !official) return { issues };
  return { issues, technique: { ...mapping, name: official.name, url: official.url, catalogCommit: catalog.commit } };
}