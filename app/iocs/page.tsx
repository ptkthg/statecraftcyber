import { PUBLIC_BRIEFING_WHERE, PUBLIC_IOC_WHERE } from "@/lib/intelligence/publication";
import type { Metadata } from "next";
import type { Ioc, EnrichedIoc } from "@/lib/types";
import IocSearch from "@/components/iocs/IocSearch";
import EditorialHero from "@/components/editorial/EditorialHero";
import { getLivePreview, filterPreviewIocs } from "@/lib/live-preview";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Busca de IOCs | Statecraft Cyber Intelligence",
  description: "Pesquise IPs, domínios, hashes e URLs extraídos dos briefings de ameaças da Statecraft.",
};

interface Stats {
  total: number;
  byType: Record<string, number>;
}

async function fetchInitialIocs(): Promise<{ results: EnrichedIoc[]; total: number; stats: Stats }> {
  const preview = await getLivePreview();
  if (preview) {
    const { stats } = filterPreviewIocs(preview.iocs, "", "");
    return { results: preview.iocs.slice(0, 25), total: preview.iocs.length, stats };
  }
  try {
    const { prisma } = await import("@/lib/prisma");

    const iocTableCount = await prisma.ioc.count({ where: PUBLIC_IOC_WHERE });

    if (iocTableCount > 0) {
      const [rows, allForStats] = await Promise.all([
        prisma.ioc.findMany({
          where: PUBLIC_IOC_WHERE,
          orderBy: { createdAt: "desc" },
          take: 25,
          include: {
            briefing: {
              select: { slug: true, title: true, severity: true, sourceName: true, createdAt: true },
            },
          },
        }),
        prisma.ioc.groupBy({ where: PUBLIC_IOC_WHERE, by: ["type"], _count: { type: true } }),
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

      return { results, total: iocTableCount, stats: { total: iocTableCount, byType } };
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

    return {
      results: allIocs.slice(0, 25),
      total: allIocs.length,
      stats: { total: allIocs.length, byType },
    };
  } catch {
    return { results: [], total: 0, stats: { total: 0, byType: {} } };
  }
}

export default async function IocPage() {
  const { results, total, stats } = await fetchInitialIocs();

  return (
    <main className="editorial-page page-shell ioc-editorial-page">
      <EditorialHero eyebrow="INDICADORES / CONSULTA TÉCNICA" title={<>Indicadores<br />em contexto.</>} subtitle="Evidência para investigar." description="Consulte IPs, domínios, hashes e URLs associados aos briefings publicados. Cada indicador preserva sua fonte e relação com a análise original." image="antena" imageAlt="Antena de telecomunicações em Teresópolis, fotografia de Vitor Paladini" labels={["INDICADORES", "FONTES", "CONTEXTO", "BRASIL"]} />
      <div className="section-heading"><h2>CONSULTA DE IOCs</h2><span>{stats.total.toLocaleString("pt-BR")} REGISTROS INDEXADOS</span></div>
      <IocSearch initialResults={results} initialTotal={total} initialStats={stats} />
    </main>
  );
}
