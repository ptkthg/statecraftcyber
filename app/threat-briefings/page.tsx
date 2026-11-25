import { PUBLIC_BRIEFING_WHERE } from "@/lib/intelligence/publication";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/PageHeader";
import BriefingExplorer, { type BriefingItem } from "@/components/threat/BriefingExplorer";
import type { Ioc, LiveIoc } from "@/lib/types";
import { getLivePreview } from "@/lib/live-preview";

export const revalidate = 300; // revalida a cada 5 min

async function getBriefings(): Promise<{ briefings: BriefingItem[]; trending: BriefingItem[]; latestIocs: LiveIoc[]; capturedAt: string | null; unavailable: boolean }> {
  try {
    const preview = await getLivePreview();
    if (preview) {
      const briefings: BriefingItem[] = preview.briefings.briefings.map((item) => ({
        ...item,
        iocs: preview.iocs.filter((ioc) => ioc.briefingSlug === item.slug),
      }));
      return { briefings, trending: briefings.filter((item) => ["critical", "high"].includes(item.severity)).slice(0, 5), latestIocs: preview.briefings.latestIocs, capturedAt: preview.capturedAt, unavailable: false };
    }
    const rows = await prisma.briefing.findMany({
      where: { ...PUBLIC_BRIEFING_WHERE },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true, title: true, slug: true, summary: true,
        severity: true, category: true, tags: true,
        sourceName: true, sourceUrl: true, cves: true,
        iocs: true, createdAt: true, readingTime: true, structuredContent: true,
      },
    });

    const briefings: BriefingItem[] = rows.map((r) => ({
      ...r,
      ...((r.structuredContent as unknown as import("@/lib/types").StructuredBriefing)?.editorialReport?.publishable ? {contentOrigin:"automated" as const,desk:"Mesa de Inteligência do Statecraft"} : {}),
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

    return { briefings, trending, latestIocs, capturedAt: null, unavailable: false };
  } catch {
    return { briefings: [], trending: [], latestIocs: [], capturedAt: null, unavailable: true };
  }
}

export default async function ThreatBriefingsPage({
  searchParams,
}: {
  searchParams: Promise<{ sev?: string }>;
}) {
  const { briefings, trending, latestIocs, capturedAt, unavailable } = await getBriefings();
  const { sev } = await searchParams;
  const criticalCount = briefings.filter((b) => b.severity === "critical").length;

  return (
    <main className="editorial-page page-shell">
      <PageHeader eyebrow="INTELIGÊNCIA OPERACIONAL" title="Threat Briefings" description="Ameaças em contexto, indicadores técnicos e análises operacionais para o Brasil e a América Latina." capturedAt={capturedAt} />
      {unavailable ? <p className="editorial-empty" role="status">Arquivo de briefings indisponível. Tente consultar novamente mais tarde.</p> : <>
        <div className="section-heading"><h2>ARQUIVO DE BRIEFINGS</h2><span>{briefings.length} PUBLICADOS · {criticalCount} CRÍTICOS</span></div>

        <BriefingExplorer
          initialBriefings={briefings}
          initialTrending={trending}
          initialIocs={latestIocs}
          initialFilter={sev === "critical" ? "Crítico" : "Todos"}
        />
      </>}
    </main>
  );
}
