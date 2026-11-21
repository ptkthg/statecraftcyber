import { PUBLIC_BRIEFING_WHERE, PUBLIC_IOC_WHERE } from "@/lib/intelligence/publication";
import { getPublishedSnapshot, type PublishedSnapshot } from "@/lib/publication/snapshot";
// Funções puras dos dados derivados da home (spec 2026-06-12 §7). Queries ficam em getHomeStats.

export { classifyNewsTitle } from './news-classification';

export interface RegionRow {
  region: string;
  critical: number;
  medium: number;
  low: number;
  total: number;
}

export function aggregateRegions(
  briefings: { affectedRegions: string[]; severity: string }[]
): RegionRow[] {
  const map = new Map<string, RegionRow>();
  for (const b of briefings) {
    for (const region of b.affectedRegions) {
      const row = map.get(region) ?? { region, critical: 0, medium: 0, low: 0, total: 0 };
      if (b.severity === "critical") row.critical++;
      else if (b.severity === "high" || b.severity === "medium") row.medium++;
      else row.low++;
      row.total++;
      map.set(region, row);
    }
  }
  return [...map.values()].sort((a, b) => b.critical - a.critical || b.total - a.total);
}

const TAG_BUCKETS: { pattern: RegExp; label: (n: number) => string }[] = [
  { pattern: /explora[çc][ãa]o-?ativa|actively-?exploited/i, label: (n) => `${n} explorado${n > 1 ? "s" : ""} ativamente` },
  { pattern: /ransomware/i, label: (n) => `${n} com ransomware` },
  { pattern: /cisa-?kev|kev/i, label: (n) => `${n} no KEV/CISA` },
];

export function summarizeCriticalTags(briefings: { tags: string[] }[]): string | null {
  const parts: string[] = [];
  for (const bucket of TAG_BUCKETS) {
    const n = briefings.filter((b) => b.tags.some((t) => bucket.pattern.test(t))).length;
    if (n > 0) parts.push(bucket.label(n));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export interface HomeStats {
  criticalCount: number;
  criticalDelta24h: number;
  criticalSummary: string | null;
  criticalLatest: { slug: string; title: string; tags: string[]; createdAt: Date; sourceName: string }[];
  briefingsTotal: number;
  briefingsWeek: number;
  cvesToday: number;
  cvesKevToday: number;
  cvesPerDay: { day: string; count: number }[]; // 7 entradas, day = "seg".."dom"
  iocsTotal: number;
  regions: RegionRow[];
  latestBriefingSlug: string | null;
  lastRunAt: Date | null;
}

const DAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DAY_MS = 24 * 3600_000;

function cveDayCounts(dates: string[], now: number) {
  const perDay = new Map<string, number>();
  for (const date of dates) {
    const key = date.slice(0, 10);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now - (6 - i) * DAY_MS);
    return { day: DAY_LABELS[date.getDay()], count: perDay.get(date.toISOString().slice(0, 10)) ?? 0 };
  });
}

function snapshotStats(snapshot: PublishedSnapshot, now: number): HomeStats {
  const briefings = snapshot.briefings.briefings;
  const recent = briefings.filter((briefing) => Date.parse(briefing.createdAt) >= now - 7 * DAY_MS);
  const criticals = recent.filter((briefing) => briefing.severity === "critical");
  const cvesToday = snapshot.cves.filter((cve) => Date.parse(cve.published) >= now - DAY_MS);
  const lastSuccess = snapshot.lastRun?.success ? snapshot.lastRun.runAt :
    snapshot.updates.find((update) => update.key === "briefings")?.lastSuccessAt;

  return {
    criticalCount: criticals.length,
    criticalDelta24h: criticals.filter((briefing) => Date.parse(briefing.createdAt) >= now - DAY_MS).length,
    criticalSummary: summarizeCriticalTags(criticals),
    criticalLatest: criticals.slice(0, 3).map(({ slug, title, tags, createdAt, sourceName }) =>
      ({ slug, title, tags, createdAt: new Date(createdAt), sourceName })),
    briefingsTotal: briefings.length,
    briefingsWeek: recent.length,
    cvesToday: cvesToday.length,
    cvesKevToday: cvesToday.filter((cve) => cve.inCisaKev).length,
    cvesPerDay: cveDayCounts(snapshot.cves.map((cve) => cve.published), now),
    iocsTotal: snapshot.iocs.length,
    regions: aggregateRegions(recent).slice(0, 4),
    latestBriefingSlug: briefings[0]?.slug ?? null,
    lastRunAt: lastSuccess ? new Date(lastSuccess) : null,
  };
}

export async function getHomeStats(): Promise<HomeStats> {
  const empty: HomeStats = {
    criticalCount: 0, criticalDelta24h: 0, criticalSummary: null, criticalLatest: [],
    briefingsTotal: 0, briefingsWeek: 0, cvesToday: 0, cvesKevToday: 0,
    cvesPerDay: [], iocsTotal: 0, regions: [], latestBriefingSlug: null, lastRunAt: null,
  };
  try {
    const now = Date.now();
    const snapshot = await getPublishedSnapshot();
    if (snapshot) return snapshotStats(snapshot, now);
    const { prisma } = await import("@/lib/prisma");
    const d1 = new Date(now - DAY_MS);
    const d7 = new Date(now - 7 * DAY_MS);

    const [criticals, briefingsTotal, briefingsWeek, cvesToday, cvesKevToday, recentCves, iocsTotal, regionRows, latest, lastRun] =
      await Promise.all([
        prisma.briefing.findMany({
          where: { ...PUBLIC_BRIEFING_WHERE, severity: "critical", createdAt: { gte: d7 } },
          orderBy: { createdAt: "desc" },
          select: { slug: true, title: true, tags: true, createdAt: true, sourceName: true },
        }),
        prisma.briefing.count({ where: { ...PUBLIC_BRIEFING_WHERE } }),
        prisma.briefing.count({ where: { ...PUBLIC_BRIEFING_WHERE, createdAt: { gte: d7 } } }),
        prisma.cveCache.count({ where: { published: { gte: d1 } } }),
        prisma.cveCache.count({ where: { published: { gte: d1 }, inCisaKev: true } }),
        prisma.cveCache.findMany({ where: { published: { gte: d7 } }, select: { published: true } }),
        prisma.ioc.count({ where: PUBLIC_IOC_WHERE }),
        prisma.briefing.findMany({
          where: { ...PUBLIC_BRIEFING_WHERE, createdAt: { gte: d7 } },
          select: { affectedRegions: true, severity: true },
        }),
        prisma.briefing.findFirst({
          where: { ...PUBLIC_BRIEFING_WHERE }, orderBy: { createdAt: "desc" }, select: { slug: true },
        }),
        prisma.cronLog.findFirst({ where: { success: true }, orderBy: { runAt: "desc" }, select: { runAt: true } }),
      ]);

    const cvesPerDay = cveDayCounts(recentCves.map((cve) => cve.published.toISOString()), now);

    return {
      criticalCount: criticals.length,
      criticalDelta24h: criticals.filter((c) => c.createdAt >= d1).length,
      criticalSummary: summarizeCriticalTags(criticals),
      criticalLatest: criticals.slice(0, 3),
      briefingsTotal, briefingsWeek, cvesToday, cvesKevToday, cvesPerDay,
      iocsTotal,
      regions: aggregateRegions(regionRows).slice(0, 4),
      latestBriefingSlug: latest?.slug ?? null,
      lastRunAt: lastRun?.runAt ?? null,
    };
  } catch {
    return empty;
  }
}
