import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { ArrowLeft, ArrowUpRight, CalendarDays, ExternalLink } from "lucide-react";
import { campaigns, mentionsCampaign, type Campaign } from "@/data/campaigns";
import { fetchNewsArticles } from "@/lib/news-feeds";
import { localizeNewsArticles } from "@/lib/news-localization";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return campaigns.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const campaign = campaigns.find((item) => item.slug === slug);
  return campaign ? {
    title: `${campaign.title} | Statecraft Cyber Intelligence`,
    description: campaign.summary,
  } : {};
}

const getRelatedCoverage = unstable_cache(async (slug: string) => {
  const campaign = campaigns.find((item) => item.slug === slug);
  if (!campaign) return { news: [] as { slug: string; title: string }[], briefings: [] as { slug: string; title: string }[] };

  const [newsResult, briefingResult] = await Promise.allSettled([
    fetchNewsArticles(3),
    prisma.briefing.findMany({
      where: { status: "published", createdAt: { gte: new Date(Date.now() - 90 * 86400000) } },
      select: { slug: true, title: true, summary: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const matchingNews = newsResult.status === "fulfilled"
    ? newsResult.value.filter((article) => mentionsCampaign(`${article.title} ${article.summary}`, campaign)).slice(0, 4)
    : [];
  const news = matchingNews.length ? await localizeNewsArticles(matchingNews).catch(() => matchingNews) : [];
  const briefings = briefingResult.status === "fulfilled"
    ? briefingResult.value.filter((briefing) => mentionsCampaign(`${briefing.title} ${briefing.summary}`, campaign)).slice(0, 4)
    : [];
  return { news: news.map(({ slug, title }) => ({ slug, title })), briefings: briefings.map(({ slug, title }) => ({ slug, title })) };
}, ["campaign-related-coverage"], { revalidate: 900 });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/[0.08] bg-raised p-6 md:p-7"><h2 className="mb-5 font-display text-xl font-bold text-ink">{title}</h2>{children}</section>;
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-soft underline decoration-brand/30 underline-offset-4 hover:text-white">{children}<ExternalLink size={12} aria-hidden /></a>;
}

export default async function CampaignPage({ params }: Props) {
  const { slug } = await params;
  const campaign: Campaign | undefined = campaigns.find((item) => item.slug === slug);
  if (!campaign) notFound();
  const related = await getRelatedCoverage(slug);

  return (
    <main className="min-h-screen bg-canvas pt-16">
      <div className="mx-auto max-w-[1140px] px-6 pb-24 pt-9">
        <Link href="/campanhas" className="mb-7 inline-flex items-center gap-2 text-sm text-dim hover:text-white"><ArrowLeft size={15} aria-hidden /> Todas as campanhas</Link>
        <div className="mb-8 border-b border-white/[0.08] pb-8">
          <div className="mb-4 flex flex-wrap items-center gap-3 font-mono text-xs text-dim">
            <span className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-brand-soft">{campaign.status}</span>
            <span className="inline-flex items-center gap-1"><CalendarDays size={13} aria-hidden /> Revisado em {new Date(`${campaign.reviewedAt}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })}</span>
          </div>
          <h1 className="max-w-3xl font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">{campaign.title}</h1>
          <p className="mt-2 text-base font-semibold text-brand-soft">{campaign.actor}</p>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-body">{campaign.summary}</p>
          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-dim">Período documentado: {campaign.period}. A atribuição segue as fontes citadas; o acompanhamento não indica atividade confirmada neste momento.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
          <div className="space-y-5">
            <Section title="Linha do tempo">
              <ol className="space-y-5 border-l border-brand/30 pl-5">
                {campaign.timeline.map((item) => <li key={`${item.date}-${item.event}`} className="relative text-sm leading-relaxed text-body"><span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-brand" /><strong className="block text-ink">{item.date}</strong>{item.event} <SourceLink href={item.source}>Fonte</SourceLink></li>)}
              </ol>
            </Section>
            <Section title="Impacto e exposição">
              <p className="text-sm leading-relaxed text-body">{campaign.impact}</p>
              <div className="mt-4 flex flex-wrap gap-2">{campaign.sectors.map((sector) => <span key={sector} className="rounded-full border border-white/10 px-3 py-1 text-xs text-dim">{sector}</span>)}</div>
            </Section>
            <Section title="Técnicas observadas">
              <div className="space-y-3">{campaign.techniques.map((technique) => <div key={technique.id} className="flex gap-4 border-b border-white/[0.06] pb-3 text-sm last:border-0 last:pb-0"><SourceLink href={`https://attack.mitre.org/techniques/${technique.id.replace(".", "/")}/`}>{technique.id}</SourceLink><span className="text-body">{technique.name}</span></div>)}</div>
              <p className="mt-4 text-xs text-dim">Mapeamento para consulta. A presença de uma técnica não identifica, por si só, um ator.</p>
            </Section>
            {campaign.indicators.length > 0 && <Section title="Indicadores publicados">
              <div className="space-y-4">{campaign.indicators.map((ioc) => <div key={ioc.value} className="border-b border-white/[0.06] pb-4 last:border-0 last:pb-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-white/5 px-2 py-1 font-mono text-xs text-dim">{ioc.type}</span><code className="break-all font-mono text-sm text-ink">{ioc.value}</code></div><p className="mt-2 text-xs leading-relaxed text-dim">{ioc.context} <SourceLink href={ioc.source}>Fonte</SourceLink></p></div>)}</div>
              <p className="mt-5 text-xs text-dim">Indicadores históricos podem ser compartilhados ou reassociados; confirme contexto e data antes de bloquear.</p>
            </Section>}
            <Section title="Cobertura relacionada no Statecraft">
              {related.news.length + related.briefings.length > 0 ? <ul className="space-y-3">{related.briefings.map((item) => <li key={item.slug}><Link className="group flex items-center justify-between gap-3 text-sm text-body hover:text-white" href={`/threat-briefings/${item.slug}`}><span>Briefing · {item.title}</span><ArrowUpRight size={15} className="shrink-0" aria-hidden /></Link></li>)}{related.news.map((item) => <li key={item.slug}><Link className="group flex items-center justify-between gap-3 text-sm text-body hover:text-white" href={`/noticias/${item.slug}`}><span>Notícia · {item.title}</span><ArrowUpRight size={15} className="shrink-0" aria-hidden /></Link></li>)}</ul> : <p className="text-sm text-dim">Nenhuma cobertura recente com menção explícita ao ator ou à vulnerabilidade.</p>}
              <p className="mt-5 text-xs leading-relaxed text-dim">A seleção identifica menções textuais. Uma menção relacionada não comprova participação na campanha.</p>
            </Section>
          </div>
          <aside className="space-y-5">
            {campaign.cves.length > 0 && <Section title="Vulnerabilidades associadas"><ul className="space-y-4">{campaign.cves.map((cve) => <li key={cve.id}><Link href={`/cves/${cve.id}`} className="font-mono text-sm text-brand-soft underline decoration-brand/30 underline-offset-4 hover:text-white">{cve.id}</Link><p className="mt-1 text-xs leading-relaxed text-dim">{cve.context}</p></li>)}</ul></Section>}
            <Section title="Ações recomendadas"><ol className="list-inside list-decimal space-y-3 text-sm leading-relaxed text-body">{campaign.actions.map((action) => <li key={action}>{action}</li>)}</ol></Section>
            <Section title="Fontes primárias"><ul className="space-y-4">{campaign.sources.map((source) => <li key={source.url}><SourceLink href={source.url}>{source.name}</SourceLink><p className="mt-1 text-xs text-dim">{source.date}</p></li>)}</ul><p className="mt-5 text-xs text-dim">Revisão editorial: {campaign.reviewedAt.split("-").reverse().join("/")}.</p></Section>
          </aside>
        </div>
      </div>
    </main>
  );
}
