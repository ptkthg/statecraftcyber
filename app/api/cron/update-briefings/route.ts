import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { fetchAllSources, fetchEpssScores } from "@/lib/threat-sources";
import { generateBriefingAsync } from "@/lib/briefing-generator";
import { filterNewItems, generateContentHash } from "@/lib/deduplication";
import { normalizeIoc } from "@/lib/threat-intel/normalize-ioc";
import type { Ioc } from "@/lib/types";

const MAX_HOURLY = parseInt(process.env.MAX_HOURLY_BRIEFINGS ?? "3", 10);
const AUTO_PUBLISH = process.env.AUTO_PUBLISH === "true";

export const maxDuration = 60; // Hobby plan limit
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest) {
  // ── Autenticação ────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const providedSecret = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!cronSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const startedAt = Date.now();
  const runErrors: string[] = [];
  let briefingsCreated = 0;
  const activeSources: string[] = [];

  try {
    // ── 0. Limpar briefings com mais de 7 dias ───────────────────────────
    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    try {
      const deleted = await prisma.briefing.deleteMany({ where: { createdAt: { lt: cutoff7d } } });
      if (deleted.count > 0) console.log(`[Cron] ${deleted.count} briefings com mais de 7 dias removidos`);
    } catch (err) {
      console.error("[Cron] Erro ao limpar briefings antigos (não crítico):", (err as Error).message);
      runErrors.push(`cleanup: ${(err as Error).message}`);
    }

    // ── 1. Coletar dados de todas as fontes ─────────────────────────────
    console.log("[Cron] Iniciando coleta horária de threat intelligence...");
    const { items, errors, sources } = await fetchAllSources();

    activeSources.push(...sources);
    runErrors.push(...errors.map((e) => `${e.source}: ${e.error}`));

    console.log(`[Cron] ${items.length} itens coletados de ${sources.length} fontes`);

    if (items.length === 0) {
      await logCronRun({
        success: true,
        briefingsCreated: 0,
        errors: runErrors,
        sources: activeSources,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ ok: true, briefingsCreated: 0, message: "Nenhum item novo" });
    }

    // ── 2. Enriquecer CVEs com EPSS ──────────────────────────────────────
    const allCves = [...new Set(items.flatMap((i) => i.cves ?? []))];
    const epssMap = await fetchEpssScores(allCves);

    for (const item of items) {
      if (item.cves?.length && !item.epssScore) {
        const score = epssMap[item.cves[0]];
        if (score !== undefined) item.epssScore = score;
      }
    }

    // ── 3. Deduplicar contra o banco ─────────────────────────────────────
    const hashes = items.map(generateContentHash);
    let existingHashes: Set<string>;
    try {
      existingHashes = await prisma.briefing
        .findMany({
          where: { contentHash: { in: hashes } },
          select: { contentHash: true },
        })
        .then((rows: { contentHash: string }[]) => new Set(rows.map((r) => r.contentHash)));
    } catch (err) {
      console.error("[Cron] Erro ao buscar hashes existentes, assumindo todos novos:", (err as Error).message);
      runErrors.push(`dedup: ${(err as Error).message}`);
      existingHashes = new Set();
    }

    const newItems = filterNewItems(items, existingHashes);
    console.log(`[Cron] ${newItems.length} itens novos após deduplicação`);

    if (newItems.length === 0) {
      await logCronRun({
        success: true,
        briefingsCreated: 0,
        errors: runErrors,
        sources: activeSources,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ ok: true, briefingsCreated: 0, message: "Todos os itens já existem" });
    }

    // ── 4. Ordenar por severidade e garantir diversidade de fontes ──────
    const sorted = prioritizeItems(newItems.map((n) => n.item));
    const prioritized = diversifyBySource(sorted, MAX_HOURLY);

    // ── 5. Gerar briefings e salvar no banco ─────────────────────────────
    let existingSlugs: Set<string>;
    try {
      existingSlugs = await prisma.briefing
        .findMany({ select: { slug: true } })
        .then((rows: { slug: string }[]) => new Set(rows.map((r) => r.slug)));
    } catch (err) {
      console.error("[Cron] Erro ao buscar slugs existentes, assumindo nenhum:", (err as Error).message);
      runErrors.push(`slugs: ${(err as Error).message}`);
      existingSlugs = new Set();
    }

    for (const item of prioritized) {
      try {
        const briefing = await generateBriefingAsync(item, existingSlugs);
        const hash = generateContentHash(item);

        const created = await prisma.briefing.create({
          data: {
            title: briefing.title,
            slug: briefing.slug,
            summary: briefing.summary,
            content: briefing.content,
            ...(briefing.structuredContent
              ? { structuredContent: briefing.structuredContent as unknown as Prisma.InputJsonValue }
              : {}),
            severity: briefing.severity,
            category: briefing.category,
            tags: briefing.tags,
            affectedSectors: briefing.affectedSectors,
            affectedRegions: briefing.affectedRegions,
            sourceName: briefing.sourceName,
            sourceUrl: briefing.sourceUrl,
            sourcePublishedAt: briefing.sourcePublishedAt,
            cves: briefing.cves,
            mitreTechniques: briefing.mitreTechniques,
            epssScore: briefing.epssScore,
            cvssScore: briefing.cvssScore,
            confidence: briefing.confidence,
            status: AUTO_PUBLISH ? "published" : "draft",
            contentHash: hash,
            readingTime: briefing.readingTime,
          },
        });

        // Populate structured Ioc table
        const iocList = (briefing.iocs ?? []) as Ioc[];
        for (const ioc of iocList) {
          if (!ioc.type || !ioc.value) continue;
          const normalized = normalizeIoc(ioc.type, ioc.value);
          await prisma.ioc.upsert({
            where: { type_normalized_briefingId: { type: ioc.type, normalized, briefingId: created.id } },
            update: {},
            create: {
              type: ioc.type,
              value: ioc.value,
              normalized,
              confidence: (["high", "medium", "low"].includes(ioc.confidence) ? ioc.confidence : "medium") as "high" | "medium" | "low",
              sourceName: ioc.source ?? briefing.sourceName,
              briefingId: created.id,
            },
          });
        }

        briefingsCreated++;
        console.log(`[Cron] Briefing criado: ${briefing.title.slice(0, 60)} (${iocList.length} IOCs)`);
      } catch (err) {
        const msg = `Erro ao salvar briefing "${item.title.slice(0, 40)}": ${(err as Error).message}`;
        console.error(`[Cron] ${msg}`);
        runErrors.push(msg);
      }
    }

    // ── 6. Log da execução ───────────────────────────────────────────────
    await logCronRun({
      success: true,
      briefingsCreated,
      errors: runErrors,
      sources: activeSources,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      ok: true,
      briefingsCreated,
      sources: activeSources,
      errors: runErrors.length > 0 ? runErrors : undefined,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[Cron] Falha geral:", msg);

    await logCronRun({
      success: false,
      briefingsCreated,
      errors: [...runErrors, msg],
      sources: activeSources,
      durationMs: Date.now() - startedAt,
    }).catch(() => {}); // Não falhar no log

    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type RawItem = import("@/lib/threat-sources/types").RawThreatItem;

/**
 * Garante que nenhuma fonte domine todos os slots.
 * Cada fonte pode ocupar no máximo ceil(max/2) slots (mínimo 2).
 * Slots restantes são preenchidos com os itens mais prioritários.
 */
function diversifyBySource(sorted: RawItem[], max: number): RawItem[] {
  // Agrupar por fonte mantendo a ordem de prioridade interna
  const bySource: Record<string, RawItem[]> = {};
  for (const item of sorted) {
    if (!bySource[item.sourceName]) bySource[item.sourceName] = [];
    bySource[item.sourceName].push(item);
  }

  // Cap proporcional ao número de fontes com itens
  const numSources = Object.keys(bySource).length;
  const capPerSource = Math.max(2, Math.ceil(max / numSources));

  const countBySource: Record<string, number> = {};
  const selected: RawItem[] = [];

  for (const item of sorted) {
    if (selected.length >= max) break;
    const src = item.sourceName;
    countBySource[src] = countBySource[src] ?? 0;
    if (countBySource[src] < capPerSource) {
      selected.push(item);
      countBySource[src]++;
    }
  }

  // Preencher slots restantes ignorando o cap
  if (selected.length < max) {
    for (const item of sorted) {
      if (selected.length >= max) break;
      if (!selected.includes(item)) selected.push(item);
    }
  }

  return selected;
}

/** Ordena itens por severidade implícita para processar os mais críticos primeiro. */
function prioritizeItems(items: RawItem[]): RawItem[] {
  const severityWeight: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  return [...items].sort((a, b) => {
    const wa = severityWeight[a.severity ?? "low"] ?? 1;
    const wb = severityWeight[b.severity ?? "low"] ?? 1;
    if (wb !== wa) return wb - wa;

    // CISA KEV primeiro
    if (a.inCisaKev && !b.inCisaKev) return -1;
    if (!a.inCisaKev && b.inCisaKev) return 1;

    // CVSS maior primeiro
    return (b.cvssScore ?? 0) - (a.cvssScore ?? 0);
  });
}

async function logCronRun(data: {
  success: boolean;
  briefingsCreated: number;
  errors: string[];
  sources: string[];
  durationMs: number;
}) {
  try {
    await prisma.cronLog.create({ data });
  } catch {
    console.error("[Cron] Não foi possível salvar o log da execução");
  }
}
