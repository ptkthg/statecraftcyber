"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Search, Copy, Check, ExternalLink, AlertTriangle,
  Globe, Hash, Link2, Mail, Shield, X,
  Download, FileCode, FileJson, FileText,
} from "lucide-react";
import type { EnrichedIoc } from "@/lib/types";

interface Stats {
  total: number;
  byType: Record<string, number>;
}

interface ApiResponse {
  results: EnrichedIoc[];
  total: number;
  stats: Stats;
  page: number;
  limit: number;
}

interface Props {
  initialResults: EnrichedIoc[];
  initialTotal: number;
  initialStats: Stats;
}

const TYPE_FILTERS = [
  { key: "", label: "Todos" },
  { key: "ip", label: "IP" },
  { key: "domain", label: "Domínio" },
  { key: "hash", label: "Hash" },
  { key: "url", label: "URL" },
  { key: "email", label: "E-mail" },
];

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  ip:     { label: "IP",      icon: Globe,  color: "text-red-400",    bg: "bg-red-600/10",    border: "border-red-600/20" },
  domain: { label: "DOM",     icon: Link2,  color: "text-orange-400", bg: "bg-orange-600/10", border: "border-orange-600/20" },
  hash:   { label: "HASH",    icon: Hash,   color: "text-purple-400", bg: "bg-purple-600/10", border: "border-purple-600/20" },
  url:    { label: "URL",     icon: Link2,  color: "text-yellow-400", bg: "bg-yellow-600/10", border: "border-yellow-600/20" },
  email:  { label: "E-MAIL",  icon: Mail,   color: "text-blue-400",   bg: "bg-blue-600/10",   border: "border-blue-600/20" },
  c2:     { label: "C2",      icon: Shield, color: "text-red-500",    bg: "bg-red-600/15",    border: "border-red-600/25" },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-400",
  medium:   "bg-yellow-400",
  low:      "bg-blue-400",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Crítico",
  high:     "Alto",
  medium:   "Médio",
  low:      "Baixo",
};

const CONFIDENCE_CONFIG: Record<string, { label: string; color: string }> = {
  high:   { label: "Alta",  color: "text-green-400" },
  medium: { label: "Média", color: "text-yellow-400" },
  low:    { label: "Baixa", color: "text-[#666]" },
};

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h";
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

// ── Export helpers ────────────────────────────────────────────────────────────

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(iocs: EnrichedIoc[]): string {
  const header = "tipo,valor,confiança,severidade,briefing_slug,fonte\n";
  const rows = iocs.map((i) =>
    [i.type, `"${i.value}"`, i.confidence, i.briefingSeverity, i.briefingSlug, i.sourceName ?? ""].join(",")
  );
  return header + rows.join("\n");
}

function toTxt(iocs: EnrichedIoc[]): string {
  return iocs.map((i) => i.value).join("\n");
}

function generateKql(iocs: EnrichedIoc[]): string {
  const today = new Date().toISOString().split("T")[0];
  const ips     = iocs.filter((i) => i.type === "ip").map((i) => i.value);
  const domains  = iocs.filter((i) => i.type === "domain").map((i) => i.value);
  const hashes   = iocs.filter((i) => i.type === "hash").map((i) => i.value);
  const urls     = iocs.filter((i) => i.type === "url").map((i) => i.value);

  const lines: string[] = [`// Statecraft IOC Hunt — ${today}\n`];

  if (ips.length)     lines.push(`let ioc_ips     = dynamic([${ips.map((v) => `"${v}"`).join(", ")}]);`);
  if (domains.length) lines.push(`let ioc_domains = dynamic([${domains.map((v) => `"${v}"`).join(", ")}]);`);
  if (hashes.length)  lines.push(`let ioc_hashes  = dynamic([${hashes.map((v) => `"${v}"`).join(", ")}]);`);
  if (urls.length)    lines.push(`let ioc_urls    = dynamic([${urls.map((v) => `"${v}"`).join(", ")}]);`);

  if (ips.length || domains.length || urls.length) {
    const conds = [
      ips.length     && "RemoteIP in (ioc_ips)",
      domains.length && "RemoteUrl has_any (ioc_domains)",
      urls.length    && "RemoteUrl has_any (ioc_urls)",
    ].filter(Boolean).join("\n    or ");
    lines.push(`\nDeviceNetworkEvents\n| where ${conds}\n| project Timestamp, DeviceName, RemoteIP, RemoteUrl, InitiatingProcessFileName, InitiatingProcessCommandLine`);
  }

  if (hashes.length) {
    lines.push(`\nDeviceFileEvents\n| where SHA256 in (ioc_hashes)\n| project Timestamp, DeviceName, FileName, SHA256, FolderPath, InitiatingProcessFileName`);
  }

  return lines.join("\n");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      aria-label={`Copiar IOC: ${value}`}
      className="ml-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-[#555] hover:text-[#A1A1AA] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500 rounded"
    >
      {copied ? <Check size={11} className="text-green-400" aria-hidden /> : <Copy size={11} aria-hidden />}
    </button>
  );
}

function IocRow({ ioc }: { ioc: EnrichedIoc }) {
  const cfg = TYPE_CONFIG[ioc.type] ?? {
    label: ioc.type.toUpperCase(),
    icon: Shield,
    color: "text-[#A1A1AA]",
    bg: "bg-white/[0.04]",
    border: "border-white/[0.08]",
  };
  const Icon = cfg.icon;
  const conf = CONFIDENCE_CONFIG[ioc.confidence] ?? { label: ioc.confidence, color: "text-[#666]" };

  return (
    <div className="group flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
      <div className={`flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold font-mono uppercase ${cfg.color} ${cfg.bg} ${cfg.border}`}>
        <Icon size={8} aria-hidden />
        {cfg.label}
      </div>
      <div className="flex items-center min-w-0 flex-1">
        <span className="font-mono text-[11px] text-[#D4D4D8] truncate">{ioc.value}</span>
        <CopyButton value={ioc.value} />
      </div>
      <div className={`flex-shrink-0 text-[10px] font-medium ${conf.color} hidden sm:block`}>
        {conf.label}
      </div>
      <div className="flex-shrink-0 hidden md:flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[ioc.briefingSeverity] ?? "bg-[#555]"}`} aria-hidden />
        <span className="text-[10px] text-[#666]">{SEVERITY_LABELS[ioc.briefingSeverity] ?? ioc.briefingSeverity}</span>
      </div>
      <Link
        href={`/threat-briefings/${ioc.briefingSlug}`}
        className="flex-shrink-0 flex items-center gap-1 text-[10px] text-[#555] hover:text-red-400 transition-colors max-w-[180px] hidden lg:flex focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500 rounded"
        title={ioc.briefingTitle}
      >
        <span className="truncate">{ioc.briefingTitle}</span>
        <ExternalLink size={9} className="flex-shrink-0" aria-hidden />
      </Link>
      <span className="flex-shrink-0 text-[10px] text-[#444] font-mono">{timeAgo(ioc.briefingDate)}</span>
    </div>
  );
}

// ── KQL Modal ─────────────────────────────────────────────────────────────────

function KqlModal({ kql, onClose }: { kql: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(kql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bloco KQL gerado"
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0D0D0D] border border-white/[0.12] rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
          <div>
            <p className="text-sm font-bold text-white">KQL — Microsoft Defender / Sentinel</p>
            <p className="text-[10px] text-[#555]">Cole no Advanced Hunting ou Sentinel Analytics</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#A1A1AA] hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
            >
              {copied ? <Check size={11} className="text-green-400" aria-hidden /> : <Copy size={11} aria-hidden />}
              {copied ? "Copiado!" : "Copiar"}
            </button>
            <button
              onClick={onClose}
              aria-label="Fechar modal"
              className="px-3 py-1.5 text-xs text-[#555] hover:text-white border border-white/[0.06] rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
            >
              Fechar
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto p-5 text-[11px] font-mono text-[#D4D4D8] leading-relaxed bg-[#080808] rounded-b-2xl whitespace-pre-wrap">
          {kql}
        </pre>
      </div>
    </div>
  );
}

// ── Export Toolbar ────────────────────────────────────────────────────────────

function ExportToolbar({ query, typeFilter }: { query: string; typeFilter: string }) {
  const [exporting, setExporting] = useState(false);
  const [kqlModal, setKqlModal] = useState<string | null>(null);

  const fetchAll = async (): Promise<EnrichedIoc[]> => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (typeFilter) params.set("type", typeFilter);
    const res = await fetch(`/api/iocs/export?${params}`);
    if (!res.ok) return [];
    const data = await res.json() as { results: EnrichedIoc[] };
    return data.results ?? [];
  };

  const handle = async (format: "csv" | "json" | "txt" | "kql") => {
    setExporting(true);
    try {
      const iocs = await fetchAll();
      if (!iocs.length) return;
      const date = new Date().toISOString().split("T")[0];
      if (format === "csv") downloadFile(toCsv(iocs), `statecraft-iocs-${date}.csv`, "text/csv");
      else if (format === "json") downloadFile(JSON.stringify(iocs, null, 2), `statecraft-iocs-${date}.json`, "application/json");
      else if (format === "txt") downloadFile(toTxt(iocs), `statecraft-iocs-${date}.txt`, "text/plain");
      else if (format === "kql") setKqlModal(generateKql(iocs));
    } finally {
      setExporting(false);
    }
  };

  const exportButtons = [
    { format: "csv"  as const, label: "CSV",  icon: Download },
    { format: "json" as const, label: "JSON", icon: FileJson },
    { format: "txt"  as const, label: "TXT",  icon: FileText },
    { format: "kql"  as const, label: "KQL",  icon: FileCode },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-[10px] text-[#555] uppercase tracking-widest mr-1">Exportar</span>
        {exportButtons.map(({ format, label, icon: Icon }) => (
          <button
            key={format}
            onClick={() => handle(format)}
            disabled={exporting}
            aria-label={`Exportar IOCs em ${label}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#666] hover:text-[#A1A1AA] bg-[#0D0D0D] hover:bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.12] rounded-lg transition-all disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
          >
            <Icon size={11} aria-hidden />
            {exporting ? "..." : label}
          </button>
        ))}
      </div>

      {kqlModal && <KqlModal kql={kqlModal} onClose={() => setKqlModal(null)} />}
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const LIMIT = 25;

export default function IocSearch({ initialResults, initialTotal, initialStats }: Props) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [results, setResults] = useState<EnrichedIoc[]>(initialResults);
  const [total, setTotal] = useState(initialTotal);
  const [stats, setStats] = useState<Stats>(initialStats);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const isInitial = useRef(true);

  const fetchIocs = useCallback(async (q: string, type: string, p: number, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (q) params.set("q", q);
      if (type) params.set("type", type);
      const res = await fetch(`/api/iocs?${params}`);
      if (!res.ok) return;
      const data: ApiResponse = await res.json();
      setResults((prev) => append ? [...prev, ...data.results] : data.results);
      setTotal(data.total);
      if (data.stats && !append) setStats(data.stats);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchIocs(query, typeFilter, 1, false);
    }, 280);
    return () => clearTimeout(debounceRef.current);
  }, [query, typeFilter, fetchIocs]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchIocs(query, typeFilter, next, true);
  };

  const clearSearch = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  const hasMore = results.length < total;

  return (
    <>
      <section className="relative py-14 border-b border-white/[0.04] overflow-hidden" aria-labelledby="ioc-heading">
        <div className="absolute inset-0 bg-grid opacity-30" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#050505]" aria-hidden />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-4" aria-hidden>
            <div className="w-1.5 h-1.5 rounded-full bg-red-600 blink" />
            <span className="text-xs font-semibold text-red-400 uppercase tracking-widest">
              Threat Intelligence
            </span>
          </div>
          <h1 id="ioc-heading" className="text-4xl md:text-5xl font-black text-white mb-3">Busca de IOCs</h1>
          <p className="text-[#A1A1AA] text-base leading-relaxed mb-8 max-w-xl">
            Cole um endereço IP, domínio, hash ou URL para verificar se aparece em algum briefing de ameaça.
          </p>

          <div className="relative max-w-2xl">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#555]" aria-hidden />
            <label htmlFor="ioc-search" className="sr-only">Buscar IOCs</label>
            <input
              id="ioc-search"
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="185.220.101.45, update-win32[.]net, a3f7c9d2..."
              autoComplete="off"
              className="w-full bg-[#0D0D0D] border border-white/[0.10] focus:border-red-600/40 focus-visible:outline-none rounded-xl pl-10 pr-10 py-3.5 text-sm text-white placeholder-[#444] transition-colors font-mono"
            />
            {query && (
              <button
                onClick={clearSearch}
                aria-label="Limpar busca"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#A1A1AA] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500 rounded"
              >
                <X size={14} aria-hidden />
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="flex flex-wrap items-center gap-4 mb-6" role="status" aria-live="polite" aria-label="Estatísticas de IOCs">
          <div className="flex items-center gap-2 text-xs text-[#666]">
            <AlertTriangle size={11} className="text-red-500" aria-hidden />
            <span className="font-mono font-bold text-white">{stats.total.toLocaleString("pt-BR")}</span>
            <span>IOCs coletados</span>
          </div>
          {Object.entries(stats.byType).map(([type, count]) => {
            const cfg = TYPE_CONFIG[type];
            if (!cfg || count === 0) return null;
            return (
              <div key={type} className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                <cfg.icon size={8} aria-hidden />
                <span className="font-bold font-mono">{count}</span>
                <span>{cfg.label}</span>
              </div>
            );
          })}
          {query && (
            <div className="text-xs text-[#A1A1AA] ml-auto">
              {total === 0 ? "Nenhum resultado" : `${total} resultado${total !== 1 ? "s" : ""}`}
            </div>
          )}
        </div>

        {/* Type filters */}
        <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label="Filtrar por tipo de IOC">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              aria-pressed={typeFilter === f.key}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500 ${
                typeFilter === f.key
                  ? "bg-red-600/15 border-red-600/30 text-red-400"
                  : "bg-[#0D0D0D] border-white/[0.06] text-[#666] hover:text-[#A1A1AA] hover:border-white/[0.12]"
              }`}
            >
              {f.label}
              {f.key && stats.byType[f.key] ? (
                <span className="ml-1.5 text-[9px] opacity-60">{stats.byType[f.key]}</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Export toolbar */}
        <ExportToolbar query={query} typeFilter={typeFilter} />

        {/* Table */}
        <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-xl overflow-hidden" role="region" aria-label="Lista de IOCs">
          <div className="hidden sm:flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]" role="row" aria-hidden>
            <span className="w-14 text-[9px] font-bold text-[#555] uppercase tracking-wider">Tipo</span>
            <span className="flex-1 text-[9px] font-bold text-[#555] uppercase tracking-wider">Indicador</span>
            <span className="w-16 text-[9px] font-bold text-[#555] uppercase tracking-wider hidden sm:block">Conf.</span>
            <span className="w-20 text-[9px] font-bold text-[#555] uppercase tracking-wider hidden md:block">Sev.</span>
            <span className="flex-shrink-0 text-[9px] font-bold text-[#555] uppercase tracking-wider hidden lg:block w-[180px]">Briefing</span>
            <span className="w-16 text-[9px] font-bold text-[#555] uppercase tracking-wider text-right">Quando</span>
          </div>

          {loading && results.length === 0 ? (
            <div className="py-16 text-center" aria-live="polite">
              <div className="text-[#444] text-sm">Carregando...</div>
            </div>
          ) : results.length === 0 ? (
            <div className="py-16 text-center" aria-live="polite">
              <div className="text-[#555] text-sm mb-1">
                {query ? `Nenhum IOC encontrado para "${query}"` : "Nenhum IOC disponível."}
              </div>
              {query && (
                <div className="text-[#444] text-xs">
                  Tente um termo diferente ou verifique a formatação do indicador.
                </div>
              )}
            </div>
          ) : (
            results.map((ioc, i) => <IocRow key={`${ioc.briefingSlug}-${ioc.value}-${i}`} ioc={ioc} />)
          )}
        </div>

        {hasMore && !loading && (
          <div className="mt-6 flex items-center justify-center">
            <button
              onClick={loadMore}
              className="px-6 py-2.5 bg-[#0D0D0D] border border-white/[0.08] hover:border-red-600/30 text-sm text-[#A1A1AA] hover:text-white rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              Carregar mais ({total - results.length} restantes)
            </button>
          </div>
        )}

        {loading && results.length > 0 && (
          <div className="mt-4 text-center text-xs text-[#555]" aria-live="polite">Carregando...</div>
        )}

        <p className="mt-8 text-center text-[10px] text-[#444] leading-relaxed max-w-lg mx-auto">
          IOCs extraídos dos briefings publicados na plataforma. Para investigação aprofundada, consulte
          a fonte original de cada indicador. Dados atualizados a cada atualização do pipeline.
        </p>
      </div>
    </>
  );
}
