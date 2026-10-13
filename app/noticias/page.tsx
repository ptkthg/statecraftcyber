import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { fetchNewsArticles } from "@/lib/news-feeds";
import { localizeNewsArticles } from "@/lib/news-localization";
import { editorialImageForNews } from "@/lib/editorial-image";
import NewsExplorer from "@/components/news/NewsExplorer";
import { getLivePreview } from "@/lib/live-preview";

const getCachedNews = unstable_cache(async () => localizeNewsArticles(await fetchNewsArticles(3)), ["noticias-list"], { revalidate: 120 });
export const metadata = { title: "Notícias", description: "Notícias de cibersegurança agregadas de fontes especializadas, com origem preservada e contexto para análise." };

export default async function NoticiasPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const preview = await getLivePreview();
  const [articles, { tab }] = await Promise.all([preview ? Promise.resolve(preview.news.articles) : getCachedNews().catch(() => []), searchParams]);
  const lead = articles[0];
  const image = lead ? editorialImageForNews(lead) : null;
  const categoryLeads = [...new Set(articles.map((article) => article.type).filter(Boolean))].slice(0, 3).map((type) => ({ type, article: articles.find((item) => item.type === type)! }));
  return <main className="editorial-page page-shell news-editorial-page">
    {lead && image ? <section className={`news-lead ${lead.title.length > 72 ? "long-headline" : ""}`}>
      <div className="news-lead-copy"><p className="eyebrow">NOTÍCIAS / EM DESTAQUE</p><h1><Link href={`/noticias/${lead.slug}`}>{lead.title}</Link></h1><p className="news-summary">{lead.summary}</p><p className="story-meta">{new Date(lead.publishedAt).toLocaleDateString("pt-BR")} · {lead.type || "CIBERSEGURANÇA"} · {lead.source}</p><Link className="editorial-button" href={`/noticias/${lead.slug}`}>Ler notícia completa →</Link></div>
      <div className="news-lead-photo"><Image src={image.src} alt={image.alt} fill sizes="(max-width: 940px) 100vw, 40vw" priority /></div>
      <aside className="news-latest"><h2>ÚLTIMAS NOTÍCIAS</h2>{articles.slice(1, 5).map((article) => <Link href={`/noticias/${article.slug}`} key={article.slug}><small>{new Date(article.publishedAt).toLocaleDateString("pt-BR")} · {article.source}</small><strong>{article.title}</strong></Link>)}</aside>
    </section> : <div className="news-empty"><p className="eyebrow">NOTÍCIAS</p><h1>Cobertura em contexto.</h1><p>As notícias dos feeds estão indisponíveis no momento.</p></div>}
    {categoryLeads.length > 0 && <section className="editorial-section news-categories"><div className="section-heading"><h2>EDITORIAS</h2><span>CATEGORIAS PRESENTES NA COBERTURA</span></div><div className="editorial-three">{categoryLeads.map(({ type, article }) => <article className="news-category" key={type}><p className="eyebrow">{type}</p><p className="story-meta">{new Date(article.publishedAt).toLocaleDateString("pt-BR")} · {article.source}</p><h3><Link href={`/noticias/${article.slug}`}>{article.title}</Link></h3><p className="news-summary">{article.summary}</p><Link href={`/noticias/${article.slug}`} className="under-link">Ler notícia →</Link></article>)}</div></section>}
    <div className="section-heading"><h2>ARQUIVO DE NOTÍCIAS</h2><span>CONTEÚDO AGREGADO · FONTES ORIGINAIS NOS ARTIGOS</span></div>
    <NewsExplorer initialArticles={articles} initialTab={tab === "contexto" ? "contexto" : "alertas"} />
  </main>;
}
