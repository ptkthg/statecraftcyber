import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Shield, ExternalLink, Clock, AlertTriangle,
  Tag, Globe, Building2, ChevronRight, ArrowRight, Terminal, ArrowDown,
} from "lucide-react";
import type { Ioc, StructuredBriefing } from "@/lib/types";
import { renderSafeMarkdown } from "@/lib/security/sanitize-markdown";
import { BriefingSection } from "@/components/briefing/BriefingSection";
import { ExecutiveSummary } from "@/components/briefing/ExecutiveSummary";
import { IocTable, EmptyIocState } from "@/components/briefing/IocTable";
import { RecommendedActions } from "@/components/briefing/RecommendedActions";
import { DetectionSuggestions } from "@/components/briefing/DetectionSuggestions";
import { ConfidenceBlock } from "@/components/briefing/ConfidenceBlock";
import { RichText } from "@/components/briefing/RichText";
import { CopyButton } from "@/components/briefing/CopyButton";
import { MITRE_NAMES } from "@/lib/mitre-names";

// ── Types ─────────────────────────────────────────────────────────────────

interface Briefing {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  structuredContent: StructuredBriefing | null;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  tags: string[];
  affectedSectors: string[];
  affectedRegions: string[];
  sourceName: string;
  sourceUrl: string;
  sourcePublishedAt: string | null;
  iocs: Ioc[];
  cves: string[];
  mitreTechniques: string[];
  epssScore: number | null;
  cvssScore: number | null;
  confidence: "high" | "medium" | "low";
  createdAt: string;
  readingTime: number;
}

// ── Style maps ────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  critical: "text-brand-soft bg-brand/10 border-brand/30",
  high:     "text-orange-400 bg-orange-600/10 border-orange-600/30",
  medium:   "text-yellow-400 bg-yellow-600/10 border-yellow-600/30",
  low:      "text-blue-400 bg-blue-600/10 border-blue-600/30",
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-brand",
  high:     "bg-orange-400",
  medium:   "bg-yellow-400",
  low:      "bg-cold",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Crítico", high: "Alto", medium: "Médio", low: "Baixo",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "Alta", medium: "Média", low: "Baixa",
};

const IOC_TYPE_LABELS: Record<string, string> = {
  ip: "Endereço IP", domain: "Domínio", url: "URL",
  hash: "Hash", email: "E-mail", file: "Arquivo", c2: "Servidor C2",
};

const CONFIDENCE_DOT: Record<string, string> = {
  high: "bg-green-500", medium: "bg-yellow-500", low: "bg-[#555]",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function cvssLabel(score: number): string {
  if (score >= 9) return "Crítico";
  if (score >= 7) return "Alto";
  if (score >= 4) return "Médio";
  return "Baixo";
}

function epssLabel(score: number): string {
  if (score >= 0.7) return "Risco muito alto";
  if (score >= 0.4) return "Risco alto";
  if (score >= 0.1) return "Risco moderado";
  return "Risco baixo";
}

function epssColor(score: number): string {
  if (score >= 0.7) return "text-brand";
  if (score >= 0.4) return "text-orange-400";
  if (score >= 0.1) return "text-yellow-400";
  return "text-[#888]";
}

// ── Data fetching ─────────────────────────────────────────────────────────

async function getBriefing(slug: string): Promise<Briefing | null> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const b = await prisma.briefing.findUnique({ where: { slug } });
    if (!b) return null;

    return {
      ...b,
      sourcePublishedAt: b.sourcePublishedAt?.toISOString() ?? null,
      createdAt: b.createdAt.toISOString(),
      iocs: b.iocs as unknown as Ioc[],
      structuredContent: b.structuredContent as unknown as StructuredBriefing | null,
    };
  } catch {
    return null;
  }
}

// ── Metadata ──────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const briefing = await getBriefing(slug);
  if (!briefing) return { title: "Briefing não encontrado" };

  const description = (briefing.structuredContent?.executiveSummary ?? briefing.summary)
    .replace(/[#*`_\[\]]/g, "")
    .slice(0, 160);

  return {
    title: briefing.title,
    description,
    openGraph: {
      title: briefing.title,
      description,
      type: "article",
      locale: "pt_BR",
      siteName: "Statecraft Cyber",
      publishedTime: briefing.createdAt,
    },
  };
}

// ── Structured content renderer ───────────────────────────────────────────

function StructuredContent({ sc, briefing }: { sc: StructuredBriefing; briefing: Briefing }) {
  const iocs: Ioc[] =
    sc.identifiedIocs.length > 0 ? sc.identifiedIocs : briefing.iocs ?? [];

  return (
    <>
      <BriefingSection title="O que aconteceu">
        <RichText text={sc.whatHappened} />
      </BriefingSection>

      <BriefingSection title="Por que isso importa">
        <RichText text={sc.whyItMatters} />
      </BriefingSection>

      <BriefingSection title="Quem está em risco">
        <RichText text={sc.whoIsAtRisk} />
      </BriefingSection>

      {sc.technicalDetails && (
        <BriefingSection title="Detalhes técnicos">
          <RichText text={sc.technicalDetails} />
        </BriefingSection>
      )}

      <BriefingSection
        id="secao-iocs"
        title={`IOCs Identificados${iocs.length > 0 ? ` (${iocs.length})` : ""}`}
      >
        <IocTable iocs={iocs} />
      </BriefingSection>

      {sc.recommendedActions.length > 0 && (
        <BriefingSection title="Ações recomendadas">
          <RecommendedActions actions={sc.recommendedActions} />
        </BriefingSection>
      )}

      {sc.detectionSuggestions.length > 0 && (
        <BriefingSection title="Sugestões de detecção" icon={<Terminal size={13} />}>
          <DetectionSuggestions suggestions={sc.detectionSuggestions} />
        </BriefingSection>
      )}

      {sc.falsePositiveNotes && (
        <BriefingSection title="Falsos positivos">
          <RichText text={sc.falsePositiveNotes} />
        </BriefingSection>
      )}
    </>
  );
}

// ── Legacy content renderer ───────────────────────────────────────────────

function LegacyContent({ content }: { content: string }) {
  return (
    <div
      className="prose-like"
      dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(content) }}
    />
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function BriefingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const briefing = await getBriefing(slug);

  if (!briefing) notFound();

  const sc = briefing.structuredContent;
  const sidebarIocs = briefing.iocs ?? [];
  const sidebarByType: Record<string, Ioc[]> = {};
  for (const ioc of sidebarIocs) {
    if (!sidebarByType[ioc.type]) sidebarByType[ioc.type] = [];
    sidebarByType[ioc.type].push(ioc);
  }

  const confidenceLevel = sc?.confidenceLevel ?? briefing.confidence;
  const confidenceReason = sc?.confidenceReason ?? null;

  return (
    <main className="min-h-screen bg-canvas pt-16">
      {/* Breadcrumb */}
      <div className="border-b border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2 text-xs text-dim">
          <Link href="/" className="hover:text-body transition-colors">Home</Link>
          <ChevronRight size={12} className="text-[#555]" />
          <Link href="/threat-briefings" className="hover:text-body transition-colors">Threat Briefings</Link>
          <ChevronRight size={12} className="text-[#555]" />
          <span className="text-dim truncate max-w-[260px]">{briefing.title}</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col lg:flex-row gap-10">

          {/* ── Article ─────────────────────────────────────────────────── */}
          <article className="flex-1 min-w-0">

            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className={`text-xs font-bold px-2.5 py-1 rounded border uppercase tracking-wider flex items-center gap-1.5 ${SEVERITY_STYLES[briefing.severity]}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${SEVERITY_DOT[briefing.severity]}`} />
                  {SEVERITY_LABELS[briefing.severity]}
                </span>
                <span className="text-xs text-body bg-white/[0.04] px-2.5 py-1 rounded border border-white/[0.06]">
                  {briefing.category}
                </span>
                {briefing.cves.slice(0, 3).map((cve) => (
                  <a
                    key={cve}
                    href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-dim hover:text-white bg-raised border border-white/[0.06] hover:border-white/[0.12] px-2 py-0.5 rounded transition-colors"
                  >
                    {cve}
                  </a>
                ))}
              </div>

              <h1
                className="font-display text-[28px] md:text-[34px] font-bold tracking-tight text-white leading-tight mb-4"
              >
                {briefing.title}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-xs text-dim pb-4 border-b border-white/[0.04]">
                <span className="flex items-center gap-1.5">
                  <Clock size={11} /> {briefing.readingTime} min de leitura
                </span>
                <span className="flex items-center gap-1.5">
                  <Shield size={11} /> {briefing.sourceName}
                </span>
                <span>{formatDate(briefing.createdAt)}</span>
                <a
                  href={briefing.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-dim hover:text-white transition-colors"
                >
                  Fonte original <ExternalLink size={10} />
                </a>
              </div>
            </div>

            {/* Mobile quick-access panel — hidden on lg */}
            {(sidebarIocs.length > 0 || briefing.mitreTechniques.length > 0) && (
              <div className="lg:hidden space-y-2 mb-6">
                {sidebarIocs.length > 0 && (
                  <a
                    href="#secao-iocs"
                    className="flex items-center justify-between bg-raised border border-white/[0.06] hover:bg-overlay rounded-lg px-4 py-3 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={12} className="text-brand" />
                      <span className="text-xs font-bold text-white">
                        {sidebarIocs.length} IOC{sidebarIocs.length > 1 ? "s" : ""} identificados
                      </span>
                    </div>
                    <ArrowDown size={12} className="text-dim group-hover:text-white transition-colors" />
                  </a>
                )}
                {briefing.mitreTechniques.length > 0 && (
                  <div className="bg-raised border border-white/[0.06] rounded-lg px-4 py-3">
                    <div className="text-xs font-bold text-dim uppercase tracking-wider mb-2">MITRE ATT&CK</div>
                    <div className="flex flex-wrap gap-1">
                      {briefing.mitreTechniques.slice(0, 6).map((t) => (
                        <a
                          key={t}
                          href={`https://attack.mitre.org/techniques/${t.replace(".", "/")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={MITRE_NAMES[t] ? `${t}: ${MITRE_NAMES[t]}` : t}
                          className="text-xs font-mono text-brand-soft hover:text-brand-soft bg-brand/5 border border-brand/15 px-2 py-0.5 rounded transition-colors"
                        >
                          {t}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Executive summary */}
            <ExecutiveSummary
              text={sc?.executiveSummary ?? briefing.summary.replace(/[#*`_\[\]]/g, "")}
              severity={briefing.severity}
            />

            {/* Scores — card único com colunas divididas */}
            <div className="mb-4 flex divide-x divide-white/[0.05] rounded-[20px] border border-white/[0.05] bg-raised">
              {briefing.cvssScore && (
                <div className="flex-1 px-5 py-4 text-center">
                  <div className="text-[10px] text-dim uppercase tracking-wider mb-1">CVSS v3</div>
                  <div className={`font-display text-3xl font-bold leading-none ${briefing.cvssScore >= 9 ? "text-brand" : briefing.cvssScore >= 7 ? "text-orange-400" : "text-yellow-400"}`}>
                    {briefing.cvssScore.toFixed(1)}
                  </div>
                  <div className="text-[11px] text-dim mt-1.5">{cvssLabel(briefing.cvssScore)}</div>
                </div>
              )}
              {briefing.epssScore != null && (
                <div className="flex-1 px-5 py-4 text-center">
                  <div className="text-[10px] text-dim uppercase tracking-wider mb-1">EPSS</div>
                  <div className="font-display text-3xl font-bold leading-none text-cold">
                    {(briefing.epssScore * 100).toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-dim mt-1.5">{epssLabel(briefing.epssScore)}</div>
                </div>
              )}
              <div className="flex-1 px-5 py-4 text-center">
                <div className="text-[10px] text-dim uppercase tracking-wider mb-1">Confiança</div>
                <div className={`font-display text-2xl font-bold leading-none mt-1 ${briefing.confidence === "high" ? "text-green-400" : briefing.confidence === "medium" ? "text-yellow-400" : "text-dim"}`}>
                  {CONFIDENCE_LABELS[briefing.confidence]}
                </div>
              </div>
            </div>

            {/* Full confidence rationale — rendered by ConfidenceBlock when available */}
            {confidenceReason && (
              <div className="mb-8">
                <ConfidenceBlock level={confidenceLevel} reason={confidenceReason} />
              </div>
            )}

            {/* ── Main content ── */}
            {sc ? (
              <StructuredContent sc={sc} briefing={briefing} />
            ) : (
              <>
                <LegacyContent content={briefing.content} />
                {sidebarIocs.length === 0 && (
                  <BriefingSection title="IOCs Identificados">
                    <EmptyIocState />
                  </BriefingSection>
                )}
              </>
            )}

            {/* CVEs Relacionadas */}
            {briefing.cves.length > 0 && (
              <section className="mt-8 pt-6 border-t border-white/[0.04]">
                <h2 className="flex items-center gap-3 text-base font-bold tracking-tight text-white mb-5">
                  <span className="w-0.5 h-4 bg-brand rounded-full flex-shrink-0" aria-hidden="true" />
                  CVEs Relacionadas
                </h2>
                <div className="space-y-2">
                  {briefing.cves.map((cve) => (
                    <div
                      key={cve}
                      className="bg-raised border border-white/[0.06] rounded-lg px-4 py-3 flex items-center justify-between gap-4 flex-wrap"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-white">{cve}</span>
                        {cve === briefing.cves[0] && briefing.epssScore != null && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${briefing.epssScore >= 0.7 ? "bg-brand/10 border-brand/25 text-brand-soft" : "bg-yellow-500/10 border-yellow-500/25 text-yellow-400"}`}>
                            EPSS {(briefing.epssScore * 100).toFixed(1)}%
                          </span>
                        )}
                        {cve === briefing.cves[0] && briefing.cvssScore != null && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${briefing.cvssScore >= 9 ? "bg-brand/10 border-brand/25 text-brand-soft" : "bg-orange-500/10 border-orange-500/25 text-orange-400"}`}>
                            CVSS {briefing.cvssScore.toFixed(1)}
                          </span>
                        )}
                        {briefing.tags.includes("cisa-kev") && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded border bg-brand/10 border-brand/25 text-brand uppercase tracking-wider">
                            CISA KEV
                          </span>
                        )}
                      </div>
                      <a
                        href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-semibold text-dim hover:text-white border border-white/[0.06] hover:border-white/[0.12] px-3 py-1.5 rounded transition-colors whitespace-nowrap"
                      >
                        Ver no NVD <ExternalLink size={10} />
                      </a>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Fontes — compact strip */}
            <section className="mt-8 pt-6 border-t border-white/[0.04]">
              <div className="text-xs text-dim uppercase tracking-wider mb-3">Fontes</div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <a
                  href={briefing.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-dim hover:text-white underline underline-offset-2 transition-colors"
                >
                  {briefing.sourceName} <ExternalLink size={10} />
                </a>
                {briefing.cves.slice(0, 3).map((cve) => (
                  <a
                    key={cve}
                    href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-mono text-dim hover:text-white underline underline-offset-2 transition-colors"
                  >
                    NVD:{cve} <ExternalLink size={10} />
                  </a>
                ))}
                {briefing.epssScore != null && briefing.cves[0] && (
                  <a
                    href={`https://api.first.org/data/v1/epss?cve=${briefing.cves[0]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-dim hover:text-white underline underline-offset-2 transition-colors"
                  >
                    FIRST EPSS <ExternalLink size={10} />
                  </a>
                )}
                {briefing.tags.includes("cisa-kev") && (
                  <a
                    href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-dim hover:text-white underline underline-offset-2 transition-colors"
                  >
                    CISA KEV <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </section>
          </article>

          {/* ── Sidebar ──────────────────────────────────────────────────── */}
          <aside className="lg:w-72 flex-shrink-0 space-y-6">

            {/* IOCs */}
            {sidebarIocs.length > 0 && (
              <div className="bg-raised border border-white/[0.06] rounded-xl p-5 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={13} className="text-brand" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      IOCs ({sidebarIocs.length})
                    </span>
                  </div>
                  <CopyButton
                    text={sidebarIocs.map((i) => i.value).join("\n")}
                    label="Copiar"
                  />
                </div>
                <div className="space-y-4">
                  {Object.entries(sidebarByType).map(([type, iocs]) => (
                    <div key={type}>
                      <div className="text-xs font-bold text-dim uppercase tracking-wider mb-2">
                        {IOC_TYPE_LABELS[type] ?? type}
                      </div>
                      <div className="space-y-1.5">
                        {iocs.map((ioc, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${CONFIDENCE_DOT[ioc.confidence] ?? "bg-[#555]"}`} />
                            <span
                              className="font-mono text-xs text-body truncate"
                              title={ioc.value}
                            >
                              {ioc.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-white/[0.04] text-xs text-dim">
                  Adicione ao SIEM, firewall e EDR
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="bg-raised border border-white/[0.06] rounded-xl p-5 space-y-4">
              {briefing.affectedSectors.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-dim uppercase tracking-wider mb-2">
                    <Building2 size={10} /> Setores Afetados
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {briefing.affectedSectors.map((s) => (
                      <span key={s} className="text-xs bg-white/[0.04] border border-white/[0.06] text-body px-2 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {briefing.affectedRegions.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-dim uppercase tracking-wider mb-2">
                    <Globe size={10} /> Regiões
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {briefing.affectedRegions.map((r) => (
                      <span key={r} className="text-xs bg-white/[0.04] border border-white/[0.06] text-body px-2 py-0.5 rounded">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {briefing.tags.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-dim uppercase tracking-wider mb-2">
                    <Tag size={10} /> Tags
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {briefing.tags.map((t) => (
                      <span key={t} className="text-xs text-dim bg-raised border border-white/[0.05] px-2 py-0.5 rounded font-mono">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {briefing.mitreTechniques.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-dim uppercase tracking-wider mb-2">
                    MITRE ATT&CK
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {briefing.mitreTechniques.map((t) => (
                      <a
                        key={t}
                        href={`https://attack.mitre.org/techniques/${t.replace(".", "/")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={MITRE_NAMES[t] ? `${t}: ${MITRE_NAMES[t]}` : `Ver ${t} no MITRE ATT&CK`}
                        className="text-xs font-mono text-brand-soft hover:text-brand-soft bg-brand/5 border border-brand/15 px-2 py-0.5 rounded transition-colors"
                      >
                        {t}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Voltar */}
            <div className="bg-raised border border-white/[0.06] rounded-xl p-5">
              <div className="text-xs font-bold text-white mb-2">Mais Briefings</div>
              <p className="text-xs text-body leading-relaxed mb-4">
                Veja todos os briefings de threat intelligence publicados na plataforma.
              </p>
              <Link
                href="/threat-briefings"
                className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-overlay hover:bg-white/10 border border-white/[0.08] hover:border-white/[0.15] text-white font-bold rounded-lg text-xs transition-all"
              >
                Ver todos <ArrowRight size={11} />
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export const revalidate = 3600;
