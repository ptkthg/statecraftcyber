import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { verifyAdminToken } from "@/lib/security/admin-token";
import { generateBriefingAsync } from "@/lib/briefing-generator";
import { publicationStatus } from "@/lib/intelligence/validation";
import type { RawThreatItem } from "@/lib/threat-sources/types";

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
      // Generated summaries cannot bootstrap their own evidence.
      if (!b.sourceSnapshot) {
        await prisma.briefing.update({ where: { id: b.id }, data: { status: "draft", analysisStatus: "preliminary" } });
        results.push({ slug: b.slug, title: b.title, enriched: false, error: "Registro legado sem snapshot original; recolha a fonte antes de regenerar." });
        continue;
      }
      const snapshot = b.sourceSnapshot as unknown as RawThreatItem;
      const item = { ...snapshot, publishedAt: snapshot.publishedAt ? new Date(snapshot.publishedAt) : undefined };
      const generated = await generateBriefingAsync(item, new Set());
      await prisma.briefing.update({
        where: { id: b.id },
        data: {
          title: generated.title, summary: generated.summary, content: generated.content,
          structuredContent: generated.structuredContent ? JSON.parse(JSON.stringify(generated.structuredContent)) as Prisma.InputJsonValue : Prisma.DbNull,
          qualityReport: JSON.parse(JSON.stringify(generated.qualityReport)) as Prisma.InputJsonValue,
          sourceSnapshot: JSON.parse(JSON.stringify(generated.sourceSnapshot)) as Prisma.InputJsonValue,
          analysisStatus: generated.analysisStatus, severity: generated.severity, confidence: generated.confidence,
          cvssScore: generated.cvssScore, epssScore: generated.epssScore, mitreTechniques: generated.mitreTechniques,
          operationalPriority: generated.operationalPriority, severityBasis: generated.severityBasis,
          status: publicationStatus(b.status === "published" || process.env.AUTO_PUBLISH === "true", generated.qualityReport),
        },
      });
      results.push({ slug: b.slug, title: generated.title, enriched: generated.analysisStatus !== "preliminary", error: generated.qualityReport.publishable ? undefined : generated.qualityReport.issues.map(i => i.code).join(",") });
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

