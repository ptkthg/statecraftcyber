import { PUBLIC_BRIEFING_WHERE, PUBLIC_IOC_WHERE } from "@/lib/intelligence/publication";
import { NextResponse } from "next/server";
import { updateHealth } from '@/lib/pipeline/health';
import { snapshotHealth } from '@/lib/publication/health';
import { getPublishedSnapshot, snapshotMode } from '@/lib/publication/snapshot';

export const dynamic = "force-dynamic";
const headers = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    const snapshot = await getPublishedSnapshot();
    if (snapshot) {
      const health = snapshotHealth(snapshot);
      return NextResponse.json(health, { status: health.status === 'degraded' ? 503 : 200, headers });
    }
    const { prisma } = await import('@/lib/prisma');
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
    }, { status: degraded ? 503 : 200, headers });
  } catch {
    return NextResponse.json(
      snapshotMode()
        ? { status: 'degraded', source: 'local-snapshot', database: 'not_required', error: 'Publication snapshot unavailable' }
        : { status: 'degraded', database: 'error', error: 'Database unavailable' },
      { status: 503, headers }
    );
  }
}
