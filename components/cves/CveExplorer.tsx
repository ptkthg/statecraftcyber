"use client";

import { useState, useMemo } from "react";
import { ExternalLink, Search, X, RefreshCw, ShieldAlert, AlertTriangle, Clock, Shield } from "lucide-react";
import type { CveEntry, VulnType } from "@/lib/cves/fetch-cves";

interface Props {
  initialCves: CveEntry[];
  initialUpdatedAt: string;
}

const VULN_TYPES: VulnType[] = [
  "Execução de Código", "Injeção", "Estouro de Buffer", "Autenticação",
  "Exposição de Dados", "Travessia de Caminho", "Negação de Serviço",
  "Escalada de Privilégio", "Criptografia", "Outro",
];

const VULN_TYPE_COLOR: Record<VulnType, string> = {
  "Execução de Código":    "text-red-400 bg-red-600/10 border-red-600/20",
  "Injeção":               "text-orange-400 bg-orange-600/10 border-orange-600/20",
  "Estouro de Buffer":     "text-rose-400 bg-rose-600/10 border-rose-600/20",
  "Autenticação":          "text-yellow-400 bg-yellow-600/10 border-yellow-600/20",
  "Exposição de Dados":    "text-blue-400 bg-blue-600/10 border-blue-600/20",
  "Travessia de Caminho":  "text-cyan-400 bg-cyan-600/10 border-cyan-600/20",
  "Negação de Serviço":    "text-purple-400 bg-purple-600/10 border-purple-600/20",
  "Escalada de Privilégio":"text-amber-400 bg-amber-600/10 border-amber-600/20",
  "Criptografia":          "text-indigo-400 bg-indigo-600/10 border-indigo-600/20",
  "Outro":                 "text-dim bg-white/[0.04] border-white/[0.08]",
};

const SEV_CONFIG = {
  CRITICAL: { label: "Crítico",  cls: "text-red-400 bg-red-600/10 border-red-600/25",    dot: "bg-red-500" },
  HIGH:     { label: "Alto",     cls: "text-orange-400 bg-orange-600/10 border-orange-600/25", dot: "bg-orange-500" },
  MEDIUM:   { label: "Médio",    cls: "text-yellow-400 bg-yellow-600/10 border-yellow-600/25", dot: "bg-yellow-500" },
  LOW:      { label: "Baixo",    cls: "text-green-400 bg-green-600/10 border-green-600/25",    dot: "bg-green-500" },
};

const PRIORITY_CONFIG: Record<string, { cls: string }> = {
  "Crítica": { cls: "text-red-400 bg-red-600/10 border-red-600/25" },
  "Alta":    { cls: "text-orange-400 bg-orange-600/10 border-orange-600/25" },
  "Média":   { cls: "text-yellow-400 bg-yellow-600/10 border-yellow-600/25" },
  "Baixa":   { cls: "text-green-400 bg-green-600/10 border-green-600/25" },
};

function cvssColor(score: number | null): string {
  if (!score) return "text-dim";
  if (score >= 9) return "text-red-400";
  if (score >= 7) return "text-orange-400";
  if (score >= 4) return "text-yellow-400";
  return "text-green-400";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h atrás";
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function CveCard({ cve }: { cve: CveEntry }) {
  const sev = cve.severity ? SEV_CONFIG[cve.severity] : null;
  const priority = cve.aiPriority ? PRIORITY_CONFIG[cve.aiPriority] : null;
  const hasAI = Boolean(cve.ptBrDescription);

  return (
    <div className="group bg-raised border border-white/[0.06] hover:border-white/[0.12] rounded-xl p-5 transition-all flex flex-col gap-4">
      {/* ── Identificação ── */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={cve.nvdUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono font-bold text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              {cve.id}
            </a>
            {sev && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${sev.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                {sev.label}
              </span>
            )}
            {cve.inCisaKev && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-bold text-red-300 bg-red-900/20 border-red-700/40">
                <ShieldAlert size={9} />
                CISA KEV
              </span>
            )}
          </div>
          <span className="flex items-center gap-1 text-xs text-dim flex-shrink-0">
            <Clock size={9} />
            {timeAgo(cve.published)}
          </span>
        </div>

        {/* Tipo + produtos afetados */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`px-2 py-0.5 rounded border text-xs font-semibold ${VULN_TYPE_COLOR[cve.vulnType]}`}>
            {cve.vulnType}
          </span>
          {cve.cweId && (
            <span className="text-xs text-dim font-mono">{cve.cweId}</span>
          )}
          {cve.affectedProducts.length > 0 && (
            <>
              <span className="text-dim text-xs">·</span>
              {cve.affectedProducts.slice(0, 2).map((p) => (
                <span key={p} className="px-1.5 py-0.5 rounded text-[9px] text-dim bg-white/[0.04] border border-white/[0.06]">
                  {p}
                </span>
              ))}
              {cve.affectedProducts.length > 2 && (
                <span className="text-[9px] text-dim">+{cve.affectedProducts.length - 2}</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Scores ── */}
      <div className="flex items-center gap-5">
        <div>
          <div className={`text-2xl font-bold font-mono leading-none ${cvssColor(cve.cvssScore)}`}>
            {cve.cvssScore?.toFixed(1) ?? "N/A"}
          </div>
          <div className="text-[9px] text-dim uppercase tracking-wider mt-0.5">CVSS {cve.cvssVersion}</div>
        </div>
        {cve.epss !== null && (
          <>
            <div className="w-px h-8 bg-white/[0.06]" />
            <div>
              <div className="text-lg font-bold font-mono leading-none text-purple-400">
                {(cve.epss * 100).toFixed(1)}%
              </div>
              <div className="text-[9px] text-dim uppercase tracking-wider mt-0.5">
                EPSS{cve.epssPercentile !== null ? ` · P${Math.round(cve.epssPercentile * 100)}` : ""}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Descrição (PT-BR se disponível, inglês caso contrário) ── */}
      <div>
        {hasAI && (
          <p className="text-xs text-dim uppercase tracking-wider font-semibold mb-1.5">Descrição técnica</p>
        )}
        <p className="text-xs text-dim leading-relaxed">
          {hasAI ? cve.ptBrDescription : (cve.description || "Sem descrição disponível.")}
        </p>
        {!hasAI && cve.vulnType !== "Outro" && (
          <div className="mt-2 p-2.5 rounded-lg bg-white/[0.025] border border-white/[0.05]">
            <p className="text-xs text-dim leading-relaxed">{cve.vulnExplanation}</p>
          </div>
        )}
      </div>

      {/* ── Mitigação (quando disponível) ── */}
      {cve.mitigation && (
        <div className="flex gap-2.5 p-3 rounded-lg bg-green-600/[0.05] border border-green-600/[0.15]">
          <Shield size={11} className="text-green-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[9px] font-semibold text-dim uppercase tracking-wider mb-1">Mitigação</p>
            <p className="text-xs text-dim leading-relaxed">{cve.mitigation}</p>
          </div>
        </div>
      )}

      {/* ── Rodapé: prioridade + datas + NVD ── */}
      <div className="flex items-center justify-between pt-3 border-t border-white/[0.04] flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {priority && cve.aiPriority && (
            <span className={`px-2 py-0.5 rounded border text-xs font-bold ${priority.cls}`}>
              Prioridade {cve.aiPriority}
            </span>
          )}
          <span className="text-xs text-dim">
            Mod. {timeAgo(cve.lastModified)}
          </span>
        </div>
        <a
          href={cve.nvdUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-dim hover:text-white transition-colors"
        >
          Ver no NVD <ExternalLink size={9} />
        </a>
      </div>
    </div>
  );
}

export default function CveExplorer({ initialCves, initialUpdatedAt }: Props) {
  const [cves, setCves] = useState<CveEntry[]>(initialCves);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<"" | "CRITICAL" | "HIGH" | "MEDIUM">("");
  const [vulnType, setVulnType] = useState<VulnType | "">("");
  const [kevOnly, setKevOnly] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/cves");
      if (res.ok) {
        const data = await res.json() as { cves: CveEntry[]; updatedAt: string };
        setCves(data.cves);
        setUpdatedAt(data.updatedAt);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = useMemo(() => {
    return cves.filter((c) => {
      if (severity && c.severity !== severity) return false;
      if (vulnType && c.vulnType !== vulnType) return false;
      if (kevOnly && !c.inCisaKev) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.id.toLowerCase().includes(q) && !c.description.toLowerCase().includes(q) &&
            !c.affectedProducts.some((p) => p.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [cves, severity, vulnType, kevOnly, search]);

  const counts = useMemo(() => ({
    CRITICAL: cves.filter((c) => c.severity === "CRITICAL").length,
    HIGH:     cves.filter((c) => c.severity === "HIGH").length,
    MEDIUM:   cves.filter((c) => c.severity === "MEDIUM").length,
    kev:      cves.filter((c) => c.inCisaKev).length,
  }), [cves]);

  return (
    <>
      <section className="relative border-b border-white/[0.04] bg-canvas">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-red-600 blink" />
            <span className="text-xs font-semibold text-dim uppercase tracking-widest">Monitoramento Ativo</span>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-2">CVEs</h1>
              <p className="text-dim text-sm max-w-xl leading-relaxed">
                Vulnerabilidades publicadas nos últimos 7 dias com CVSS e EPSS. Entradas marcadas com{" "}
                <span className="text-red-400 font-semibold">CISA KEV</span> têm exploração ativa confirmada.
              </p>
            </div>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 text-sm text-dim hover:text-white border border-white/[0.08] hover:border-white/[0.16] rounded-lg transition-all"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              Atualizar
            </button>
          </div>

          <div className="relative max-w-xl">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
            <label htmlFor="cve-search" className="sr-only">Buscar CVEs</label>
            <input
              id="cve-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por CVE-ID, produto ou palavra-chave..."
              autoComplete="off"
              className="w-full bg-raised border border-white/[0.08] focus:border-white/20 focus-visible:outline-none rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-dim transition-colors"
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Limpar busca" className="absolute right-4 top-1/2 -translate-y-1/2 text-dim hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 rounded">
                <X size={14} aria-hidden />
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center gap-3 mb-4 text-xs text-dim">
          <AlertTriangle size={11} className="text-red-500" />
          <span><span className="font-mono font-bold text-white">{filtered.length}</span> vulnerabilidades</span>
          {updatedAt && (
            <span className="text-dim">· Atualizado {timeAgo(updatedAt)}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {([["", "Todas"], ["CRITICAL", `Crítico (${counts.CRITICAL})`], ["HIGH", `Alto (${counts.HIGH})`], ["MEDIUM", `Médio (${counts.MEDIUM})`]] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setSeverity(val as typeof severity)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                severity === val
                  ? "bg-red-600/15 border-red-600/30 text-red-400"
                  : "bg-raised border-white/[0.06] text-dim hover:text-white hover:border-white/[0.12]"
              }`}
            >
              {label}
            </button>
          ))}
          <div className="w-px bg-white/[0.06] self-stretch mx-1 hidden sm:block" />
          <select
            value={vulnType}
            onChange={(e) => setVulnType(e.target.value as VulnType | "")}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border bg-raised border-white/[0.06] text-dim hover:border-white/[0.12] outline-none cursor-pointer transition-all"
          >
            <option value="">Todos os tipos</option>
            {VULN_TYPES.filter((t) => cves.some((c) => c.vulnType === t)).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <div className="w-px bg-white/[0.06] self-stretch mx-1 hidden sm:block" />
          <button
            onClick={() => setKevOnly(!kevOnly)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              kevOnly
                ? "bg-red-900/20 border-red-700/40 text-red-300"
                : "bg-raised border-white/[0.06] text-dim hover:text-white hover:border-white/[0.12]"
            }`}
          >
            <ShieldAlert size={11} />
            CISA KEV ({counts.kev})
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-dim text-sm">
            {search || severity || kevOnly ? "Nenhum CVE encontrado com esses filtros." : "Nenhum CVE disponível no momento."}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((cve) => <CveCard key={cve.id} cve={cve} />)}
          </div>
        )}

        <div className="mt-10 text-center">
          <a
            href="https://nvd.nist.gov/vuln/search"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-dim hover:text-white transition-colors"
          >
            Base completa no NVD/NIST <ExternalLink size={10} />
          </a>
        </div>
      </div>
    </>
  );
}
