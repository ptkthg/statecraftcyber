import Groq from "groq-sdk";
import type { RawThreatItem } from "./threat-sources/types";

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
}

// ── Prompt base ───────────────────────────────────────────────────────────────

const SYSTEM = `Você é um analista sênior de threat intelligence da Statecraft Cyber Intelligence. Escreva em português brasileiro. Tom jornalístico e informativo, como uma reportagem técnica de segurança. Seja direto e preciso. Nunca use travessões (— ou –). Nunca use emojis. Varie o vocabulário.`;

// ── Contexto do item ──────────────────────────────────────────────────────────

function buildContext(item: RawThreatItem, severity: string): string {
  const cve = item.cves?.[0] ?? null;
  const epss = item.epssScore ? `${(item.epssScore * 100).toFixed(1)}%` : null;
  const iocCount = (item.iocs ?? []).length;

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
      ? `CISA KEV: sim. Exploração ativa confirmada. Remediação mandatória para agências federais dos EUA`
      : null,
    iocCount > 0
      ? `IOCs identificados: ${iocCount} indicadores (IPs, domínios, hashes, URLs)`
      : `IOCs: nenhum indicador estruturado disponível`,
    (item.mitreTechniques ?? []).length
      ? `MITRE ATT&CK: ${item.mitreTechniques!.slice(0, 4).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Gerador principal ─────────────────────────────────────────────────────────

export async function generateAiBriefing(
  item: RawThreatItem,
  severity: string,
  templateSummary: string,
  templateContent: string
): Promise<AiBriefingResult> {
  const groq = getGroq();
  if (!groq) return { title: item.title, summary: templateSummary, content: templateContent };

  const ctx = buildContext(item, severity);
  const iocCount = (item.iocs ?? []).length;

  const [titleRes, summaryRes, contentRes] = await Promise.allSettled([
    // 1. Título traduzido para PT-BR
    groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 80,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Traduza o título abaixo para português brasileiro técnico e conciso. Se já estiver em português, retorne exatamente como está. Retorne APENAS o título, sem aspas, sem explicações.\n\nTítulo: ${item.title}`,
        },
      ],
    }),

    // 2. Resumo executivo
    groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 180,
      temperature: 0.4,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Escreva um resumo executivo de 2 a 3 frases para analistas de segurança. Máximo 140 palavras. Destaque o risco concreto e o impacto prático. Use **negrito** apenas em termos técnicos essenciais (nomes de CVE, produtos, técnicas de ataque). Sem travessões. Sem repetição de palavras na mesma frase.\n\nDados:\n${ctx}`,
        },
      ],
    }),

    // 3. Conteúdo completo do briefing
    groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1400,
      temperature: 0.5,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Escreva um briefing de threat intelligence em markdown com as seções abaixo. Tom de reportagem técnica. Sem travessões. Parágrafos completos nas seções narrativas.

## O que aconteceu
[Descreva o evento/vulnerabilidade de forma clara. Se houver CVE com CVSS ou EPSS, explique o que esses scores significam na prática para quem opera sistemas.]

## Por que isso é importante
[Contextualize o impacto real: o que pode acontecer se explorado, exemplos de consequências concretas. Se for CISA KEV, explique o peso disso.]

## Quem está em risco
[Descreva os alvos: setores, produtos, regiões. Seja específico.]

## IOCs Identificados
${
  iocCount > 0
    ? `[Escreva UM parágrafo explicando o que os ${iocCount} indicadores de comprometimento encontrados nesta ameaça revelam sobre a infraestrutura ou comportamento do atacante. Não liste os IOCs, pois eles aparecem na tabela abaixo deste texto.]`
    : `[Escreva que não há indicadores estruturados disponíveis para este briefing e oriente o analista a consultar a fonte original para busca manual de IOCs.]`
}

## Ações recomendadas
[Lista com bullets de ações concretas e priorizadas. Comece com as mais urgentes. Seja específico: qual patch aplicar, qual configuração rever, qual log monitorar.]

## Nível de Confiança
[Explique por que o nível de confiança para esta ameaça específica é ${severity === "critical" || severity === "high" ? "alto" : "médio a baixo"}. Mencione a fonte [${item.sourceName}](${item.sourceUrl}) como link clicável. Explique o que esse nível de confiança significa para o analista tomar decisão.]

Dados da ameaça:
${ctx}`,
        },
      ],
    }),
  ]);

  const title =
    titleRes.status === "fulfilled"
      ? (titleRes.value.choices[0]?.message?.content?.trim() ?? item.title)
      : item.title;

  const summary =
    summaryRes.status === "fulfilled"
      ? (summaryRes.value.choices[0]?.message?.content?.trim() ?? templateSummary)
      : templateSummary;

  const aiContent =
    contentRes.status === "fulfilled"
      ? (contentRes.value.choices[0]?.message?.content?.trim() ?? null)
      : null;

  const content = aiContent
    ? mergeAiWithTemplate(aiContent, templateContent)
    : templateContent;

  return { title, summary, content };
}

// ── Merge: narrativa AI + dados do template ───────────────────────────────────

/**
 * Preserva o texto narrativo gerado pela IA e injeta após ele as seções
 * de dados estruturados do template (lista de IOCs, CVEs com links,
 * impacto para PMEs, fontes consultadas com links clicáveis).
 *
 * Para a seção de IOCs: injeta a lista de IOCs do template logo após
 * o parágrafo narrativo gerado pela IA, dentro da mesma seção.
 */
function mergeAiWithTemplate(aiContent: string, templateContent: string): string {
  // CVEs, Fontes e Impacto para PMEs são renderizados como JSX na página (não em markdown)
  // Aqui só preservamos o Nível de Confiança se a IA não o gerou
  const dataSections: string[] = [];

  // Extrair a lista de IOCs do template (o bloco após "## IOCs Identificados")
  const iocListFromTemplate = extractSectionContent(templateContent, "## IOCs Identificados");

  // Injetar lista de IOCs após o parágrafo narrativo de IOCs da IA (só se houver dados)
  let content = aiContent;
  const iocSectionIdx = content.indexOf("## IOCs Identificados");
  if (iocSectionIdx !== -1 && iocListFromTemplate && iocListFromTemplate.trim().length > 0) {
    const nextSectionIdx = content.indexOf("\n## ", iocSectionIdx + 5);
    const iocEnd = nextSectionIdx !== -1 ? nextSectionIdx : content.length;
    const aiIocNarrative = content.slice(iocSectionIdx, iocEnd).trim();
    const rest = nextSectionIdx !== -1 ? content.slice(nextSectionIdx) : "";
    content =
      content.slice(0, iocSectionIdx) +
      aiIocNarrative +
      "\n\n" +
      iocListFromTemplate +
      rest;
  }

  // Remover a seção "## Nível de Confiança" do template (IA já gerou a própria)
  // e adicionar as demais seções de dados
  const templateParts: string[] = [];
  for (const section of dataSections) {
    if (section === "## Nível de Confiança") continue; // IA já gerou
    const sectionContent = extractSection(templateContent, section);
    if (sectionContent) templateParts.push(sectionContent.trim());
  }

  if (templateParts.length === 0) return content;

  return content + "\n\n---\n\n" + templateParts.join("\n\n---\n\n");
}

function extractSectionContent(text: string, header: string): string {
  const idx = text.indexOf(header);
  if (idx === -1) return "";
  const start = text.indexOf("\n", idx) + 1;
  const nextSection = text.indexOf("\n## ", start);
  return nextSection !== -1 ? text.slice(start, nextSection).trim() : text.slice(start).trim();
}

function extractSection(text: string, header: string): string {
  const idx = text.indexOf(header);
  if (idx === -1) return "";
  const nextSection = text.indexOf("\n## ", idx + header.length);
  return nextSection !== -1 ? text.slice(idx, nextSection) : text.slice(idx);
}
