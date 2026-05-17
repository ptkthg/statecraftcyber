import { NextRequest, NextResponse } from "next/server";
import type { Ioc, EnrichedIoc } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { prisma } = await import("@/lib/prisma");
    const { searchParams } = req.nextUrl;

    const ALLOWED_TYPES = new Set(["ip", "domain", "hash", "url", "email", "file", "c2"]);
    const q = searchParams.get("q")?.toLowerCase().trim() ?? "";
    const rawType = searchParams.get("type")?.toLowerCase() ?? "";
    const typeFilter = ALLOWED_TYPES.has(rawType) ? rawType : "";
    const rawPage = parseInt(searchParams.get("page") ?? "1", 10);
    const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
    const limit = 25;
    const skip = (page - 1) * limit;

    // Check if the structured Ioc table has data
    const iocTableCount = await prisma.ioc.count();

    if (iocTableCount > 0) {
      // Use structured Ioc table with server-side pagination & filtering
      const where = {
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(q ? { normalized: { contains: q } } : {}),
      };

      const [results, total, allForStats] = await Promise.all([
        prisma.ioc.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip,
          include: {
            briefing: {
              select: { slug: true, title: true, severity: true, sourceName: true, createdAt: true },
            },
          },
        }),
        prisma.ioc.count({ where }),
        prisma.ioc.groupBy({ by: ["type"], _count: { type: true } }),
      ]);

      const enriched: EnrichedIoc[] = results.map((ioc) => ({
        type: ioc.type as EnrichedIoc["type"],
        value: ioc.value,
        confidence: ioc.confidence,
        source: ioc.sourceName ?? undefined,
        briefingSlug: ioc.briefing.slug,
        briefingTitle: ioc.briefing.title,
        briefingSeverity: ioc.briefing.severity,
        briefingDate: ioc.briefing.createdAt.toISOString(),
        sourceName: ioc.sourceName ?? ioc.briefing.sourceName,
      }));

      const byType = allForStats.reduce<Record<string, number>>((acc, row) => {
        acc[row.type] = row._count.type;
        return acc;
      }, {});

      return NextResponse.json(
        {
          results: enriched,
          total,
          stats: { total: iocTableCount, byType },
          page,
          limit,
          hasMore: skip + results.length < total,
        },
        { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } }
      );
    }

    // Fallback: IOCs still stored in Briefing.iocs JSON field
    const briefings = await prisma.briefing.findMany({
      where: { status: "published" },
      select: {
        slug: true,
        title: true,
        severity: true,
        sourceName: true,
        createdAt: true,
        iocs: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Flatten + enrich
    const allIocs: EnrichedIoc[] = [];
    for (const b of briefings) {
      const iocs = b.iocs as unknown as Ioc[];
      if (!Array.isArray(iocs)) continue;
      for (const ioc of iocs) {
        if (!ioc.value) continue;
        allIocs.push({
          ...ioc,
          briefingSlug: b.slug,
          briefingTitle: b.title,
          briefingSeverity: b.severity,
          briefingDate: b.createdAt.toISOString(),
          sourceName: b.sourceName,
        });
      }
    }

    // Stats globais (antes do filtro)
    const stats = {
      total: allIocs.length,
      byType: allIocs.reduce<Record<string, number>>((acc, ioc) => {
        acc[ioc.type] = (acc[ioc.type] ?? 0) + 1;
        return acc;
      }, {}),
    };

    // Filtros em memória
    let filtered = allIocs;
    if (q) filtered = filtered.filter((ioc) => ioc.value.toLowerCase().includes(q));
    if (typeFilter) filtered = filtered.filter((ioc) => ioc.type === typeFilter);

    const total = filtered.length;
    const results = filtered.slice(skip, skip + limit);

    return NextResponse.json(
      {
        results,
        total,
        stats,
        page,
        limit,
        hasMore: skip + results.length < total,
      },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } }
    );
  } catch (err) {
    const error = err as { code?: string; message: string };
    if (
      error.code === "P1001" ||
      error.message?.includes("DATABASE_URL") ||
      error.message?.includes("connect")
    ) {
      return NextResponse.json({
        results: [],
        total: 0,
        stats: { total: 0, byType: {} },
        page: 1,
        limit: 25,
        hasMore: false,
      });
    }
    console.error("[API /iocs]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
