"use client";

import { useState } from "react";
import { Shield, ArrowRight, Wifi, AlertTriangle, Clock, Search, X } from "lucide-react";
import Link from "next/link";
import type { Ioc, LiveIoc } from "@/lib/types";

export interface BriefingItem {
  id: string;
  title: string;
  slug: string;
  summary: string;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  tags: string[];
  sourceName: string;
  sourceUrl: string;
  cves: string[];
  iocs: Ioc[];
  createdAt: string;
  readingTime?: number;
}

interface Props {
  initialBriefings: BriefingItem[];
  initialTrending: BriefingItem[];
  initialIocs: LiveIoc[];
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "text-red-400 bg-red-600/10 border-red-600/20",
  high:     "text-orange-400 bg-orange-600/10 border-orange-600/20",
  medium:   "text-yellow-400 bg-yellow-600/10 border-yellow-600/20",
  low:      "text-blue-400 bg-blue-600/10 border-blue-600/20",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Crítico", high: "Alto", medium: "Médio", low: "Baixo",
};

const FILTER_TO_SEVERITY: Record<string, string> = {
  "crítico": "critical", "alto": "high", "médio": "medium", "baixo": "low",
};

const SEVERITY_FILTERS = [
  { key: "Crítico", label: "Crítico", style: "text-red-400 bg-red-600/10 border-red-600/25",    active: "bg-red-600/20 border-red-600/40 text-red-300" },
  { key: "Alto",    label: "Alto",    style: "text-orange-400 bg-orange-600/10 border-orange-600/25", active: "bg-orange-600/20 border-orange-600/40 text-orange-300" },
  { key: "Médio",   label: "Médio",   style: "text-yellow-400 bg-yellow-600/10 border-yellow-600/25", active: "bg-yellow-600/20 border-yellow-600/40 text-yellow-300" },
];

const CATEGORY_FILTERS = ["Malware", "Ransomware", "Vulnerabilidade", "APT", "Phishing", "Supply Chain", "LATAM"];

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1").replace(/`(.+?)`/g, "$1")
    .replace(/_{1,2}(.+?)_{1,2}/g, "$1");
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h atrás";
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function FeaturedCard({ briefing }: { briefing: BriefingItem }) {
  return (
    <Link href={`/threat-briefings/${briefing.slug}`} className="block group">
      <div className="bg-[#0D0D0D] border border-white/[0.06] hover:border-red-600/25 rounded-xl p-6 transition-all duration-300">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${SEVERITY_STYLES[briefing.severity]}`}>
            {SEVERITY_LABELS[briefing.severity]}
          </span>
          <span className="text-[10px] text-[#555] bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
            {briefing.category}
          </span>
          {briefing.cves.slice(0, 2).map((cve) => (
            <span key={cve} className="text-[10px] font-mono text-[#888] bg-[#0A0A0A] px-2 py-0.5 rounded">{cve}</span>
          ))}
          <span className="ml-auto text-[10px] text-[#555]">{timeAgo(briefing.createdAt)}</span>
        </div>
        <h2 className="text-lg font-black text-white mb-3 leading-snug group-hover:text-red-400 transition-colors">
          {briefing.title}
        </h2>
        <p className="text-sm text-[#A1A1AA] leading-relaxed mb-4 line-clamp-3">{stripMarkdown(briefing.summary)}</p>
        {briefing.iocs.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] font-bold text-[#666] uppercase tracking-wider mb-2">IOCs</div>
            <div className="flex flex-wrap gap-2">
              {briefing.iocs.slice(0, 3).map((ioc, i) => (
                <span key={i} className="font-mono text-[10px] bg-[#0A0A0A] border border-white/[0.06] text-[#999] px-2 py-1 rounded">
                  {ioc.value}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px] text-[#555]">
            <span className="flex items-center gap-1"><Clock size={10} /> {briefing.readingTime ?? 5} min</span>
            <span>{briefing.sourceName}</span>
          </div>
          <span className="text-xs text-red-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            Ler briefing completo <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function BriefingCard({ briefing }: { briefing: BriefingItem }) {
  return (
    <Link href={`/threat-briefings/${briefing.slug}`} className="block group h-full">
      <div className="bg-[#0D0D0D] border border-white/[0.06] hover:border-red-600/20 rounded-xl p-5 transition-all duration-300 h-full flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${SEVERITY_STYLES[briefing.severity]}`}>
            {SEVERITY_LABELS[briefing.severity]}
          </span>
          <span className="text-[10px] text-[#555] truncate">{briefing.category}</span>
          <span className="ml-auto text-[10px] text-[#555] flex-shrink-0">{timeAgo(briefing.createdAt)}</span>
        </div>
        <h3 className="text-sm font-bold text-white mb-2 leading-snug group-hover:text-red-400 transition-colors line-clamp-2 flex-1">
          {briefing.title}
        </h3>
        <p className="text-xs text-[#A1A1AA] leading-relaxed line-clamp-2 mb-3">{stripMarkdown(briefing.summary)}</p>
        <div className="flex items-center justify-between mt-auto">
          <span className="text-[10px] text-[#555]">{briefing.sourceName}</span>
          {briefing.cves.length > 0 && (
            <span className="font-mono text-[9px] text-[#666] bg-[#0A0A0A] px-1.5 py-0.5 rounded">{briefing.cves[0]}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function BriefingExplorer({ initialBriefings, initialTrending, initialIocs }: Props) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("Todos");
  const [visibleCount, setVisibleCount] = useState(6);

  const briefings = initialBriefings;
  const trending = initialTrending;
  const latestIocs = initialIocs;

  const featured = briefings.find((b) => b.severity === "critical") ?? briefings[0];
  const rest = briefings.filter((b) => b.id !== featured?.id);

  const filtered = rest.filter((b) => {
    const q = search.toLowerCase();
    const matchSearch = !q || b.title.toLowerCase().includes(q) || b.tags.some((t) => t.includes(q)) || b.cves.some((c) => c.toLowerCase().includes(q)) || b.summary.toLowerCase().includes(q);
    const filterKey = activeFilter.toLowerCase();
    const mappedSeverity = FILTER_TO_SEVERITY[filterKey];
    const matchFilter = activeFilter === "Todos" || (mappedSeverity ? b.severity === mappedSeverity : false) || b.category.toLowerCase().includes(filterKey) || b.tags.some((t) => t.includes(filterKey));
    return matchSearch && matchFilter;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="bg-[#0A0A0A] border border-white/[0.07] rounded-xl mb-8 overflow-hidden">
            <div className="relative">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#444] pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por título, CVE, tag ou conteúdo..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setVisibleCount(6); }}
                className="w-full bg-transparent border-b border-white/[0.06] pl-11 pr-10 py-3.5 text-sm text-white placeholder-[#444] outline-none focus:placeholder-[#666] transition-colors"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#A1A1AA] transition-colors">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button onClick={() => { setActiveFilter("Todos"); setVisibleCount(6); }} className={`text-xs font-medium px-2.5 py-1 rounded-md border transition-all ${activeFilter === "Todos" ? "bg-white/[0.08] border-white/20 text-white" : "border-transparent text-[#555] hover:text-[#A1A1AA]"}`}>
                Todos
              </button>
              <div className="w-px h-4 bg-white/[0.06] flex-shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-[#333] uppercase tracking-wider">Sev.</span>
                {SEVERITY_FILTERS.map((f) => (
                  <button key={f.key} onClick={() => { setActiveFilter(f.key); setVisibleCount(6); }} className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-all ${activeFilter === f.key ? f.active : f.style + " hover:opacity-90"}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="w-px h-4 bg-white/[0.06] flex-shrink-0" />
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] font-bold text-[#333] uppercase tracking-wider">Cat.</span>
                {CATEGORY_FILTERS.map((cat) => (
                  <button key={cat} onClick={() => { setActiveFilter(cat); setVisibleCount(6); }} className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all ${activeFilter === cat ? "bg-white/[0.08] border-white/20 text-white" : "border-white/[0.06] text-[#666] hover:text-[#A1A1AA] hover:border-white/[0.12]"}`}>
                    {cat}
                  </button>
                ))}
              </div>
              {activeFilter !== "Todos" && (
                <button onClick={() => { setActiveFilter("Todos"); setVisibleCount(6); }} className="ml-auto flex items-center gap-1 text-[10px] text-[#555] hover:text-[#A1A1AA] transition-colors">
                  <X size={10} /> Limpar
                </button>
              )}
            </div>
          </div>

          {/* Featured */}
          {!search && activeFilter === "Todos" && featured && (
            <div className="mb-8">
              <div className="text-xs font-bold text-red-500 uppercase tracking-widest mb-3">Briefing em Destaque</div>
              <FeaturedCard briefing={featured} />
            </div>
          )}

          {/* Grid */}
          <div>
            <div className="text-xs font-bold text-[#666] uppercase tracking-widest mb-4">Briefings Recentes</div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.slice(0, visibleCount).map((b) => <BriefingCard key={b.id} briefing={b} />)}
            </div>
            {filtered.length === 0 && briefings.length === 0 && (
              <div className="text-center py-20 border border-white/[0.06] rounded-xl">
                <Shield size={32} className="text-[#333] mx-auto mb-3" />
                <div className="text-sm font-bold text-[#666] mb-1">Nenhum briefing publicado</div>
                <div className="text-xs text-[#444]">Os briefings são gerados automaticamente a cada hora.</div>
              </div>
            )}
            {filtered.length === 0 && briefings.length > 0 && (
              <div className="text-center py-16 text-[#666] text-sm">Nenhum briefing corresponde ao filtro selecionado.</div>
            )}
            {filtered.length > visibleCount && (
              <div className="mt-8 flex justify-center">
                <button onClick={() => setVisibleCount((v) => v + 6)} className="px-6 py-2.5 bg-[#0D0D0D] border border-white/[0.08] hover:border-red-600/30 text-sm text-[#A1A1AA] hover:text-white rounded-lg transition-all">
                  Carregar mais ({filtered.length - visibleCount} restantes)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="lg:w-72 flex-shrink-0 space-y-6">
          <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Ameaças em Alta</span>
              <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-600/10 border border-green-600/20 px-2 py-0.5 rounded-full">
                <Wifi size={8} /> PIPELINE ATIVO
              </span>
            </div>
            <div className="space-y-1">
              {trending.length > 0 ? trending.map((b) => (
                <Link key={b.id} href={`/threat-briefings/${b.slug}`} className="flex items-center justify-between gap-2 py-2 px-2 rounded-lg hover:bg-white/[0.03] transition-colors group">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${b.severity === "critical" ? "bg-red-500" : b.severity === "high" ? "bg-orange-400" : "bg-yellow-400"}`} />
                    <span className="text-xs text-[#A1A1AA] truncate group-hover:text-white transition-colors leading-tight">{b.title}</span>
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 uppercase ${SEVERITY_STYLES[b.severity]}`}>{SEVERITY_LABELS[b.severity]}</span>
                </Link>
              )) : (
                <div className="text-xs text-[#444] py-4 text-center">Nenhuma ameaça em alta no momento.</div>
              )}
            </div>
          </div>

          <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Últimos Indicadores</span>
              {latestIocs.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-600/10 border border-green-600/20 px-2 py-0.5 rounded-full">
                  <Wifi size={8} /> PIPELINE ATIVO
                </span>
              )}
            </div>
            <div className="space-y-3">
              {latestIocs.length > 0 ? latestIocs.map((ioc, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[9px] font-bold bg-red-600/10 border border-red-600/20 text-red-400 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 font-mono uppercase">{ioc.type}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] text-[#A1A1AA] truncate">{ioc.value}</div>
                    {ioc.briefingSlug ? (
                      <Link href={`/threat-briefings/${ioc.briefingSlug}`} className="text-[9px] text-red-500 hover:text-red-400 transition-colors flex items-center gap-0.5 mt-0.5">
                        {ioc.sourceName} <ArrowRight size={8} />
                      </Link>
                    ) : (
                      <div className="text-[9px] text-[#555]">{ioc.confidence}</div>
                    )}
                  </div>
                </div>
              )) : (
                <div className="text-xs text-[#444] py-4 text-center">Nenhum IOC disponível.</div>
              )}
            </div>
          </div>

          <div className="bg-[#0D0D0D] border border-red-600/15 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-red-500" />
              <span className="text-xs font-bold text-white">Aviso Operacional</span>
            </div>
            <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
              Dados de Threat Intelligence devem ser validados em fontes primárias antes de qualquer ação crítica em produção.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
