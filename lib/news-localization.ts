import type { NewsArticle } from "./news-feeds";
import { completeNewsJson } from "./news-ai-client";

type Preview = Pick<NewsArticle, "slug" | "title" | "summary">;
export type NewsLocalizationDiagnostics = { cached?: number; missing?: number; generated?: number; failed?: boolean };

const SYSTEM = "Traduza notícias de cibersegurança para português brasileiro. Preserve nomes próprios, produtos, CVEs, números e o sentido da fonte. Não invente fatos. Responda somente com JSON válido.";
const BATCH_SIZE = 12;

export function parseNewsTranslations(raw: string, articles: Preview[]): Map<string, Preview> {
  const allowed = new Set(articles.map((article) => article.slug));
  const translated = new Map<string, Preview>();
  try {
    const data = JSON.parse(raw) as { articles?: unknown };
    if (!Array.isArray(data.articles)) return translated;
    for (const entry of data.articles) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      if (
        typeof item.slug !== "string" || !allowed.has(item.slug) ||
        typeof item.title !== "string" || !item.title.trim() ||
        typeof item.summary !== "string" || !item.summary.trim()
      ) continue;
      translated.set(item.slug, {
        slug: item.slug,
        title: item.title.trim().slice(0, 200),
        summary: item.summary.trim().slice(0, 800),
      });
    }
  } catch {
    // An invalid AI response leaves the original article available.
  }
  return translated;
}

async function translateBatch(articles: NewsArticle[]): Promise<Map<string, Preview>> {
  const prompt = `Traduza o título e o resumo de cada notícia para PT-BR. Mantenha os slugs exatamente iguais. Resumos devem ter no máximo 350 caracteres. Não acrescente informação nem traduza nomes de empresas, produtos ou CVEs. Se o texto já estiver em português, apenas preserve-o.\n\nResponda no formato {"articles":[{"slug":"...","title":"...","summary":"..."}]}.\n\n${JSON.stringify(articles.map(({ slug, title, summary }) => ({ slug, title, summary: summary.slice(0, 400) })))}`;
  const raw = await completeNewsJson(SYSTEM, prompt, 3500);
  return raw ? parseNewsTranslations(raw, articles) : new Map();
}

/** Translate RSS previews once, then reuse the existing NewsCache rows on every surface. */
export async function localizeNewsArticles(
  articles: NewsArticle[],
  diagnostics?: NewsLocalizationDiagnostics,
): Promise<NewsArticle[]> {
  if (articles.length === 0) return articles;

  try {
    const { prisma } = await import("./prisma");
    const cached = await prisma.newsCache.findMany({
      where: { slug: { in: articles.map((article) => article.slug) } },
      select: { slug: true, title: true, summary: true },
    });
    if (diagnostics) diagnostics.cached = cached.length;
    const translations = new Map(cached.map((item) => [item.slug, item]));
    const missing = articles.filter((article) =>
      article.sourceRegion !== "Brasil" && !translations.has(article.slug)
    );
    if (diagnostics) diagnostics.missing = missing.length;
    if (diagnostics) diagnostics.generated = 0;

    // Translate only uncached articles; small batches keep the response bounded.
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE);
      const translated = await translateBatch(batch);
      if (diagnostics) diagnostics.generated = (diagnostics.generated ?? 0) + translated.size;
      if (translated.size === 0) continue;
      const rows = batch.flatMap((article) => {
        const preview = translated.get(article.slug);
        if (!preview) return [];
        translations.set(article.slug, preview);
        return [{
          slug: article.slug,
          title: preview.title,
          summary: preview.summary,
          content: "", // Full PT-BR article is generated only when opened.
          source: article.source,
          originalUrl: article.url,
        }];
      });
      if (rows.length > 0) {
        await prisma.newsCache.createMany({ data: rows, skipDuplicates: true });
      }
    }

    return articles.map((article) => {
      const preview = translations.get(article.slug);
      return preview ? { ...article, title: preview.title, summary: preview.summary } : article;
    });
  } catch (error) {
    if (diagnostics) diagnostics.failed = true;
    console.error("[News localization]", error);
    return articles;
  }
}
