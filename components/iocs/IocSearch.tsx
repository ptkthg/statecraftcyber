"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Search, Copy, Check, ExternalLink, AlertTriangle, Globe, Hash, Link2, Mail, Shield, X } from "lucide-react";
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
      className="ml-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[#555] hover:text-[#A1A1AA]"
      title="Copiar"
    >
      {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
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
        <Icon size={8} />
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
        <div className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[ioc.briefingSeverity] ?? "bg-[#555]"}`} />
        <span className="text-[10px] text-[#666]">{SEVERITY_LABELS[ioc.briefingSeverity] ?? ioc.briefingSeverity}</span>
      </div>
      <Link
        href={`/threat-briefings/${ioc.briefingSlug}`}
        className="flex-shrink-0 flex items-center gap-1 text-[10px] text-[#555] hover:text-red-400 transition-colors max-w-[180px] hidden lg:flex"
        title={ioc.briefingTitle}
      >
        <span className="truncate">{ioc.briefingTitle}</span>
        <ExternalLink size={9} className="flex-shrink-0" />
      </Link>
      <span className="flex-shrink-0 text-[10px] text-[#444] font-mono">{timeAgo(ioc.briefingDate)}</span>
    </div>
  );
}

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
    // Skip the very first render — initial data is already hydrated from server
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
      <section className="relative py-14 border-b border-white/[0.04] overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#050505]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-red-600 blink" />
            <span className="text-xs font-semibold text-red-400 uppercase tracking-widest">
              Threat Intelligence
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3">Busca de IOCs</h1>
          <p className="text-[#A1A1AA] text-base leading-relaxed mb-8 max-w-xl">
            Cole um endereço IP, domínio, hash ou URL para verificar se aparece em algum briefing de ameaça.
          </p>

          <div className="relative max-w-2xl">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#555]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="185.220.101.45, update-win32[.]net, a3f7c9d2..."
              className="w-full bg-[#0D0D0D] border border-white/[0.10] focus:border-red-600/40 rounded-xl pl-10 pr-10 py-3.5 text-sm text-white placeholder-[#444] outline-none transition-colors font-mono"
            />
            {query && (
              <button
                onClick={clearSearch}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#A1A1AA] transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-2 text-xs text-[#666]">
            <AlertTriangle size={11} className="text-red-500" />
            <span className="font-mono font-bold text-white">{stats.total.toLocaleString("pt-BR")}</span>
            <span>IOCs coletados</span>
          </div>
          {Object.entries(stats.byType).map(([type, count]) => {
            const cfg = TYPE_CONFIG[type];
            if (!cfg || count === 0) return null;
            return (
              <div key={type} className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                <cfg.icon size={8} />
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

        <div className="flex flex-wrap gap-1.5 mb-6">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
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

        <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="hidden sm:flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
            <span className="w-14 text-[9px] font-bold text-[#555] uppercase tracking-wider">Tipo</span>
            <span className="flex-1 text-[9px] font-bold text-[#555] uppercase tracking-wider">Indicador</span>
            <span className="w-16 text-[9px] font-bold text-[#555] uppercase tracking-wider hidden sm:block">Conf.</span>
            <span className="w-20 text-[9px] font-bold text-[#555] uppercase tracking-wider hidden md:block">Sev.</span>
            <span className="flex-shrink-0 text-[9px] font-bold text-[#555] uppercase tracking-wider hidden lg:block w-[180px]">Briefing</span>
            <span className="w-16 text-[9px] font-bold text-[#555] uppercase tracking-wider text-right">Quando</span>
          </div>

          {loading && results.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-[#444] text-sm">Carregando...</div>
            </div>
          ) : results.length === 0 ? (
            <div className="py-16 text-center">
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
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              onClick={loadMore}
              className="px-6 py-2.5 bg-[#0D0D0D] border border-white/[0.08] hover:border-red-600/30 text-sm text-[#A1A1AA] hover:text-white rounded-lg transition-all"
            >
              Carregar mais ({total - results.length} restantes)
            </button>
          </div>
        )}

        {loading && results.length > 0 && (
          <div className="mt-4 text-center text-xs text-[#555]">Carregando...</div>
        )}

        <p className="mt-8 text-center text-[10px] text-[#444] leading-relaxed max-w-lg mx-auto">
          IOCs extraídos dos briefings publicados na plataforma. Para investigação aprofundada, consulte
          a fonte original de cada indicador. Dados atualizados a cada atualização do pipeline.
        </p>
      </div>
    </>
  );
}
