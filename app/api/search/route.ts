import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { detectCveId, mergeResults } from "@/lib/search/merge";
import type { SearchResult } from "@/lib/search/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const { allowed, retryAfterMs } = checkRateLimit(`search:${ip}`, 60, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [], total: 0 });
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const cveId = detectCveId(q);

    type BriefingRow = {
      id: string;
      title: string;
      slug: string;
      severity: string;
      rank: number;
    };
    type NewsRow = {
      slug: string;
      title: string;
      source: string;
      rank: number;
    };

    const [briefingRes, iocRes, newsRes, cveRes] = await Promise.allSettled([
      prisma.$queryRaw<BriefingRow[]>`
        SELECT id, title, slug, severity::text,
          ts_rank(search_vector, plainto_tsquery('portuguese', ${q})) AS rank
        FROM "Briefing"
        WHERE status = 'published'
          AND search_vector @@ plainto_tsquery('portuguese', ${q})
        ORDER BY rank DESC
        LIMIT 5
      `,
      prisma.ioc.findMany({
        where: {
          OR: [
            { value: { contains: q, mode: "insensitive" } },
            { normalized: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { briefing: { select: { slug: true, severity: true } } },
      }),
      prisma.$queryRaw<NewsRow[]>`
        SELECT slug, title, source,
          ts_rank(search_vector, plainto_tsquery('portuguese', ${q})) AS rank
        FROM "NewsCache"
        WHERE search_vector @@ plainto_tsquery('portuguese', ${q})
        ORDER BY rank DESC
        LIMIT 5
      `,
      prisma.cveCache.findMany({
        where: {
          OR: [
            { id: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 5,
        orderBy: { published: "desc" },
      }),
    ]);

    const briefings: SearchResult[] =
      briefingRes.status === "fulfilled"
        ? briefingRes.value.map((r) => ({
            type: "briefing",
            id: r.id,
            title: r.title,
            href: `/threat-briefings/${r.slug}`,
            meta: r.severity.toUpperCase(),
            rank: Number(r.rank),
          }))
        : [];

    const iocs: SearchResult[] =
      iocRes.status === "fulfilled"
        ? iocRes.value.map((r) => ({
            type: "ioc",
            id: r.id,
            title: r.value,
            href: `/iocs?q=${encodeURIComponent(r.value)}`,
            meta: `${r.type.toUpperCase()} · ${r.briefing.severity.toUpperCase()}`,
            rank: 0.5,
            isMono: true,
          }))
        : [];

    const noticias: SearchResult[] =
      newsRes.status === "fulfilled"
        ? newsRes.value.map((r) => ({
            type: "noticia",
            id: r.slug,
            title: r.title,
            href: `/noticias/${r.slug}`,
            meta: r.source,
            rank: Number(r.rank),
          }))
        : [];

    const cves: SearchResult[] =
      cveRes.status === "fulfilled"
        ? cveRes.value.map((r) => ({
            type: "cve",
            id: r.id,
            title: r.id,
            href: `/cves?q=${encodeURIComponent(r.id)}`,
            meta: r.severity ? r.severity.toUpperCase() : "N/A",
            rank: r.id.toLowerCase() === q.toLowerCase() ? 1 : 0.3,
            isMono: true,
          }))
        : [];

    let correlatedIocs: SearchResult[] = [];
    if (cveId) {
      try {
        const corr = await prisma.ioc.findMany({
          where: { briefing: { cves: { has: cveId.toUpperCase() } } },
          take: 5,
          include: { briefing: { select: { slug: true, severity: true } } },
        });
        correlatedIocs = corr.map((r) => ({
          type: "ioc",
          id: r.id,
          title: r.value,
          href: `/iocs?q=${encodeURIComponent(r.value)}`,
          meta: `via ${cveId.toUpperCase()} · ${r.briefing.severity.toUpperCase()}`,
          rank: 0.7,
          isMono: true,
        }));
      } catch {
        // best-effort: proceed without correlated IOCs
      }
    }

    const results = mergeResults([briefings, iocs, noticias, cves], correlatedIocs);
    return NextResponse.json({ results, total: results.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("P1001")) {
      return NextResponse.json({ error: "Banco de dados indisponível" }, { status: 503 });
    }
    console.error("[search] Unexpected error:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
