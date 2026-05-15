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
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);
    const status = searchParams.get("status") ?? "published";

    const [briefings, latestIocsRaw] = await Promise.all([
      prisma.briefing.findMany({
        where: { status: status as "published" | "draft" },
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
          iocs: true,
          createdAt: true,
          readingTime: true,
        },
      }),
      // Últimos IOCs dos briefings mais recentes (inclui slug para link)
      prisma.briefing.findMany({
        where: { status: "published", NOT: { iocs: { equals: [] } } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { iocs: true, sourceName: true, slug: true, severity: true },
      }),
    ]);

    const flatIocs: LiveIoc[] = [];
    for (const row of latestIocsRaw) {
      const iocs = row.iocs as unknown as Ioc[];
      if (Array.isArray(iocs)) {
        flatIocs.push(
          ...iocs.slice(0, 3).map((ioc) => ({
            ...ioc,
            sourceName: row.sourceName,
            briefingSlug: row.slug,
            severity: row.severity,
          }))
        );
      }
    }
    const uniqueIocs = flatIocs.slice(0, 8);

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
