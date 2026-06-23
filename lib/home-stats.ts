// Funções puras dos dados derivados da home (spec 2026-06-12 §7). Queries ficam em getHomeStats.

const ALERT_PATTERNS = /(corrige|patch|atualiza[çc][ãa]o|urgente|explorad[ao]|exploit|zero-day|kev|mitiga[çc][ãa]o)/i;

export function classifyNewsTitle(title: string): "alert" | "context" {
  return ALERT_PATTERNS.test(title) ? "alert" : "context";
}

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

export async function getHomeStats(): Promise<HomeStats> {
  const empty: HomeStats = {
    criticalCount: 0, criticalDelta24h: 0, criticalSummary: null, criticalLatest: [],
    briefingsTotal: 0, briefingsWeek: 0, cvesToday: 0, cvesKevToday: 0,
    cvesPerDay: [], iocsTotal: 0, regions: [], latestBriefingSlug: null, lastRunAt: null,
  };
  try {
    const { prisma } = await import("@/lib/prisma");
    const now = Date.now();
    const d1 = new Date(now - 24 * 3600_000);
    const d7 = new Date(now - 7 * 24 * 3600_000);

    const [criticals, briefingsTotal, briefingsWeek, cvesToday, cvesKevToday, recentCves, iocsTotal, regionRows, latest, lastRun] =
      await Promise.all([
        prisma.briefing.findMany({
          where: { status: "published", severity: "critical", createdAt: { gte: d7 } },
          orderBy: { createdAt: "desc" },
          select: { slug: true, title: true, tags: true, createdAt: true, sourceName: true },
        }),
        prisma.briefing.count({ where: { status: "published" } }),
        prisma.briefing.count({ where: { status: "published", createdAt: { gte: d7 } } }),
        prisma.cveCache.count({ where: { published: { gte: d1 } } }),
        prisma.cveCache.count({ where: { published: { gte: d1 }, inCisaKev: true } }),
        prisma.cveCache.findMany({ where: { published: { gte: d7 } }, select: { published: true } }),
        prisma.ioc.count(),
        prisma.briefing.findMany({
          where: { status: "published", createdAt: { gte: d7 } },
          select: { affectedRegions: true, severity: true },
        }),
        prisma.briefing.findFirst({
          where: { status: "published" }, orderBy: { createdAt: "desc" }, select: { slug: true },
        }),
        prisma.cronLog.findFirst({ where: { success: true }, orderBy: { runAt: "desc" }, select: { runAt: true } }),
      ]);

    const perDay = new Map<string, number>();
    for (const c of recentCves) {
      const key = c.published.toISOString().slice(0, 10);
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    const cvesPerDay = [...Array(7)].map((_, i) => {
      const d = new Date(now - (6 - i) * 24 * 3600_000);
      return { day: DAY_LABELS[d.getDay()], count: perDay.get(d.toISOString().slice(0, 10)) ?? 0 };
    });

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
