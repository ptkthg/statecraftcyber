import Groq from "groq-sdk";
import type { RawThreatItem } from "./threat-sources/types";
import type { StructuredBriefing, Ioc } from "./types";
import { parseStructuredBriefing } from "./briefing/parse-structured-briefing";
import { enrichCveContext } from "./cves/enrich-cve";

let _groq: Groq | null = null;

function getGroq(): Groq | null {
  if (!process.env.GROQ_API_KEY) return null;
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENROUTER_MODEL ?? "anthropic/claude-3.5-haiku";

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://statecraftcyber.vercel.app",
        "X-Title": "Statecraft Cyber Intelligence",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`[OpenRouter] ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.warn("[OpenRouter] Falha:", (err as Error).message);
    return null;
  }
}

export interface AiBriefingResult {
  title: string;
  summary: string;
  content: string;
  structuredContent: StructuredBriefing | null;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM = `Você é um analista sênior de Threat Intelligence e Blue Team da plataforma Statecraft.

Gere um briefing técnico em português brasileiro a partir dos dados fornecidos.

Responda APENAS em JSON válido. Não use Markdown fora dos campos. Não escreva texto antes ou depois do JSON.

O briefing deve ser útil para Blue Team, SecOps, GRC e times de infraestrutura.

Regras obrigatórias:
- Não invente informações. Use apenas o que está nos dados fornecidos.
- Não repita ideias entre seções.
- Não crie seções extras além das especificadas.
- Não use linguagem sensacionalista.
- Não use parágrafos longos.
- Não use travessões (— ou –).
- Não inclua IOCs se eles não existirem na fonte.
- A seção "recommendedActions" deve ser uma lista objetiva e priorizada.
- A seção "detectionSuggestions" deve trazer sugestões práticas de hunting, logs, eventos ou consultas.
- Não diga genericamente "monitore logs"; especifique qual log, qual campo, qual valor esperado.
- Não repita "aplicar atualizações" em várias seções.
- O conteúdo deve ser claro, técnico e didático.

Instruções específicas para CVEs com contexto de enriquecimento RAG:
- Se os dados incluírem um bloco "--- Contexto de enriquecimento RAG ---", use-o ativamente.
- Em "technicalDetails": mencione o vetor de ataque (rede/local/adjacente), complexidade, privilégios exigidos e interação do usuário extraídos do vetor CVSS.
- Em "recommendedActions": se houver versões de patch (OSV ou GitHub Advisory), cite a versão correta explicitamente. Exemplo: "Atualize para a versão X.Y.Z ou superior."
- Em "detectionSuggestions": baseie-se no vetor de ataque e no tipo de vulnerabilidade (CWE) para sugerir queries SIEM específicas ou eventos Windows/Linux relevantes.
- Se houver referências de exploit/PoC nos dados, mencione explicitamente na seção "technicalDetails" com a URL.
- Se a CVE estiver no CISA KEV, mencione o prazo obrigatório e a ação requerida em "recommendedActions".
- Em "confidenceLevel": use "high" se NVD + EPSS + CISA KEV confirmarem os dados; "medium" se apenas NVD; "low" se os dados forem escassos.`;

// ── Context builder ───────────────────────────────────────────────────────────

/**
 * Builds the context string sent to the AI.
 *
 * @param item           - Raw threat item from any source adapter
 * @param severity       - Pre-computed severity label
 * @param enrichmentBlock - Optional RAG enrichment block from enrichCveContext().
 *                         Appended verbatim after the base context when present.
 */
function buildContext(item: RawThreatItem, severity: string, enrichmentBlock?: string): string {
  const cve = item.cves?.[0] ?? null;
  const epss = item.epssScore ? `${(item.epssScore * 100).toFixed(1)}%` : null;
  const iocs = item.iocs ?? [];

  const base = [
    `Fonte: ${item.sourceName}`,
    `URL da fonte: ${item.sourceUrl}`,
    `Título: ${item.title}`,
    // Increase description budget for non-CVE items (CVE description is usually short anyway)
    `Descrição: ${item.description.slice(0, cve ? 600 : 900)}`,
    cve ? `CVE principal: ${cve}` : null,
    item.cves && item.cves.length > 1
      ? `CVEs adicionais: ${item.cves.slice(1, 5).join(", ")}`
      : null,
    item.cvssScore ? `CVSS: ${item.cvssScore.toFixed(1)}` : null,
    epss ? `EPSS: ${epss} (probabilidade de exploração nos próximos 30 dias)` : null,
    `Severidade calculada: ${severity}`,
    (item.affectedProducts ?? []).length
      ? `Produtos afetados: ${item.affectedProducts!.slice(0, 5).join(", ")}`
      : null,
    (item.affectedSectors ?? []).length
      ? `Setores: ${item.affectedSectors!.join(", ")}`
      : null,
    (item.affectedRegions ?? []).length
      ? `Regiões: ${item.affectedRegions!.join(", ")}`
      : null,
    item.inCisaKev
      ? `CISA KEV: sim. Exploração ativa confirmada pelo catálogo CISA KEV.`
      : null,
    (item.mitreTechniques ?? []).length
      ? `MITRE ATT&CK: ${item.mitreTechniques!.slice(0, 4).join(", ")}`
      : null,
    iocs.length > 0
      ? `IOCs identificados na fonte (${iocs.length}): ${iocs.slice(0, 5).map((i) => `${i.type}:${i.value}`).join(", ")}`
      : `IOCs: nenhum indicador estruturado na fonte`,
  ]
    .filter(Boolean)
    .join("\n");

  // Append RAG enrichment block when available
  if (enrichmentBlock) {
    return `${base}\n${enrichmentBlock}`;
  }
  return base;
}

// ── User prompt ───────────────────────────────────────────────────────────────

function buildPrompt(ctx: string, severity: string): string {
  const defaultConf = severity === "critical" || severity === "high" ? "high" : "medium";
  return `Gere o briefing a partir dos dados abaixo.

Formato JSON obrigatório (retorne apenas o JSON):
{
  "title": "Título técnico e direto, máx. 100 caracteres",
  "executiveSummary": "Resumo em 3 a 5 frases. Explique risco, impacto e prioridade.",
  "whatHappened": "Explique o evento de forma objetiva e técnica. Se houver CVE, explique o que CVSS e EPSS significam na prática.",
  "whyItMatters": "Impacto prático para organizações. Não repita o resumo executivo.",
  "whoIsAtRisk": "Quem deve se preocupar: produto, setor, tecnologia, região ou tipo de ambiente.",
  "technicalDetails": "Detalhes técnicos: vetores de ataque, mecanismo de exploração, técnicas MITRE ATT&CK se houver.",
  "recommendedActions": [
    "Ação objetiva e aplicável 1 (mais urgente)",
    "Ação objetiva e aplicável 2",
    "Ação objetiva e aplicável 3"
  ],
  "detectionSuggestions": [
    "Sugestão prática de detecção ou hunting 1",
    "Sugestão prática de detecção ou hunting 2"
  ],
  "falsePositiveNotes": "Possíveis falsos positivos. Se não houver contexto, declare: Não há dados suficientes para avaliar falsos positivos.",
  "confidenceLevel": "${defaultConf}",
  "confidenceReason": "Explique por que o nível de confiança foi atribuído com base na fonte e nos dados disponíveis.",
  "sourceName": "Nome exato da fonte",
  "sourceUrl": "URL exata da fonte"
}

Dados da fonte:
${ctx}`;
}

// ── Main generator ────────────────────────────────────────────────────────────

export async function generateAiBriefing(
  item: RawThreatItem,
  severity: string,
  templateSummary: string,
  templateContent: string
): Promise<AiBriefingResult> {
  const groq = getGroq();
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

  if (!groq && !hasOpenRouter) {
    return {
      title: item.title,
      summary: templateSummary,
      content: templateContent,
      structuredContent: null,
    };
  }

  // ── RAG enrichment (CVE-only, non-blocking) ────────────────────────────────
  // Only runs when the item has at least one CVE. Fails gracefully: if
  // enrichment times out or all sources are unavailable the briefing still
  // generates using the base context. Total enrichment budget: ≤ 13 s.
  let enrichmentBlock: string | undefined;
  const primaryCve = item.cves?.[0];
  if (primaryCve) {
    try {
      const enrichment = await enrichCveContext(primaryCve);
      if (enrichment.hasData) {
        enrichmentBlock = enrichment.contextBlock;
      }
    } catch {
      // Enrichment failure is non-fatal — proceed without it
    }
  }

  const ctx = buildContext(item, severity, enrichmentBlock);

  const userPrompt = buildPrompt(ctx, severity);

  try {
    let raw = "";

    if (groq) {
      try {
        const response = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          max_tokens: 2000,
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: userPrompt },
          ],
        });
        raw = response.choices[0]?.message?.content?.trim() ?? "";
      } catch (groqErr) {
        console.warn("[Groq] Falhou, tentando OpenRouter:", (groqErr as Error).message);
      }
    }

    // Fallback to OpenRouter if Groq produced no output or isn't configured
    if (!raw) {
      raw = (await callOpenRouter(SYSTEM, userPrompt)) ?? "";
    }

    // Build fallback values from source data
    const fallback: Partial<StructuredBriefing> = {
      title: item.title,
      executiveSummary: templateSummary,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
    };

    const structured = parseStructuredBriefing(raw, fallback);

    if (!structured) {
      return {
        title: item.title,
        summary: templateSummary,
        content: templateContent,
        structuredContent: null,
      };
    }

    // Always use source-provided data for structured arrays — AI must not invent them
    structured.identifiedIocs = (item.iocs ?? []) as Ioc[];
    structured.relatedCves = item.cves ?? [];
    structured.mitreTechniques = item.mitreTechniques ?? [];

    return {
      title: structured.title,
      summary: structured.executiveSummary,
      content: buildMarkdownFallback(structured),
      structuredContent: structured,
    };
  } catch {
    return {
      title: item.title,
      summary: templateSummary,
      content: templateContent,
      structuredContent: null,
    };
  }
}

// ── Markdown fallback (legacy content field) ──────────────────────────────────
// Produces a simplified markdown version stored in `content` for backward
// compatibility with briefings opened before `structuredContent` was added.

export function buildMarkdownFallback(s: StructuredBriefing): string {
  const sections: string[] = [];

  sections.push(`## O que aconteceu\n\n${s.whatHappened}`);
  sections.push(`## Por que isso importa\n\n${s.whyItMatters}`);
  sections.push(`## Quem está em risco\n\n${s.whoIsAtRisk}`);

  if (s.technicalDetails) {
    sections.push(`## Detalhes técnicos\n\n${s.technicalDetails}`);
  }

  if (s.identifiedIocs.length > 0) {
    const iocLines = s.identifiedIocs
      .slice(0, 30)
      .map((ioc) => `- \`${ioc.value}\` (${ioc.type}, ${ioc.confidence})`);
    sections.push(`## IOCs Identificados\n\n${iocLines.join("\n")}`);
  } else {
    sections.push(`## IOCs Identificados\n\nNenhum IOC estruturado foi identificado na fonte original.`);
  }

  if (s.recommendedActions.length > 0) {
    const bullets = s.recommendedActions.map((a) => `- ${a}`).join("\n");
    sections.push(`## Ações recomendadas\n\n${bullets}`);
  }

  if (s.detectionSuggestions.length > 0) {
    const bullets = s.detectionSuggestions.map((d) => `- ${d}`).join("\n");
    sections.push(`## Sugestões de detecção\n\n${bullets}`);
  }

  if (s.falsePositiveNotes) {
    sections.push(`## Falsos positivos\n\n${s.falsePositiveNotes}`);
  }

  const confMap: Record<string, string> = { high: "Alta", medium: "Média", low: "Baixa" };
  sections.push(
    `## Nível de confiança\n\n**${confMap[s.confidenceLevel] ?? s.confidenceLevel}** — ${s.confidenceReason}`
  );

  return sections.join("\n\n");
}
