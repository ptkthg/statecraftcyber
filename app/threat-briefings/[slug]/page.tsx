import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft, Shield, ExternalLink, Clock, AlertTriangle,
  Tag, Globe, Building2, ChevronRight
} from "lucide-react";
import type { Ioc } from "@/lib/types";
import { renderSafeMarkdown } from "@/lib/security/sanitize-markdown";

interface Briefing {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
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

// ── Helpers ───────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  critical: "text-red-400 bg-red-600/10 border-red-600/30",
  high: "text-orange-400 bg-orange-600/10 border-orange-600/30",
  medium: "text-yellow-400 bg-yellow-600/10 border-yellow-600/30",
  low: "text-blue-400 bg-blue-600/10 border-blue-600/30",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

const IOC_TYPE_LABELS: Record<string, string> = {
  ip: "Endereço IP",
  domain: "Domínio",
  url: "URL",
  hash: "Hash",
  email: "E-mail",
  file: "Arquivo",
  c2: "Servidor C2",
};

const CONFIDENCE_DOT: Record<string, string> = {
  high: "bg-green-500",
  medium: "bg-yellow-500",
  low: "bg-[#555]",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ── Data fetching ─────────────────────────────────────────────────────────

async function getBriefing(slug: string): Promise<Briefing | null> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const b = await prisma.briefing.findUnique({
      where: { slug },
    });
    if (!b) return null;

    return {
      ...b,
      sourcePublishedAt: b.sourcePublishedAt?.toISOString() ?? null,
      createdAt: b.createdAt.toISOString(),
      iocs: b.iocs as unknown as Ioc[],
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

  const description = briefing.summary.replace(/[#*`_\[\]]/g, "").slice(0, 160);

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

// ── Page ──────────────────────────────────────────────────────────────────

export default async function BriefingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const briefing = await getBriefing(slug);

  if (!briefing) notFound();

  const byType: Record<string, Ioc[]> = {};
  for (const ioc of briefing.iocs ?? []) {
    if (!byType[ioc.type]) byType[ioc.type] = [];
    byType[ioc.type].push(ioc);
  }

  return (
    <main className="min-h-screen bg-[#050505] pt-16">
      {/* Breadcrumb */}
      <div className="border-b border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2 text-xs text-[#555]">
          <Link href="/" className="hover:text-[#A1A1AA] transition-colors">Home</Link>
          <ChevronRight size={10} />
          <Link href="/threat-briefings" className="hover:text-[#A1A1AA] transition-colors">Threat Briefings</Link>
          <ChevronRight size={10} />
          <span className="text-[#666] truncate max-w-xs">{briefing.title}</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col lg:flex-row gap-10">
          {/* ── Article ─────────────────────────────────────────────────── */}
          <article className="flex-1 min-w-0">
            {/* Back link */}
            <Link
              href="/threat-briefings"
              className="inline-flex items-center gap-1.5 text-xs text-[#555] hover:text-[#A1A1AA] mb-6 transition-colors"
            >
              <ArrowLeft size={12} /> Todos os Briefings
            </Link>

            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded border uppercase tracking-wider ${SEVERITY_STYLES[briefing.severity]}`}>
                  ⬤ {SEVERITY_LABELS[briefing.severity]}
                </span>
                <span className="text-[10px] text-[#666] bg-white/[0.04] px-2.5 py-1 rounded border border-white/[0.06]">
                  {briefing.category}
                </span>
                {briefing.cves.slice(0, 3).map((cve) => (
                  <a
                    key={cve}
                    href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] text-[#888] hover:text-red-400 bg-[#0A0A0A] border border-white/[0.06] hover:border-red-600/20 px-2 py-0.5 rounded transition-colors"
                  >
                    {cve}
                  </a>
                ))}
              </div>

              <h1 className="text-2xl md:text-3xl font-black text-white leading-tight mb-4">
                {briefing.title}
              </h1>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-[#555] pb-4 border-b border-white/[0.04]">
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
                  className="flex items-center gap-1 text-red-500 hover:text-red-400 transition-colors"
                >
                  Fonte original <ExternalLink size={10} />
                </a>
              </div>
            </div>

            {/* Summary box */}
            <div className="bg-[#0D0D0D] border-l-2 border-red-600 rounded-r-lg px-5 py-4 mb-8">
              <div className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-2">
                Resumo Executivo
              </div>
              <div
                className="text-sm text-[#C0C0C0] leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(briefing.summary) }}
              />
            </div>

            {/* Scores row */}
            {(briefing.cvssScore || briefing.epssScore) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
                {briefing.cvssScore && (
                  <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-lg p-3 text-center">
                    <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1">CVSS</div>
                    <div className={`text-2xl font-black ${briefing.cvssScore >= 9 ? "text-red-500" : briefing.cvssScore >= 7 ? "text-orange-400" : "text-yellow-400"}`}>
                      {briefing.cvssScore.toFixed(1)}
                    </div>
                  </div>
                )}
                {briefing.epssScore && (
                  <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-lg p-3 text-center">
                    <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1">EPSS</div>
                    <div className="text-2xl font-black text-yellow-400">
                      {(briefing.epssScore * 100).toFixed(1)}%
                    </div>
                    <div className="text-[9px] text-[#555] mt-0.5">prob. de exploração</div>
                  </div>
                )}
                <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-lg p-3 text-center">
                  <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Confiança</div>
                  <div className={`text-lg font-black ${briefing.confidence === "high" ? "text-green-400" : briefing.confidence === "medium" ? "text-yellow-400" : "text-[#666]"}`}>
                    {CONFIDENCE_LABELS[briefing.confidence]}
                  </div>
                </div>
              </div>
            )}

            {/* Main content */}
            <div
              className="prose-like"
              dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(briefing.content) }}
            />

            {/* CVEs Relacionadas */}
            {briefing.cves.length > 0 && (
              <div className="mt-10 pt-8 border-t border-white/[0.04]">
                <h2 className="text-base font-black text-white uppercase tracking-wider mb-4">
                  CVEs Relacionadas
                </h2>
                <div className="space-y-2">
                  {briefing.cves.map((cve) => (
                    <div
                      key={cve}
                      className="bg-[#0D0D0D] border border-white/[0.06] rounded-lg px-4 py-3 flex items-center justify-between gap-4 flex-wrap"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-white">{cve}</span>
                        {cve === briefing.cves[0] && briefing.epssScore != null && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${briefing.epssScore >= 0.7 ? "bg-red-500/10 border-red-500/25 text-red-400" : "bg-yellow-500/10 border-yellow-500/25 text-yellow-400"}`}>
                            EPSS {(briefing.epssScore * 100).toFixed(1)}%
                          </span>
                        )}
                        {cve === briefing.cves[0] && briefing.cvssScore != null && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${briefing.cvssScore >= 9 ? "bg-red-500/10 border-red-500/25 text-red-400" : "bg-orange-500/10 border-orange-500/25 text-orange-400"}`}>
                            CVSS {briefing.cvssScore.toFixed(1)}
                          </span>
                        )}
                        {briefing.tags.includes("cisa-kev") && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-red-600/10 border-red-600/25 text-red-500 uppercase tracking-wider">
                            CISA KEV
                          </span>
                        )}
                      </div>
                      <a
                        href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-[#888] hover:text-red-400 border border-white/[0.06] hover:border-red-600/25 px-3 py-1.5 rounded transition-colors whitespace-nowrap"
                      >
                        Ver no NVD <ExternalLink size={10} />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fontes */}
            <div className="mt-8 pt-8 border-t border-white/[0.04]">
              <h2 className="text-base font-black text-white uppercase tracking-wider mb-4">
                Fontes Consultadas
              </h2>
              <div className="space-y-2">
                <a
                  href={briefing.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between bg-[#0D0D0D] border border-white/[0.06] hover:border-red-600/20 rounded-lg px-4 py-3 transition-colors group"
                >
                  <div>
                    <div className="text-sm font-bold text-white group-hover:text-red-400 transition-colors">
                      {briefing.sourceName}
                    </div>
                    {briefing.sourcePublishedAt && (
                      <div className="text-[11px] text-[#555] mt-0.5">
                        Publicado em {formatDate(briefing.sourcePublishedAt)}
                      </div>
                    )}
                  </div>
                  <ExternalLink size={13} className="text-[#444] group-hover:text-red-400 transition-colors flex-shrink-0" />
                </a>

                {briefing.cves.slice(0, 2).map((cve) => (
                  <a
                    key={cve}
                    href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between bg-[#0D0D0D] border border-white/[0.06] hover:border-red-600/20 rounded-lg px-4 py-3 transition-colors group"
                  >
                    <div>
                      <div className="text-sm font-bold text-white group-hover:text-red-400 transition-colors">
                        NVD: {cve}
                      </div>
                      <div className="text-[11px] text-[#555] mt-0.5">National Vulnerability Database (NIST)</div>
                    </div>
                    <ExternalLink size={13} className="text-[#444] group-hover:text-red-400 transition-colors flex-shrink-0" />
                  </a>
                ))}

                {briefing.cves.length > 0 && briefing.epssScore != null && (
                  <a
                    href={`https://api.first.org/data/v1/epss?cve=${briefing.cves[0]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between bg-[#0D0D0D] border border-white/[0.06] hover:border-red-600/20 rounded-lg px-4 py-3 transition-colors group"
                  >
                    <div>
                      <div className="text-sm font-bold text-white group-hover:text-red-400 transition-colors">
                        EPSS: {briefing.cves[0]}
                      </div>
                      <div className="text-[11px] text-[#555] mt-0.5">
                        Exploit Prediction Scoring System (FIRST). Score: {(briefing.epssScore * 100).toFixed(1)}%
                      </div>
                    </div>
                    <ExternalLink size={13} className="text-[#444] group-hover:text-red-400 transition-colors flex-shrink-0" />
                  </a>
                )}

                {briefing.tags.includes("cisa-kev") && (
                  <a
                    href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between bg-[#0D0D0D] border border-red-600/15 hover:border-red-600/30 rounded-lg px-4 py-3 transition-colors group"
                  >
                    <div>
                      <div className="text-sm font-bold text-red-400 group-hover:text-red-300 transition-colors">
                        CISA KEV: Known Exploited Vulnerabilities
                      </div>
                      <div className="text-[11px] text-[#555] mt-0.5">Exploração ativa confirmada pela CISA</div>
                    </div>
                    <ExternalLink size={13} className="text-red-600/50 group-hover:text-red-400 transition-colors flex-shrink-0" />
                  </a>
                )}
              </div>
            </div>
          </article>

          {/* ── Sidebar ──────────────────────────────────────────────── */}
          <aside className="lg:w-72 flex-shrink-0 space-y-6">
            {/* IOCs */}
            {briefing.iocs.length > 0 && (
              <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-xl p-5 sticky top-20">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle size={13} className="text-red-500" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    IOCs ({briefing.iocs.length})
                  </span>
                </div>
                <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                  {Object.entries(byType).map(([type, iocs]) => (
                    <div key={type}>
                      <div className="text-[9px] font-bold text-[#555] uppercase tracking-wider mb-2">
                        {IOC_TYPE_LABELS[type] ?? type}
                      </div>
                      <div className="space-y-1.5">
                        {iocs.map((ioc, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${CONFIDENCE_DOT[ioc.confidence] ?? "bg-[#555]"}`} />
                            <span className="font-mono text-[10px] text-[#A1A1AA] truncate">{ioc.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-white/[0.04] text-[9px] text-[#444]">
                  Adicione ao SIEM, firewall e EDR
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-xl p-5 space-y-4">
              {briefing.affectedSectors.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#555] uppercase tracking-wider mb-2">
                    <Building2 size={10} /> Setores Afetados
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {briefing.affectedSectors.map((s) => (
                      <span key={s} className="text-[10px] bg-white/[0.04] border border-white/[0.06] text-[#888] px-2 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {briefing.affectedRegions.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#555] uppercase tracking-wider mb-2">
                    <Globe size={10} /> Regiões
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {briefing.affectedRegions.map((r) => (
                      <span key={r} className="text-[10px] bg-white/[0.04] border border-white/[0.06] text-[#888] px-2 py-0.5 rounded">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {briefing.tags.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#555] uppercase tracking-wider mb-2">
                    <Tag size={10} /> Tags
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {briefing.tags.map((t) => (
                      <span key={t} className="text-[10px] text-[#666] bg-[#0A0A0A] border border-white/[0.05] px-2 py-0.5 rounded font-mono">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {briefing.mitreTechniques.length > 0 && (
                <div>
                  <div className="text-[9px] font-bold text-[#555] uppercase tracking-wider mb-2">
                    MITRE ATT&CK
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {briefing.mitreTechniques.map((t) => (
                      <a
                        key={t}
                        href={`https://attack.mitre.org/techniques/${t.replace(".", "/")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-mono text-red-400 hover:text-red-300 bg-red-600/5 border border-red-600/15 px-2 py-0.5 rounded transition-colors"
                      >
                        {t}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Voltar */}
            <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-xl p-5">
              <div className="text-xs font-bold text-white mb-2">Mais Briefings</div>
              <p className="text-[11px] text-[#A1A1AA] leading-relaxed mb-4">
                Veja todos os briefings de threat intelligence publicados na plataforma.
              </p>
              <Link
                href="/threat-briefings"
                className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-[#161616] hover:bg-[#1a1a1a] border border-white/[0.08] hover:border-red-600/25 text-white font-bold rounded-lg text-xs transition-all"
              >
                Ver todos <ExternalLink size={11} />
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export const revalidate = 3600; // Revalidar a cada hora
