import { prisma } from "@/lib/prisma";
import { Wifi } from "lucide-react";
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

export default async function ThreatBriefingsPage() {
  const { briefings, trending, latestIocs } = await getBriefings();

  return (
    <main className="min-h-screen bg-[#050505] pt-16">
      {/* Hero — renderizado no servidor */}
      <section className="relative py-14 border-b border-white/[0.04] overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#050505]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-red-600 blink" />
            <span className="text-xs font-semibold text-red-400 uppercase tracking-widest">Threat Intelligence</span>
            <span className="ml-2 flex items-center gap-1 text-[10px] text-green-400 bg-green-600/10 border border-green-600/20 px-2 py-0.5 rounded-full">
              <Wifi size={8} /> AO VIVO
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3">Threat Briefings</h1>
          <p className="text-[#A1A1AA] max-w-2xl text-base leading-relaxed mb-2">
            Análises operacionais de ameaças ativas, vulnerabilidades e campanhas APT, geradas automaticamente pela IA Statecraft a cada hora.
          </p>
          <p className="text-xs text-[#555] max-w-xl leading-relaxed">
            Diferente das notícias, cada briefing é uma ficha técnica acionável: severidade, IOCs, CVEs e recomendações diretas para o Blue Team.
          </p>
          {briefings.length > 0 && (
            <div className="mt-4 flex items-center gap-2 text-[11px] text-[#555]">
              <span className="font-mono font-bold text-white">{briefings.length}</span> briefings publicados
              {trending.some((b) => b.severity === "critical") && (
                <span className="ml-2 text-red-400 font-semibold">· {trending.filter((b) => b.severity === "critical").length} crítico{trending.filter((b) => b.severity === "critical").length > 1 ? "s" : ""}</span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Explorer — interatividade no cliente, dados já hidratados do servidor */}
      <BriefingExplorer
        initialBriefings={briefings}
        initialTrending={trending}
        initialIocs={latestIocs}
      />
    </main>
  );
}
