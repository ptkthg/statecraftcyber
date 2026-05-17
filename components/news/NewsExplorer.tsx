"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { ExternalLink, Globe, MapPin, Clock, RefreshCw, AlertCircle } from "lucide-react";
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
      {article.imageUrl && (
        <div className="relative flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden hidden sm:block">
          <Image
            src={article.imageUrl}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-semibold ${colors.badge}`}>
            <span className={`w-1 h-1 rounded-full ${colors.dot}`} />
            {article.source.replace("Blog", "").replace("Google ", "").trim()}
          </span>
          {article.type && (
            <span className="px-1.5 py-0.5 rounded border text-[9px] font-medium text-[#777] bg-white/[0.03] border-white/[0.06]">
              {article.type}
            </span>
          )}
          {article.sourceRegion === "Brasil" && (
            <span className="flex items-center gap-0.5 text-[10px] text-green-600">
              <MapPin size={9} />BR
            </span>
          )}
          <span className="flex items-center gap-0.5 text-[10px] text-[#555]">
            <Clock size={9} />{timeAgo(article.publishedAt)}
          </span>
        </div>
        <h3 className="text-sm font-semibold text-white leading-snug group-hover:text-red-400 transition-colors line-clamp-2 mb-1.5">
          {article.title}
        </h3>
        <div className="flex flex-wrap gap-1">
          {article.cves.slice(0, 2).map((cve) => (
            <span key={cve} className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-red-400 bg-red-600/10 border border-red-600/20">
              {cve}
            </span>
          ))}
          {article.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded text-[9px] text-[#555] bg-white/[0.04] border border-white/[0.06]">
              #{tag}
            </span>
          ))}
        </div>
      </div>
      <ExternalLink size={12} className="flex-shrink-0 text-[#333] group-hover:text-red-400 transition-colors self-start mt-1" />
    </Link>
  );
}

function DateGroup({ label, articles }: { label: string; articles: NewsArticle[] }) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs font-bold text-[#A1A1AA] uppercase tracking-widest">{label}</span>
        <div className="h-px flex-1 bg-white/[0.06]" />
        <span className="text-[10px] text-[#444] font-mono">{articles.length}</span>
      </div>
      <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-xl overflow-hidden">
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
      <div className="flex flex-col gap-3 mb-8">
        <div className="flex flex-wrap gap-1.5">
          {ARTICLE_TYPES.map((t) => {
            const count = typeCounts[t] ?? 0;
            if (t && !count) return null;
            return (
              <button
                key={t || "all"}
                onClick={() => setArticleType(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  articleType === t
                    ? "bg-red-600/15 border-red-600/30 text-red-400"
                    : "bg-[#0D0D0D] border-white/[0.06] text-[#666] hover:text-[#A1A1AA] hover:border-white/[0.12]"
                }`}
              >
                {getTypeLabel(t || "")}
                <span className="ml-1.5 text-[9px] opacity-50">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(["", "Global", "Brasil"] as const).map((r) => {
            const count = r
              ? articles.filter((a) => a.sourceRegion === r).length
              : articles.length;
            return (
              <button
                key={r || "all-r"}
                onClick={() => setRegion(r)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  region === r
                    ? "bg-red-600/15 border-red-600/30 text-red-400"
                    : "bg-[#0D0D0D] border-white/[0.06] text-[#666] hover:text-[#A1A1AA] hover:border-white/[0.12]"
                }`}
              >
                {r === "Global" && <Globe size={10} />}
                {r === "Brasil" && <MapPin size={10} />}
                {r === "" ? "Todas as regiões" : r}
                <span className="text-[9px] opacity-50">{count}</span>
              </button>
            );
          })}

          <button
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#666] hover:text-[#A1A1AA] border border-white/[0.06] hover:border-white/[0.12] rounded-lg transition-all ml-auto"
          >
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
            Atualizar
          </button>

          <div className="flex items-center gap-1.5 text-xs text-[#555]">
            <AlertCircle size={10} className="text-red-500" />
            <span className="font-mono font-bold text-white">{filtered.length}</span>
            <span>artigos</span>
          </div>
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="py-20 text-center text-[#555] text-sm">
          Nenhuma notícia disponível com esses filtros.
        </div>
      ) : (
        grouped.map(({ label, articles: arts }) => (
          <DateGroup key={label} label={label} articles={arts} />
        ))
      )}

      <p className="mt-6 text-center text-[10px] text-[#444] leading-relaxed max-w-lg mx-auto">
        Artigos coletados de RSS feeds e reescritos em PT-BR por IA. Clique para ler a cobertura completa gerada pela Statecraft.
      </p>
    </div>
  );
}
