import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import BriefingExplorer, { type BriefingItem } from "@/components/threat/BriefingExplorer";
import type { Ioc, LiveIoc } from "@/lib/types";

export const revalidate = 300; // revalida a cada 5 min

async function getBriefings(): Promise<{ briefings: BriefingItem[]; trending: BriefingItem[]; latestIocs: LiveIoc[] }> {
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
    <main className="min-h-screen bg-canvas pt-16">
      <div className="max-w-[1140px] mx-auto px-6 pt-8">
        <PageHeader
          title="Threat Briefings"
          description="Análises operacionais de ameaças ativas com severidade, IOCs e recomendações diretas para o Blue Team."
          meta={
            briefings.length > 0
              ? [
                  { text: "pipeline ativo · execução horária", live: true },
                  { text: `${briefings.length} publicados · ${criticalCount} críticos` },
                ]
              : undefined
          }
        />
      </div>

      <BriefingExplorer
        initialBriefings={briefings}
        initialTrending={trending}
        initialIocs={latestIocs}
        initialFilter={sev === "critical" ? "Crítico" : "Todos"}
      />
    </main>
  );
}
