"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Clock, Flame, Globe, MapPin } from "lucide-react";
import type { NewsArticle } from "@/lib/news-feeds";
import { getSourceColor } from "@/lib/source-colors";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h";
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function NewsCard({ article, featured = false }: { article: NewsArticle; featured?: boolean }) {
  const { dot } = getSourceColor(article.source);
  return (
    <Link
      href={`/noticias/${article.slug}`}
      className="group block bg-[#0D0D0D] border border-white/[0.06] rounded-xl overflow-hidden hover:border-white/[0.14] hover:bg-[#111] transition-all"
    >
      {article.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.imageUrl}
          alt=""
          className={`w-full object-cover ${featured ? "h-40" : "h-28"} opacity-70 group-hover:opacity-80 transition-opacity`}
          loading="lazy"
        />
      )}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex items-center gap-1 text-[10px] text-[#555]">
            <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
            {article.source.split(" ")[0]}
          </span>
          {article.sourceRegion === "Brasil" ? (
            <span className="flex items-center gap-0.5 text-[10px] text-green-600"><MapPin size={8} />BR</span>
          ) : (
            <span className="flex items-center gap-0.5 text-[10px] text-[#444]"><Globe size={8} /></span>
          )}
          <span className="ml-auto flex items-center gap-1 text-[10px] text-[#444]">
            <Clock size={8} />{timeAgo(article.publishedAt)}
          </span>
        </div>
        <h3 className={`font-semibold text-white leading-snug group-hover:text-red-400 transition-colors line-clamp-2 ${featured ? "text-sm" : "text-xs"}`}>
          {article.title}
        </h3>
        {featured && article.cves.length > 0 && (
          <div className="flex gap-1 mt-2">
            {article.cves.slice(0, 2).map((cve) => (
              <span key={cve} className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-red-400 bg-red-600/10 border border-red-600/20">
                {cve}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function NewsSection() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/noticias")
      .then((r) => r.json())
      .then((d) => setArticles(d.articles?.slice(0, 7) ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="py-16 border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-6 w-32 bg-white/[0.04] rounded animate-pulse mb-8" />
          <div className="grid md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-[#0D0D0D] border border-white/[0.06] rounded-xl h-36 animate-pulse" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (articles.length === 0) return null;

  const [top, ...rest] = articles;
  const side = rest.slice(0, 6);

  return (
    <section className="py-16 border-t border-white/[0.04]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Flame size={12} className="text-orange-500" />
              <span className="text-xs font-semibold text-red-500 uppercase tracking-widest">Em alta</span>
            </div>
            <h2 className="text-2xl font-black text-white">Últimas Notícias</h2>
          </div>
          <Link href="/noticias" className="hidden sm:flex items-center gap-1 text-sm text-[#A1A1AA] hover:text-white transition-colors">
            Ver todas <ArrowRight size={14} />
          </Link>
        </div>

        <div className="grid md:grid-cols-[2fr_1fr_1fr] gap-4 mb-4">
          {/* Destaque principal */}
          <NewsCard article={top} featured />

          {/* Dois menores ao lado */}
          <div className="grid grid-rows-2 gap-4">
            {side.slice(0, 2).map((a) => <NewsCard key={a.slug} article={a} />)}
          </div>

          {/* Mais dois */}
          <div className="grid grid-rows-2 gap-4">
            {side.slice(2, 4).map((a) => <NewsCard key={a.slug} article={a} />)}
          </div>
        </div>

        {/* Fila de notícias restantes */}
        {side.slice(4).length > 0 && (
          <div className="grid md:grid-cols-3 gap-4">
            {side.slice(4).map((a) => <NewsCard key={a.slug} article={a} />)}
          </div>
        )}

        <div className="mt-4 sm:hidden text-center">
          <Link href="/noticias" className="inline-flex items-center gap-1 text-sm text-[#A1A1AA] hover:text-white transition-colors">
            Ver todas as notícias <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
