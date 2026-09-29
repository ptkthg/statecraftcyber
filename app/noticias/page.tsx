import { unstable_cache } from "next/cache";
import { fetchNewsArticles } from "@/lib/news-feeds";
import { localizeNewsArticles } from "@/lib/news-localization";
import NewsExplorer from "@/components/news/NewsExplorer";
import { PageHeader } from "@/components/ui/PageHeader";

const getCachedNews = unstable_cache(
  async () => {
    return localizeNewsArticles(await fetchNewsArticles(3));
  },
  ["noticias-list"],
  { revalidate: 120 }
);

export const metadata = {
  title: "Notícias | Statecraft Cyber Intelligence",
  description:
    "Cobertura jornalística do cenário global de cibersegurança, reescrita em português pela IA Statecraft a partir de 20 fontes especializadas.",
};

export default async function NoticiasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [initialArticles, { tab }] = await Promise.all([getCachedNews(), searchParams]);

  return (
    <main className="min-h-screen bg-canvas pt-16">
      <div className="max-w-[1140px] mx-auto px-6 pt-8">
        <PageHeader
          title="Notícias"
          description="Cobertura do cenário global de segurança, reescrita em português pela IA Statecraft a partir de 20 fontes especializadas."
          meta={
            initialArticles.length > 0
              ? [
                  { text: "monitoramento ativo", live: true },
                  { text: `${initialArticles.length} artigos monitorados` },
                ]
              : undefined
          }
        />
      </div>

      <NewsExplorer
        initialArticles={initialArticles}
        initialTab={tab === "contexto" ? "contexto" : "alertas"}
      />
    </main>
  );
}
