import type { Metadata } from "next";
import { PUBLIC_BRIEFING_WHERE } from "@/lib/intelligence/publication";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { campaigns } from "@/data/campaigns";
import { getStoredNews } from "@/lib/news-store";
import EditorialHero from "@/components/editorial/EditorialHero";
import StoryTile from "@/components/editorial/StoryTile";
import Image from "next/image";
import { getLivePreview } from "@/lib/live-preview";
import { getPublishedSnapshot } from "@/lib/publication/snapshot";
import type { NewsArticle } from "@/lib/news-feeds";
import JournalistByline from '@/components/ui/JournalistByline';

export const revalidate = 300;
export const metadata: Metadata = { alternates: { canonical: "/" } };
const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };
type HomeBriefing = { slug: string; title: string; summary: string; severity: keyof typeof severityRank; category: string; createdAt: Date; sourceName: string };
const formatDate = (date: string | Date) => new Date(date).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

async function getHomeData() {
  let briefings: HomeBriefing[] = [];
  let news: NewsArticle[] = [];
  let sourceUnavailable = false;
  let briefingsUnavailable = false;
  let newsUnavailable = false;
  let radar: { critical: number; kev: number; capturedAt: string | null } | null = null;
  const now = Date.now();
  const since = new Date(now - 72 * 3_600_000);
  try {
    const published = await getPublishedSnapshot();
    const preview = published ?? await getLivePreview();
    if (preview) {
      briefings = preview.briefings.briefings.map((item) => ({ ...item, createdAt: new Date(item.createdAt) }));
      news = [...preview.news.articles].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 6);
      if (published) radar = {
        critical: published.cves.filter((cve) => cve.cvssScore !== null && cve.cvssScore >= 9 && cve.cvssScore <= 10 && Date.parse(cve.published) >= since.getTime() && Date.parse(cve.published) <= now).length,
        kev: published.cves.filter((cve) => cve.inCisaKev).length,
        capturedAt: published.capturedAt || published.generatedAt,
      };
    } else {
      const [briefingResult, newsResult, radarResult] = await Promise.allSettled([
        prisma.briefing.findMany({ where: { ...PUBLIC_BRIEFING_WHERE }, orderBy: { createdAt: "desc" }, take: 30, select: { slug: true, title: true, summary: true, severity: true, category: true, createdAt: true, sourceName: true } }),
        getStoredNews(),
        Promise.all([
          prisma.cveCache.count({ where: { recordStatus: { not: "Rejected" }, cvssScore: { gte: 9, lte: 10 }, published: { gte: since, lte: new Date(now) } } }),
          prisma.cveCache.count({ where: { recordStatus: { not: "Rejected" }, inCisaKev: true } }),
          prisma.updateHealth.findUnique({ where: { key: "cves" }, select: { lastCollectionAt: true } }),
        ]),
      ]);
      if (briefingResult.status === "fulfilled") briefings = briefingResult.value;
      else briefingsUnavailable = true;
      if (newsResult.status === "fulfilled") news = newsResult.value.articles.slice(0, 6);
      else newsUnavailable = true;
      if (radarResult.status === "fulfilled") radar = { critical: radarResult.value[0], kev: radarResult.value[1], capturedAt: radarResult.value[2]?.lastCollectionAt?.toISOString() ?? null };
    }
  } catch {
    sourceUnavailable = true;
  }
  return { briefings, news, radar, sourceUnavailable, briefingsUnavailable, newsUnavailable };
}

export default async function HomePage() {
  const { briefings, news, radar, sourceUnavailable, briefingsUnavailable, newsUnavailable } = await getHomeData();
  const ranked = [...briefings].sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.createdAt.getTime() - a.createdAt.getTime());
  const featured = ranked[0];
  const observed = ranked.slice(1, 4);

  return <main className="editorial-page page-shell home-page" data-content="home">
    <EditorialHero eyebrow="INTELIGÊNCIA ESTRATÉGICA / BRASIL" title={<>Ameaças globais.<br />Contexto local.</>} description="Inteligência de ameaças, cibersegurança e geopolítica traduzidas em contexto para decisões no Brasil e na América Latina." image="congresso" imageAlt="Congresso Nacional em Brasília, fotografia histórica do Acervo Arquivo Nacional" labels={["ANÁLISE", "GEOPOLÍTICA", "INFRAESTRUTURA", "BRASIL"]} primary={{ label: "Explorar CVEs", href: "/cves" }} secondary={{ label: "Conheça o projeto", href: "/sobre" }} />
    {sourceUnavailable && <p className="editorial-empty" role="status">Fonte de dados indisponível. Tente consultar novamente mais tarde.</p>}
    <section className="editorial-section" aria-label="Radar de vulnerabilidades">
      {radar ? <div className="editorial-three home-data-strip">
        <Link href="/cves?severity=CRITICAL&window=72h&sort=recent"><strong>{radar.critical}</strong><span>CVEs críticas nas últimas 72 h</span></Link>
        <Link href="/cves?kev=yes"><strong>{radar.kev}</strong><span>CVEs no catálogo CISA KEV</span></Link>
        <div><span>Última coleta</span>{radar.capturedAt ? <time dateTime={radar.capturedAt}>{new Date(radar.capturedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} (horário de Brasília)</time> : <span>Data não informada</span>}</div>
      </div> : !sourceUnavailable && <p className="editorial-empty">Dados do radar indisponíveis no momento.</p>}
    </section>
    <section className="editorial-section"><div className="section-heading"><h2>NOTÍCIAS RECENTES</h2><Link href="/noticias">Ver todas →</Link></div>
      {news.length > 0 ? <div className="editorial-three">{news.map((article) => <article className="story-tile story-tile--text" key={article.slug}><div className="story-copy"><p className="story-meta">{article.source} · {formatDate(article.publishedAt)}</p><h3><Link href={`/noticias/${article.slug}`}>{article.title}</Link></h3><p>{article.summary}</p><JournalistByline compact contentOrigin={article.contentOrigin} journalist={article.journalist} source={article.source} sourceUrl={article.url} /></div></article>)}</div> : <p className="editorial-empty">{sourceUnavailable || newsUnavailable ? "Notícias indisponíveis no momento." : "Nenhuma notícia publicada no momento."}</p>}
    </section>
    <section className="editorial-section"><div className="section-heading"><h2>CAMPANHAS DOCUMENTADAS</h2><Link href="/campanhas">Ver todas →</Link></div><div className="editorial-three">{campaigns.slice(0, 3).map((campaign) => <StoryTile key={campaign.slug} section="CAMPANHA" title={campaign.title} description={campaign.summary} href={`/campanhas/${campaign.slug}`} image="antena" imageAlt="Antena de telecomunicações em Teresópolis" />)}</div></section>
    {featured && <section className="editorial-section"><div className="section-heading"><h2>BRIEFING EM DESTAQUE</h2><Link href="/threat-briefings">Ver todos →</Link></div>
      <div className="home-feature"><div className="feature-photo"><Image src="/editorial/datacenter-ache.webp" alt="Racks de servidores; imagem editorial ilustrativa" fill sizes="(max-width: 700px) 100vw, 24vw" /></div><div className="feature-story"><p className="story-meta">{formatDate(featured.createdAt)} · {featured.category} · {featured.sourceName}</p><h3><Link href={`/threat-briefings/${featured.slug}`}>{featured.title}</Link></h3><p>{featured.summary}</p><Link href={`/threat-briefings/${featured.slug}`} className="editorial-button">Ler briefing completo →</Link></div>{observed.length > 0 && <aside className="feature-aside"><h4>EM OBSERVAÇÃO</h4>{observed.map((item) => <Link key={item.slug} href={`/threat-briefings/${item.slug}`}>{item.title}<small>{item.severity.toUpperCase()} · {item.sourceName}</small></Link>)}</aside>}</div>
    </section>}
    {briefingsUnavailable && <p className="editorial-empty" role="status">Arquivo de briefings indisponível no momento.</p>}
    <section className="editorial-section"><div className="section-heading"><h2>EDITORIAS</h2><span>INTELIGÊNCIA EM CONTEXTO</span></div><div className="editorial-three">
      <StoryTile section="VULNERABILIDADES" title="Radar de CVEs e superfície de ataque" description="Priorize com CVSS, EPSS e catálogo CISA KEV, quando os dados estiverem disponíveis." href="/cves" image="datacenter" imageAlt="Racks de servidores em um datacenter" />
      <StoryTile section="CAMPANHAS" title="Campanhas documentadas" description="Evidências, técnicas e implicações de campanhas de ameaça." href="/campanhas" image="antena" imageAlt="Antena de telecomunicações em Teresópolis" />
      <StoryTile section="NOTÍCIAS" title="Acompanhe as notícias de segurança" description="As últimas publicações das fontes acompanhadas pelo projeto." href="/noticias" image="porto" imageAlt="Guindastes e navios de carga em um porto" />
    </div></section>
  </main>;
}
