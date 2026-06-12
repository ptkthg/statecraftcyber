import { unstable_cache } from "next/cache";
import { fetchNewsArticles } from "@/lib/news-feeds";
import NewsExplorer from "@/components/news/NewsExplorer";

const getCachedNews = unstable_cache(
  async () => {
    const articles = await fetchNewsArticles(3);

    try {
      const { prisma } = await import("@/lib/prisma");
      const slugs = articles.map((a) => a.slug);
      const cached = await prisma.newsCache.findMany({
        where: { slug: { in: slugs } },
        select: { slug: true, title: true, summary: true },
      });
      const cacheMap = new Map(cached.map((c) => [c.slug, c]));
      return articles.map((a) => {
        const c = cacheMap.get(a.slug);
        return c ? { ...a, title: c.title, summary: c.summary } : a;
      });
    } catch {
      return articles;
    }
  },
  ["noticias-list"],
  { revalidate: 120 }
);

export const metadata = {
  title: "Notícias | Statecraft Cyber Intelligence",
  description:
    "Cobertura jornalística do cenário global de cibersegurança, reescrita em português pela IA Statecraft a partir de 19 fontes especializadas.",
};

export default async function NoticiasPage() {
  const initialArticles = await getCachedNews();

  return (
    <main className="min-h-screen bg-canvas pt-16">
      {/* Hero */}
      <section className="relative py-14 border-b border-white/[0.04] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-canvas" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-red-600 blink" />
            <span className="text-xs font-semibold text-dim uppercase tracking-widest">Monitoramento Ativo</span>
          </div>
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-2">Notícias</h1>
            <p className="text-body text-sm leading-relaxed max-w-xl mb-1">
              Cobertura jornalística do cenário global de segurança, reescrita em português pela IA Statecraft a partir de 19 fontes especializadas.
            </p>
            <p className="text-xs text-dim max-w-xl leading-relaxed">
              Para análises técnicas com IOCs e recomendações operacionais, veja os{" "}
              <a href="/threat-briefings" className="text-dim hover:text-white transition-colors">
                Threat Briefings
              </a>.
            </p>
            {initialArticles.length > 0 && (
              <p className="text-xs text-dim mt-3">
                <span className="font-mono font-bold text-dim">{initialArticles.length}</span> artigos monitorados
              </p>
            )}
          </div>
        </div>
      </section>

      <NewsExplorer initialArticles={initialArticles} />
    </main>
  );
}
