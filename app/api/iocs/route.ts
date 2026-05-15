import { NextRequest, NextResponse } from "next/server";
import type { Ioc, EnrichedIoc } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { prisma } = await import("@/lib/prisma");
    const { searchParams } = req.nextUrl;

    const q = searchParams.get("q")?.toLowerCase().trim() ?? "";
    const typeFilter = searchParams.get("type") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = 25;

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

    // Filtros
    let filtered = allIocs;
    if (q) filtered = filtered.filter((ioc) => ioc.value.toLowerCase().includes(q));
    if (typeFilter) filtered = filtered.filter((ioc) => ioc.type === typeFilter);

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const results = filtered.slice(offset, offset + limit);

    return NextResponse.json(
      { results, total, stats, page, limit },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } }
    );
  } catch (err) {
    const error = err as { code?: string; message: string };
    if (
      error.code === "P1001" ||
      error.message?.includes("DATABASE_URL") ||
      error.message?.includes("connect")
    ) {
      return NextResponse.json({ results: [], total: 0, stats: { total: 0, byType: {} }, page: 1, limit: 25 });
    }
    console.error("[API /iocs]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
