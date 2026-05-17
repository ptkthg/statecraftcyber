import { NextRequest, NextResponse } from "next/server";
import type { Ioc, LiveIoc } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PrismaError {
  code?: string;
  message: string;
}

export async function GET(req: NextRequest) {
  try {
    // Importação dinâmica para não quebrar quando o banco não está configurado
    const { prisma } = await import("@/lib/prisma");

    const { searchParams } = req.nextUrl;
    const rawLimit = parseInt(searchParams.get("limit") ?? "20", 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;
    // Always force "published" — never expose drafts via public endpoint
    const status = "published";

    const [briefings, latestIocsRaw] = await Promise.all([
      prisma.briefing.findMany({
        where: { status },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        take: limit,
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          severity: true,
          category: true,
          tags: true,
          sourceName: true,
          sourceUrl: true,
          cves: true,
          createdAt: true,
          readingTime: true,
        },
      }),
      // Últimos IOCs da tabela Ioc (inclui briefing para slug e severidade)
      prisma.ioc.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          type: true,
          value: true,
          normalized: true,
          confidence: true,
          briefing: { select: { sourceName: true, slug: true, severity: true } },
        },
      }),
    ]);

    const uniqueIocs: LiveIoc[] = latestIocsRaw.map((ioc) => ({
      type: ioc.type as Ioc["type"],
      value: ioc.value,
      normalized: ioc.normalized,
      confidence: ioc.confidence as Ioc["confidence"],
      sourceName: ioc.briefing.sourceName,
      briefingSlug: ioc.briefing.slug,
      severity: ioc.briefing.severity,
    }));

    // Trending = briefings mais críticos das últimas 48h
    const trending = briefings
      .filter((b) => ["critical", "high"].includes(b.severity))
      .slice(0, 5);

    return NextResponse.json(
      { briefings, trending, latestIocs: uniqueIocs },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err) {
    const error = err as PrismaError;
    // Se o banco não estiver configurado, retorna lista vazia (frontend usa mock)
    if (
      error.code === "P1001" ||
      error.message?.includes("DATABASE_URL") ||
      error.message?.includes("connect")
    ) {
      return NextResponse.json({ briefings: [], trending: [], latestIocs: [] });
    }

    console.error("[API /briefings]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
