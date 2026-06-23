"use client";

import { useState, useMemo } from "react";
import { ExternalLink, Search, X, RefreshCw, ShieldAlert } from "lucide-react";
import type { CveEntry, VulnType } from "@/lib/cves/fetch-cves";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterPill } from "@/components/ui/FilterPill";
import { Tag } from "@/components/ui/Tag";
import { Pagination } from "@/components/ui/Pagination";

interface Props {
  initialCves: CveEntry[];
  initialUpdatedAt: string;
}

const PAGE_SIZE = 12;

const VULN_TYPES: VulnType[] = [
  "Execução de Código", "Injeção", "Estouro de Buffer", "Autenticação",
  "Exposição de Dados", "Travessia de Caminho", "Negação de Serviço",
  "Escalada de Privilégio", "Criptografia", "Outro",
];

const SEV_LABEL: Record<string, string> = {
  CRITICAL: "Crítico", HIGH: "Alto", MEDIUM: "Médio", LOW: "Baixo",
};

function cvssColor(score: number | null): string {
  if (!score) return "text-dim";
  if (score >= 9) return "text-brand";
  if (score >= 7) return "text-orange-400";
  return "text-yellow-400";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h atrás";
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function CveRow({ cve }: { cve: CveEntry }) {
  return (
    <a
      href={cve.nvdUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group grid grid-cols-[64px_1fr_auto] items-center gap-4 rounded-2xl border border-white/[0.05] bg-raised px-5 py-4 transition-all hover:bg-overlay hover:border-white/10"
    >
      {/* CVSS */}
      <div className="text-center">
        <div className={`font-display text-[22px] font-bold leading-none ${cvssColor(cve.cvssScore)}`}>
          {cve.cvssScore?.toFixed(1) ?? "N/A"}
        </div>
        <div className="mt-0.5 text-[9px] uppercase tracking-wider text-dim">cvss</div>
      </div>

      {/* Identificação */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[12.5px] text-cold">{cve.id}</span>
          {cve.severity && <Tag variant={cve.severity === "CRITICAL" ? "solid" : cve.severity === "LOW" ? "info" : "warn"}>{SEV_LABEL[cve.severity]}</Tag>}
          {cve.inCisaKev && <Tag variant="alert">CISA KEV</Tag>}
          <Tag variant="plain">{cve.vulnType}</Tag>
        </div>
        <div className="mt-1 truncate text-[13.5px] font-semibold text-ink">
          {cve.affectedProducts.length > 0 ? cve.affectedProducts.slice(0, 3).join(", ") : cve.id}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-dim">
          {cve.epss !== null && <>EPSS {(cve.epss * 100).toFixed(1)}% · </>}
          publicada {timeAgo(cve.published)}
        </div>
      </div>

      {/* Chevron */}
      <span aria-hidden className="text-dim transition-colors group-hover:text-white">›</span>
    </a>
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
  const [page, setPage] = useState(1);

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const reset = () => setPage(1);

  return (
    <div className="max-w-[1140px] mx-auto px-6 pt-8 pb-16">
      <PageHeader
        title={<>Vulnerabilidades <span className="text-dim text-lg ml-1 font-sans">CVE</span></>}
        description="Vulnerabilidades publicadas nos últimos 7 dias com CVSS e EPSS. Entradas com CISA KEV têm exploração ativa confirmada."
        meta={[
          { text: "monitoramento ativo", live: true },
          { text: `${filtered.length} vulnerabilidades · atualizado ${updatedAt ? timeAgo(updatedAt) : "—"}` },
        ]}
      />

      {/* Busca + atualizar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
          <label htmlFor="cve-search" className="sr-only">Buscar CVEs</label>
          <input
            id="cve-search"
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); reset(); }}
            placeholder="Buscar por CVE-ID, produto ou palavra-chave..."
            autoComplete="off"
            className="w-full rounded-full bg-raised border border-white/[0.05] focus:border-white/15 focus-visible:outline-none pl-11 pr-10 py-2.5 text-sm text-ink placeholder-dim transition-colors"
          />
          {search && (
            <button onClick={() => { setSearch(""); reset(); }} aria-label="Limpar busca" className="absolute right-4 top-1/2 -translate-y-1/2 text-dim hover:text-white">
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-full border border-white/[0.08] hover:border-white/20 px-4 py-2.5 text-sm text-dim hover:text-white transition-all flex-shrink-0"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>
      </div>

      {/* Filtros */}
      <div className="mb-8 flex flex-wrap items-center gap-2">
        <FilterPill active={severity === ""} onClick={() => { setSeverity(""); reset(); }}>Todas</FilterPill>
        <FilterPill active={severity === "CRITICAL"} critical onClick={() => { setSeverity("CRITICAL"); reset(); }}>Crítico ({counts.CRITICAL})</FilterPill>
        <FilterPill active={severity === "HIGH"} onClick={() => { setSeverity("HIGH"); reset(); }}>Alto ({counts.HIGH})</FilterPill>
        <FilterPill active={severity === "MEDIUM"} onClick={() => { setSeverity("MEDIUM"); reset(); }}>Médio ({counts.MEDIUM})</FilterPill>
        <span className="mx-1 h-4 w-px bg-white/[0.08]" />
        <FilterPill active={kevOnly} critical onClick={() => { setKevOnly(!kevOnly); reset(); }}>
          <span className="inline-flex items-center gap-1.5"><ShieldAlert size={11} /> Só CISA KEV ({counts.kev})</span>
        </FilterPill>
        <select
          value={vulnType}
          onChange={(e) => { setVulnType(e.target.value as VulnType | ""); reset(); }}
          className="rounded-full border border-white/[0.05] bg-raised px-4 py-1.5 text-[12.5px] font-semibold text-dim hover:border-white/15 outline-none cursor-pointer transition-colors"
        >
          <option value="">Todos os tipos</option>
          {VULN_TYPES.filter((t) => cves.some((c) => c.vulnType === t)).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-dim text-sm">
          {search || severity || kevOnly ? "Nenhum CVE encontrado com esses filtros." : "Nenhum CVE disponível no momento."}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {pageItems.map((cve) => <CveRow key={cve.id} cve={cve} />)}
        </div>
      )}

      <Pagination
        page={safePage}
        totalPages={totalPages}
        onPage={(n) => { setPage(n); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        className="mt-8"
      />

      <div className="mt-8 text-center">
        <a
          href="https://nvd.nist.gov/vuln/search"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-cold hover:text-white transition-colors"
        >
          Base completa no NVD/NIST <ExternalLink size={10} />
        </a>
      </div>
    </div>
  );
}
