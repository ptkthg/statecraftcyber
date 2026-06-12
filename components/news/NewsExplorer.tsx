"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Globe, MapPin, Clock, RefreshCw, Newspaper } from "lucide-react";
import type { NewsArticle, ArticleType } from "@/lib/news-feeds";
import { getSourceColor } from "@/lib/source-colors";

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

function ArticleRow({ article }: { article: NewsArticle }) {
  const colors = getSourceColor(article.source);

  return (
    <Link
      href={`/noticias/${article.slug}`}
      className="group flex gap-4 p-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015] transition-colors"
    >
      <div className="relative flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden hidden sm:flex items-center justify-center bg-raised">
        {article.imageUrl ? (
          <Image
            src={article.imageUrl}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <Globe size={18} className="text-[#2a2a2a]" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-semibold ${colors.badge}`}>
            <span className={`w-1 h-1 rounded-full ${colors.dot}`} />
            {article.source.replace("Blog", "").replace("Google ", "").trim()}
          </span>
          {article.type && (
            <span className="px-1.5 py-0.5 rounded border text-xs font-medium text-dim bg-white/[0.03] border-white/[0.06]">
              {article.type}
            </span>
          )}
          {article.sourceRegion === "Brasil" && (
            <span className="flex items-center gap-0.5 text-xs text-green-500">
              <MapPin size={9} />BR
            </span>
          )}
          <span className="flex items-center gap-0.5 text-xs text-dim">
            <Clock size={9} />{timeAgo(article.publishedAt)}
          </span>
        </div>
        <h3 className="text-sm font-semibold text-white leading-snug group-hover:text-white/80 transition-colors line-clamp-2 mb-1.5">
          {article.title}
        </h3>
        <div className="flex flex-wrap gap-1">
          {article.cves.slice(0, 2).map((cve) => (
            <span key={cve} className="px-1.5 py-0.5 rounded text-xs font-mono font-bold text-red-400 bg-red-600/10 border border-red-600/20">
              {cve}
            </span>
          ))}
          {article.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded text-xs text-dim bg-white/[0.04] border border-white/[0.06]">
              #{tag}
            </span>
          ))}
        </div>
      </div>
      <ChevronRight size={14} className="flex-shrink-0 text-dim group-hover:text-white transition-colors self-start mt-0.5" />
    </Link>
  );
}

function DateGroup({ label, articles }: { label: string; articles: NewsArticle[] }) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs font-bold text-dim uppercase tracking-widest">{label}</span>
        <div className="h-px flex-1 bg-white/[0.06]" />
        <span className="text-xs text-dim font-mono">{articles.length}</span>
      </div>
      <div className="bg-raised border border-white/[0.06] rounded-xl overflow-hidden">
        {articles.map((article) => (
          <ArticleRow key={article.slug} article={article} />
        ))}
      </div>
    </section>
  );
}

interface Props {
  initialArticles: NewsArticle[];
}

export default function NewsExplorer({ initialArticles }: Props) {
  const [articles, setArticles] = useState<NewsArticle[]>(initialArticles);
  const [refreshing, setRefreshing] = useState(false);
  const [region, setRegion] = useState<"" | "Brasil" | "Global">("");
  const [articleType, setArticleType] = useState<ArticleType | "">("");

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

  const filtered = useMemo(() => {
    return articles.filter((a) => {
      if (region && a.sourceRegion !== region) return false;
      if (articleType && a.type !== articleType) return false;
      return true;
    });
  }, [articles, region, articleType]);

  const grouped = useMemo(() => {
    const map = new Map<string, NewsArticle[]>();
    for (const a of filtered) {
      const d = new Date(a.publishedAt);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, arts]) => ({ label: formatDateLabel(key), articles: arts }));
  }, [filtered]);

  const typeCounts = useMemo(() => {
    return Object.fromEntries(
      ARTICLE_TYPES.map((t) => [t, t ? articles.filter((a) => a.type === t).length : articles.length])
    );
  }, [articles]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Filtros */}
      <div className="flex flex-col gap-4 mb-8">
        <div>
          <div className="text-xs font-bold text-dim uppercase tracking-widest mb-2">Tipo</div>
          <div className="flex flex-wrap gap-1.5">
            {ARTICLE_TYPES.map((t) => {
              const count = typeCounts[t] ?? 0;
              if (t && !count) return null;
              return (
                <button
                  key={t || "all"}
                  onClick={() => setArticleType(t)}
                  aria-pressed={articleType === t}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 ${
                    articleType === t
                      ? "bg-white/10 border-white/20 text-white font-semibold"
                      : "bg-raised border-white/[0.06] text-dim hover:text-white hover:border-white/[0.12]"
                  }`}
                >
                  {getTypeLabel(t || "")}
                  <span className="ml-1.5 text-xs opacity-50">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs font-bold text-dim uppercase tracking-widest mr-1">Região</div>
          {(["", "Global", "Brasil"] as const).map((r) => {
            const count = r
              ? articles.filter((a) => a.sourceRegion === r).length
              : articles.length;
            return (
              <button
                key={r || "all-r"}
                onClick={() => setRegion(r)}
                aria-pressed={region === r}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 ${
                  region === r
                    ? "bg-white/10 border-white/20 text-white font-semibold"
                    : "bg-raised border-white/[0.06] text-dim hover:text-white hover:border-white/[0.12]"
                }`}
              >
                {r === "Global" && <Globe size={10} />}
                {r === "Brasil" && <MapPin size={10} />}
                {r === "" ? "Todas" : r}
                <span className="text-xs opacity-50">{count}</span>
              </button>
            );
          })}

          <button
            onClick={refresh}
            disabled={refreshing}
            aria-label={refreshing ? "Atualizando notícias..." : "Atualizar notícias"}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-dim hover:text-white border border-white/[0.06] hover:border-white/[0.12] rounded-lg transition-all ml-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 disabled:opacity-50"
          >
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} aria-hidden />
            {refreshing ? "Atualizando..." : "Atualizar"}
          </button>

          <div className="flex items-center gap-1.5 text-xs text-dim">
            <Newspaper size={10} aria-hidden />
            <span className="font-mono font-bold text-white">{filtered.length}</span>
            <span>artigos</span>
          </div>
        </div>
      </div>

      <div className="relative">
        {refreshing && (
          <div className="absolute inset-0 bg-canvas/70 z-10 rounded-xl pointer-events-none" aria-hidden />
        )}

        {articles.length === 0 ? (
          <div className="py-24 text-center">
            <Newspaper size={28} className="mx-auto text-[#333] mb-4" aria-hidden />
            <p className="text-sm font-semibold text-dim mb-1">Nenhuma notícia disponível</p>
            <p className="text-xs text-dim max-w-xs mx-auto leading-relaxed">
              As fontes RSS podem estar temporariamente indisponíveis. Tente atualizar em instantes.
            </p>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="mt-4 flex items-center gap-1.5 px-4 py-2 text-xs text-dim hover:text-white border border-white/[0.06] hover:border-white/[0.12] rounded-lg transition-all mx-auto"
            >
              <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} aria-hidden />
              Tentar novamente
            </button>
          </div>
        ) : grouped.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm text-dim">Nenhuma notícia com esses filtros.</p>
            <button
              onClick={() => { setArticleType(""); setRegion(""); }}
              className="mt-3 text-xs text-dim hover:text-white transition-colors"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          grouped.map(({ label, articles: arts }) => (
            <DateGroup key={label} label={label} articles={arts} />
          ))
        )}
      </div>

      <p className="mt-6 text-center text-xs text-dim leading-relaxed max-w-lg mx-auto">
        Artigos coletados de RSS feeds e reescritos em PT-BR por IA. Clique para ler a cobertura completa gerada pela Statecraft.
      </p>
    </div>
  );
}
