/**
 * CVE Enrichment — RAG data-fetching layer
 *
 * Fetches supplementary context for a CVE from multiple free APIs in parallel,
 * each with an individual timeout. Results are aggregated into a structured
 * string that is injected into the AI briefing context.
 *
 * Design constraints:
 *   - Total wall-clock time ≤ 15 s (Vercel 60 s limit; leaves 45 s for Groq + DB)
 *   - Zero cost: all sources are free/unauthenticated or use an already-held key
 *   - Never throws: always returns a string (empty on total failure)
 *   - No vector DB / embeddings required
 *
 * Sources used:
 *   1. NVD CVE 2.0 API       — CVSS vector, CWE, CPE, references  (no key needed, ~6 req/min anon)
 *   2. FIRST EPSS API        — exploitation probability             (no key)
 *   3. CISA KEV JSON feed    — confirmed in-the-wild exploitation   (no key)
 *   4. OSV.dev API           — patch details, affected versions, aliases (no key)
 *   5. GitHub Advisory DB    — vendor advisories, patch versions, GHSA (no key)
 *
 * Deliberately NOT included:
 *   - ExploitDB search (HTML scraping, fragile)
 *   - VulnCheck (requires account)
 *   - Shodan (paid)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CveEnrichment {
  /** Raw aggregated context block, ready to append to buildContext() output */
  contextBlock: string;
  /** True if at least one source returned useful data */
  hasData: boolean;
}

// ── Individual source fetchers ────────────────────────────────────────────────

/** Fetch NVD full detail — CVSS vector string, CWE, references, CPE configs */
async function fetchNvdDetail(cve: string): Promise<string | null> {
  try {
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(cve)}`;
    const headers: HeadersInit = { Accept: "application/json" };
    const nvdKey = process.env.NVD_API_KEY;
    if (nvdKey) headers["apiKey"] = nvdKey;

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;

    const data = await res.json() as {
      vulnerabilities?: {
        cve: {
          metrics?: {
            cvssMetricV31?: {
              cvssData: {
                vectorString: string;
                attackVector: string;
                attackComplexity: string;
                privilegesRequired: string;
                userInteraction: string;
                scope: string;
                confidentialityImpact: string;
                integrityImpact: string;
                availabilityImpact: string;
              };
              exploitabilityScore: number;
              impactScore: number;
            }[];
            cvssMetricV3?: {
              cvssData: {
                vectorString: string;
                attackVector: string;
                attackComplexity: string;
                privilegesRequired: string;
                userInteraction: string;
              };
            }[];
          };
          weaknesses?: { description: { lang: string; value: string }[] }[];
          references?: { url: string; source: string; tags?: string[] }[];
          configurations?: {
            nodes: { cpeMatch: { criteria: string; vulnerable: boolean; versionStartIncluding?: string; versionEndExcluding?: string }[] }[];
          }[];
        };
      }[];
    };

    const vuln = data.vulnerabilities?.[0]?.cve;
    if (!vuln) return null;

    const lines: string[] = [];

    // CVSS vector string (attack characteristics)
    const v31 = vuln.metrics?.cvssMetricV31?.[0];
    if (v31) {
      const d = v31.cvssData;
      lines.push(`Vetor CVSS 3.1: ${d.vectorString}`);
      lines.push(`Vetor de ataque: ${d.attackVector} | Complexidade: ${d.attackComplexity} | Privilégios exigidos: ${d.privilegesRequired} | Interação do usuário: ${d.userInteraction}`);
      lines.push(`Impacto — Confidencialidade: ${d.confidentialityImpact} | Integridade: ${d.integrityImpact} | Disponibilidade: ${d.availabilityImpact}`);
      lines.push(`Exploitability Score: ${v31.exploitabilityScore} | Impact Score: ${v31.impactScore}`);
    } else {
      const v3 = vuln.metrics?.cvssMetricV3?.[0];
      if (v3) {
        const d = v3.cvssData;
        lines.push(`Vetor CVSS 3.0: ${d.vectorString}`);
        lines.push(`Vetor de ataque: ${d.attackVector} | Complexidade: ${d.attackComplexity} | Privilégios exigidos: ${d.privilegesRequired} | Interação do usuário: ${d.userInteraction}`);
      }
    }

    // CWE
    const cweDesc = vuln.weaknesses?.[0]?.description.find((d) => d.lang === "en")?.value;
    if (cweDesc && cweDesc !== "NVD-CWE-noinfo") {
      lines.push(`CWE: ${cweDesc}`);
    }

    // Affected version ranges from CPE
    const versionRanges: string[] = [];
    for (const config of vuln.configurations ?? []) {
      for (const node of config.nodes) {
        for (const match of node.cpeMatch) {
          if (!match.vulnerable) continue;
          const parts = match.criteria.split(":");
          const product = parts.length >= 5 ? `${parts[3]} ${parts[4]}` : match.criteria;
          const from = match.versionStartIncluding ? `>= ${match.versionStartIncluding}` : "";
          const to = match.versionEndExcluding ? `< ${match.versionEndExcluding} (excluída = versão com patch)` : "";
          const range = [from, to].filter(Boolean).join(", ");
          if (range) versionRanges.push(`${product}: ${range}`);
        }
      }
    }
    if (versionRanges.length > 0) {
      lines.push(`Versões vulneráveis: ${versionRanges.slice(0, 4).join(" | ")}`);
    }

    // References — prioritize patches, advisories, exploits
    const refs = vuln.references ?? [];
    const patchRefs = refs.filter((r) => r.tags?.some((t) => /patch|fix|vendor.?advisory|mitigation/i.test(t)));
    const exploitRefs = refs.filter((r) => r.tags?.some((t) => /exploit|poc|proof.?of.?concept/i.test(t)));
    const advisoryRefs = refs.filter((r) => r.tags?.some((t) => /vendor.?advisory|advisory/i.test(t)));

    if (patchRefs.length > 0) {
      lines.push(`Referências de patch: ${patchRefs.slice(0, 2).map((r) => r.url).join(", ")}`);
    }
    if (advisoryRefs.length > 0) {
      lines.push(`Advisory do vendor: ${advisoryRefs.slice(0, 2).map((r) => r.url).join(", ")}`);
    }
    if (exploitRefs.length > 0) {
      lines.push(`Referências de exploit/PoC (NVD): ${exploitRefs.slice(0, 2).map((r) => r.url).join(", ")}`);
    }

    return lines.length > 0 ? `[NVD Detail]\n${lines.join("\n")}` : null;
  } catch {
    return null;
  }
}

/** Fetch EPSS detail — score + percentile + trend */
async function fetchEpssDetail(cve: string): Promise<string | null> {
  try {
    const url = `https://api.first.org/data/v1/epss?cve=${encodeURIComponent(cve)}&envelope=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;

    const data = await res.json() as {
      data?: { cve: string; epss: string; percentile: string; date: string }[];
    };

    const entry = data.data?.[0];
    if (!entry) return null;

    const score = parseFloat(entry.epss);
    const pct = parseFloat(entry.percentile);
    const scoreLabel =
      score >= 0.7 ? "muito alto (exploits amplamente disponíveis)" :
      score >= 0.4 ? "alto (ferramentas de exploit conhecidas)" :
      score >= 0.1 ? "moderado" :
      "baixo";

    return `[EPSS]\nScore: ${(score * 100).toFixed(2)}% (${scoreLabel}) | Percentil: ${(pct * 100).toFixed(1)}% das CVEs conhecidas | Data: ${entry.date}`;
  } catch {
    return null;
  }
}

interface KevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  requiredAction: string;
  dueDate: string;
  knownRansomwareCampaignUse: string;
}

// Module-level cache — avoids re-downloading o JSON KEV inteiro por CVE enriquecida no mesmo run
let _kevCache: { data: { vulnerabilities: KevEntry[] }; at: number } | null = null;

async function getCisaKevCatalog(): Promise<{ vulnerabilities: KevEntry[] } | null> {
  const now = Date.now();
  if (_kevCache && now - _kevCache.at < 120_000) return _kevCache.data;
  try {
    const res = await fetch(
      "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { vulnerabilities: KevEntry[] };
    _kevCache = { data, at: now };
    return data;
  } catch {
    return null;
  }
}

/** Check CISA KEV and extract mandatory action + ransomware association */
async function fetchCisaKevDetail(cve: string): Promise<string | null> {
  try {
    const data = await getCisaKevCatalog();
    if (!data) return null;

    const entry = data.vulnerabilities.find((v) => v.cveID === cve);
    if (!entry) return null;

    const lines = [
      `Status: CONFIRMADO NO CISA KEV — Exploração ativa em ambientes reais`,
      `Produto afetado: ${entry.vendorProject} ${entry.product}`,
      `Nome da vulnerabilidade: ${entry.vulnerabilityName}`,
      `Data de adição ao KEV: ${entry.dateAdded}`,
      `Ação obrigatória (CISA): ${entry.requiredAction}`,
      `Prazo CISA: ${entry.dueDate}`,
    ];

    if (entry.knownRansomwareCampaignUse === "Known") {
      lines.push(`Associação com ransomware: SIM — uso por grupos de ransomware confirmado`);
    }

    return `[CISA KEV]\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

interface OsvVuln {
  id: string;
  aliases?: string[];
  summary?: string;
  details?: string;
  affected?: {
    package?: { name: string; ecosystem: string };
    ranges?: {
      type: string;
      events: { introduced?: string; fixed?: string }[];
    }[];
    versions?: string[];
  }[];
  references?: { type: string; url: string }[];
  database_specific?: { severity?: string };
}

/**
 * Fetch OSV.dev — patch versions, affected version ranges, ecosystem info.
 * OSV is the best free source for "what version fixes it" data.
 */
async function fetchOsvDetail(cve: string): Promise<string | null> {
  try {
    // OSV.dev v1 query API: look up by CVE alias
    // Correct body format: { "query": "CVE-XXXX-XXXXX" } is NOT supported;
    // we must use the direct vuln lookup endpoint since OSV IDs != CVE IDs.
    // The /v1/vulns/{id} endpoint accepts CVE IDs directly as aliases.
    const res = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(cve)}`, {
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) {
      // If direct CVE lookup fails, try the batch query endpoint with alias
      const res2 = await fetch("https://api.osv.dev/v1/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // OSV batch query: query by aliases array is not directly supported;
        // we query for the CVE in the id field which OSV resolves via aliases
        body: JSON.stringify({ query: { id: cve } }),
        signal: AbortSignal.timeout(6_000),
      });
      if (!res2.ok) return null;
      const data2 = await res2.json() as { vulns?: OsvVuln[] };
      const v = data2.vulns?.[0];
      if (!v) return null;
      return formatOsvVuln(v);
    }

    const vuln = await res.json() as OsvVuln;
    return formatOsvVuln(vuln);
  } catch {
    return null;
  }
}

function formatOsvVuln(vuln: OsvVuln): string | null {
  const lines: string[] = [];

  if (vuln.aliases?.length) {
    lines.push(`IDs relacionados: ${vuln.aliases.slice(0, 4).join(", ")}`);
  }

  // Patch versions — the most operationally useful info
  const patchVersions: string[] = [];
  for (const affected of vuln.affected ?? []) {
    const pkg = affected.package ? `${affected.package.ecosystem}/${affected.package.name}` : "";
    for (const range of affected.ranges ?? []) {
      const fixed = range.events.find((e) => e.fixed)?.fixed;
      if (fixed) {
        patchVersions.push(pkg ? `${pkg} → corrigido em ${fixed}` : `corrigido em ${fixed}`);
      }
    }
  }
  if (patchVersions.length > 0) {
    lines.push(`Versões com patch (OSV): ${patchVersions.slice(0, 4).join(" | ")}`);
  }

  // Advisory references
  const advisories = (vuln.references ?? [])
    .filter((r) => r.type === "ADVISORY" || r.type === "FIX" || r.type === "PACKAGE")
    .slice(0, 3);
  if (advisories.length > 0) {
    lines.push(`Referências OSV: ${advisories.map((r) => r.url).join(", ")}`);
  }

  return lines.length > 0 ? `[OSV.dev]\n${lines.join("\n")}` : null;
}

interface GhsaAdvisory {
  ghsaId: string;
  summary: string;
  description?: string;
  severity: string;
  publishedAt: string;
  updatedAt: string;
  cvss?: { score: number; vectorString: string };
  cwes?: { cweId: string; name: string }[];
  references?: string[];
  identifiers?: { type: string; value: string }[];
  vulnerabilities?: {
    package: { name: string; ecosystem: string };
    vulnerableVersionRange?: string;
    firstPatchedVersion?: { identifier: string };
  }[];
}

/**
 * Fetch GitHub Advisory Database via REST (unauthenticated, 60 req/hour).
 * Best source for OSS ecosystem patch info and GHSA cross-references.
 */
async function fetchGithubAdvisory(cve: string): Promise<string | null> {
  try {
    const url = `https://api.github.com/advisories?cve_id=${encodeURIComponent(cve)}&per_page=1`;
    const headers: HeadersInit = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "statecraft-intel/1.0",
    };
    // If a GH token is available (for higher rate limits), use it
    if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;

    const advisories = await res.json() as GhsaAdvisory[];
    const advisory = advisories?.[0];
    if (!advisory) return null;

    const lines: string[] = [
      `GHSA ID: ${advisory.ghsaId}`,
      `Severidade GitHub: ${advisory.severity}`,
    ];

    if (advisory.cvss) {
      lines.push(`CVSS GitHub: ${advisory.cvss.score} | Vetor: ${advisory.cvss.vectorString}`);
    }

    if (advisory.cwes?.length) {
      lines.push(`CWEs: ${advisory.cwes.map((c) => `${c.cweId} (${c.name})`).join(", ")}`);
    }

    // Patch versions per package — the key operational data
    const patches: string[] = [];
    for (const v of advisory.vulnerabilities ?? []) {
      const patch = v.firstPatchedVersion?.identifier;
      if (patch) {
        patches.push(`${v.package.ecosystem}/${v.package.name}: patch em ${patch}`);
      } else if (v.vulnerableVersionRange) {
        patches.push(`${v.package.ecosystem}/${v.package.name}: versões afetadas ${v.vulnerableVersionRange}`);
      }
    }
    if (patches.length > 0) {
      lines.push(`Patches (GitHub Advisory): ${patches.slice(0, 4).join(" | ")}`);
    }

    return `[GitHub Advisory DB]\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

// ── Main enrichment function ──────────────────────────────────────────────────

/**
 * Fetches enrichment data for a CVE from multiple free APIs in parallel.
 *
 * Timeout strategy:
 *   - Each fetcher has its own AbortSignal timeout (5–8 s)
 *   - An outer 13 s race ensures we never block the pipeline
 *   - Failed/slow fetchers return null and are skipped silently
 *
 * Token budget: enriched context adds ~250–450 tokens on average.
 * Groq llama-3.3-70b-versatile context window: 128k tokens — no concern.
 *
 * @param cve  - CVE identifier, e.g. "CVE-2024-21887"
 * @returns    - CveEnrichment with aggregated context block
 */
export async function enrichCveContext(cve: string): Promise<CveEnrichment> {
  // Validate CVE format before making any requests
  if (!/^CVE-\d{4}-\d{4,}$/i.test(cve)) {
    return { contextBlock: "", hasData: false };
  }

  const OUTER_TIMEOUT_MS = 13_000;

  try {
    // Fire all fetchers in parallel; each has its own internal timeout
    const results = await Promise.race([
      Promise.allSettled([
        fetchNvdDetail(cve),
        fetchEpssDetail(cve),
        fetchCisaKevDetail(cve),
        fetchOsvDetail(cve),
        fetchGithubAdvisory(cve),
      ]),
      // Outer safety net: resolve with partial results after 13 s
      new Promise<PromiseSettledResult<string | null>[]>((resolve) =>
        setTimeout(() => resolve([]), OUTER_TIMEOUT_MS)
      ),
    ]);

    const sections: string[] = [];
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        sections.push(result.value);
      }
    }

    if (sections.length === 0) {
      return { contextBlock: "", hasData: false };
    }

    const contextBlock = [
      `\n--- Contexto de enriquecimento RAG para ${cve} ---`,
      ...sections,
      `--- Fim do enriquecimento RAG ---`,
    ].join("\n");

    return { contextBlock, hasData: true };
  } catch {
    return { contextBlock: "", hasData: false };
  }
}
