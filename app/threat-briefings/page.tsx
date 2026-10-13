import { prisma } from "@/lib/prisma";
import EditorialHero from "@/components/editorial/EditorialHero";
import BriefingExplorer, { type BriefingItem } from "@/components/threat/BriefingExplorer";
import type { Ioc, LiveIoc } from "@/lib/types";
import { getLivePreview } from "@/lib/live-preview";

export const revalidate = 300; // revalida a cada 5 min

async function getBriefings(): Promise<{ briefings: BriefingItem[]; trending: BriefingItem[]; latestIocs: LiveIoc[] }> {
  const preview = await getLivePreview();
  if (preview) {
    const briefings: BriefingItem[] = preview.briefings.briefings.map((item) => ({
      ...item,
      iocs: preview.iocs.filter((ioc) => ioc.briefingSlug === item.slug),
    }));
    return { briefings, trending: briefings.filter((item) => ["critical", "high"].includes(item.severity)).slice(0, 5), latestIocs: preview.briefings.latestIocs };
  }
  try {
    const rows = await prisma.briefing.findMany({
      where: { status: "published" },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true, title: true, slug: true, summary: true,
        severity: true, category: true, tags: true,
        sourceName: true, sourceUrl: true, cves: true,
        iocs: true, createdAt: true, readingTime: true,
      },
    });

    const briefings: BriefingItem[] = rows.map((r) => ({
      ...r,
      iocs: (r.iocs as Ioc[] | null) ?? [],
      createdAt: r.createdAt.toISOString(),
    }));

    const trending = [...briefings]
      .sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return order[a.severity] - order[b.severity];
      })
      .slice(0, 5);

    const latestIocs: LiveIoc[] = briefings
      .flatMap((b) =>
        b.iocs.slice(0, 2).map((ioc) => ({
          ...ioc,
          sourceName: b.sourceName,
          briefingSlug: b.slug,
          severity: b.severity,
        }))
      )
      .slice(0, 6);

    return { briefings, trending, latestIocs };
  } catch {
    return { briefings: [], trending: [], latestIocs: [] };
  }
}

export default async function ThreatBriefingsPage({
  searchParams,
}: {
  searchParams: Promise<{ sev?: string }>;
}) {
  const { briefings, trending, latestIocs } = await getBriefings();
  const { sev } = await searchParams;
  const criticalCount = briefings.filter((b) => b.severity === "critical").length;

  return (
    <main className="editorial-page page-shell">
      <EditorialHero eyebrow="INTELIGÊNCIA OPERACIONAL" title="Threat Briefings." subtitle={<>Ameaças em contexto.<br />Decisões com base em evidência.</>} description="Briefings de cibersegurança com foco no Brasil e na América Latina, análises operacionais, indicadores técnicos e implicações para governos, empresas e setores estratégicos." image="congresso" imageAlt="Congresso Nacional, fotografia histórica do Acervo Arquivo Nacional" labels={["AMEAÇAS", "INFRAESTRUTURA", "GEOPOLÍTICA", "BRASIL"]} />
      <div className="section-heading"><h2>ARQUIVO DE BRIEFINGS</h2><span>{briefings.length} PUBLICADOS · {criticalCount} CRÍTICOS</span></div>

      <BriefingExplorer
        initialBriefings={briefings}
        initialTrending={trending}
        initialIocs={latestIocs}
        initialFilter={sev === "critical" ? "Crítico" : "Todos"}
      />
    </main>
  );
}
