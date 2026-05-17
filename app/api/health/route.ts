import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [briefingCount, iocCount, cveCount, lastCron] = await Promise.all([
      prisma.briefing.count({ where: { status: "published" } }),
      prisma.ioc.count(),
      prisma.cveCache.count(),
      prisma.cronLog.findFirst({ orderBy: { runAt: "desc" } }),
    ]);

    return NextResponse.json({
      status: "ok",
      database: "ok",
      briefings: {
        published: briefingCount,
      },
      iocs: {
        total: iocCount,
      },
      cves: {
        cached: cveCount,
      },
      cron: {
        lastRun: lastCron?.runAt ?? null,
        lastSuccess: lastCron?.success ?? null,
        briefingsLastRun: lastCron?.briefingsCreated ?? null,
        durationMs: lastCron?.durationMs ?? null,
      },
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "error", error: "Database unavailable" },
      { status: 503 }
    );
  }
}
