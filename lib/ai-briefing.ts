import Groq from "groq-sdk";
import type { RawThreatItem } from "./threat-sources/types";
import type { StructuredBriefing, Ioc } from "./types";
import { parseStructuredBriefing } from "./briefing/parse-structured-briefing";

let _groq: Groq | null = null;

function getGroq(): Groq | null {
  if (!process.env.GROQ_API_KEY) return null;
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

export interface AiBriefingResult {
  title: string;
  summary: string;
  content: string;
  structuredContent: StructuredBriefing | null;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM = `Você é um analista sênior de Threat Intelligence e Blue Team.

Gere um briefing técnico em português brasileiro a partir dos dados fornecidos.

Responda APENAS em JSON válido. Não use Markdown fora dos campos. Não escreva texto antes ou depois do JSON.

O briefing deve ser útil para Blue Team, SecOps, GRC e times de infraestrutura.

Regras obrigatórias:
- Não invente informações.
- Não repita ideias entre seções.
- Não crie seções extras.
- Não use linguagem sensacionalista.
- Não use parágrafos longos.
- Não use travessões.
- Não inclua IOCs se eles não existirem na fonte.
- A seção "recommendedActions" deve ser uma lista objetiva.
- A seção "detectionSuggestions" deve trazer sugestões práticas de hunting, logs, eventos ou consultas quando houver contexto.
- Não diga genericamente "monitore logs"; especifique o que monitorar.
- Não repita "aplicar atualizações" em várias seções.
- O conteúdo deve ser claro, técnico e didático.`;

// ── Context builder ───────────────────────────────────────────────────────────

function buildContext(item: RawThreatItem, severity: string): string {
  const cve = item.cves?.[0] ?? null;
  const epss = item.epssScore ? `${(item.epssScore * 100).toFixed(1)}%` : null;
  const iocs = item.iocs ?? [];

  return [
    `Fonte: ${item.sourceName}`,
    `URL da fonte: ${item.sourceUrl}`,
    `Título: ${item.title}`,
    `Descrição: ${item.description.slice(0, 600)}`,
    cve ? `CVE principal: ${cve}` : null,
    item.cvssScore ? `CVSS: ${item.cvssScore.toFixed(1)}` : null,
    epss ? `EPSS: ${epss} (probabilidade de exploração nos próximos 30 dias)` : null,
    `Severidade: ${severity}`,
    (item.affectedProducts ?? []).length
      ? `Produtos afetados: ${item.affectedProducts!.slice(0, 3).join(", ")}`
      : null,
    (item.affectedSectors ?? []).length
      ? `Setores: ${item.affectedSectors!.join(", ")}`
      : null,
    (item.affectedRegions ?? []).length
      ? `Regiões: ${item.affectedRegions!.join(", ")}`
      : null,
    item.inCisaKev
      ? `CISA KEV: sim. Exploração ativa confirmada.`
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
  if (!groq) {
    return {
      title: item.title,
      summary: templateSummary,
      content: templateContent,
      structuredContent: null,
    };
  }

  const ctx = buildContext(item, severity);

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2000,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildPrompt(ctx, severity) },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";

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
