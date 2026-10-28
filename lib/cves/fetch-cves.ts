import { type CveCache } from "@prisma/client";
import { nvdMetadata, type NvdRecord } from "./record";
import {
  metadataFrom,
  type CveSourceMetadata,
} from "./assessment";
import { fetchKevCatalog, fetchEpssDated } from "./sources";
import { selectNvdCvss } from "../intelligence/cvss";
import { safeCveEnrichment } from "../intelligence/cve-policy";
import {
  sourceDigest,
  validateTextFields,
} from "../intelligence/text-validation";
import Groq from "groq-sdk";

let _groq: Groq | null = null;
function getGroq(): Groq | null {
  if (!process.env.GROQ_API_KEY) return null;
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

const CVE_SYSTEM = `Você é um analista sênior de segurança cibernética da Statecraft. Escreva sempre em português brasileiro. Tom técnico, objetivo e didático. Nunca use travessões (— ou –). Sem emojis.`;

interface CveAiResult {
  id: string;
  ptBrDescription: string;
  mitigation: string;
  aiPriority: "Crítica" | "Alta" | "Média" | "Baixa";
}

async function enrichBatch(batch: CveEntry[]): Promise<CveAiResult[]> {
  const groq = getGroq();
  if (!groq || batch.length === 0) return [];

  const input = batch.map((c) => ({
    id: c.id,
    description: c.description.slice(0, 500),
    severity: c.severity,
    cvssScore: c.cvssScore,
    epss: c.epss ? Math.round(c.epss * 100 * 10) / 10 : null,
    inCisaKev: c.inCisaKev,
    vulnType: c.vulnType,
    cweId: c.cweId,
    affectedProducts: c.affectedProducts.slice(0, 3),
  }));

  const userPrompt = `Para cada vulnerabilidade abaixo, gere uma ficha técnica em português brasileiro.

- "ptBrDescription": Explicação didática em 3 a 5 frases. Explique o que é a falha, como funciona tecnicamente e em quais condições pode ser explorada. Linguagem técnica mas acessível para analistas, gestores e times de SecOps.
- "mitigation": Somente uma medida explicitamente descrita na fonte. Não deduza patch de limites de versão e não invente medidas de contorno. Sem suporte, deixe vazio.
- "aiPriority": Use exatamente um destes valores: "Crítica", "Alta", "Média" ou "Baixa". Considere CVSS, EPSS e presença no CISA KEV.

Responda APENAS com um objeto JSON válido:
{"cves": [{"id": "CVE-XXXX", "ptBrDescription": "...", "mitigation": "...", "aiPriority": "..."}]}

Vulnerabilidades:
${JSON.stringify(input)}`;

  try {
    const res = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
      response_format: { type: "json_object" },
      max_tokens: 4000,
      temperature: 0.2,
      messages: [
        { role: "system", content: CVE_SYSTEM },
        { role: "user", content: userPrompt },
      ],
    });
    const raw = JSON.parse(res.choices[0]?.message?.content ?? "{}") as {
      cves?: CveAiResult[];
    };
    return Array.isArray(raw.cves) ? raw.cves : [];
  } catch (err) {
    console.error("[CVE AI] Falha no batch:", (err as Error).message);
    return [];
  }
}

export async function enrichAndSave(entries: CveEntry[]): Promise<void> {
  try {
    const { prisma } = await import("../prisma");
    const attempted = await prisma.cveCache.findMany({
      where: { id: { in: entries.map((e) => e.id) } },
      select: { id: true, qualityReport: true },
    });
    const previous = new Map(
      attempted.map((row) => [
        row.id,
        row.qualityReport as { sourceDigest?: string } | null,
      ]),
    );
    const unenriched = entries.filter(
      (e) =>
        !e.ptBrDescription &&
        previous.get(e.id)?.sourceDigest !== sourceDigest(e.description),
    );
    if (unenriched.length === 0) return;

    const BATCH = 15;
    for (let i = 0; i < unenriched.length && i < 60; i += BATCH) {
      const batch = unenriched.slice(i, i + BATCH);
      const results = await enrichBatch(batch);
      for (const r of results) {
        const original = batch.find((entry) => entry.id === r.id);
        if (
          !original ||
          typeof r.ptBrDescription !== "string" ||
          typeof r.mitigation !== "string"
        )
          continue;
        const report = validateTextFields(original.description, {
          ptBrDescription: r.ptBrDescription,
          mitigation: r.mitigation,
        });
        await prisma.cveCache.updateMany({
          where: {
            id: r.id,
            description: original.description,
            lastModified: new Date(original.lastModified),
          },
          data: {
            ptBrDescription: report.publishable ? r.ptBrDescription : null,
            mitigation: report.publishable ? r.mitigation : null,
            aiPriority: null,
            qualityReport: JSON.parse(
              JSON.stringify({
                ...report,
                analysisStatus: report.publishable ? "validated" : "enriched",
                unpublishedCandidate: report.publishable ? undefined : r,
              }),
            ),
            analysisReady: report.publishable,
            enrichedAt: new Date(),
          },
        });
      }
    }
  } catch (err) {
    console.error(
      "[CVE AI] Falha ao salvar enriquecimento:",
      (err as Error).message,
    );
  }
}

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
  | "Validação de entrada"
  | "Concorrência"
  | "Outro";

const CWE_MAP: Record<string, { type: VulnType; explanation: string }> = {
  "CWE-94": {
    type: "Execução de Código",
    explanation:
      "Permite ao atacante executar comandos arbitrários no sistema alvo.",
  },
  "CWE-77": {
    type: "Execução de Código",
    explanation:
      "Comandos enviados pelo atacante são executados diretamente pelo sistema.",
  },
  "CWE-78": {
    type: "Execução de Código",
    explanation:
      "Dados externos são usados para executar comandos do sistema operacional.",
  },
  "CWE-502": {
    type: "Execução de Código",
    explanation:
      "Dados maliciosos desserializados disparam execução de código no servidor.",
  },
  "CWE-89": {
    type: "Injeção",
    explanation:
      "Comandos SQL inseridos pelo atacante manipulam o banco de dados.",
  },
  "CWE-79": {
    type: "Injeção",
    explanation:
      "Scripts maliciosos são injetados em páginas web e executados no navegador de outras pessoas.",
  },
  "CWE-611": {
    type: "Injeção",
    explanation: "Arquivos XML maliciosos acessam dados internos do servidor.",
  },
  "CWE-918": {
    type: "Injeção",
    explanation:
      "O servidor é manipulado para fazer requisições a sistemas internos da rede.",
  },
  "CWE-787": {
    type: "Estouro de Buffer",
    explanation:
      "Gravação além dos limites de memória pode causar execução de código ou travamento.",
  },
  "CWE-125": {
    type: "Estouro de Buffer",
    explanation:
      "Leitura além dos limites de memória pode vazar dados sensíveis.",
  },
  "CWE-119": {
    type: "Estouro de Buffer",
    explanation:
      "Operações de memória sem verificação de limites permitem corrupção de dados.",
  },
  "CWE-416": {
    type: "Estouro de Buffer",
    explanation:
      "Uso de memória após liberação pode permitir execução de código arbitrário.",
  },
  "CWE-190": {
    type: "Estouro de Buffer",
    explanation:
      "Overflow em cálculos inteiros causa comportamento inesperado ou corrupção de memória.",
  },
  "CWE-476": {
    type: "Estouro de Buffer",
    explanation: "Referência a ponteiro nulo causa travamento do processo.",
  },
  "CWE-287": {
    type: "Autenticação",
    explanation:
      "Falha no mecanismo de autenticação permite acesso sem credenciais válidas.",
  },
  "CWE-306": {
    type: "Autenticação",
    explanation: "Funcionalidade crítica acessível sem qualquer autenticação.",
  },
  "CWE-798": {
    type: "Autenticação",
    explanation:
      "Credenciais fixas no código-fonte permitem acesso não autorizado.",
  },
  "CWE-384": {
    type: "Autenticação",
    explanation:
      "Sessões de autenticação podem ser sequestradas ou reutilizadas indevidamente.",
  },
  "CWE-200": {
    type: "Exposição de Dados",
    explanation:
      "Informações sensíveis expostas a partes não autorizadas através de respostas ou logs.",
  },
  "CWE-312": {
    type: "Exposição de Dados",
    explanation:
      "Dados sensíveis armazenados sem criptografia, acessíveis se o sistema for comprometido.",
  },
  "CWE-319": {
    type: "Exposição de Dados",
    explanation:
      "Dados transmitidos em texto claro, interceptáveis em trânsito.",
  },
  "CWE-22": {
    type: "Travessia de Caminho",
    explanation:
      "O atacante acessa arquivos fora do diretório permitido, podendo ler dados do sistema.",
  },
  "CWE-23": {
    type: "Travessia de Caminho",
    explanation:
      "Sequências como '../' permitem navegar para diretórios não autorizados.",
  },
  "CWE-400": {
    type: "Negação de Serviço",
    explanation:
      "Consumo excessivo de recursos torna o serviço indisponível para usuários legítimos.",
  },
  "CWE-362": {
    type: "Concorrência",
    explanation:
      "Condição de corrida entre processos pode causar comportamento imprevisível ou travamento.",
  },
  "CWE-20": {
    type: "Validação de entrada",
    explanation:
      "Entrada não validada causa comportamento inesperado, travamento ou execução de código.",
  },
  "CWE-269": {
    type: "Escalada de Privilégio",
    explanation:
      "Usuário com acesso limitado obtém permissões de administrador indevidamente.",
  },
  "CWE-732": {
    type: "Escalada de Privilégio",
    explanation:
      "Permissões incorretas em arquivos ou recursos permitem acesso não autorizado.",
  },
  "CWE-434": {
    type: "Escalada de Privilégio",
    explanation:
      "Upload de arquivos maliciosos sem validação pode resultar em execução remota de código.",
  },
  "CWE-327": {
    type: "Criptografia",
    explanation:
      "Algoritmo criptográfico fraco ou obsoleto pode ser quebrado por atacantes.",
  },
  "CWE-326": {
    type: "Criptografia",
    explanation:
      "Chave criptográfica insuficientemente curta é vulnerável a ataques de força bruta.",
  },
  "CWE-295": {
    type: "Criptografia",
    explanation:
      "Certificados TLS não validados corretamente permitem ataques de intermediário.",
  },
};

export interface CveEntry {
  id: string;
  published: string;
  lastModified: string;
  description: string;
  cvssScore: number | null;
  cvssVersion: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE" | null;
  epss: number | null;
  epssPercentile: number | null;
  inCisaKev: boolean;
  affectedProducts: string[];
  nvdUrl: string;
  vulnType: VulnType;
  cweId: string;
  vulnExplanation: string;
  ptBrDescription?: string | null;
  mitigation?: string | null;
  aiPriority?: string | null;
  sourceMetadata?: CveSourceMetadata | null;
}

export type NvdVuln = { cve: NvdRecord };

export function extractVulnType(cve: NvdVuln["cve"]): {
  vulnType: VulnType;
  cweId: string;
  vulnExplanation: string;
} {
  const weaknesses = cve.weaknesses ?? [];
  const primary = weaknesses.find((w) => w.type === "Primary") ?? weaknesses[0];
  const cweId = primary?.description.find((d) => d.lang === "en")?.value ?? "";
  const mapped = CWE_MAP[cweId];
  return {
    cweId,
    vulnType: mapped?.type ?? "Outro",
    vulnExplanation:
      mapped?.explanation ??
      "Vulnerabilidade sem classificação detalhada disponível.",
  };
}

function extractCvss(cve: NvdVuln["cve"]): {
  score: number | null;
  severity: CveEntry["severity"];
  version: string;
} {
  const metric = selectNvdCvss(cve.metrics);
  return {
    score: metric.score,
    severity: metric.severity
      ? (metric.severity.toUpperCase() as CveEntry["severity"])
      : null,
    version: metric.version,
  };
}

export function fromNvd(cve: NvdRecord): CveEntry {
  const metric = extractCvss(cve),
    metadata = nvdMetadata(cve);
  return {
    id: cve.id,
    published: cve.published,
    lastModified: cve.lastModified,
    description:
      cve.descriptions?.find((d) => d.lang === "en")?.value ??
      cve.descriptions?.[0]?.value ??
      "",
    cvssScore: cve.vulnStatus === "Rejected" ? null : metric.score,
    cvssVersion: metric.version,
    severity: cve.vulnStatus === "Rejected" ? null : metric.severity,
    epss: null,
    epssPercentile: null,
    inCisaKev: false,
    affectedProducts: [
      ...new Set(metadata.products.map((p) => p.vendor + " " + p.product)),
    ],
    nvdUrl: metadata.nvd.url,
    ...extractVulnType(cve),
    sourceMetadata: metadata,
  };
}
export function fromStored(r: CveCache): CveEntry {
  return {
    id: r.id,
    published: r.published.toISOString(),
    lastModified: r.lastModified.toISOString(),
    description: r.description,
    cvssVersion: r.cvssVersion,
    inCisaKev: r.inCisaKev,
    affectedProducts: r.affectedProducts,
    nvdUrl: r.nvdUrl,
    ...extractVulnType({
      id: r.id,
      published: r.published.toISOString(),
      lastModified: r.lastModified.toISOString(),
      weaknesses: r.cweId
        ? [{ type: "Primary", description: [{ lang: "en", value: r.cweId }] }]
        : [],
    }),
    ...safeCveEnrichment(r),
    sourceMetadata: metadataFrom(r.sourceMetadata),
  };
}
async function collectCves(): Promise<CveEntry[]> {
  const headers: HeadersInit = { Accept: "application/json" };
  if (process.env.NVD_API_KEY) headers.apiKey = process.env.NVD_API_KEY;
  const end = new Date(),
    start = new Date(+end - 7 * 86400000),
    vulns: NvdRecord[] = [];
  let expected = 0;
  const kevPromise = fetchKevCatalog();
  for (let page = 0; page < 2; page++) {
    const url = new URL("https://services.nvd.nist.gov/rest/json/cves/2.0");
    url.searchParams.set("pubStartDate", start.toISOString());
    url.searchParams.set("pubEndDate", end.toISOString());
    url.searchParams.set("resultsPerPage", "2000");
    url.searchParams.set("startIndex", String(page * 2000));
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      if (!vulns.length) throw new Error("NVD unavailable");
      break;
    }
    const data = (await response.json()) as {
      vulnerabilities?: NvdVuln[];
      totalResults: number;
    };
    expected = data.totalResults ?? 0;
    const rows = data.vulnerabilities ?? [];
    vulns.push(...rows.map((v) => v.cve));
    if (rows.length < 2000 || vulns.length >= expected) break;
  }
  const entries = vulns.map(fromNvd),
    [kev, epss] = await Promise.all([
      kevPromise,
      fetchEpssDated(entries.map((e) => e.id)),
    ]);
  for (const cve of entries) {
    const metadata = cve.sourceMetadata!,
      score = epss.get(cve.id),
      entry = kev?.entries.get(cve.id);
    if (vulns.length < expected)
      metadata.warnings.push(
        "Cobertura NVD parcial: " +
          vulns.length +
          " de " +
          expected +
          " registros na consulta.",
      );
    if (kev) {
      metadata.kev = {
        ...metadata.kev,
        status: !!entry,
        checkedAt: kev.checkedAt,
        ...entry,
      };
      cve.inCisaKev = !!entry;
    }
    if (score) {
      cve.epss = score.score;
      cve.epssPercentile = score.percentile;
      metadata.epss = {
        ...metadata.epss,
        date: score.date,
        retrievedAt: score.retrievedAt,
      };
    }
  }
  return entries;
}
export async function saveCve(cve: CveEntry) {
  const { prisma } = await import("../prisma"),
    { saveCveBatch } = await import("./persist");
  const previous = await prisma.cveCache.findUnique({ where: { id: cve.id } });
  await saveCveBatch(prisma, [cve]);
  if (
    previous &&
    previous.description === cve.description &&
    +previous.lastModified === Date.parse(cve.lastModified)
  )
    await prisma.cveCache.updateMany({
      where: {
        id: cve.id,
        description: cve.description,
        lastModified: new Date(cve.lastModified),
      },
      data: { analysisReady: !!safeCveEnrichment(previous).ptBrDescription },
    });
}
export async function fetchCves(): Promise<{
  cves: CveEntry[];
  total: number;
  updatedAt: string;
}> {
  try {
    const { prisma } = await import("../prisma");
    const newest = await prisma.cveCache.findFirst({
      where: {
        fetchedAt: { gte: new Date(Date.now() - 6 * 3600000) },
        sourceMetadata: { path: ["version"], equals: "phase3-v1" },
      },
      orderBy: { fetchedAt: "desc" },
      select: { fetchedAt: true },
    });
    if (newest) {
      const rows = await prisma.cveCache.findMany({
        orderBy: { published: "desc" },
      });
      return {
        cves: rows.map(fromStored),
        total: rows.length,
        updatedAt: newest.fetchedAt.toISOString(),
      };
    }
  } catch {
    /* Preserve API fallback when PostgreSQL is unavailable. */
  }
  const cves = await collectCves();
  try {
    const { prisma } = await import("../prisma");
    const { saveCveBatch } = await import("./persist");
    await saveCveBatch(prisma, cves);
  } catch (error) {
    console.error(
      "[CveCache] persistence unavailable",
      error instanceof Error ? error.name : "unknown",
    );
  }
  return { cves, total: cves.length, updatedAt: new Date().toISOString() };
}
