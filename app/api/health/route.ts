import { PUBLIC_BRIEFING_WHERE, PUBLIC_IOC_WHERE } from "@/lib/intelligence/publication";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateHealth } from '@/lib/pipeline/health';

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [briefingCount, iocCount, cveCount, lastCron, updates] = await Promise.all([
      prisma.briefing.count({ where: { ...PUBLIC_BRIEFING_WHERE } }),
      prisma.ioc.count({ where: PUBLIC_IOC_WHERE }),
      prisma.cveCache.count(),
      prisma.cronLog.findFirst({ orderBy: { runAt: "desc" } }),
      prisma.updateHealth.findMany(),
    ]);
    const pipelines = Object.fromEntries(['briefings', 'news'].map(key => [key, updateHealth(updates.find(row => row.key === key) ?? null)]));
    const degraded = Object.values(pipelines).some(p => p.status === 'degraded');
    return NextResponse.json({
      status: degraded ? 'degraded' : 'ok',
      pipelines,
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
    }, { status: degraded ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "error", error: "Database unavailable" },
      { status: 503 }
    );
  }
}
