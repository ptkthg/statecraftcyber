/**
 * Backfill script: populates structuredContent for briefings that predate
 * the structured-JSON pipeline.
 *
 * Usage:
 *   npm run backfill:briefings            # process all, write to DB
 *   npm run backfill:briefings -- --dry-run  # inspect without writing
 *   npm run backfill:briefings -- --limit 10  # process at most 10
 *   npm run backfill:briefings -- --id <id>   # single briefing
 */

import { PrismaClient, Prisma } from "@prisma/client";
import Groq from "groq-sdk";
import { parseStructuredBriefing } from "../lib/briefing/parse-structured-briefing";
import type { StructuredBriefing, Ioc } from "../lib/types";

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT_ARG = process.argv.indexOf("--limit");
const LIMIT = LIMIT_ARG !== -1 ? parseInt(process.argv[LIMIT_ARG + 1], 10) : Infinity;
const ID_ARG = process.argv.indexOf("--id");
const SINGLE_ID = ID_ARG !== -1 ? process.argv[ID_ARG + 1] : null;
const BATCH_SIZE = 5;
const DELAY_MS = 2000; // avoid Groq rate limits between batches

const prisma = new PrismaClient();
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

// ── Prompt ────────────────────────────────────────────────────────────────────

const SYSTEM = `Você é um analista sênior de Threat Intelligence e Blue Team.

Reestruture o briefing de threat intelligence abaixo no formato JSON especificado.

Responda APENAS em JSON válido. Não escreva texto antes ou depois do JSON.
Não invente informações. Use apenas o que está nos dados fornecidos.
Não use travessões. Não use parágrafos longos.
Se uma seção não tiver dados suficientes, responda: "A fonte original não fornece detalhes suficientes para esta seção."`;

function buildBackfillPrompt(b: {
  title: string;
  summary: string;
  content: string;
  severity: string;
  sourceName: string;
  sourceUrl: string;
  confidence: string;
}): string {
  const truncatedContent = b.content.slice(0, 2000);
  return `Reestruture o briefing abaixo:

Título: ${b.title}
Resumo: ${b.summary}
Severidade: ${b.severity}
Confiança: ${b.confidence}
Fonte: ${b.sourceName}
URL: ${b.sourceUrl}
Conteúdo (parcial):
${truncatedContent}

Formato JSON obrigatório:
{
  "title": "Título técnico em PT-BR",
  "executiveSummary": "Resumo executivo em 3 a 5 frases.",
  "whatHappened": "O que aconteceu de forma objetiva.",
  "whyItMatters": "Impacto prático. Não repita o resumo.",
  "whoIsAtRisk": "Quem deve se preocupar.",
  "technicalDetails": "Detalhes técnicos conhecidos.",
  "recommendedActions": ["Ação 1", "Ação 2", "Ação 3"],
  "detectionSuggestions": ["Sugestão 1", "Sugestão 2"],
  "falsePositiveNotes": "Possíveis falsos positivos ou declaração de ausência de dados.",
  "confidenceLevel": "${b.confidence === "high" ? "high" : b.confidence === "low" ? "low" : "medium"}",
  "confidenceReason": "Motivo do nível de confiança.",
  "sourceName": "${b.sourceName}",
  "sourceUrl": "${b.sourceUrl}"
}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function restructureBriefing(b: {
  id: string;
  title: string;
  summary: string;
  content: string;
  severity: string;
  confidence: string;
  sourceName: string;
  sourceUrl: string;
  iocs: unknown;
  cves: string[];
  mitreTechniques: string[];
}): Promise<StructuredBriefing | null> {
  const fallback: Partial<StructuredBriefing> = {
    title: b.title,
    executiveSummary: b.summary,
    sourceName: b.sourceName,
    sourceUrl: b.sourceUrl,
    relatedCves: b.cves,
    mitreTechniques: b.mitreTechniques,
    identifiedIocs: Array.isArray(b.iocs) ? (b.iocs as Ioc[]).filter(
      (i) => i && typeof i.type === "string" && typeof i.value === "string"
    ) : [],
  };

  if (!groq) {
    console.warn(`  [SKIP] GROQ_API_KEY não configurada. Gerando fallback mínimo.`);
    return parseStructuredBriefing("{}", fallback);
  }

  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1800,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildBackfillPrompt(b) },
      ],
    });

    const raw = res.choices[0]?.message?.content?.trim() ?? "";
    const parsed = parseStructuredBriefing(raw, fallback);
    if (!parsed) return parseStructuredBriefing("{}", fallback);

    // Always use source-authoritative structured arrays
    parsed.identifiedIocs = fallback.identifiedIocs ?? [];
    parsed.relatedCves = b.cves;
    parsed.mitreTechniques = b.mitreTechniques;

    return parsed;
  } catch (err) {
    console.warn(`  [WARN] AI failed: ${(err as Error).message}. Using fallback.`);
    return parseStructuredBriefing("{}", fallback);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Backfill de structuredContent ===`);
  if (DRY_RUN) console.log("  [DRY-RUN] Nenhuma alteração será salva.\n");

  // Fetch briefings without structuredContent.
  // We filter for null in JS because Prisma's JsonNullableFilter type requires
  // Prisma.DbNull for DB-level null, which varies across adapter versions.
  const idFilter = SINGLE_ID ? { id: SINGLE_ID } : {};

  const total = await prisma.briefing.count({
    where: { ...idFilter, structuredContent: { equals: Prisma.DbNull } },
  });
  console.log(`Total sem structuredContent: ${total}`);

  if (total === 0) {
    console.log("Nenhum briefing para processar. Encerrando.\n");
    return;
  }

  const toProcess = Math.min(total, Number.isFinite(LIMIT) ? LIMIT : total);
  console.log(`Processando: ${toProcess}\n`);

  let processed = 0;
  let saved = 0;
  let failed = 0;
  let skipped = 0;
  let offset = 0;

  while (processed < toProcess) {
    const batch = await prisma.briefing.findMany({
      where: { ...idFilter, structuredContent: { equals: Prisma.DbNull } },
      select: {
        id: true,
        title: true,
        summary: true,
        content: true,
        severity: true,
        confidence: true,
        sourceName: true,
        sourceUrl: true,
        iocs: true,
        cves: true,
        mitreTechniques: true,
      },
      skip: offset,
      take: BATCH_SIZE,
    });

    if (batch.length === 0) break;

    for (const b of batch) {
      if (processed >= toProcess) break;
      processed++;

      const shortTitle = b.title.slice(0, 60);
      process.stdout.write(`  [${processed}/${toProcess}] ${shortTitle}... `);

      const structured = await restructureBriefing(b);
      if (!structured) {
        console.log("SKIP (falha na geração)");
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log("OK (dry-run)");
        saved++;
        continue;
      }

      try {
        await prisma.briefing.update({
          where: { id: b.id },
          data: { structuredContent: structured as unknown as Prisma.InputJsonValue },
        });
        console.log("SALVO");
        saved++;
      } catch (err) {
        console.log(`ERRO: ${(err as Error).message}`);
        failed++;
      }
    }

    offset += batch.length;
    if (processed < toProcess) await sleep(DELAY_MS);
  }

  console.log(`
=== Resultado ===
  Total encontrados:  ${total}
  Processados:        ${processed}
  Salvos:             ${saved}
  Falhas:             ${failed}
  Ignorados:          ${skipped}
`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
