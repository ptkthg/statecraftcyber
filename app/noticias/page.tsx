"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ExternalLink, Globe, MapPin, Clock, RefreshCw, AlertCircle, Flame, Search, X } from "lucide-react";
import type { NewsArticle, ArticleType } from "@/lib/news-feeds";
import { getSourceColor } from "@/lib/source-colors";

interface ApiResponse {
  articles: NewsArticle[];
  total: number;
  bySource: Record<string, number>;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h atrás";
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

// ── Featured Card ─────────────────────────────────────────────────────────────

function FeaturedCard({ article, rank }: { article: NewsArticle; rank: number }) {
  const colors = getSourceColor(article.source);
  return (
    <Link
      href={`/noticias/${article.slug}`}
      className="group relative block rounded-xl overflow-hidden border border-white/[0.06] hover:border-white/[0.14] transition-all"
    >
      <div className="relative h-52 bg-gradient-to-br from-[#111] to-[#0A0A0A]">
        {article.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={article.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-70 transition-opacity" loading="lazy" />
        ) : (
          <div className="absolute inset-0 bg-grid opacity-20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0D] via-[#0D0D0D]/60 to-transparent" />
        <div className="absolute top-3 left-3 flex items-center gap-2">
          {rank === 1 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold text-orange-400 bg-orange-600/20 border border-orange-600/30">
              <Flame size={8} />DESTAQUE
            </span>
          )}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-semibold ${colors.badge}`}>
            <span className={`w-1 h-1 rounded-full ${colors.dot}`} />
            {article.source.split(" ")[0]}
          </span>
        </div>
      </div>
      <div className="bg-[#0D0D0D] p-4">
        <h3 className="text-sm font-bold text-white leading-snug mb-2 group-hover:text-red-400 transition-colors line-clamp-2">
          {article.title}
        </h3>
        <p className="text-xs text-[#666] leading-relaxed line-clamp-2 mb-3">{article.summary}</p>
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {article.cves.slice(0, 2).map((cve) => (
              <span key={cve} className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-red-400 bg-red-600/10 border border-red-600/20">{cve}</span>
            ))}
            {article.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 rounded text-[9px] text-[#555] bg-white/[0.04] border border-white/[0.06]">#{tag}</span>
            ))}
          </div>
          <span className="text-[10px] text-[#444] flex-shrink-0">{timeAgo(article.publishedAt)}</span>
        </div>
      </div>
    </Link>
  );
}

// ── Article Row ───────────────────────────────────────────────────────────────

function ArticleRow({ article, highlight }: { article: NewsArticle; highlight?: string }) {
  const colors = getSourceColor(article.source);

  function hl(text: string) {
    if (!highlight) return text;
    const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-red-600/20 text-red-300 rounded px-0.5">{text.slice(idx, idx + highlight.length)}</mark>
        {text.slice(idx + highlight.length)}
      </>
    );
  }

  return (
    <Link
      href={`/noticias/${article.slug}`}
      className="group flex gap-4 p-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015] transition-colors"
    >
      {article.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={article.imageUrl} alt="" className="flex-shrink-0 w-20 h-16 object-cover rounded-lg hidden sm:block" loading="lazy" />
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
          <span className="flex items-center gap-0.5 text-[10px] text-[#555]"><Clock size={9} />{timeAgo(article.publishedAt)}</span>
          {article.sourceRegion === "Brasil" && (
            <span className="flex items-center gap-0.5 text-[10px] text-green-600"><MapPin size={9} />BR</span>
          )}
        </div>
        <h3 className="text-sm font-semibold text-white leading-snug group-hover:text-red-400 transition-colors line-clamp-2 mb-1">
          {hl(article.title)}
        </h3>
        <div className="flex flex-wrap gap-1">
          {article.cves.slice(0, 2).map((cve) => (
            <span key={cve} className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-red-400 bg-red-600/10 border border-red-600/20">{cve}</span>
          ))}
          {article.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded text-[9px] text-[#555] bg-white/[0.04] border border-white/[0.06]">#{tag}</span>
          ))}
        </div>
      </div>
      <ExternalLink size={12} className="flex-shrink-0 text-[#333] group-hover:text-red-400 transition-colors self-start mt-1" />
    </Link>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NoticiasPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("");
  const [region, setRegion] = useState<"" | "Brasil" | "Global">("");
  const [articleType, setArticleType] = useState<ArticleType | "">("");
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch("/api/noticias");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Filtros por fonte, região e tipo
  const filtered = useMemo(() => {
    return (data?.articles ?? []).filter((a) => {
      if (source && a.source !== source) return false;
      if (region && a.sourceRegion !== region) return false;
      if (articleType && a.type !== articleType) return false;
      return true;
    });
  }, [data, source, region, articleType]);

  // Busca textual sobre os filtrados
  const results = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter((a) =>
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.cves.some((c) => c.toLowerCase().includes(q)) ||
      a.tags.some((t) => t.toLowerCase().includes(q)) ||
      a.source.toLowerCase().includes(q)
    );
  }, [filtered, searchQuery]);

  const isSearching = searchQuery.trim().length > 0;
  const featured = !isSearching ? results.slice(0, 3) : [];
  const rest = !isSearching ? results.slice(3) : results;

  return (
    <main className="min-h-screen bg-[#050505] pt-16">
      {/* Hero */}
      <section className="relative py-14 border-b border-white/[0.04] overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#050505]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-red-600 blink" />
            <span className="text-xs font-semibold text-red-400 uppercase tracking-widest">Ao Vivo</span>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
            <div>
              <h1 className="text-4xl md:text-5xl font-black text-white mb-2">Notícias</h1>
              <p className="text-[#A1A1AA] text-sm leading-relaxed max-w-xl mb-1">
                Cobertura jornalística do cenário global de segurança, reescrita em português pela IA Statecraft a partir de 19 fontes especializadas.
              </p>
              <p className="text-xs text-[#555] max-w-xl leading-relaxed">
                Para análises técnicas com IOCs e recomendações operacionais, veja os <a href="/threat-briefings" className="text-red-600/70 hover:text-red-500 transition-colors">Threat Briefings</a>.
              </p>
            </div>
            <button onClick={() => load(true)} disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 text-sm text-[#A1A1AA] hover:text-white border border-white/[0.08] hover:border-white/[0.16] rounded-lg transition-all">
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              Atualizar
            </button>
          </div>

          {/* Busca */}
          <div className="relative max-w-2xl">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#444]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por CVE, grupo APT, produto, fonte..."
              className="w-full bg-[#0D0D0D] border border-white/[0.08] focus:border-red-600/40 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-[#444] outline-none transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#A1A1AA] transition-colors">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        {data && !loading && (
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="flex items-center gap-2 text-xs text-[#666]">
              <AlertCircle size={11} className="text-red-500" />
              {isSearching ? (
                <>
                  <span className="font-mono font-bold text-white">{results.length}</span>
                  <span>resultado{results.length !== 1 ? "s" : ""} para</span>
                  <span className="text-[#A1A1AA] font-medium">&ldquo;{searchQuery}&rdquo;</span>
                </>
              ) : (
                <>
                  <span className="font-mono font-bold text-white">{data.total}</span>
                  <span>artigos nos últimos 3 dias</span>
                </>
              )}
            </div>
            {!isSearching && (
              <>
                <span className="flex items-center gap-1.5 text-xs text-[#666]">
                  <Globe size={10} />
                  <span className="font-mono font-bold text-white">{data.articles.filter((a) => a.sourceRegion === "Global").length}</span>
                  globais
                </span>
                <span className="flex items-center gap-1.5 text-xs text-[#666]">
                  <MapPin size={10} className="text-green-500" />
                  <span className="font-mono font-bold text-white">{data.articles.filter((a) => a.sourceRegion === "Brasil").length}</span>
                  brasileiros
                </span>
              </>
            )}
            {isSearching && results.length === 0 && (
              <button onClick={() => setSearchQuery("")} className="text-xs text-red-500 hover:text-red-400 transition-colors">
                Limpar busca
              </button>
            )}
          </div>
        )}

        {/* Filtros por tipo */}
        {!isSearching && data && (
          <div className="flex flex-wrap gap-2 mb-3">
            {([
              "", "Vulnerabilidade", "Ransomware", "Phishing", "APT",
              "Malware", "Vazamento", "Supply Chain", "Ataque", "Alerta Oficial", "Ameaça",
            ] as (ArticleType | "")[]).map((t) => {
              const count = t ? data.articles.filter((a) => a.type === t).length : data.articles.length;
              if (t && !count) return null;
              const active = articleType === t;
              return (
                <button key={t || "all-t"} onClick={() => setArticleType(t)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg border transition-all ${active ? "bg-red-600/15 border-red-600/30 text-red-400" : "bg-[#0D0D0D] border-white/[0.06] text-[#666] hover:text-[#A1A1AA] hover:border-white/[0.12]"}`}>
                  {t || "Todos os tipos"}
                  <span className="ml-1.5 text-[9px] opacity-50">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Filtros de fonte e região */}
        {!isSearching && (
          <div className="flex flex-wrap gap-2 mb-8">
            {(["", "Global", "Brasil"] as const).map((r) => (
              <button key={r || "all-r"} onClick={() => setRegion(r)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${region === r ? "bg-red-600/15 border-red-600/30 text-red-400" : "bg-[#0D0D0D] border-white/[0.06] text-[#666] hover:text-[#A1A1AA] hover:border-white/[0.12]"}`}>
                {r === "" ? "Todas as regiões" : r}
                {r && data ? <span className="ml-1.5 text-[9px] opacity-60">{data.articles.filter((a) => a.sourceRegion === r).length}</span> : null}
              </button>
            ))}
            <div className="w-px bg-white/[0.06] self-stretch mx-1 hidden sm:block" />
            <button onClick={() => setSource("")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${source === "" ? "bg-red-600/15 border-red-600/30 text-red-400" : "bg-[#0D0D0D] border-white/[0.06] text-[#666] hover:text-[#A1A1AA] hover:border-white/[0.12]"}`}>
              Todas as fontes
            </button>
            {Object.keys(data?.bySource ?? {}).map((s) => {
              const c = getSourceColor(s);
              const count = data?.bySource[s] ?? 0;
              if (!count) return null;
              return (
                <button key={s} onClick={() => setSource(source === s ? "" : s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${source === s ? `${c.badge}` : "bg-[#0D0D0D] border-white/[0.06] text-[#666] hover:text-[#A1A1AA] hover:border-white/[0.12]"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                  {s.replace("Blog", "").replace("Google ", "").trim()}
                  <span className="text-[9px] opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-[#444] text-sm">Carregando notícias...</div>
        ) : results.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <p className="text-[#555] text-sm">
              {isSearching ? `Nenhum resultado para "${searchQuery}".` : "Nenhuma notícia disponível."}
            </p>
            {isSearching && (
              <p className="text-[#444] text-xs">
                Tente termos como &quot;ransomware&quot;, &quot;CVE-2025&quot;, &quot;Microsoft&quot; ou &quot;zero-day&quot;.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Destaques (apenas sem busca ativa) */}
            {featured.length > 0 && (
              <section className="mb-10">
                <div className="flex items-center gap-2 mb-4">
                  <Flame size={13} className="text-orange-500" />
                  <span className="text-xs font-bold text-[#A1A1AA] uppercase tracking-widest">Principais destaques</span>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  {featured.map((article, i) => (
                    <FeaturedCard key={article.slug} article={article} rank={i + 1} />
                  ))}
                </div>
              </section>
            )}

            {/* Resultados de busca ou lista restante */}
            {rest.length > 0 && (
              <section>
                {!isSearching && featured.length > 0 && (
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-px flex-1 bg-white/[0.06]" />
                    <span className="text-[10px] font-bold text-[#444] uppercase tracking-widest">Mais notícias</span>
                    <div className="h-px flex-1 bg-white/[0.06]" />
                  </div>
                )}
                {isSearching && (
                  <div className="flex items-center gap-2 mb-4">
                    <Search size={11} className="text-[#555]" />
                    <span className="text-xs text-[#555]">{results.length} resultado{results.length !== 1 ? "s" : ""}</span>
                  </div>
                )}
                <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-xl overflow-hidden">
                  {rest.map((article) => (
                    <ArticleRow
                      key={article.slug}
                      article={article}
                      highlight={isSearching ? searchQuery.trim() : undefined}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <p className="mt-10 text-center text-[10px] text-[#444] leading-relaxed max-w-lg mx-auto">
          Artigos coletados dos RSS feeds e traduzidos para PT-BR por IA. Clique para ler o artigo completo gerado pela Statecraft.
        </p>
      </div>
    </main>
  );
}
