import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, ExternalLink, ShieldAlert } from "lucide-react";
import { campaigns } from "@/data/campaigns";
import { getCveDetail, normalizeCveId } from "@/lib/cves/get-cve-detail";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ id: string }> };

const severityLabel: Record<string, string> = { CRITICAL: "Crítica", HIGH: "Alta", MEDIUM: "Média", LOW: "Baixa" };

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/[0.08] bg-raised p-6 md:p-7"><h2 className="mb-4 font-display text-xl font-bold text-ink">{title}</h2>{children}</section>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = normalizeCveId(rawId);
  if (!id) return {};
  const cve = await getCveDetail(id);
  return {
    title: `${id} | Statecraft Cyber Intelligence`,
    description: cve?.ptBrDescription?.slice(0, 155) ?? `Detalhes, impacto e referências da vulnerabilidade ${id}.`,
    robots: cve ? undefined : { index: false, follow: true },
  };
}

export default async function CveDetailPage({ params }: Props) {
  const { id: rawId } = await params;
  const id = normalizeCveId(rawId);
  if (!id) notFound();
  const cve = await getCveDetail(id);
  if (!cve) return <main className="min-h-screen bg-canvas pt-16"><div className="mx-auto max-w-[1140px] px-6 py-16"><Link href="/cves" className="mb-8 inline-flex items-center gap-2 text-sm text-dim hover:text-white"><ArrowLeft size={15} aria-hidden /> Voltar às vulnerabilidades</Link><h1 className="font-display text-3xl font-bold text-ink">{id}</h1><p className="mt-4 max-w-xl text-sm leading-relaxed text-body">Ainda não foi possível consultar os detalhes desta CVE. Tente novamente mais tarde ou consulte o registro original.</p><a href={`https://nvd.nist.gov/vuln/detail/${id}`} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-soft underline underline-offset-4">Consultar no NVD <ExternalLink size={14} aria-hidden /></a></div></main>;

  const relatedCampaigns = campaigns.filter((campaign) => campaign.cves.some((item) => item.id === id));
  const relatedBriefings = await prisma.briefing.findMany({
    where: { status: "published", cves: { has: id } },
    select: { slug: true, title: true, severity: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 6,
  }).catch(() => []);

  return (
    <main className="min-h-screen bg-canvas pt-16">
      <div className="mx-auto max-w-[1140px] px-6 pb-24 pt-9">
        <Link href="/cves" className="mb-7 inline-flex items-center gap-2 text-sm text-dim hover:text-white"><ArrowLeft size={15} aria-hidden /> Voltar às vulnerabilidades</Link>

        <div className="mb-8 border-b border-white/[0.08] pb-8">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-white/15 px-3 py-1 font-mono text-dim">Vulnerabilidade</span>
            {cve.severity && <span className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 font-semibold text-brand-soft">Severidade {severityLabel[cve.severity] ?? cve.severity}</span>}
            {cve.inCisaKev && <span className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 font-semibold text-brand-soft">CISA KEV</span>}
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">{id}</h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-body">{cve.affectedProducts.length > 0 ? cve.affectedProducts.slice(0, 3).map((item) => item.replaceAll("_", " ")).join(" · ") : cve.vulnType !== "Outro" ? cve.vulnType : "Ficha técnica de vulnerabilidade"}</p>
          <p className="mt-4 text-xs text-dim">Publicado em {formatDate(cve.published)} · última modificação no NVD em {formatDate(cve.lastModified)}{cve.fetchedAt ? ` · dados consultados em ${formatDate(cve.fetchedAt)}` : ""}</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
          <div className="space-y-5">
            <Section title="Resumo técnico">
              {cve.ptBrDescription ? <><p className="text-sm leading-relaxed text-body">{cve.ptBrDescription}</p>{cve.enrichedAt && <p className="mt-3 text-xs text-dim">Análise em português gerada em {formatDate(cve.enrichedAt)}.</p>}</> : <p className="text-sm leading-relaxed text-body">A análise em português ainda não foi gerada para esta CVE. A descrição original está disponível na fonte abaixo.</p>}
              {cve.description && <div className="mt-5 border-t border-white/[0.07] pt-5"><h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-dim">Descrição original do NVD</h3><p lang="en" className="text-sm leading-relaxed text-body">{cve.description}</p></div>}
            </Section>

            <Section title="Mitigação">
              {cve.mitigation ? <><p className="text-sm leading-relaxed text-body">{cve.mitigation}</p><p className="mt-4 text-xs text-dim">Orientação gerada por IA. Confirme versões afetadas e correções no aviso do fornecedor antes de aplicar mudanças.</p></> : <p className="text-sm leading-relaxed text-body">Ainda não há uma recomendação específica revisada nesta ficha. Consulte as referências do NVD e o aviso do fornecedor para versões corrigidas e medidas de contenção.</p>}
            </Section>

            <Section title="Contexto no Statecraft">
              {relatedCampaigns.length === 0 && relatedBriefings.length === 0 ? <p className="text-sm text-dim">Nenhuma campanha ou briefing publicado com vínculo explícito a esta CVE.</p> : <div className="space-y-4">
                {relatedCampaigns.map((campaign) => <Link key={campaign.slug} href={`/campanhas/${campaign.slug}`} className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-4 text-sm last:border-0 last:pb-0"><span><span className="block text-xs font-semibold uppercase tracking-wider text-brand-soft">Campanha</span><span className="mt-1 block text-ink">{campaign.title}</span><span className="mt-1 block text-xs text-dim">{campaign.actor}</span></span><ArrowUpRight size={16} className="shrink-0 text-dim" aria-hidden /></Link>)}
                {relatedBriefings.map((briefing) => <Link key={briefing.slug} href={`/threat-briefings/${briefing.slug}`} className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-4 text-sm last:border-0 last:pb-0"><span><span className="block text-xs font-semibold uppercase tracking-wider text-brand-soft">Briefing · {briefing.severity}</span><span className="mt-1 block text-ink">{briefing.title}</span></span><ArrowUpRight size={16} className="shrink-0 text-dim" aria-hidden /></Link>)}
              </div>}
              <p className="mt-5 text-xs text-dim">O vínculo com briefings usa o identificador CVE registrado no banco; revise as fontes do briefing para validar o contexto.</p>
            </Section>
          </div>

          <aside className="space-y-5">
            <Section title="Pontuações">
              <dl className="space-y-4 text-sm">
                <div className="flex items-baseline justify-between gap-3"><dt className="text-dim">CVSS {cve.cvssVersion || ""}</dt><dd className="font-display text-2xl font-bold text-ink">{cve.cvssScore?.toFixed(1) ?? "—"}</dd></div>
                <div className="flex items-baseline justify-between gap-3"><dt className="text-dim">EPSS</dt><dd className="font-mono font-semibold text-ink">{cve.epss == null ? "—" : `${(cve.epss * 100).toFixed(1)}%`}</dd></div>
                {cve.epssPercentile != null && <div className="flex items-baseline justify-between gap-3"><dt className="text-dim">Percentil EPSS</dt><dd className="font-mono text-ink">{(cve.epssPercentile * 100).toFixed(0)}</dd></div>}
                {cve.aiPriority && <div className="flex items-baseline justify-between gap-3"><dt className="text-dim">Prioridade sugerida por IA</dt><dd className="font-semibold text-brand-soft">{cve.aiPriority}</dd></div>}
              </dl>
              <p className="mt-5 text-xs leading-relaxed text-dim">EPSS estima probabilidade de exploração nos próximos 30 dias a partir da data do score. CVSS mede severidade técnica. Valores indisponíveis aparecem como “—”.</p>
            </Section>
            {(cve.affectedProducts.length > 0 || cve.cweId) && <Section title="Classificação">
              {cve.cweId && <p className="mb-4 text-sm text-body"><span className="text-dim">CWE:</span> <span className="font-mono text-ink">{cve.cweId}</span></p>}
              {cve.affectedProducts.length > 0 && <><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-dim">Produtos mencionados no NVD</h3><ul className="space-y-2 text-sm text-body">{cve.affectedProducts.map((product) => <li key={product}>{product.replaceAll("_", " ")}</li>)}</ul><p className="mt-4 text-xs text-dim">A lista pode ser parcial; confira versões e configurações na fonte.</p></>}
            </Section>}
            <Section title="Fontes e validação">
              <a href={cve.nvdUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-soft underline decoration-brand/30 underline-offset-4 hover:text-white">Registro no NVD <ExternalLink size={14} aria-hidden /></a>
              {cve.inCisaKev && <a href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog" target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-2 text-sm font-semibold text-brand-soft underline decoration-brand/30 underline-offset-4 hover:text-white">Catálogo CISA KEV <ExternalLink size={14} aria-hidden /></a>}
              <div className="mt-5 flex items-start gap-2 border-t border-white/[0.07] pt-4 text-xs leading-relaxed text-dim"><ShieldAlert size={15} className="mt-0.5 shrink-0 text-brand-soft" aria-hidden /><p>Informações de apoio à análise. A decisão de correção deve considerar o ativo afetado e os avisos oficiais.</p></div>
            </Section>
          </aside>
        </div>
      </div>
    </main>
  );
}
