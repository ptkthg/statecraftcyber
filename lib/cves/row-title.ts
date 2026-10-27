import type { CveEntry } from "./fetch-cves";

// Recent CVEs can have a description before NVD adds CPE configurations.
// Keep that source text useful without presenting inferred names as products.
export function getCveRowTitle(cve: Pick<CveEntry, "id" | "affectedProducts" | "description" | "ptBrDescription">): string {
  const products = cve.affectedProducts
    .map((value) => value.replaceAll("_", " ").trim())
    .filter(Boolean);
  if (products.length) return products.slice(0, 2).join(" · ");
  return cve.ptBrDescription?.trim() || cve.description.trim() || cve.id;
}