import { NextRequest, NextResponse } from "next/server";
import type { EnrichedIoc } from "@/lib/types";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  // 20 requests per minute per IP
  const { allowed, retryAfterMs } = checkRateLimit(`ioc-export:${ip}`, 20, 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit excedido. Tente novamente em breve." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      }
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const { searchParams } = req.nextUrl;

    const ALLOWED_TYPES = new Set(["ip", "domain", "hash", "url", "email", "file", "c2"]);
    const q = searchParams.get("q")?.toLowerCase().trim() ?? "";
    const rawType = searchParams.get("type")?.toLowerCase() ?? "";
    const typeFilter = ALLOWED_TYPES.has(rawType) ? rawType : "";

    const where = {
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(q ? { normalized: { contains: q } } : {}),
    };

    const rows = await prisma.ioc.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        briefing: {
          select: { slug: true, title: true, severity: true, sourceName: true, createdAt: true },
        },
      },
    });

    const results: EnrichedIoc[] = rows.map((ioc) => ({
      type: ioc.type as EnrichedIoc["type"],
      value: ioc.value,
      confidence: ioc.confidence as EnrichedIoc["confidence"],
      briefingSlug: ioc.briefing.slug,
      briefingTitle: ioc.briefing.title,
      briefingSeverity: ioc.briefing.severity as EnrichedIoc["briefingSeverity"],
      briefingDate: ioc.briefing.createdAt.toISOString(),
      sourceName: ioc.sourceName ?? ioc.briefing.sourceName,
    }));

    return NextResponse.json({ results, total: results.length });
  } catch (err) {
    console.error("[API /iocs/export]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
