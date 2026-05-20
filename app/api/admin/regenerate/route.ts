import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { verifyAdminToken } from "@/lib/security/admin-token";
import { generateAiBriefing, buildMarkdownFallback } from "@/lib/ai-briefing";
import type { RawThreatItem, RawIOC } from "@/lib/threat-sources/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const INCLUDE = { iocsRel: true } as const;
type BriefingWithIocs = Prisma.BriefingGetPayload<{ include: typeof INCLUDE }>;

function isAuthorized(req: NextRequest): boolean {
  // Accept admin cookie
  const cookie = req.cookies.get("admin_token")?.value;
  const secret = process.env.ADMIN_SECRET;
  if (cookie && secret && verifyAdminToken(cookie, secret)) return true;

  // Accept CRON_SECRET as Bearer token (easy curl testing)
  const cronSecret = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization")?.slice(7);
  if (cronSecret && bearer === cronSecret) return true;

  return false;
}

/**
 * POST /api/admin/regenerate
 *
 * Body (JSON):
 *   { "slug": "some-slug" }          — regenerate one briefing
 *   { "last": 5 }                    — regenerate the last N CVE briefings
 *   { "all": true }                  — regenerate ALL CVE briefings (use carefully)
 *
 * Returns the updated briefings' titles and slugs.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY não configurada" }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    slug?: string;
    last?: number;
    all?: boolean;
  };

  // Determine which briefings to regenerate
  let briefings: BriefingWithIocs[];

  if (body.slug) {
    briefings = await prisma.briefing.findMany({
      where: { slug: body.slug },
      include: INCLUDE,
    });
    if (briefings.length === 0) {
      return NextResponse.json({ error: `Briefing '${body.slug}' não encontrado` }, { status: 404 });
    }
  } else if (body.last) {
    const limit = Math.min(Math.max(1, body.last), 20);
    briefings = await prisma.briefing.findMany({
      where: { cves: { isEmpty: false } },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: INCLUDE,
    });
  } else if (body.all) {
    briefings = await prisma.briefing.findMany({
      where: { cves: { isEmpty: false } },
      orderBy: { createdAt: "desc" },
      include: INCLUDE,
    });
  } else {
    return NextResponse.json(
      { error: 'Informe "slug", "last": N ou "all": true' },
      { status: 400 }
    );
  }

  const results: { slug: string; title: string; enriched: boolean; error?: string }[] = [];

  for (const b of briefings) {
    try {
      // Reconstruct a minimal RawThreatItem from stored fields.
      // The original description is not stored; NVD enrichment will supply technical details.
      const item: RawThreatItem = {
        externalId: b.id,
        title: b.title,
        description: b.summary,
        sourceName: b.sourceName,
        sourceUrl: b.sourceUrl,
        publishedAt: b.sourcePublishedAt ?? b.createdAt,
        cves: b.cves,
        cvssScore: b.cvssScore ?? undefined,
        epssScore: b.epssScore ?? undefined,
        severity: b.severity as RawThreatItem["severity"],
        mitreTechniques: b.mitreTechniques,
        affectedSectors: b.affectedSectors,
        affectedRegions: b.affectedRegions,
        affectedProducts: [],
        iocs: b.iocsRel.map((ioc) => ({
          type: ioc.type as RawIOC["type"],
          value: ioc.value,
          confidence: ioc.confidence as RawIOC["confidence"],
          source: ioc.sourceName ?? b.sourceName,
        })),
        inCisaKev: false, // re-checked by enrichCveContext during RAG
        tags: b.tags,
      };

      const { title, summary, structuredContent } = await generateAiBriefing(
        item,
        b.severity,
        b.summary,
        b.content
      );

      const content = structuredContent
        ? buildMarkdownFallback(structuredContent)
        : b.content;

      await prisma.briefing.update({
        where: { id: b.id },
        data: {
          title,
          summary,
          content,
          ...(structuredContent
            ? { structuredContent: structuredContent as unknown as Prisma.InputJsonValue }
            : {}),
        },
      });

      results.push({ slug: b.slug, title, enriched: !!structuredContent });
    } catch (err) {
      results.push({
        slug: b.slug,
        title: b.title,
        enriched: false,
        error: (err as Error).message,
      });
    }
  }

  return NextResponse.json({ ok: true, regenerated: results.length, results });
}

