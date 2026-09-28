import { NextRequest, NextResponse } from "next/server";
import { fetchNewsArticles } from "@/lib/news-feeds";
import { localizeNewsArticles, type NewsLocalizationDiagnostics } from "@/lib/news-localization";
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
    const diagnostics: NewsLocalizationDiagnostics = {};
    const merged = await localizeNewsArticles(articles, diagnostics);

    const bySource: Record<string, number> = {};
    for (const a of merged) {
      bySource[a.source] = (bySource[a.source] ?? 0) + 1;
    }

    const headers = new Headers({ "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" });
    if (req.nextUrl.searchParams.has("diag")) {
      headers.set("X-News-AI-Configured", [
        process.env.GROQ_API_KEY ? "groq" : "",
        process.env.OPENROUTER_API_KEY ? "openrouter" : "",
      ].filter(Boolean).join(",") || "none");
      headers.set("X-News-Translated", String(merged.filter((article, index) => article.title !== articles[index].title).length));
      headers.set("X-News-Cache-Count", String(diagnostics.cached ?? -1));
      headers.set("X-News-Missing-Count", String(diagnostics.missing ?? -1));
      headers.set("X-News-Generated-Count", String(diagnostics.generated ?? -1));
      headers.set("X-News-Failed", String(!!diagnostics.failed));
    }

    return NextResponse.json(
      { articles: merged, total: merged.length, bySource },
      { headers }
    );
  } catch (err) {
    console.error("[API /noticias]", err);
    return NextResponse.json({ articles: [], total: 0, bySource: {} });
  }
}
