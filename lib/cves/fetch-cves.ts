export type VulnType =
  | "Execução de Código"
  | "Injeção"
  | "Estouro de Buffer"
  | "Autenticação"
  | "Exposição de Dados"
  | "Travessia de Caminho"
  | "Negação de Serviço"
  | "Escalada de Privilégio"
  | "Criptografia"
  | "Outro";

const CWE_MAP: Record<string, { type: VulnType; explanation: string }> = {
  "CWE-94":  { type: "Execução de Código",    explanation: "Permite ao atacante executar comandos arbitrários no sistema alvo." },
  "CWE-77":  { type: "Execução de Código",    explanation: "Comandos enviados pelo atacante são executados diretamente pelo sistema." },
  "CWE-78":  { type: "Execução de Código",    explanation: "Dados externos são usados para executar comandos do sistema operacional." },
  "CWE-502": { type: "Execução de Código",    explanation: "Dados maliciosos desserializados disparam execução de código no servidor." },
  "CWE-89":  { type: "Injeção",               explanation: "Comandos SQL inseridos pelo atacante manipulam o banco de dados." },
  "CWE-79":  { type: "Injeção",               explanation: "Scripts maliciosos são injetados em páginas web e executados no navegador de outras pessoas." },
  "CWE-611": { type: "Injeção",               explanation: "Arquivos XML maliciosos acessam dados internos do servidor." },
  "CWE-918": { type: "Injeção",               explanation: "O servidor é manipulado para fazer requisições a sistemas internos da rede." },
  "CWE-787": { type: "Estouro de Buffer",     explanation: "Gravação além dos limites de memória pode causar execução de código ou travamento." },
  "CWE-125": { type: "Estouro de Buffer",     explanation: "Leitura além dos limites de memória pode vazar dados sensíveis." },
  "CWE-119": { type: "Estouro de Buffer",     explanation: "Operações de memória sem verificação de limites permitem corrupção de dados." },
  "CWE-416": { type: "Estouro de Buffer",     explanation: "Uso de memória após liberação pode permitir execução de código arbitrário." },
  "CWE-190": { type: "Estouro de Buffer",     explanation: "Overflow em cálculos inteiros causa comportamento inesperado ou corrupção de memória." },
  "CWE-476": { type: "Estouro de Buffer",     explanation: "Referência a ponteiro nulo causa travamento do processo." },
  "CWE-287": { type: "Autenticação",          explanation: "Falha no mecanismo de autenticação permite acesso sem credenciais válidas." },
  "CWE-306": { type: "Autenticação",          explanation: "Funcionalidade crítica acessível sem qualquer autenticação." },
  "CWE-798": { type: "Autenticação",          explanation: "Credenciais fixas no código-fonte permitem acesso não autorizado." },
  "CWE-384": { type: "Autenticação",          explanation: "Sessões de autenticação podem ser sequestradas ou reutilizadas indevidamente." },
  "CWE-200": { type: "Exposição de Dados",    explanation: "Informações sensíveis expostas a partes não autorizadas através de respostas ou logs." },
  "CWE-312": { type: "Exposição de Dados",    explanation: "Dados sensíveis armazenados sem criptografia, acessíveis se o sistema for comprometido." },
  "CWE-319": { type: "Exposição de Dados",    explanation: "Dados transmitidos em texto claro, interceptáveis em trânsito." },
  "CWE-22":  { type: "Travessia de Caminho",  explanation: "O atacante acessa arquivos fora do diretório permitido, podendo ler dados do sistema." },
  "CWE-23":  { type: "Travessia de Caminho",  explanation: "Sequências como '../' permitem navegar para diretórios não autorizados." },
  "CWE-400": { type: "Negação de Serviço",    explanation: "Consumo excessivo de recursos torna o serviço indisponível para usuários legítimos." },
  "CWE-362": { type: "Negação de Serviço",    explanation: "Condição de corrida entre processos pode causar comportamento imprevisível ou travamento." },
  "CWE-20":  { type: "Negação de Serviço",    explanation: "Entrada não validada causa comportamento inesperado, travamento ou execução de código." },
  "CWE-269": { type: "Escalada de Privilégio", explanation: "Usuário com acesso limitado obtém permissões de administrador indevidamente." },
  "CWE-732": { type: "Escalada de Privilégio", explanation: "Permissões incorretas em arquivos ou recursos permitem acesso não autorizado." },
  "CWE-434": { type: "Escalada de Privilégio", explanation: "Upload de arquivos maliciosos sem validação pode resultar em execução remota de código." },
  "CWE-327": { type: "Criptografia",          explanation: "Algoritmo criptográfico fraco ou obsoleto pode ser quebrado por atacantes." },
  "CWE-326": { type: "Criptografia",          explanation: "Chave criptográfica insuficientemente curta é vulnerável a ataques de força bruta." },
  "CWE-295": { type: "Criptografia",          explanation: "Certificados TLS não validados corretamente permitem ataques de intermediário." },
};

export interface CveEntry {
  id: string;
  published: string;
  lastModified: string;
  description: string;
  cvssScore: number | null;
  cvssVersion: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | null;
  epss: number | null;
  epssPercentile: number | null;
  inCisaKev: boolean;
  affectedProducts: string[];
  nvdUrl: string;
  vulnType: VulnType;
  cweId: string;
  vulnExplanation: string;
}

interface NvdVuln {
  cve: {
    id: string;
    published: string;
    lastModified: string;
    vulnStatus: string;
    descriptions: { lang: string; value: string }[];
    metrics?: {
      cvssMetricV31?: { cvssData: { baseScore: number; baseSeverity: string }; type: string }[];
      cvssMetricV3?:  { cvssData: { baseScore: number; baseSeverity: string }; type: string }[];
      cvssMetricV2?:  { cvssData: { baseScore: number }; baseSeverity: string }[];
    };
    configurations?: { nodes: { cpeMatch: { criteria: string; vulnerable: boolean }[] }[] }[];
    weaknesses?: { type: string; description: { lang: string; value: string }[] }[];
  };
}

function extractVulnType(cve: NvdVuln["cve"]): { vulnType: VulnType; cweId: string; vulnExplanation: string } {
  const weaknesses = cve.weaknesses ?? [];
  const primary = weaknesses.find((w) => w.type === "Primary") ?? weaknesses[0];
  const cweId = primary?.description.find((d) => d.lang === "en")?.value ?? "";
  const mapped = CWE_MAP[cweId];
  return {
    cweId,
    vulnType: mapped?.type ?? "Outro",
    vulnExplanation: mapped?.explanation ?? "Vulnerabilidade sem classificação detalhada disponível.",
  };
}

function extractCvss(cve: NvdVuln["cve"]): { score: number | null; severity: CveEntry["severity"]; version: string } {
  const v31 = cve.metrics?.cvssMetricV31?.find((m) => m.type === "Primary") ?? cve.metrics?.cvssMetricV31?.[0];
  if (v31) return { score: v31.cvssData.baseScore, severity: v31.cvssData.baseSeverity as CveEntry["severity"], version: "3.1" };
  const v3 = cve.metrics?.cvssMetricV3?.find((m) => m.type === "Primary") ?? cve.metrics?.cvssMetricV3?.[0];
  if (v3)  return { score: v3.cvssData.baseScore,  severity: v3.cvssData.baseSeverity  as CveEntry["severity"], version: "3.0" };
  const v2 = cve.metrics?.cvssMetricV2?.[0];
  if (v2)  return { score: v2.cvssData.baseScore,  severity: v2.baseSeverity as CveEntry["severity"], version: "2.0" };
  return { score: null, severity: null, version: "" };
}

function extractProducts(cve: NvdVuln["cve"]): string[] {
  const set = new Set<string>();
  for (const conf of cve.configurations ?? [])
    for (const node of conf.nodes)
      for (const m of node.cpeMatch)
        if (m.vulnerable) {
          const p = m.criteria.split(":");
          if (p.length >= 5) set.add(`${p[3]} ${p[4]}`);
        }
  return [...set].slice(0, 4);
}

async function fetchNvd(days: number): Promise<NvdVuln[]> {
  const apiKey = process.env.NVD_API_KEY;
  const headers: HeadersInit = { Accept: "application/json" };
  if (apiKey) headers["apiKey"] = apiKey;

  const start = new Date(Date.now() - days * 86_400_000);
  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, ".000");

  const url = new URL("https://services.nvd.nist.gov/rest/json/cves/2.0");
  url.searchParams.set("pubStartDate", fmt(start));
  url.searchParams.set("pubEndDate", fmt(new Date()));
  url.searchParams.set("resultsPerPage", "100");

  const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`NVD ${res.status}`);
  const data = await res.json() as { vulnerabilities: NvdVuln[] };
  return data.vulnerabilities ?? [];
}

async function fetchKevIds(): Promise<Set<string>> {
  try {
    const res = await fetch("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return new Set();
    const data = await res.json() as { vulnerabilities: { cveID: string }[] };
    return new Set(data.vulnerabilities.map((v) => v.cveID));
  } catch {
    return new Set();
  }
}

async function fetchEpss(cveIds: string[]): Promise<Record<string, { score: number; percentile: number }>> {
  if (!cveIds.length) return {};
  try {
    const url = new URL("https://api.first.org/data/v1/epss");
    url.searchParams.set("cve", cveIds.slice(0, 100).join(","));
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return {};
    const data = await res.json() as { data: { cve: string; epss: string; percentile: string }[] };
    return Object.fromEntries(
      data.data.map((e) => [e.cve, { score: parseFloat(e.epss), percentile: parseFloat(e.percentile) }])
    );
  } catch {
    return {};
  }
}

export async function fetchCves(): Promise<{ cves: CveEntry[]; total: number; updatedAt: string }> {
  const [vulns, kevIds] = await Promise.all([fetchNvd(7), fetchKevIds()]);

  const filtered = vulns.filter((v) => {
    if (v.cve.vulnStatus === "Rejected") return false;
    const { severity } = extractCvss(v.cve);
    return severity === "CRITICAL" || severity === "HIGH" || severity === "MEDIUM";
  });

  const cveIds = filtered.map((v) => v.cve.id);
  const epssMap = await fetchEpss(cveIds);

  const entries: CveEntry[] = filtered.map((v) => {
    const { score, severity, version } = extractCvss(v.cve);
    const epss = epssMap[v.cve.id];
    const desc = v.cve.descriptions.find((d) => d.lang === "en")?.value ?? "";
    return {
      id: v.cve.id,
      published: v.cve.published,
      lastModified: v.cve.lastModified,
      description: desc,
      cvssScore: score,
      cvssVersion: version,
      severity,
      epss: epss?.score ?? null,
      epssPercentile: epss?.percentile ?? null,
      inCisaKev: kevIds.has(v.cve.id),
      affectedProducts: extractProducts(v.cve),
      nvdUrl: `https://nvd.nist.gov/vuln/detail/${v.cve.id}`,
      ...extractVulnType(v.cve),
    };
  });

  entries.sort((a, b) => {
    if (a.inCisaKev !== b.inCisaKev) return a.inCisaKev ? -1 : 1;
    const sevOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, null: 4 };
    const sd = (sevOrder[a.severity ?? "null"] ?? 4) - (sevOrder[b.severity ?? "null"] ?? 4);
    if (sd !== 0) return sd;
    return (b.cvssScore ?? 0) - (a.cvssScore ?? 0);
  });

  return { cves: entries, total: entries.length, updatedAt: new Date().toISOString() };
}
