"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import Link from "next/link";
import type { Ioc, LiveIoc } from "@/lib/types";
import { BentoCard } from "@/components/ui/BentoCard";
import { Tag } from "@/components/ui/Tag";
import { FilterPill } from "@/components/ui/FilterPill";
import { Pagination } from "@/components/ui/Pagination";

const PAGE_SIZE = 6;

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
  initialFilter?: string;
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Crítico", high: "Alto", medium: "Médio", low: "Baixo",
};

const SEVERITY_VARIANT: Record<string, "solid" | "warn" | "info" | "plain"> = {
  critical: "solid", high: "warn", medium: "warn", low: "info",
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-brand", high: "bg-yellow-500", medium: "bg-yellow-400", low: "bg-cold",
};

const FILTER_TO_SEVERITY: Record<string, string> = {
  "crítico": "critical", "alto": "high", "médio": "medium", "baixo": "low",
};

const SEVERITY_FILTERS = ["Crítico", "Alto", "Médio"];
const CATEGORY_FILTERS = ["Malware", "Ransomware", "Vulnerabilidade", "APT", "Phishing", "Supply Chain", "LATAM"];

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
    <BentoCard
      href={`/threat-briefings/${briefing.slug}`}
      action="Ler briefing completo"
      className="border-[rgba(var(--primary-rgb),0.3)] bg-[radial-gradient(ellipse_at_top_left,rgba(var(--primary-rgb),0.07),transparent_55%)]"
    >
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <Tag variant={SEVERITY_VARIANT[briefing.severity]}>{SEVERITY_LABELS[briefing.severity]}</Tag>
        <Tag variant="plain">{briefing.category}</Tag>
        {briefing.cves.slice(0, 2).map((cve) => (
          <span key={cve} className="font-mono text-[11px] text-cold">{cve}</span>
        ))}
        <span className="ml-auto font-mono text-[11px] text-dim">{timeAgo(briefing.createdAt)}</span>
      </div>
      <h2 className="font-display text-xl font-bold tracking-tight text-ink leading-snug">{briefing.title}</h2>
      <div className="mt-3 flex items-center gap-3 font-mono text-[11px] text-dim">
        <span>{briefing.readingTime ?? 5} min</span>
        <span>·</span>
        <span>{briefing.sourceName}</span>
        {briefing.iocs.length > 0 && <><span>·</span><span>{briefing.iocs.length} IOCs</span></>}
      </div>
    </BentoCard>
  );
}

function BriefingRowCard({ briefing }: { briefing: BriefingItem }) {
  return (
    <BentoCard href={`/threat-briefings/${briefing.slug}`} action="Ler briefing" className="min-h-[150px]">
      <div className="mb-2.5 flex items-center gap-2">
        <Tag variant={SEVERITY_VARIANT[briefing.severity]}>{SEVERITY_LABELS[briefing.severity]}</Tag>
        <span className="text-[11px] text-dim truncate">{briefing.category}</span>
        <span className="ml-auto font-mono text-[11px] text-dim flex-shrink-0">{timeAgo(briefing.createdAt)}</span>
      </div>
      <h3 className="text-[15px] font-semibold text-ink leading-snug line-clamp-2">{briefing.title}</h3>
      <div className="mt-auto flex items-center justify-between pt-3 font-mono text-[11px] text-dim">
        <span className="truncate">{briefing.sourceName}</span>
        {briefing.cves.length > 0 && <span className="text-cold flex-shrink-0">{briefing.cves[0]}</span>}
      </div>
    </BentoCard>
  );
}

export default function BriefingExplorer({ initialBriefings, initialTrending, initialIocs, initialFilter = "Todos" }: Props) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState(initialFilter);
  const [page, setPage] = useState(1);

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="max-w-[1140px] mx-auto px-6 py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="mb-6">
            <div className="relative mb-4">
              <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
              <label htmlFor="briefing-search" className="sr-only">Buscar briefings</label>
              <input
                id="briefing-search"
                type="search"
                placeholder="Buscar por título, CVE, tag ou conteúdo..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                autoComplete="off"
                className="w-full rounded-full bg-raised border border-white/[0.05] pl-11 pr-10 py-2.5 text-sm text-ink placeholder-dim outline-none transition-colors focus-visible:border-white/15"
              />
              {search && (
                <button onClick={() => setSearch("")} aria-label="Limpar busca" className="absolute right-4 top-1/2 -translate-y-1/2 text-dim hover:text-white transition-colors">
                  <X size={14} aria-hidden />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterPill active={activeFilter === "Todos"} onClick={() => { setActiveFilter("Todos"); setPage(1); }}>Todos</FilterPill>
              {SEVERITY_FILTERS.map((f) => (
                <FilterPill key={f} active={activeFilter === f} critical={f === "Crítico"} onClick={() => { setActiveFilter(f); setPage(1); }}>{f}</FilterPill>
              ))}
              <span className="mx-1 h-4 w-px bg-white/[0.08]" />
              {CATEGORY_FILTERS.map((cat) => (
                <FilterPill key={cat} active={activeFilter === cat} onClick={() => { setActiveFilter(cat); setPage(1); }}>{cat}</FilterPill>
              ))}
            </div>
          </div>

          {/* Featured */}
          {!search && activeFilter === "Todos" && featured && (
            <div className="mb-6">
              <FeaturedCard briefing={featured} />
            </div>
          )}

          {/* Grid */}
          <div className="grid sm:grid-cols-2 gap-4">
            {pageItems.map((b) => <BriefingRowCard key={b.id} briefing={b} />)}
          </div>
          {filtered.length === 0 && briefings.length === 0 && (
            <div className="text-center py-20 border border-white/[0.05] rounded-[20px]">
              <div className="text-sm font-semibold text-dim mb-1">Nenhum briefing publicado</div>
              <div className="text-xs text-dim">Os briefings são gerados automaticamente a cada hora.</div>
            </div>
          )}
          {filtered.length === 0 && briefings.length > 0 && (
            <div className="text-center py-16 text-dim text-sm">Nenhum briefing corresponde ao filtro selecionado.</div>
          )}
          <Pagination
            page={safePage}
            totalPages={totalPages}
            onPage={(n) => { setPage(n); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="mt-8"
          />
        </div>

        {/* Sidebar */}
        <aside className="lg:w-72 flex-shrink-0 space-y-4">
          <BentoCard label="Ameaças em alta" period="agora">
            <div className="-mx-1">
              {trending.length > 0 ? trending.map((b) => (
                <Link key={b.id} href={`/threat-briefings/${b.slug}`} className="flex items-center gap-2 rounded-lg px-1 py-2 hover:bg-white/[0.03] transition-colors group">
                  <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${SEVERITY_DOT[b.severity]}`} />
                  <span className="text-xs text-dim truncate group-hover:text-white transition-colors leading-tight">{b.title}</span>
                </Link>
              )) : (
                <div className="text-xs text-dim py-4 text-center">Nenhuma ameaça em alta no momento.</div>
              )}
            </div>
          </BentoCard>

          <BentoCard label="Últimos indicadores" period="pipeline">
            <div className="space-y-3">
              {latestIocs.length > 0 ? latestIocs.map((ioc, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Tag variant="alert">{ioc.type}</Tag>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-dim truncate">{ioc.value}</div>
                    {ioc.briefingSlug && (
                      <Link href={`/threat-briefings/${ioc.briefingSlug}`} className="text-[10px] text-cold hover:text-white transition-colors mt-0.5 inline-block">
                        {ioc.sourceName} →
                      </Link>
                    )}
                  </div>
                </div>
              )) : (
                <div className="text-xs text-dim py-4 text-center">Nenhum IOC disponível.</div>
              )}
            </div>
          </BentoCard>
        </aside>
      </div>
    </div>
  );
}
