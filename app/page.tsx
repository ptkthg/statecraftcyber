import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { campaigns } from "@/data/campaigns";
import { fetchNewsArticles } from "@/lib/news-feeds";
import { localizeNewsArticles } from "@/lib/news-localization";
import EditorialHero from "@/components/editorial/EditorialHero";
import StoryTile from "@/components/editorial/StoryTile";
import Image from "next/image";
import { getLivePreview } from "@/lib/live-preview";

export const revalidate = 300;

const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };

export default async function HomePage() {
  const preview = await getLivePreview();
  const [briefings, news] = await Promise.all([
    preview ? Promise.resolve(preview.briefings.briefings.map((item) => ({ ...item, createdAt: new Date(item.createdAt) })).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 30)) : prisma.briefing.findMany({ where: { status: "published" }, orderBy: { createdAt: "desc" }, take: 30, select: { slug: true, title: true, summary: true, severity: true, category: true, createdAt: true, sourceName: true } }).catch(() => []),
    preview ? Promise.resolve(preview.news.articles.slice(0, 6)) : fetchNewsArticles(3).then((items) => localizeNewsArticles(items.slice(0, 6))).catch(() => []),
  ]);
  // Destaque: maior severidade entre os 30 briefings recentes; empate pela data mais recente.
  const ranked = [...briefings].sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.createdAt.getTime() - a.createdAt.getTime());
  const featured = ranked[0];
  const observed = ranked.slice(1, 4);
  const latestNews = news[0];

  return <main className="editorial-page page-shell home-page">
    <EditorialHero eyebrow="INTELIGÊNCIA ESTRATÉGICA / BRASIL" title={<>Ameaças globais.<br />Contexto local.</>} description="Inteligência de ameaças, cibersegurança e geopolítica traduzidas em contexto para decisões no Brasil e na América Latina." image="congresso" imageAlt="Congresso Nacional em Brasília, fotografia histórica do Acervo Arquivo Nacional" labels={["ANÁLISE", "GEOPOLÍTICA", "INFRAESTRUTURA", "BRASIL"]} primary={{ label: "Briefings recentes", href: "/threat-briefings" }} secondary={{ label: "Conheça o projeto", href: "/sobre" }} />
    <section className="editorial-section"><div className="section-heading"><h2>BRIEFING EM DESTAQUE</h2><Link href="/threat-briefings">Ver todos →</Link></div>
      {featured ? <div className="home-feature"><div className="feature-photo"><Image src="/editorial/datacenter-ache.webp" alt="Racks de servidores; imagem editorial ilustrativa" fill sizes="(max-width: 700px) 100vw, 24vw" /></div><div className="feature-story"><p className="story-meta">{featured.createdAt.toLocaleDateString("pt-BR")} · {featured.category} · {featured.sourceName}</p><h3><Link href={`/threat-briefings/${featured.slug}`}>{featured.title}</Link></h3><p>{featured.summary}</p><Link href={`/threat-briefings/${featured.slug}`} className="editorial-button">Ler briefing completo →</Link></div><aside className="feature-aside"><h4>EM OBSERVAÇÃO</h4>{observed.map((item) => <Link key={item.slug} href={`/threat-briefings/${item.slug}`}>{item.title}<small>{item.severity.toUpperCase()} · {item.sourceName}</small></Link>)}</aside></div> : <div className="editorial-empty">Nenhum briefing publicado no momento. <Link href="/threat-briefings">Consultar o arquivo →</Link></div>}
    </section>
    <section className="editorial-section"><div className="section-heading"><h2>EDITORIAS</h2><span>INTELIGÊNCIA EM CONTEXTO</span></div><div className="editorial-three">
      <StoryTile section="VULNERABILIDADES" title="Radar de CVEs e superfície de ataque" description="Priorize com CVSS, EPSS e catálogo CISA KEV, quando os dados estiverem disponíveis." href="/cves" image="datacenter" imageAlt="Racks de servidores em um datacenter" />
      <StoryTile section="CAMPANHAS" title={campaigns[0]?.title ?? "Campanhas documentadas"} description={campaigns[0]?.summary} href={campaigns[0] ? `/campanhas/${campaigns[0].slug}` : "/campanhas"} image="antena" imageAlt="Antena de telecomunicações em Teresópolis" />
      <StoryTile section="NOTÍCIAS" title={latestNews?.title ?? "Acompanhe as notícias de segurança"} description={latestNews?.summary} href={latestNews ? `/noticias/${latestNews.slug}` : "/noticias"} image="porto" imageAlt="Guindastes e navios de carga em um porto" meta={latestNews ? `${latestNews.source} · ${new Date(latestNews.publishedAt).toLocaleDateString("pt-BR")}` : undefined} />
    </div></section>
  </main>;
}
