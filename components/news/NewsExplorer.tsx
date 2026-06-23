"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Globe, MapPin, RefreshCw, Newspaper } from "lucide-react";
import type { NewsArticle, ArticleType } from "@/lib/news-feeds";
import { getSourceColor } from "@/lib/source-colors";
import { classifyNewsTitle } from "@/lib/home-stats";
import { FilterPill } from "@/components/ui/FilterPill";
import { Tag } from "@/components/ui/Tag";
import { Pagination } from "@/components/ui/Pagination";

const PAGE_SIZE = 16;

const ARTICLE_TYPES: (ArticleType | "")[] = [
  "", "Vulnerabilidade", "Ransomware", "Phishing", "APT",
  "Malware", "Vazamento", "Supply Chain", "Ataque", "Alerta Oficial", "Ameaça",
];

const TYPE_LABELS: Record<string, string> = {
  "": "Todos",
  Vulnerabilidade: "Vuln.",
  "Alerta Oficial": "Alerta",
  "Supply Chain": "Supply Chain",
};

function getTypeLabel(t: string) {
  return TYPE_LABELS[t] ?? t;
}

function formatDateLabel(isoDay: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(isoDay);
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h atrás";
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function ArticleRow({ article, alert }: { article: NewsArticle; alert: boolean }) {
  const colors = getSourceColor(article.source);

  return (
    <Link
      href={`/noticias/${article.slug}`}
      className="group flex gap-4 p-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015] transition-colors"
    >
      <div className="relative flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden hidden sm:flex items-center justify-center bg-canvas">
        {article.imageUrl ? (
          <Image src={article.imageUrl} alt="" fill sizes="80px" className="object-cover" />
        ) : (
          <Globe size={18} className="text-dim/40" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-semibold ${colors.badge}`}>
            <span className={`w-1 h-1 rounded-full ${colors.dot}`} />
            {article.source.replace("Blog", "").replace("Google ", "").trim()}
          </span>
          {alert && <Tag variant="alert">Alerta operacional</Tag>}
          {article.type && <Tag variant="plain">{article.type}</Tag>}
          {article.sourceRegion === "Brasil" && (
            <span className="flex items-center gap-0.5 text-xs text-cold"><MapPin size={9} />BR</span>
          )}
          <span className="font-mono text-[11px] text-dim">{timeAgo(article.publishedAt)}</span>
        </div>
        <h3 className="text-sm font-semibold text-ink leading-snug line-clamp-2 mb-1.5">{article.title}</h3>
        {article.summary && (
          <p className="text-xs text-dim leading-relaxed line-clamp-2 mb-1.5">{article.summary}</p>
        )}
        <div className="flex flex-wrap gap-1">
          {article.cves.slice(0, 2).map((cve) => (
            <span key={cve} className="px-1.5 py-0.5 rounded text-xs font-mono font-bold text-brand-soft bg-[rgba(var(--primary-rgb),0.12)]">{cve}</span>
          ))}
          {article.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded text-xs text-dim bg-white/[0.04]">#{tag}</span>
          ))}
        </div>
      </div>
      <ChevronRight size={14} className="flex-shrink-0 text-dim group-hover:text-white transition-colors self-start mt-0.5" />
    </Link>
  );
}

function DateGroup({ label, articles, alert }: { label: string; articles: NewsArticle[]; alert: boolean }) {
  return (
    <section className="mb-7">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[11px] font-bold text-dim uppercase tracking-widest">{label}</span>
        <div className="h-px flex-1 bg-white/[0.06]" />
        <span className="font-mono text-[11px] text-dim">{articles.length}</span>
      </div>
      <div className="bg-raised border border-white/[0.05] rounded-[20px] overflow-hidden">
        {articles.map((article) => (
          <ArticleRow key={article.slug} article={article} alert={alert} />
        ))}
      </div>
    </section>
  );
}

interface Props {
  initialArticles: NewsArticle[];
  initialTab?: "alertas" | "contexto";
}

export default function NewsExplorer({ initialArticles, initialTab = "alertas" }: Props) {
  const [articles, setArticles] = useState<NewsArticle[]>(initialArticles);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"alertas" | "contexto">(initialTab);
  const [region, setRegion] = useState<"" | "Brasil" | "Global">("");
  const [articleType, setArticleType] = useState<ArticleType | "">("");
  const [page, setPage] = useState(1);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/noticias");
      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles ?? []);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const isAlert = tab === "alertas";

  const filtered = useMemo(() => {
    return articles.filter((a) => {
      if ((classifyNewsTitle(a.title) === "alert") !== isAlert) return false;
      if (region && a.sourceRegion !== region) return false;
      if (articleType && a.type !== articleType) return false;
      return true;
    });
  }, [articles, isAlert, region, articleType]);

  const tabCounts = useMemo(() => {
    let alert = 0, context = 0;
    for (const a of articles) classifyNewsTitle(a.title) === "alert" ? alert++ : context++;
    return { alert, context };
  }, [articles]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const grouped = useMemo(() => {
    const map = new Map<string, NewsArticle[]>();
    for (const a of pageItems) {
      const d = new Date(a.publishedAt);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, arts]) => ({ label: formatDateLabel(key), articles: arts }));
  }, [pageItems]);

  const typeCounts = useMemo(() => {
    const base = articles.filter((a) => (classifyNewsTitle(a.title) === "alert") === isAlert);
    return Object.fromEntries(
      ARTICLE_TYPES.map((t) => [t, t ? base.filter((a) => a.type === t).length : base.length])
    );
  }, [articles, isAlert]);

  const reset = () => setPage(1);
  const switchTab = (t: "alertas" | "contexto") => { setTab(t); setArticleType(""); setPage(1); };

  return (
    <div className="max-w-[1140px] mx-auto px-6 py-8">
      {/* Abas */}
      <div className="mb-6 flex items-center gap-1 border-b border-white/[0.06]">
        {([["alertas", "Alertas operacionais", tabCounts.alert], ["contexto", "Contexto", tabCounts.context]] as const).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            aria-pressed={tab === key}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === key
                ? key === "alertas" ? "border-brand text-white" : "border-white text-white"
                : "border-transparent text-dim hover:text-white"
            }`}
          >
            {label}
            <span className="ml-1.5 font-mono text-[11px] text-dim">{count}</span>
          </button>
        ))}
        <button
          onClick={refresh}
          disabled={refreshing}
          aria-label="Atualizar notícias"
          className="ml-auto flex items-center gap-1.5 text-xs text-dim hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} aria-hidden />
          <span className="hidden sm:inline">{refreshing ? "Atualizando..." : "Atualizar"}</span>
        </button>
      </div>

      {/* Filtros secundários */}
      <div className="mb-7 flex flex-wrap items-center gap-2">
        {ARTICLE_TYPES.map((t) => {
          const count = typeCounts[t] ?? 0;
          if (t && !count) return null;
          return (
            <FilterPill key={t || "all"} active={articleType === t} onClick={() => { setArticleType(t); reset(); }}>
              {getTypeLabel(t || "")} <span className="opacity-50">{count}</span>
            </FilterPill>
          );
        })}
        <span className="mx-1 h-4 w-px bg-white/[0.08]" />
        {(["", "Global", "Brasil"] as const).map((r) => (
          <FilterPill key={r || "all-r"} active={region === r} onClick={() => { setRegion(r); reset(); }}>
            {r === "" ? "Todas regiões" : r}
          </FilterPill>
        ))}
      </div>

      <div className="relative">
        {refreshing && <div className="absolute inset-0 bg-canvas/70 z-10 rounded-xl pointer-events-none" aria-hidden />}

        {articles.length === 0 ? (
          <div className="py-24 text-center">
            <Newspaper size={28} className="mx-auto text-dim/40 mb-4" aria-hidden />
            <p className="text-sm font-semibold text-dim mb-1">Nenhuma notícia disponível</p>
            <p className="text-xs text-dim max-w-xs mx-auto leading-relaxed">
              As fontes RSS podem estar temporariamente indisponíveis. Tente atualizar em instantes.
            </p>
          </div>
        ) : grouped.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm text-dim">Nenhuma notícia nesta aba com esses filtros.</p>
            <button onClick={() => { setArticleType(""); setRegion(""); reset(); }} className="mt-3 text-xs text-cold hover:text-white transition-colors">
              Limpar filtros
            </button>
          </div>
        ) : (
          grouped.map(({ label, articles: arts }) => (
            <DateGroup key={label} label={label} articles={arts} alert={isAlert} />
          ))
        )}
      </div>

      <Pagination
        page={safePage}
        totalPages={totalPages}
        onPage={(n) => { setPage(n); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        className="mt-6"
      />
    </div>
  );
}
