import { selectNvdCvss, type NvdMetrics } from "../intelligence/cvss";
import { safeSourceUrl } from "../intelligence/evidence";
import type {
  CveSourceMetadata,
  AffectedProduct,
  FixedVersion,
} from "./assessment";
export interface NvdRecord {
  id: string;
  published: string;
  lastModified: string;
  vulnStatus?: string;
  descriptions?: { lang: string; value: string }[];
  metrics?: NvdMetrics;
  weaknesses?: {
    type?: string;
    description: { lang: string; value: string }[];
  }[];
  references?: { url: string; tags?: string[]; source?: string }[];
  configurations?: { operator?: string; negate?: boolean; nodes?: NvdNode[] }[];
}
interface NvdNode {
  operator?: string;
  negate?: boolean;
  nodes?: NvdNode[];
  cpeMatch?: ({ criteria: string; vulnerable: boolean } & Partial<
    Record<
      | "versionStartIncluding"
      | "versionStartExcluding"
      | "versionEndIncluding"
      | "versionEndExcluding",
      string
    >
  >)[];
}
export function nvdMetadata(
  cve: NvdRecord,
  now = new Date().toISOString(),
): CveSourceMetadata {
  const url = "https://nvd.nist.gov/vuln/detail/" + cve.id,
    selected = selectNvdCvss(cve.metrics),
    products: AffectedProduct[] = [];
  const visit = (node: NvdNode, path: string) => {
    const configuration =
      path +
      " / " +
      (node.operator ?? "não informado") +
      (node.negate ? " / NEGATE" : "");
    for (const m of node.cpeMatch ?? []) {
      if (!m.vulnerable) continue;
      const parts = m.criteria
        .split(/(?<!\\):/)
        .map((p) => p.replace(/\\([\\:])/g, "$1"));
      if (parts[0] !== "cpe" || parts[1] !== "2.3" || parts.length < 6)
        continue;
      products.push({
        vendor: parts[3],
        product: parts[4],
        version: parts[5] === "*" || parts[5] === "-" ? null : parts[5],
        cpe: m.criteria,
        startIncluding: m.versionStartIncluding,
        startExcluding: m.versionStartExcluding,
        endIncluding: m.versionEndIncluding,
        endExcluding: m.versionEndExcluding,
        configuration,
        sourceUrl: url,
      });
    }
    for (const [i, child] of (node.nodes ?? []).entries())
      visit(child, configuration + " / nó " + (i + 1));
  };
  for (const [i, configuration] of (cve.configurations ?? []).entries())
    for (const node of configuration.nodes ?? [])
      visit(
        node,
        "Configuração " +
          (i + 1) +
          " / " +
          (configuration.operator ?? "não informado") +
          (configuration.negate ? " / NEGATE" : ""),
      );
  const values =
    selected.version === "4.0"
      ? cve.metrics?.cvssMetricV40
      : selected.version === "3.1"
        ? cve.metrics?.cvssMetricV31
        : selected.version === "3.0"
          ? cve.metrics?.cvssMetricV30
          : cve.metrics?.cvssMetricV2;
  const metric =
    values
      ?.filter((m) => m.cvssData.baseScore === selected.score)
      .find((m) => m.type === "Primary") ??
    values?.find((m) => m.cvssData.baseScore === selected.score);
  const detail = metric as unknown as
    | { source?: string; cvssData?: { vectorString?: string } }
    | undefined;
  return {
    version: "phase3-v1",
    nvd: {
      url,
      retrievedAt: now,
      vector: detail?.cvssData?.vectorString ?? null,
      metricSource: detail?.source ?? null,
      status: cve.vulnStatus ?? null,
    },
    products,
    references: (cve.references ?? [])
      .filter((r) => safeSourceUrl(r.url))
      .map((r) => ({ url: r.url, tags: r.tags ?? [], source: r.source })),
    epss: {
      url: "https://api.first.org/data/v1/epss?cve=" + cve.id,
      date: null,
      retrievedAt: null,
    },
    kev: {
      status: null,
      checkedAt: null,
      url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
    },
    fixedVersions: [],
    warnings: [...selected.warnings],
  };
}
export function fixedVersionsFromOsv(
  value: unknown,
  cveId: string,
): FixedVersion[] {
  const data = value as {
    id?: string;
    aliases?: string[];
    affected?: {
      package?: { name?: string; ecosystem?: string };
      ranges?: { type?: string; events?: { fixed?: string }[] }[];
    }[];
  };
  if (
    !data ||
    !(data.id === cveId || data.aliases?.includes(cveId)) ||
    !data.id ||
    !/^[\w.-]+$/.test(data.id)
  )
    return [];
  const result: FixedVersion[] = [];
  for (const a of data.affected ?? [])
    for (const r of a.ranges ?? []) {
      if (
        !a.package?.name ||
        !a.package.ecosystem ||
        !["SEMVER", "ECOSYSTEM"].includes(r.type ?? "")
      )
        continue;
      for (const event of r.events ?? [])
        if (
          typeof event.fixed === "string" &&
          event.fixed.trim() &&
          event.fixed !== "0"
        )
          result.push({
            package: a.package.name,
            ecosystem: a.package.ecosystem,
            version: event.fixed,
            rangeType: r.type!,
            sourceUrl: "https://osv.dev/vulnerability/" + data.id,
          });
    }
  return [
    ...new Map(
      result.map((r) => [[r.package, r.ecosystem, r.version].join("|"), r]),
    ).values(),
  ];
}
