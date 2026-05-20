import Link from "next/link";
import { ArrowRight, ChevronRight, BadgeCheck, Languages, Fingerprint, Crosshair } from "lucide-react";
import { unstable_cache } from "next/cache";
import RadarMap from "@/components/radar/RadarMap";
import BriefingCard from "@/components/threat/BriefingCard";
import NewsSection from "@/components/news/NewsSection";
import { fetchNewsArticles } from "@/lib/news-feeds";
import type { Briefing } from "@/data/briefings";

const getCachedHomeNews = unstable_cache(
  async () => {
    try {
      const articles = await fetchNewsArticles(3);
      try {
        const { prisma } = await import("@/lib/prisma");
        const slugs = articles.map((a) => a.slug);
        const cached = await prisma.newsCache.findMany({
          where: { slug: { in: slugs } },
          select: { slug: true, title: true, summary: true },
        });
        const map = new Map(cached.map((c) => [c.slug, c]));
        return articles
          .map((a) => { const c = map.get(a.slug); return c ? { ...a, title: c.title, summary: c.summary } : a; })
          .slice(0, 7);
      } catch {
        return articles.slice(0, 7);
      }
    } catch {
      return [];
    }
  },
  ["home-news"],
  { revalidate: 120 }
);

async function getFeaturedBriefings(): Promise<Briefing[]> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.briefing.findMany({
      where: { status: "published" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true, slug: true, title: true, summary: true,
        severity: true, category: true, tags: true,
        readingTime: true, createdAt: true, affectedRegions: true,
      },
    });
    return rows.map((b) => ({
      id: b.id,
      slug: b.slug,
      title: b.title,
      summary: b.summary,
      severity: b.severity as Briefing["severity"],
      category: b.category as Briefing["category"],
      region: (b.affectedRegions[0] ?? "Global") as Briefing["region"],
      date: b.createdAt.toISOString(),
      readingTime: b.readingTime,
      author: "IA Statecraft",
      tags: b.tags,
    }));
  } catch {
    return [];
  }
}

async function getStats() {
  try {
    const { prisma } = await import("@/lib/prisma");
    const [total, latest] = await Promise.all([
      prisma.briefing.count({ where: { status: "published" } }),
      prisma.briefing.findFirst({
        where: { status: "published" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);
    return { total, latestAt: latest?.createdAt ?? null };
  } catch {
    return { total: 0, latestAt: null };
  }
}

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d atrás`;
  if (hours > 0) return `${hours}h atrás`;
  return "há pouco";
}

export default async function HomePage() {
  const [featuredBriefings, homeNews, stats] = await Promise.all([
    getFeaturedBriefings(),
    getCachedHomeNews(),
    getStats(),
  ]);

  const lastUpdate = stats.latestAt ? formatTimeAgo(new Date(stats.latestAt)) : null;

  return (
    <main className="min-h-screen bg-[#050505]">
      {/* Hero Section */}
      <section className="relative min-h-[80vh] overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/80 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#050505] to-transparent" />

        <div className="absolute right-0 top-0 bottom-0 w-1/2 flex items-center justify-end opacity-70">
          <div className="w-full max-w-[600px] pr-8">
            <RadarMap />
          </div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-36 pb-24 w-full">
          <div className="max-w-2xl">
            <Link href="/threat-briefings" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-red-600/30 bg-red-950/20 mb-8 hover:border-red-500/50 transition-colors">
              <div className="w-2 h-2 rounded-full bg-red-600 blink" />
              <span className="text-xs font-semibold text-red-400 tracking-wider uppercase">
                Monitoramento contínuo de ameaças
              </span>
            </Link>

            <h1
              className="text-5xl md:text-6xl font-black text-white leading-tight mb-6"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              Inteligência{" "}
              <span className="text-red-600">Cibernética</span>
              {" "}para Proteger o Território Digital
            </h1>

            <p className="text-[#C8C8D2] text-lg leading-relaxed mb-8 max-w-xl">
              A Statecraft agrega inteligência de ameaças de fontes abertas globais e entrega
              briefings operacionais em PT-BR, para que sua equipe saiba o que está acontecendo antes de ser impactada.
            </p>

            <div className="flex items-center gap-4 flex-wrap">
              <Link
                href="/threat-briefings"
                className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-all duration-200 hover:shadow-[0_0_30px_rgba(229,9,20,0.35)] focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-[#050505]"
              >
                Ver Threat Briefings
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/sobre"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/[0.05] hover:bg-white/10 border border-white/10 hover:border-white/20 text-white font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-[#050505]"
              >
                Sobre a Statecraft
                <ChevronRight size={16} />
              </Link>
            </div>

            {(lastUpdate || stats.total > 0) && (
              <div className="flex items-center gap-3 mt-6 text-xs font-mono text-[#A1A1AA]">
                {lastUpdate && <span>Último briefing: {lastUpdate}</span>}
                {lastUpdate && stats.total > 0 && <span className="text-white/20">·</span>}
                {stats.total > 0 && (
                  <span>{stats.total} briefing{stats.total !== 1 ? "s" : ""} publicados</span>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Briefings em Destaque */}
      <section className="py-20 bg-[#080808] border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="text-xs font-semibold text-red-500 uppercase tracking-widest mb-2">
                Inteligência de Ameaças
              </div>
              <h2 className="text-2xl font-black text-white">Últimos Threat Briefings</h2>
            </div>
            <Link
              href="/threat-briefings"
              className="hidden sm:flex items-center gap-1 text-sm text-[#A1A1AA] hover:text-white transition-colors"
            >
              Ver todos <ArrowRight size={14} />
            </Link>
          </div>

          {featuredBriefings.length > 0 ? (
            <div className="grid md:grid-cols-3 gap-4">
              {featuredBriefings.map((briefing) => (
                <BriefingCard key={briefing.id} briefing={briefing} variant="featured" />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-[#A1A1AA] text-sm">
              Nenhum briefing publicado ainda.{" "}
              <Link href="/threat-briefings" className="text-red-600/70 hover:text-red-500 transition-colors">
                Ver todos os briefings
              </Link>
            </div>
          )}

          <div className="mt-6 sm:hidden text-center">
            <Link
              href="/threat-briefings"
              className="inline-flex items-center gap-1 text-sm text-[#A1A1AA] hover:text-white transition-colors"
            >
              Ver todos os briefings <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      <NewsSection articles={homeNews} />

      {/* O que é a Statecraft */}
      <section className="py-24 border-t border-red-600/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="text-xs font-semibold text-red-500 uppercase tracking-widest mb-4">
                O que fazemos
              </div>
              <h2 className="text-3xl font-black text-white mb-5 leading-snug">
                Threat intelligence acessível para times de segurança
              </h2>
              <p className="text-[#C8C8D2] text-sm leading-relaxed mb-4">
                A Statecraft agrega inteligência de ameaças de fontes abertas e especializadas:
                CISA KEV, OTX AlienVault, NVD e outros feeds globais, organizando tudo em briefings
                legíveis, com contexto técnico e recomendações acionáveis.
              </p>
              <p className="text-[#C8C8D2] text-sm leading-relaxed mb-6">
                Cada briefing inclui IOCs, técnicas MITRE ATT&CK, scores de severidade e links diretos
                para as fontes primárias, para que analistas possam investigar sem perder tempo rastreando
                fontes manualmente.
              </p>
              <Link
                href="/sobre"
                className="inline-flex items-center gap-1 text-sm text-red-500 hover:text-red-400 font-medium transition-colors"
              >
                Saiba mais sobre a Statecraft <ArrowRight size={14} />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: BadgeCheck, title: "Fontes verificadas", desc: "CISA KEV, OTX, NVD e feeds globais atualizados continuamente." },
                { icon: Languages, title: "Briefings em PT-BR", desc: "Conteúdo técnico em português, sem necessidade de tradução manual." },
                { icon: Fingerprint, title: "IOCs estruturados", desc: "IPs, domínios, hashes e URLs prontos para importar no seu SIEM." },
                { icon: Crosshair, title: "MITRE ATT&CK", desc: "Técnicas mapeadas para que você saiba exatamente onde defender." },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} className="bg-[#0D0D0D] border border-white/[0.06] rounded-xl p-5 hover:border-red-600/20 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-red-600/10 border border-red-600/20 flex items-center justify-center mb-3">
                      <Icon size={15} className="text-red-500" />
                    </div>
                    <h3 className="text-sm font-bold text-white mb-1">{item.title}</h3>
                    <p className="text-xs text-[#C8C8D2] leading-relaxed">{item.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
