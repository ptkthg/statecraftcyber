import { NextRequest, NextResponse } from "next/server";
import { fetchNewsArticles } from "@/lib/news-feeds";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const { allowed, retryAfterMs } = checkRateLimit(`noticias:${ip}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  try {
    const articles = await fetchNewsArticles(3);

    // Merge PT-BR titles from DB cache (batch query)
    let merged = articles;
    try {
      const { prisma } = await import("@/lib/prisma");
      const slugs = articles.map((a) => a.slug);
      const cached: { slug: string; title: string; summary: string }[] = await prisma.newsCache.findMany({
        where: { slug: { in: slugs } },
        select: { slug: true, title: true, summary: true },
      });
      const cacheMap = new Map(cached.map((c) => [c.slug, c]));
      merged = articles.map((a) => {
        const c = cacheMap.get(a.slug);
        return c ? { ...a, title: c.title, summary: c.summary } : a;
      });
    } catch {
      // DB offline — serve original
    }

    const bySource: Record<string, number> = {};
    for (const a of merged) {
      bySource[a.source] = (bySource[a.source] ?? 0) + 1;
    }

    return NextResponse.json(
      { articles: merged, total: merged.length, bySource },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } }
    );
  } catch (err) {
    console.error("[API /noticias]", err);
    return NextResponse.json({ articles: [], total: 0, bySource: {} });
  }
}
