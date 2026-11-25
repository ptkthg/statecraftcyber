import { PUBLIC_BRIEFING_WHERE, PUBLIC_IOC_WHERE } from "@/lib/intelligence/publication";
import type { Metadata } from "next";
import type { Ioc, EnrichedIoc } from "@/lib/types";
import IocSearch from "@/components/iocs/IocSearch";
import PageHeader from "@/components/PageHeader";
import { getLivePreview, filterPreviewIocs } from "@/lib/live-preview";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Busca de IOCs",
  alternates: { canonical: "/iocs" },
  description: "Pesquise IPs, domínios, hashes e URLs extraídos dos briefings de ameaças da Statecraft.",
};

interface Stats {
  total: number;
  byType: Record<string, number>;
}

async function fetchInitialIocs(query: string): Promise<{ results: EnrichedIoc[]; total: number; stats: Stats; capturedAt?: string | null; error?: string }> {
  try {
  const preview = await getLivePreview();
  if (preview) {
    const { filtered, stats } = filterPreviewIocs(preview.iocs, query, "");
    return { results: filtered.slice(0, 25), total: filtered.length, stats, capturedAt: preview.capturedAt };
  }
    const { prisma } = await import("@/lib/prisma");

    const where = { ...PUBLIC_IOC_WHERE, ...(query ? { normalized: { contains: query.trim().toLowerCase() } } : {}) };
    const iocTableCount = await prisma.ioc.count({ where: PUBLIC_IOC_WHERE });

    if (iocTableCount > 0) {
      const [rows, allForStats, total] = await Promise.all([
        prisma.ioc.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 25,
          include: {
            briefing: {
              select: { slug: true, title: true, severity: true, sourceName: true, createdAt: true },
            },
          },
        }),
        prisma.ioc.groupBy({ where: PUBLIC_IOC_WHERE, by: ["type"], _count: { type: true } }),
        prisma.ioc.count({ where }),
      ]);

      const results: EnrichedIoc[] = rows.map((ioc) => ({
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

      return { results, total, stats: { total: iocTableCount, byType } };
    }

    // Fallback: scan Briefing.iocs JSON field
    const briefings = await prisma.briefing.findMany({
      where: { ...PUBLIC_BRIEFING_WHERE },
      select: { slug: true, title: true, severity: true, sourceName: true, createdAt: true, iocs: true },
      orderBy: { createdAt: "desc" },
    });

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

    const byType = allIocs.reduce<Record<string, number>>((acc, ioc) => {
      acc[ioc.type] = (acc[ioc.type] ?? 0) + 1;
      return acc;
    }, {});

    const filtered = allIocs.filter(ioc => !query || ioc.value.toLowerCase().includes(query.trim().toLowerCase()));
    return {
      results: filtered.slice(0, 25),
      total: filtered.length,
      stats: { total: allIocs.length, byType },
    };
  } catch {
    return { results: [], total: 0, stats: { total: 0, byType: {} }, error: "Fonte de IOCs indisponível. Não foi possível carregar a publicação. Tente novamente mais tarde." };
  }
}

export default async function IocPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { results, total, stats, capturedAt, error } = await fetchInitialIocs(q);

  return (
    <main className="editorial-page page-shell ioc-editorial-page">
      <PageHeader eyebrow="INDICADORES / CONSULTA TÉCNICA" title="Indicadores em contexto." description="Consulte IPs, domínios, hashes e URLs associados aos briefings publicados, preservando sua fonte." capturedAt={capturedAt} />
      <div className="section-heading"><h2>CONSULTA DE IOCs</h2><span>{stats.total.toLocaleString("pt-BR")} REGISTROS INDEXADOS</span></div>
      <IocSearch key={q} initialResults={results} initialTotal={total} initialStats={stats} initialQuery={q} initialError={error} />
    </main>
  );
}
