import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [briefingCount, iocRaw, lastCron] = await Promise.all([
      prisma.briefing.count({ where: { status: "published" } }),
      prisma.briefing.findMany({ select: { iocs: true } }),
      prisma.cronLog.findFirst({ orderBy: { runAt: "desc" } }),
    ]);

    const iocCount = iocRaw.reduce((acc, b) => {
      return acc + (Array.isArray(b.iocs) ? (b.iocs as unknown[]).length : 0);
    }, 0);

    return NextResponse.json({
      status: "ok",
      database: "ok",
      publishedBriefings: briefingCount,
      iocs: iocCount,
      lastCronRun: lastCron?.runAt ?? null,
      lastCronSuccess: lastCron?.success ?? null,
      briefingsLastHour: lastCron?.briefingsCreated ?? null,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "error", error: "Database unavailable" },
      { status: 503 }
    );
  }
}
