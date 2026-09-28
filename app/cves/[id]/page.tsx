import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, ArrowUpRight, CalendarClock, ChevronRight, ExternalLink,
  Fingerprint, Radar, ShieldCheck, ShieldAlert,
} from "lucide-react";
import { campaigns } from "@/data/campaigns";
import { getCveDetail, normalizeCveId } from "@/lib/cves/get-cve-detail";
import { prisma } from "@/lib/prisma";
import styles from "./cve-detail.module.css";

type Props = { params: Promise<{ id: string }> };

const severityLabel: Record<string, string> = {
  CRITICAL: "Crítica", HIGH: "Alta", MEDIUM: "Média", LOW: "Baixa",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR", {
    timeZone: "UTC", day: "numeric", month: "short", year: "numeric",
  });
}

function DossierSection({ number, eyebrow, title, children, className = "" }: {
  number: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${styles.section} ${className}`}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionNumber}>{number}</span>
        <div>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h2 className="font-display text-xl font-bold tracking-tight text-ink md:text-2xl">{title}</h2>
        </div>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
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

  if (!cve) return (
    <main className="min-h-screen bg-canvas pt-16">
      <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8">
        <Link href="/cves" className={styles.backLink}><ArrowLeft size={15} aria-hidden /> Voltar às vulnerabilidades</Link>
        <div className={`${styles.hero} mt-7 p-8 md:p-12`}>
          <span className={styles.eyebrow}>Registro indisponível</span>
          <h1 className="mt-3 font-display text-3xl font-bold text-ink">{id}</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-body">Ainda não foi possível consultar os detalhes desta CVE. Tente novamente mais tarde ou consulte o registro original.</p>
          <a href={`https://nvd.nist.gov/vuln/detail/${id}`} target="_blank" rel="noopener noreferrer" className={styles.primaryAction}>Consultar no NVD <ExternalLink size={15} aria-hidden /></a>
        </div>
      </div>
    </main>
  );

  const relatedCampaigns = campaigns.filter((campaign) => campaign.cves.some((item) => item.id === id));
  const relatedBriefings = await prisma.briefing.findMany({
    where: { status: "published", cves: { has: id } },
    select: { slug: true, title: true, severity: true },
    orderBy: { createdAt: "desc" },
    take: 6,
  }).catch(() => []);

  const score = cve.cvssScore;
  const scoreFill = score == null ? 0 : Math.max(0, Math.min(100, score * 10));
  const scoreStyle = { "--score-fill": `${scoreFill}%` } as CSSProperties;
  const productLine = cve.affectedProducts.length > 0
    ? cve.affectedProducts.slice(0, 3).map((item) => item.replaceAll("_", " ")).join(" · ")
    : cve.vulnType !== "Outro" ? cve.vulnType : "Ficha técnica de vulnerabilidade";

  return (
    <main className="min-h-screen bg-canvas pb-24 pt-16">
      <div className="mx-auto max-w-[1180px] px-5 pt-8 sm:px-8">
        <nav aria-label="Navegação da ficha" className="mb-6 flex flex-wrap items-center gap-2 font-mono text-[11px] text-dim">
          <Link href="/cves" className={styles.backLink}><ArrowLeft size={14} aria-hidden /> Vulnerabilidades</Link>
          <ChevronRight size={12} aria-hidden />
          <span className="text-ink">{id}</span>
        </nav>

        <header className={styles.hero}>
          <div className={styles.heroTopline}>
            <div className="flex items-center gap-2"><Radar size={15} aria-hidden /><span>Statecraft / Dossiê técnico</span></div>
            <span className="hidden sm:inline">Registro de vulnerabilidade</span>
          </div>
          <div className={styles.heroContent}>
            <div className="min-w-0">
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <span className={styles.statusPill}><span className={styles.statusDot} /> CVE documentada</span>
                {cve.inCisaKev && <span className={styles.kevPill}>Exploração confirmada · CISA KEV</span>}
              </div>
              <p className={styles.eyebrow}>Identificador / NVD</p>
              <h1 className={styles.heroTitle}>{id}</h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-body md:text-lg">{productLine}</p>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] text-dim">
                <span>PUBLICADA {formatDate(cve.published).toUpperCase()}</span>
                <span>MODIFICADA {formatDate(cve.lastModified).toUpperCase()}</span>
              </div>
            </div>
            <div className={styles.scorePanel}>
              <div className={styles.scoreDial} style={scoreStyle} aria-label={score == null ? "CVSS indisponível" : `CVSS ${score.toFixed(1)} de 10`}>
                <div className={styles.scoreCenter}>
                  <strong>{score?.toFixed(1) ?? "—"}</strong>
                  <span>CVSS {cve.cvssVersion || ""}</span>
                </div>
              </div>
              <span className={styles.scoreCaption}>{cve.severity ? `Severidade ${severityLabel[cve.severity] ?? cve.severity}` : "Severidade não informada"}</span>
            </div>
          </div>
          <div className={styles.heroFooter}>
            <span><Fingerprint size={14} aria-hidden /> {cve.cweId || "CWE não informada"}</span>
            <span><CalendarClock size={14} aria-hidden /> Dados consultados em {formatDate(cve.fetchedAt!)}</span>
            <a href={cve.nvdUrl} target="_blank" rel="noopener noreferrer">Registro original <ArrowUpRight size={14} aria-hidden /></a>
          </div>
        </header>

        <div className={styles.signalBar} aria-label="Resumo dos sinais de risco">
          <div className={styles.signal}><span className={styles.signalLabel}>Severidade técnica</span><strong>{cve.severity ? severityLabel[cve.severity] ?? cve.severity : "—"}</strong><small>CVSS {cve.cvssVersion || "não informado"}</small></div>
          <div className={styles.signal}><span className={styles.signalLabel}>Probabilidade EPSS</span><strong>{cve.epss == null ? "—" : `${(cve.epss * 100).toFixed(1)}%`}</strong><small>{cve.epssPercentile == null ? "Dado indisponível" : `Percentil ${(cve.epssPercentile * 100).toFixed(0)}`}</small></div>
          <div className={styles.signal}><span className={styles.signalLabel}>Exploração conhecida</span><strong className={cve.inCisaKev ? styles.signalAlert : undefined}>{cve.inCisaKev ? "Confirmada" : "Não sinalizada"}</strong><small>{cve.inCisaKev ? "Catálogo CISA KEV" : "No dado disponível"}</small></div>
          <div className={styles.signal}><span className={styles.signalLabel}>Prioridade sugerida</span><strong>{cve.aiPriority || "—"}</strong><small>{cve.aiPriority ? "Análise automatizada" : "Ainda não analisada"}</small></div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(290px,0.85fr)] lg:items-start">
          <div className="space-y-6">
            <DossierSection number="01" eyebrow="Entenda a falha" title="Análise técnica">
              {cve.ptBrDescription ? <>
                <p className={styles.leadText}>{cve.ptBrDescription}</p>
                {cve.enrichedAt && <p className="mt-5 font-mono text-[11px] text-dim">ANÁLISE EM PORTUGUÊS · {formatDate(cve.enrichedAt).toUpperCase()}</p>}
              </> : <p className="text-sm leading-relaxed text-body">A análise em português ainda não foi gerada para esta CVE. Consulte a descrição original abaixo e o registro do NVD.</p>}
              {cve.description && <details className={styles.sourceDetails}><summary>Descrição original do NVD <ChevronRight size={15} aria-hidden /></summary><p lang="en" className="pt-4 text-sm leading-relaxed text-body">{cve.description}</p></details>}
            </DossierSection>

            <DossierSection number="02" eyebrow="Próximos passos" title="Resposta recomendada" className={styles.responseSection}>
              <div className="flex items-start gap-4">
                <div className={styles.responseIcon}><ShieldCheck size={21} aria-hidden /></div>
                <div>
                  {cve.mitigation ? <p className={styles.leadText}>{cve.mitigation}</p> : <p className="text-sm leading-relaxed text-body">Ainda não há uma recomendação específica nesta ficha. Consulte o aviso do fornecedor e as referências do NVD para identificar versões corrigidas e medidas de contenção.</p>}
                  <p className="mt-5 text-xs leading-relaxed text-dim">{cve.mitigation ? "Orientação gerada por IA. Confirme versões afetadas e correções no aviso do fornecedor antes de aplicar mudanças." : "Esta seção será completada quando houver dados suficientes para a análise."}</p>
                </div>
              </div>
            </DossierSection>

            <DossierSection number="03" eyebrow="Relações verificáveis" title="No radar da Statecraft">
              {relatedCampaigns.length + relatedBriefings.length === 0 ? <p className="text-sm text-dim">Nenhuma campanha ou briefing publicado com vínculo explícito a esta CVE.</p> : <div className="grid gap-3 sm:grid-cols-2">
                {relatedCampaigns.map((campaign) => <Link key={campaign.slug} href={`/campanhas/${campaign.slug}`} className={styles.relatedCard}><span className={styles.relatedType}>Campanha monitorada</span><strong>{campaign.title}</strong><small>{campaign.actor}</small><ArrowUpRight size={16} className={styles.relatedArrow} aria-hidden /></Link>)}
                {relatedBriefings.map((briefing) => <Link key={briefing.slug} href={`/threat-briefings/${briefing.slug}`} className={styles.relatedCard}><span className={styles.relatedType}>Briefing · {briefing.severity}</span><strong>{briefing.title}</strong><ArrowUpRight size={16} className={styles.relatedArrow} aria-hidden /></Link>)}
              </div>}
              <p className="mt-5 text-xs leading-relaxed text-dim">Os briefings são relacionados pelo identificador CVE. Verifique as fontes de cada briefing para confirmar o contexto.</p>
            </DossierSection>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24">
            <div className={styles.sidePanel}>
              <div className={styles.sideHeading}><span>Ficha de exposição</span><Fingerprint size={18} aria-hidden /></div>
              <dl className={styles.factList}>
                <div><dt>Tipo</dt><dd>{cve.vulnType}</dd></div>
                <div><dt>CWE</dt><dd className="font-mono">{cve.cweId || "Não informada"}</dd></div>
                <div><dt>Produtos no NVD</dt><dd>{cve.affectedProducts.length > 0 ? <ul className="space-y-1">{cve.affectedProducts.map((product) => <li key={product}>{product.replaceAll("_", " ")}</li>)}</ul> : "Não informados"}</dd></div>
              </dl>
              <p className="mt-5 text-xs leading-relaxed text-dim">A lista de produtos pode ser parcial. Confira versões e configurações na fonte original.</p>
            </div>

            <div className={styles.sidePanel}>
              <div className={styles.sideHeading}><span>Rastreabilidade</span><ExternalLink size={17} aria-hidden /></div>
              <a href={cve.nvdUrl} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}><span>Registro no NVD <small>Descrição, métricas e referências</small></span><ArrowUpRight size={17} aria-hidden /></a>
              {cve.inCisaKev && <a href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog" target="_blank" rel="noopener noreferrer" className={styles.sourceLink}><span>Catálogo CISA KEV <small>Exploração confirmada</small></span><ArrowUpRight size={17} aria-hidden /></a>}
              <div className={styles.caveat}><ShieldAlert size={16} className="shrink-0 text-brand-soft" aria-hidden /><p>Dados de apoio à análise. Confirme a exposição do seu ambiente e os avisos oficiais antes de agir.</p></div>
            </div>
          </aside>
        </div>

        <div className={styles.bottomNote}><span>STATECRAFT / CYBER INTELLIGENCE</span><p>CVSS mede severidade técnica. EPSS estima a probabilidade de exploração nos 30 dias seguintes à data do score.</p></div>
      </div>
    </main>
  );
}
