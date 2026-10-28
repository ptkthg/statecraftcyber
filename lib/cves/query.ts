import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { fetchCves, fromStored, type CveEntry } from "./fetch-cves";
import { operationalPriority } from "./assessment";
export interface CveFilters {
  q: string;
  severity: string;
  cvssMin: number | null;
  cvssMax: number | null;
  epssMin: number | null;
  epssMax: number | null;
  kev: string;
  product: string;
  type: string;
  from: string;
  to: string;
  analysis: string;
  sort: "priority" | "cvss" | "epss" | "recent";
  page: number;
  limit: number;
}
export class InvalidCveFilter extends Error {}
export function parseCveFilters(params: URLSearchParams): CveFilters {
  const bounded = (name: string, max: number) => {
    const raw = params.get(name);
    if (raw === null || raw === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > max)
      throw new InvalidCveFilter("Faixa inválida: " + name);
    return n;
  };
  const date = (name: string) => {
    const v = params.get(name) ?? "";
    if (
      v &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        !Number.isFinite(Date.parse(v)) ||
        new Date(v).toISOString().slice(0, 10) !== v)
    )
      throw new InvalidCveFilter("Data inválida: " + name);
    return v;
  };
  const one = (name: string, allowed: string[], fallback = "") => {
    const v = params.get(name) ?? fallback;
    if (!allowed.includes(v))
      throw new InvalidCveFilter("Filtro inválido: " + name);
    return v;
  };
  const page = Number(params.get("page") ?? 1),
    limit = Number(params.get("limit") ?? 12);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  )
    throw new InvalidCveFilter("Paginação inválida");
  const result: CveFilters = {
    q: (params.get("q") ?? "").trim().slice(0, 200),
    severity: one("severity", [
      "",
      "CRITICAL",
      "HIGH",
      "MEDIUM",
      "LOW",
      "NONE",
      "UNKNOWN",
    ]),
    cvssMin: bounded("cvssMin", 10),
    cvssMax: bounded("cvssMax", 10),
    epssMin: bounded("epssMin", 100),
    epssMax: bounded("epssMax", 100),
    kev: one("kev", ["", "yes", "no"]),
    product: (params.get("product") ?? "")
      .trim()
      .replaceAll("_", " ")
      .slice(0, 120),
    type: (params.get("type") ?? "").trim().slice(0, 100),
    from: date("from"),
    to: date("to"),
    analysis: one("analysis", ["", "yes", "no"]),
    sort: one(
      "sort",
      ["priority", "cvss", "epss", "recent"],
      "priority",
    ) as CveFilters["sort"],
    page,
    limit,
  };
  for (const [lo, hi] of [
    [result.cvssMin, result.cvssMax],
    [result.epssMin, result.epssMax],
  ])
    if (lo !== null && hi !== null && lo > hi)
      throw new InvalidCveFilter("O início da faixa deve ser menor que o fim");
  if (result.from && result.to && result.from > result.to)
    throw new InvalidCveFilter("Intervalo de datas invertido");
  return result;
}
export function cveWhere(f: CveFilters): Prisma.CveCacheWhereInput {
  const AND: Prisma.CveCacheWhereInput[] = [
    { recordStatus: { not: "Rejected" } },
  ];
  if (f.q)
    AND.push({
      OR: [
        { id: { contains: f.q, mode: "insensitive" } },
        { description: { contains: f.q, mode: "insensitive" } },
        { ptBrDescription: { contains: f.q, mode: "insensitive" } },
        { vulnType: { contains: f.q, mode: "insensitive" } },
        {
          productSearch: {
            contains: f.q.replaceAll("_", " "),
            mode: "insensitive",
          },
        },
      ],
    });
  const severities: Record<string, Prisma.CveCacheWhereInput> = {
    CRITICAL: { cvssScore: { gte: 9, lte: 10 } },
    HIGH: { cvssScore: { gte: 7, lt: 9 } },
    MEDIUM: { cvssScore: { gte: 4, lt: 7 } },
    LOW: { cvssScore: { gt: 0, lt: 4 } },
    NONE: { cvssScore: 0 },
    UNKNOWN: {
      OR: [
        { cvssScore: null },
        { cvssScore: { lt: 0 } },
        { cvssScore: { gt: 10 } },
      ],
    },
  };
  if (f.severity) AND.push(severities[f.severity]);
  if (f.cvssMin !== null || f.cvssMax !== null)
    AND.push({
      cvssScore: {
        ...(f.cvssMin !== null ? { gte: f.cvssMin } : {}),
        ...(f.cvssMax !== null ? { lte: f.cvssMax } : {}),
      },
    });
  if (f.epssMin !== null || f.epssMax !== null)
    AND.push({
      epss: {
        ...(f.epssMin !== null ? { gte: f.epssMin / 100 } : {}),
        ...(f.epssMax !== null ? { lte: f.epssMax / 100 } : {}),
      },
    });
  if (f.kev === "yes") AND.push({ inCisaKev: true });
  if (f.kev === "no")
    AND.push({ sourceMetadata: { path: ["kev", "status"], equals: false } });
  if (f.product)
    AND.push({ productSearch: { contains: f.product, mode: "insensitive" } });
  if (f.type) AND.push({ vulnType: f.type });
  if (f.from || f.to)
    AND.push({
      published: {
        ...(f.from ? { gte: new Date(f.from + "T00:00:00Z") } : {}),
        ...(f.to
          ? { lt: new Date(Date.parse(f.to + "T00:00:00Z") + 86400000) }
          : {}),
      },
    });
  if (f.analysis) AND.push({ analysisReady: f.analysis === "yes" });
  return AND.length ? { AND } : {};
}
export function cveOrder(
  f: CveFilters,
): Prisma.CveCacheOrderByWithRelationInput[] {
  const tie: Prisma.CveCacheOrderByWithRelationInput[] = [
    { published: "desc" },
    { id: "asc" },
  ];
  if (f.sort === "cvss")
    return [{ cvssScore: { sort: "desc", nulls: "last" } }, ...tie];
  if (f.sort === "epss")
    return [{ epss: { sort: "desc", nulls: "last" } }, ...tie];
  if (f.sort === "recent") return tie;
  return [
    { priorityRank: "asc" },
    { epss: { sort: "desc", nulls: "last" } },
    { cvssScore: { sort: "desc", nulls: "last" } },
    ...tie,
  ];
}
export function filterCveEntries(entries: CveEntry[], f: CveFilters) {
  const text = (v: string) => v.toLowerCase().replaceAll("_", " ");
  const rows = entries.filter((c) => {
    if (c.sourceMetadata?.nvd.status === "Rejected") return false;
    const knownKev = c.sourceMetadata?.kev.status;
    if (
      f.q &&
      !text(
        [
          c.id,
          c.description,
          c.ptBrDescription ?? "",
          ...c.affectedProducts,
        ].join(" "),
      ).includes(text(f.q))
    )
      return false;
    if (
      f.severity &&
      (f.severity === "UNKNOWN"
        ? c.cvssScore !== null
        : c.severity !== f.severity)
    )
      return false;
    for (const [value, min, max] of [
      [c.cvssScore, f.cvssMin, f.cvssMax],
      [
        c.epss,
        f.epssMin === null ? null : f.epssMin / 100,
        f.epssMax === null ? null : f.epssMax / 100,
      ],
    ])
      if (
        (min !== null || max !== null) &&
        (value === null ||
          (min !== null && value < min) ||
          (max !== null && value > max))
      )
        return false;
    if (
      (f.kev === "yes" && !c.inCisaKev) ||
      (f.kev === "no" && knownKev !== false)
    )
      return false;
    if (
      f.product &&
      !text(c.affectedProducts.join(" ")).includes(text(f.product))
    )
      return false;
    if (
      (f.type && c.vulnType !== f.type) ||
      (f.from && c.published < f.from) ||
      (f.to && c.published.slice(0, 10) > f.to)
    )
      return false;
    if (f.analysis && !!c.ptBrDescription !== (f.analysis === "yes"))
      return false;
    return true;
  });
  return rows.sort(
    (a, b) =>
      (f.sort === "priority"
        ? operationalPriority(a).rank - operationalPriority(b).rank
        : 0) ||
      (f.sort === "cvss" ? (b.cvssScore ?? -1) - (a.cvssScore ?? -1) : 0) ||
      (f.sort === "epss" ? (b.epss ?? -1) - (a.epss ?? -1) : 0) ||
      (f.sort === "priority"
        ? (b.epss ?? -1) - (a.epss ?? -1) ||
          (b.cvssScore ?? -1) - (a.cvssScore ?? -1)
        : 0) ||
      Date.parse(b.published) - Date.parse(a.published) ||
      a.id.localeCompare(b.id),
  );
}
export interface CvePage {
  cves: CveEntry[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  updatedAt: string | null;
  coverage: string;
  types: string[];
}
export async function queryCves(params: URLSearchParams): Promise<CvePage> {
  const f = parseCveFilters(params);
  try {
    const fresh = await prisma.cveCache.findFirst({
      where: {
        fetchedAt: { gte: new Date(Date.now() - 6 * 3600000) },
        sourceMetadata: { path: ["version"], equals: "phase3-v1" },
      },
      select: { id: true },
    });
    if (!fresh) {
      try {
        await fetchCves();
      } catch {
        if (!(await prisma.cveCache.count()))
          throw new Error("No cached CVEs available");
      }
    }
    const where = cveWhere(f);
    const result = await prisma.$transaction(
      async (tx) => {
        const total = await tx.cveCache.count({ where }),
          totalPages = Math.max(1, Math.ceil(total / f.limit)),
          page = Math.min(f.page, totalPages);
        const [rows, newest, types] = await Promise.all([
          tx.cveCache.findMany({
            where,
            orderBy: cveOrder(f),
            skip: (page - 1) * f.limit,
            take: f.limit,
          }),
          tx.cveCache.findFirst({
            orderBy: { fetchedAt: "desc" },
            select: { fetchedAt: true },
          }),
          tx.cveCache.findMany({
            distinct: ["vulnType"],
            select: { vulnType: true },
          }),
        ]);
        return {
          cves: rows.map(fromStored),
          total,
          page,
          totalPages,
          limit: f.limit,
          updatedAt: newest?.fetchedAt.toISOString() ?? null,
          coverage:
            "Registros disponíveis no cache local; não representa a totalidade do NVD.",
          types: types.map((t) => t.vulnType).sort(),
        };
      },
      { isolationLevel: "RepeatableRead", timeout: 12000 },
    );
    return result;
  } catch {
    const data = await fetchCves(),
      rows = filterCveEntries(data.cves, f),
      totalPages = Math.max(1, Math.ceil(rows.length / f.limit)),
      page = Math.min(f.page, totalPages);
    return {
      cves: rows.slice((page - 1) * f.limit, page * f.limit),
      total: rows.length,
      page,
      totalPages,
      limit: f.limit,
      updatedAt: data.updatedAt,
      coverage:
        "Consulta de contingência às fontes; resultados limitados à coleta disponível.",
      types: [...new Set(data.cves.map((c) => c.vulnType))].sort(),
    };
  }
}
