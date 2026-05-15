import type { SourceAdapter, RawThreatItem } from "./types";

const CISA_KEV_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

interface KevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  dueDate: string;
  knownRansomwareCampaignUse: string;
}

interface KevResponse {
  vulnerabilities: KevEntry[];
}

export const cisaKevAdapter: SourceAdapter = {
  name: "CISA KEV",

  async fetch(): Promise<RawThreatItem[]> {
    const res = await fetch(CISA_KEV_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`CISA KEV retornou ${res.status}`);

    const data: KevResponse = await res.json();

    // Pegar apenas as 20 mais recentes (já vêm em ordem crescente)
    const recent = data.vulnerabilities.slice(-20);

    return recent.map((entry): RawThreatItem => ({
      externalId: entry.cveID,
      title: `${entry.cveID}: Exploração Ativa em ${entry.vulnerabilityName}`,
      description: `${entry.shortDescription} Ação requerida pela CISA: ${entry.requiredAction}`,
      sourceUrl: `https://nvd.nist.gov/vuln/detail/${entry.cveID}`,
      sourceName: "CISA KEV",
      publishedAt: new Date(entry.dateAdded),
      cves: [entry.cveID],
      iocs: [],
      mitreTechniques: [],
      tags: [
        "cisa-kev",
        "exploração-ativa",
        entry.vendorProject.toLowerCase().replace(/\s+/g, "-"),
        ...(entry.knownRansomwareCampaignUse === "Known"
          ? ["ransomware"]
          : []),
      ],
      affectedProducts: [`${entry.vendorProject} ${entry.product}`],
      affectedSectors: inferSectors(entry.vendorProject, entry.product),
      affectedRegions: ["Global"],
      severity: "critical",
      inCisaKev: true,
      exploitedInWild: true,
    }));
  },
};

function inferSectors(vendor: string, product: string): string[] {
  const combined = `${vendor} ${product}`.toLowerCase();
  const sectors: string[] = [];
  if (/cisco|fortinet|palo|sonicwall|juniper|netgear/.test(combined))
    sectors.push("Infraestrutura de Rede");
  if (/vmware|microsoft|oracle|sap/.test(combined))
    sectors.push("Corporativo");
  if (/ivanti|citrix|pulse|vpn/.test(combined))
    sectors.push("Acesso Remoto");
  if (/exchange|sharepoint|outlook/.test(combined))
    sectors.push("Colaboração Empresarial");
  if (sectors.length === 0) sectors.push("Geral");
  return sectors;
}
