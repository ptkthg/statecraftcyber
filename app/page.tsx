import Link from "next/link";
import { unstable_cache } from "next/cache";
import { BentoCard } from "@/components/ui/BentoCard";
import { getHomeStats, classifyNewsTitle } from "@/lib/home-stats";
import { fetchNewsArticles } from "@/lib/news-feeds";

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
          .slice(0, 8);
      } catch {
        return articles.slice(0, 8);
      }
    } catch {
      return [];
    }
  },
  ["home-news"],
  { revalidate: 120 }
);

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d atrás`;
  if (hours > 0) return `${hours}h atrás`;
  return "há pouco";
}

export default async function HomePage() {
  const [stats, news] = await Promise.all([getHomeStats(), getCachedHomeNews()]);
  const alerts = news.filter((n) => classifyNewsTitle(n.title) === "alert").slice(0, 3);
  const context = news.filter((n) => classifyNewsTitle(n.title) === "context").slice(0, 3);
  const heroHref = stats.latestBriefingSlug ? `/threat-briefings/${stats.latestBriefingSlug}` : "/threat-briefings";

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto grid max-w-[1140px] grid-cols-1 gap-4 px-6 pb-24 pt-28 md:grid-cols-2 lg:grid-cols-4">

        {/* HERO 2x2 */}
        <BentoCard className="md:col-span-2 lg:row-span-2 min-h-[330px] justify-end
          bg-[radial-gradient(ellipse_at_85%_15%,rgba(var(--primary-rgb),0.10),transparent_55%),radial-gradient(rgba(255,255,255,0.028)_1px,transparent_1px)] bg-[length:auto,22px_22px]">
          {stats.lastRunAt && (
            <span className="absolute left-6 top-6 flex items-center gap-2 font-mono text-[11.5px] text-body">
              <span className="h-[7px] w-[7px] rounded-full bg-brand pulse-dot" aria-hidden />
              atualizado {formatTimeAgo(stats.lastRunAt)}
            </span>
          )}
          <div className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.1em] text-cold">
            Threat intel global com contexto para o Brasil
          </div>
          <h1 className="font-display mb-4 text-[27px] font-bold leading-[1.22] tracking-tight text-ink">
            Briefings de ameaças cibernéticas em português para SOC, GRC e times de segurança.
          </h1>
          <Link href={heroHref}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-brand-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
            Ver briefing mais recente →
          </Link>
        </BentoCard>

        {/* CRÍTICOS 2x2 */}
        <BentoCard href="/threat-briefings?sev=critical" action="Ver críticos ativos"
          label="Críticos ativos agora" labelClassName="text-brand-soft" period="últimas 24h"
          className="md:col-span-2 lg:row-span-2 border-[rgba(var(--primary-rgb),0.3)]
            bg-[radial-gradient(ellipse_at_top_left,rgba(var(--primary-rgb),0.08),transparent_55%)]">
          <div className="font-display text-[40px] font-bold leading-none text-ink">
            {stats.criticalCount}
            {stats.criticalDelta24h > 0 && (
              <span className="ml-2 text-[15px] font-semibold text-body">+{stats.criticalDelta24h} nas últimas 24h</span>
            )}
          </div>
          <div className="mt-4">
            {stats.criticalLatest.map((b) => (
              <div key={b.slug} className="flex items-baseline justify-between gap-3 border-t border-white/[0.05] py-3">
                <span className="text-sm font-semibold text-ink">{b.title}</span>
                <span aria-hidden className="font-mono text-[11px] text-dim">{formatTimeAgo(b.createdAt)}</span>
              </div>
            ))}
            {stats.criticalLatest.length === 0 && (
              <p className="py-4 text-sm text-dim">Nenhum briefing crítico nos últimos 7 dias.</p>
            )}
          </div>
        </BentoCard>

        {/* MÉTRICAS (4 cards 1x1) — número grande + rótulo, sem microcopy */}
        <BentoCard href="/threat-briefings" action="Explorar briefings" className="min-h-[150px]">
          <div className="font-display text-4xl font-bold tracking-tight">{stats.briefingsTotal}</div>
          <div className="mt-1.5 text-[13px] font-semibold text-ink">briefings publicados</div>
        </BentoCard>
        <BentoCard href="/cves" action="Ver CVEs recentes" className="min-h-[150px]">
          <div className="font-display text-4xl font-bold tracking-tight">{stats.cvesToday}</div>
          <div className="mt-1.5 text-[13px] font-semibold text-ink">CVEs analisadas hoje</div>
        </BentoCard>
        <BentoCard href="/iocs" action="Ver IOCs" className="min-h-[150px]">
          <div className="font-display text-4xl font-bold tracking-tight">{stats.iocsTotal.toLocaleString("pt-BR")}</div>
          <div className="mt-1.5 text-[13px] font-semibold text-ink">IOCs ativos</div>
        </BentoCard>
        <BentoCard className="min-h-[150px]">
          <div className="font-display pt-2 text-[22px] font-bold text-cold">● Operacional</div>
          <div className="mt-1.5 text-[13px] font-semibold text-ink">pipeline de coleta</div>
        </BentoCard>

        {/* CVEs POR DIA 2x1 */}
        <BentoCard href="/cves" action="Ver CVEs recentes" label="Vulnerabilidades por dia" period="últimos 7 dias" className="md:col-span-2">
          <div className="mt-1">
            {stats.cvesPerDay.map((d, i) => {
              const max = Math.max(...stats.cvesPerDay.map((x) => x.count), 1);
              const isPeak = d.count === max && d.count > 0;
              return (
                <div key={i} className="flex items-center gap-2.5 py-1 font-mono text-[11px] text-dim">
                  <b className="w-7 font-medium">{d.day}</b>
                  <span className="flex-1">
                    <span className={`block h-2 rounded ${isPeak ? "bg-gradient-to-r from-brand to-[rgba(var(--primary-rgb),0.3)]" : "bg-gradient-to-r from-[rgba(127,163,184,0.85)] to-[rgba(127,163,184,0.25)]"}`}
                      style={{ width: `${Math.max((d.count / max) * 100, 2)}%` }} />
                  </span>
                  {d.count}
                </div>
              );
            })}
          </div>
        </BentoCard>

        {/* REGIÕES 2x1 — só barras, sem linha-resumo */}
        <BentoCard href="/threat-briefings" action="Ver análise por região" label="Regiões afetadas" period="últimos 7 dias" className="md:col-span-2">
          <div className="mt-1">
            {stats.regions.map((r) => (
              <div key={r.region} className="grid grid-cols-[80px_1fr_90px] items-center gap-3 border-t border-white/[0.05] py-1.5 text-[12.5px]">
                <span className="font-semibold text-ink">{r.region}</span>
                <span className="flex h-2 gap-[3px]">
                  {r.critical > 0 && <i className="rounded-[3px] bg-brand" style={{ width: `${r.critical * 17}%` }} />}
                  {r.medium > 0 && <i className="rounded-[3px] bg-yellow-600/80" style={{ width: `${r.medium * 17}%` }} />}
                  {r.low > 0 && <i className="rounded-[3px] bg-white/[0.18]" style={{ width: `${r.low * 17}%` }} />}
                </span>
                <span className="text-right font-mono text-[11px] text-dim">{r.critical}C · {r.medium}M · {r.low}B</span>
              </div>
            ))}
            {stats.regions.length === 0 && <p className="py-3 text-sm text-dim">Sem dados regionais nos últimos 7 dias.</p>}
          </div>
        </BentoCard>

        {/* ALERTAS OPERACIONAIS 2x1 + NOTÍCIAS 2x1 — só títulos */}
        <BentoCard href="/noticias?tab=alertas" action="Ver todos os alertas" label="Alertas operacionais" labelClassName="text-brand-soft" period="exigem ação" className="md:col-span-2">
          <div className="mt-1">
            {alerts.map((n) => (
              <div key={n.slug} className="flex gap-3 border-t border-white/[0.05] py-2.5 text-[13.5px]">
                <span className="flex-1 leading-snug text-body">{n.title} <span aria-hidden className="text-dim">›</span></span>
              </div>
            ))}
            {alerts.length === 0 && <p className="py-3 text-sm text-dim">Nenhum alerta operacional agora.</p>}
          </div>
        </BentoCard>
        <BentoCard href="/noticias?tab=contexto" action="Ver todas as notícias" label="Notícias relevantes" period="contexto" className="md:col-span-2">
          <div className="mt-1">
            {context.map((n) => (
              <div key={n.slug} className="flex gap-3 border-t border-white/[0.05] py-2.5 text-[13.5px]">
                <span className="flex-1 leading-snug text-body">{n.title} <span aria-hidden className="text-dim">›</span></span>
              </div>
            ))}
            {context.length === 0 && <p className="py-3 text-sm text-dim">Sem notícias no momento.</p>}
          </div>
        </BentoCard>
      </div>
    </main>
  );
}
