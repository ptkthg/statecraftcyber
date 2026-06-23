import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { renderSafeMarkdown } from "@/lib/security/sanitize-markdown";
import {
  ArrowLeft, ExternalLink, Globe, MapPin, Clock,
  Tag, AlertCircle, Loader2, Sparkles, BookOpen, Shield, ChevronRight,
} from "lucide-react";
import { fetchNewsArticles, sanitizeContent, classifyType, type NewsArticle, type ArticleType } from "@/lib/news-feeds";
import { getEnrichedArticle } from "@/lib/ai-news";
import { getSourceColor } from "@/lib/source-colors";

const getCachedArticles = unstable_cache(
  () => fetchNewsArticles(3),
  ["news-articles"],
  { revalidate: 900 }
);



const TYPE_STYLES: Record<ArticleType, { label: string; cls: string }> = {
  "Vulnerabilidade": { label: "Vulnerabilidade", cls: "text-orange-400 bg-orange-600/10 border-orange-600/25" },
  "Ransomware":      { label: "Ransomware",      cls: "text-brand-soft bg-brand/10 border-brand/25" },
  "Phishing":        { label: "Phishing",         cls: "text-yellow-400 bg-yellow-600/10 border-yellow-600/25" },
  "APT":             { label: "APT",              cls: "text-purple-400 bg-purple-600/10 border-purple-600/25" },
  "Malware":         { label: "Malware",          cls: "text-rose-400 bg-rose-600/10 border-rose-600/25" },
  "Vazamento":       { label: "Vazamento",        cls: "text-blue-400 bg-blue-600/10 border-blue-600/25" },
  "Supply Chain":    { label: "Supply Chain",     cls: "text-amber-400 bg-amber-600/10 border-amber-600/25" },
  "Ataque":          { label: "Ataque",           cls: "text-brand-soft bg-brand/10 border-brand/25" },
  "Alerta Oficial":  { label: "Alerta Oficial",   cls: "text-green-400 bg-green-600/10 border-green-600/25" },
  "Ameaça":          { label: "Ameaça",           cls: "text-slate-400 bg-slate-600/10 border-slate-600/25" },
};

function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDateAbnt(iso: string): string {
  const d = new Date(iso);
  const months = ["jan.", "fev.", "mar.", "abr.", "maio", "jun.",
                   "jul.", "ago.", "set.", "out.", "nov.", "dez."];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function abntSourceName(source: string): string {
  return source.toUpperCase();
}

// ── Skeleton enquanto a IA processa ──────────────────────────────────────────

function ArticleBodySkeleton({ article }: { article: NewsArticle }) {
  return (
    <div>
      {/* Status de geração */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 bg-raised border border-white/[0.06] rounded-xl mb-8">
        <Loader2 size={14} className="text-brand animate-spin flex-shrink-0" />
        <div>
          <p className="text-xs text-dim">Gerando notícia em português...</p>
          <p className="text-xs text-dim mt-0.5">A IA está redigindo o artigo completo. Aguarde alguns segundos.</p>
        </div>
      </div>

      {/* Título placeholder */}
      <div className="space-y-3 mb-8">
        <div className="h-11 bg-white/[0.04] rounded-lg animate-pulse w-full" />
        <div className="h-11 bg-white/[0.04] rounded-lg animate-pulse w-4/5" />
        <div className="h-7 bg-white/[0.03] rounded-lg animate-pulse w-3/5 mt-2" />
      </div>

      {/* Lead placeholder */}
      <div className="space-y-2.5 mb-10 pl-5 border-l-2 border-brand/20">
        <div className="h-4 bg-white/[0.04] rounded animate-pulse w-full" />
        <div className="h-4 bg-white/[0.04] rounded animate-pulse w-11/12" />
        <div className="h-4 bg-white/[0.04] rounded animate-pulse w-4/5" />
        <div className="h-4 bg-white/[0.04] rounded animate-pulse w-3/4" />
      </div>

      {/* Corpo placeholder */}
      <div className="space-y-2 mb-6">
        {[1, 0.95, 0.88, 1, 0.92, 0.78, 1, 0.85, 0.65].map((w, i) => (
          <div key={i} className="h-4 bg-white/[0.025] rounded animate-pulse" style={{ width: `${w * 100}%` }} />
        ))}
      </div>

      {/* Resumo original como fallback */}
      <div className="p-5 bg-raised border border-white/[0.04] rounded-xl mt-8">
        <p className="text-xs text-dim uppercase tracking-widest mb-3 font-semibold">Resumo original (fonte)</p>
        <p className="text-sm text-dim leading-relaxed italic">{article.summary}</p>
      </div>
    </div>
  );
}

// ── Corpo enriquecido ─────────────────────────────────────────────────────────

async function EnrichedArticleBody({ article }: { article: NewsArticle }) {
  const enriched = await getEnrichedArticle(article);

  let html = "";
  if (enriched.content && enriched.content.length > 100) {
    if (enriched.content.trimStart().startsWith("<")) {
      html = sanitizeContent(enriched.content);
    } else {
      html = renderSafeMarkdown(enriched.content);
    }
  } else if (article.content) {
    html = sanitizeContent(article.content);
  }

  // CVEs no corpo viram links para o NVD
  html = html.replace(
    /\b(CVE-\d{4}-\d{4,7})\b/gi,
    '<a href="https://nvd.nist.gov/vuln/detail/$1" target="_blank" rel="noopener noreferrer" ' +
    'class="font-mono font-bold text-brand-soft hover:text-brand-soft no-underline hover:underline transition-colors">$1</a>'
  );

  const isAi = enriched.content.length > 100 && enriched.content !== (article.content ?? "");
  const displayTitle = isAi ? enriched.title : article.title;
  const displaySummary = isAi ? enriched.summary : article.summary;

  // Referência ABNT automática
  const accessDate = formatDateAbnt(new Date().toISOString());
  const pubDate = formatDateAbnt(article.publishedAt);

  return (
    <div>
      {/* Título principal */}
      <h1
        className="text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight mb-4"
      >
        {displayTitle}
      </h1>

      {/* Subtítulo — categoria/fonte */}
      <p
        className="text-lg md:text-xl text-dim font-normal italic leading-snug mb-6"
      >
        {isAi ? "Análise elaborada pela Statecraft com base em fontes abertas" : `Fonte: ${article.source}`}
      </p>

      {/* Linha de creditos */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-8 pb-6 border-b border-white/[0.07]">
        <span className="text-xs text-dim">
          Por <strong className="text-dim">IA Statecraft</strong>
        </span>
        <span className="text-dim">|</span>
        <span className="flex items-center gap-1 text-xs text-dim">
          <Clock size={10} />{formatDateFull(article.publishedAt)}
        </span>
        <span className="text-dim">|</span>
        <span className="flex items-center gap-1 text-xs text-dim">
          <Clock size={10} />
          {Math.max(3, Math.ceil((enriched.content || article.summary).split(/\s+/).length / 200))} min de leitura
        </span>
        {isAi && (
          <>
            <span className="text-dim">|</span>
            <span className="flex items-center gap-1 text-xs text-dim">
              <Sparkles size={9} className="text-brand" />
              {enriched.fromCache ? "Cache" : "Gerado por IA"}
            </span>
          </>
        )}
      </div>

      {/* Lide (parágrafo de abertura destacado) */}
      <p
        style={{ fontFamily: "var(--font-lora), Georgia, serif" }}
        className="text-lg text-body leading-relaxed mb-8 pl-5 border-l-[3px] border-brand/50 italic"
      >
        {displaySummary}
      </p>

      {/* Divisor decorativo */}
      <div className="flex items-center gap-3 mb-10">
        <div className="h-px flex-1 bg-white/[0.06]" />
        <div className="w-1.5 h-1.5 rounded-full bg-brand" />
        <div className="w-1 h-1 rounded-full bg-brand/50" />
        <div className="w-1 h-1 rounded-full bg-brand/25" />
        <div className="h-px flex-1 bg-white/[0.06]" />
      </div>

      {/* Corpo da notícia */}
      {html ? (
        <div className="article-content mb-12" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="article-content mb-12">
          <p>{displaySummary}</p>
        </div>
      )}

      {/* Divisor antes das referências */}
      <div className="border-t border-white/[0.07] pt-8 mb-8">
        <div className="flex items-center gap-2 mb-5">
          <BookOpen size={13} className="text-[#555]" />
          <h2
            className="text-sm font-bold text-dim uppercase tracking-widest"
          >
            Referências
          </h2>
        </div>

        {/* Referência ABNT */}
        <div className="bg-raised border border-white/[0.05] rounded-xl p-5">
          <p className="text-xs leading-relaxed text-dim font-mono">
            <span className="text-dim">[1]</span>{" "}
            {abntSourceName(article.source)}. <em className="not-italic text-dim">{enriched.title || article.title}</em>.{" "}
            {article.source}, {pubDate}.{" "}
            Disponível em:{" "}
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-dim hover:text-white underline break-all"
            >
              &lt;{article.url}&gt;
            </a>
            . Acesso em: {accessDate}.
          </p>
        </div>
      </div>

      {/* CTA — fonte original */}
      <div className="p-5 bg-raised border border-white/[0.08] rounded-xl flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-white mb-0.5">Ler na fonte original</p>
          <p className="text-xs text-dim">{article.source}</p>
        </div>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand text-white text-xs font-semibold rounded-lg transition-all flex-shrink-0"
        >
          Acessar <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}

// ── Briefings relacionados (cross-link) ───────────────────────────────────────

const SEVERITY_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  critical: { label: "Crítico", dot: "bg-brand",    text: "text-brand-soft" },
  high:     { label: "Alto",    dot: "bg-orange-400", text: "text-orange-400" },
  medium:   { label: "Médio",   dot: "bg-yellow-400", text: "text-yellow-400" },
  low:      { label: "Baixo",   dot: "bg-blue-400",   text: "text-blue-400" },
};

async function RelatedBriefings({ cves, tags }: { cves: string[]; tags: string[] }) {
  if (cves.length === 0 && tags.length === 0) return null;

  try {
    const { prisma } = await import("@/lib/prisma");

    // Build OR conditions: match by CVE first, then by tags
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orConditions: any[] = [];
    if (cves.length > 0) orConditions.push({ cves: { hasSome: cves } });
    if (tags.length > 0) orConditions.push({ tags: { hasSome: tags } });

    const briefings = await prisma.briefing.findMany({
      where: { status: "published", OR: orConditions },
      select: { slug: true, title: true, severity: true, category: true, cves: true, tags: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    });

    if (briefings.length === 0) return null;

    return (
      <section className="mt-10 mb-2">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={13} className="text-brand" />
          <h2
            className="text-sm font-bold tracking-tight text-white"
          >
            Threat Briefings Relacionados
          </h2>
          <span className="text-xs text-dim ml-1">da plataforma Statecraft</span>
        </div>
        <div className="space-y-2">
          {briefings.map((b) => {
            const sev = SEVERITY_CONFIG[b.severity] ?? SEVERITY_CONFIG.low;
            // CVEs que coincidem com o artigo
            const matchedCves = b.cves.filter((c: string) => cves.includes(c));
            return (
              <Link
                key={b.slug}
                href={`/threat-briefings/${b.slug}`}
                className="group flex items-center gap-4 p-4 bg-raised border border-white/[0.06] hover:bg-overlay rounded-xl transition-all"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sev.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white line-clamp-1 mb-1">
                    {b.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-medium ${sev.text}`}>{sev.label}</span>
                    <span className="text-[#333]">·</span>
                    <span className="text-xs text-dim">{b.category}</span>
                    {matchedCves.length > 0 && (
                      <>
                        <span className="text-[#333]">·</span>
                        {matchedCves.slice(0, 2).map((cve: string) => (
                          <span key={cve} className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-brand-soft bg-brand/10 border border-brand/20">
                            {cve}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight size={14} className="flex-shrink-0 text-dim group-hover:text-white transition-colors" />
              </Link>
            );
          })}
        </div>
        <Link
          href="/threat-briefings"
          className="inline-flex items-center gap-1 mt-3 text-xs text-dim hover:text-white transition-colors"
        >
          Ver todos os briefings <ChevronRight size={11} />
        </Link>
      </section>
    );
  } catch {
    return null;
  }
}

// ── Card de relacionados ──────────────────────────────────────────────────────

function RelatedCard({ article }: { article: NewsArticle }) {
  const c = getSourceColor(article.source);
  return (
    <Link
      href={`/noticias/${article.slug}`}
      className="group block bg-raised border border-white/[0.06] rounded-xl overflow-hidden hover:bg-overlay transition-all"
    >
      {article.imageUrl && (
        <div className="relative w-full h-28 overflow-hidden">
          <Image src={article.imageUrl} alt="" fill sizes="(max-width: 640px) 100vw, 320px" className="object-cover" />
        </div>
      )}
      <div className="p-4">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-semibold mb-2 ${c.badge}`}>
          <span className={`w-1 h-1 rounded-full ${c.dot}`} />
          {article.source.split(" ")[0]}
        </span>
        <p
          className="text-xs font-semibold text-white leading-snug group-hover:text-white transition-colors line-clamp-3"
        >
          {article.title}
        </p>
      </div>
    </Link>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const articles = await getCachedArticles();
  let article: NewsArticle | undefined = articles.find((a) => a.slug === slug);

  // Cache de 15min pode estar desatualizado — tenta fetch fresco
  if (!article) {
    try {
      const fresh = await fetchNewsArticles(3);
      article = fresh.find((a) => a.slug === slug);
    } catch {}
  }

  // Artigo saiu do RSS (> 3 dias) mas ainda está no cache do banco
  if (!article) {
    try {
      const { prisma } = await import("@/lib/prisma");
      const cached = await prisma.newsCache.findUnique({ where: { slug } });
      if (cached) {
        article = {
          id: cached.slug,
          slug: cached.slug,
          title: cached.title,
          summary: cached.summary,
          url: cached.originalUrl,
          source: cached.source,
          sourceRegion: "Global" as const,
          publishedAt: cached.enrichedAt.toISOString(),
          tags: [],
          cves: [],
          importance: 0,
          type: "Ameaça" as const,
        };
      }
    } catch {}
  }

  if (!article) notFound();

  const colors = getSourceColor(article.source);

  const related = articles
    .filter((a) => a.slug !== slug && (a.source === article.source || a.tags.some((t) => article.tags.includes(t))))
    .slice(0, 3);

  return (
    <main className="min-h-screen bg-canvas pt-16">
      {/* Breadcrumb */}
      <div className="border-b border-white/[0.04]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2 text-xs text-dim">
          <Link href="/" className="hover:text-body transition-colors">Home</Link>
          <span>/</span>
          <Link href="/noticias" className="hover:text-body transition-colors">Notícias</Link>
          <span>/</span>
          <span className="text-dim truncate max-w-[260px]">{article.title}</span>
        </div>
      </div>

      {/* Layout principal — coluna estreita para boa legibilidade */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Voltar */}
        <Link
          href="/noticias"
          className="inline-flex items-center gap-1.5 text-xs text-dim hover:text-white transition-colors mb-8"
        >
          <ArrowLeft size={12} />
          Voltar para Notícias
        </Link>

        {/* Cabeçalho: fonte + região */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-semibold ${colors.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
            {article.source}
          </span>
          <span className="flex items-center gap-1 text-xs text-dim">
            {article.sourceRegion === "Brasil"
              ? <MapPin size={10} className="text-green-500" />
              : <Globe size={10} />
            }
            {article.sourceRegion}
          </span>
          {(() => {
            const t = TYPE_STYLES[article.type] ?? TYPE_STYLES["Ameaça"];
            return (
              <span className={`px-2 py-0.5 rounded border text-xs font-semibold ${t.cls}`}>
                {t.label}
              </span>
            );
          })()}
        </div>

        {/* Tags + CVEs */}
        {(article.cves.length > 0 || article.tags.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <Tag size={11} className="text-[#555]" />
            {article.cves.map((cve) => (
              <a
                key={cve}
                href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-0.5 rounded text-xs font-mono font-bold text-brand-soft bg-brand/10 border border-brand/20 hover:bg-brand/20 hover:border-brand/40 transition-colors"
              >
                {cve}
              </a>
            ))}
            {article.tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded text-xs text-dim bg-white/[0.04] border border-white/[0.06]">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Alerta alta relevância */}
        {article.importance >= 5 && (
          <div className="flex items-center gap-3 p-4 bg-brand/[0.06] border border-brand/20 rounded-xl mb-6">
            <AlertCircle size={15} className="text-brand flex-shrink-0" />
            <p className="text-xs text-brand-soft leading-relaxed">
              Classificada como <strong>alta relevância</strong> pelo sistema de threat intelligence.
            </p>
          </div>
        )}

        {/* Imagem hero */}
        {article.imageUrl && (
          <div className="rounded-xl overflow-hidden mb-8 border border-white/[0.06]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.imageUrl}
              alt={article.title}
              className="w-full object-cover"
              style={{ maxHeight: "400px" }}
            />
            <div className="px-4 py-2 bg-raised border-t border-white/[0.04]">
              <p className="text-xs text-dim">Imagem: {article.source}</p>
            </div>
          </div>
        )}

        {/* Corpo via Suspense (IA) */}
        <Suspense fallback={<ArticleBodySkeleton article={article} />}>
          <EnrichedArticleBody article={article} />
        </Suspense>

        {/* Briefings relacionados (cross-link) */}
        <Suspense fallback={null}>
          <RelatedBriefings cves={article.cves} tags={article.tags} />
        </Suspense>

        {/* Artigos relacionados */}
        {related.length > 0 && (
          <section className="mt-14">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 bg-white/[0.06]" />
              <h2
                className="text-xs font-bold text-dim uppercase tracking-widest"
              >
                Leia também
              </h2>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {related.map((rel) => <RelatedCard key={rel.slug} article={rel} />)}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const articles = await getCachedArticles();
  const article = articles.find((a) => a.slug === slug);
  if (!article) return { title: "Notícia não encontrada" };
  return {
    title: article.title,
    description: article.summary.slice(0, 160),
    openGraph: article.imageUrl ? { images: [{ url: article.imageUrl }] } : undefined,
  };
}
