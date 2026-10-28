import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { RawIOC, RawThreatItem } from "../threat-sources/types";
import { extractIocsFromText } from "../ioc-extractor";
import { safeSourceUrl, sourceEvidence } from "../intelligence/evidence";
import { getTechnique, validateTechnique } from "../intelligence/mitre";
export interface RecordIssue {
  code: string;
  severity: "error" | "warning";
  field: string;
}
export interface EntityFact {
  kind: string;
  value: string;
  original: string;
  origin: "structured" | "mention";
  sourceUrl: string;
  field: string;
}
export interface EventProfile {
  kind: string;
  exactKey?: string;
  source: string;
  periodicKey?: string;
  url: string;
  title: string[];
  body: string[];
  bodyDigest: string;
  cves: string[];
  campaigns: string[];
  indicators: string[];
  publishedAt: string | null;
}
export const fold = (s: string) =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value instanceof Date)
    return JSON.stringify(
      Number.isFinite(+value) ? value.toISOString() : "invalid-date",
    );
  if (Array.isArray(value))
    return "[" + value.map(stableStringify).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + stableStringify(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export const hash = (value: unknown) =>
  createHash("sha256").update(stableStringify(value)).digest("hex");
const unique = (items: string[]) => [...new Set(items)].sort();
export function canonicalUrl(
  value: string,
  stripTracking = false,
): string | null {
  try {
    const u = new URL(value);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
      return null;
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (stripTracking)
      for (const key of [...u.searchParams.keys()])
        if (/^(utm_|fbclid$|gclid$)/i.test(key)) u.searchParams.delete(key);
    if (stripTracking) u.searchParams.sort();
    return u.href;
  } catch {
    return null;
  }
}
/** URL paths and queries are significant IOC identities; host-only normalization loses indicators. */
export function indicatorKey(
  ioc: Pick<RawIOC, "type" | "value">,
): string | null {
  const v = ioc.value?.trim();
  if (!v) return null;
  let normalized: string | null = null;
  switch (ioc.type) {
    case "url":
      normalized = canonicalUrl(v);
      break;
    case "domain":
      if (!/\s|[/:?#]/.test(v))
        try {
          normalized = new URL(
            "http://" + v.replace(/\.$/, ""),
          ).hostname.toLowerCase();
        } catch {}
      break;
    case "ip":
      if (isIP(v))
        normalized =
          isIP(v) === 6
            ? new URL("http://[" + v + "]/").hostname.slice(1, -1)
            : v;
      break;
    case "hash":
      if (/^(?:[a-f\d]{32}|[a-f\d]{40}|[a-f\d]{64})$/i.test(v))
        normalized = v.toLowerCase();
      break;
    case "email":
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) normalized = v.toLowerCase();
      break;
    case "file":
      normalized = v;
      break;
    case "c2":
      if (isIP(v)) normalized = v.toLowerCase();
      else normalized = canonicalUrl(v);
      break;
  }
  return normalized === null ? null : ioc.type + ":" + normalized;
}
export function normalizeIndicators(iocs: RawIOC[]): RawIOC[] {
  const map = new Map<string, RawIOC>();
  for (const ioc of iocs) {
    const key = indicatorKey(ioc);
    if (!key) continue;
    const normalized = { ...ioc, value: key.slice(key.indexOf(":") + 1) };
    const old = map.get(key);
    if (!old) map.set(key, normalized);
    else {
      const rank = { low: 0, medium: 1, high: 2 };
      if (rank[ioc.confidence] > rank[old.confidence]) map.set(key, normalized);
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}
export function indicatorDelta(
  previous: RawIOC[],
  incoming: RawIOC[],
  complete: boolean,
) {
  const before = new Map(
    previous.map((i) => [indicatorKey(i), i]).filter(([k]) => k !== null) as [
      string,
      RawIOC,
    ][],
  );
  const next = new Map(
    normalizeIndicators(incoming).map((i) => [indicatorKey(i)!, i]),
  );
  const added = [...next.keys()].filter((k) => !before.has(k));
  const removed = complete
    ? [...before.keys()].filter((k) => !next.has(k))
    : [];
  const effective = complete
    ? [...next.values()]
    : normalizeIndicators([...before.values(), ...next.values()]);
  return { added, removed, effective, removalsKnown: complete };
}
const stop = new Set(
  "a o e de da do das dos em um uma para por com na no as os the and of in to for on a an is are was were from by at this that report security cyber seguranca relatorio".split(
    " ",
  ),
);
function tokens(s: string) {
  return unique(
    (fold(s).match(/[a-z0-9][a-z0-9._-]*/g) ?? []).filter(
      (w) => w.length > 2 && !stop.has(w),
    ),
  );
}
function nativeMaterial(value: unknown): unknown {
  if (Array.isArray(value))
    return value
      .map(nativeMaterial)
      .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            ![
              "modified",
              "created",
              "published",
              "lastModified",
              "pubDate",
              "isoDate",
              "retrievedAt",
            ].includes(key),
        )
        .map(([key, v]) => [key, nativeMaterial(v)]),
    );
  return value;
}
export function materialFingerprint(
  raw: RawThreatItem,
  effective = raw.iocs ?? [],
): string {
  return hash({
    native: nativeMaterial(raw.originalPayload),
    source: fold(raw.sourceName),
    url: canonicalUrl(raw.sourceUrl, true),
    kind: raw.recordKind ?? "event",
    title: fold(raw.title),
    description: fold(raw.description),
    cves: unique((raw.cves ?? []).map((c) => c.toUpperCase())),
    iocs: normalizeIndicators(effective).map((i) => ({
      key: indicatorKey(i),
      confidence: i.confidence,
      sourceUrl: i.sourceUrl,
      locallyConfirmed: i.locallyConfirmed,
      sharedInfrastructure: i.sharedInfrastructure,
    })),
    vendors: unique((raw.vendors ?? []).map(fold)),
    products: unique((raw.affectedProducts ?? []).map(fold)),
    campaigns: unique((raw.campaigns ?? []).map(fold)),
    actors: unique((raw.actors ?? []).map(fold)),
    techniques: raw.mitreEvidence ?? [],
    cvss: raw.cvssScore,
    epss: raw.epssScore,
    kev: raw.inCisaKev === true,
    severity: raw.severity,
    severityOrigin: raw.severityOrigin,
    sectors: unique(raw.affectedSectors ?? []),
    regions: unique(raw.affectedRegions ?? []),
  });
}
export function prepareRecord(input: RawThreatItem, now = new Date()) {
  const issues: RecordIssue[] = [];
  const add = (
    code: string,
    field: string,
    severity: "error" | "warning" = "error",
  ) => issues.push({ code, field, severity });
  const raw = { ...input };
  if (!raw.externalId?.trim()) add("required.external_id", "externalId");
  if (!raw.title?.trim()) add("required.title", "title");
  if (!raw.description?.trim()) add("required.description", "description");
  if (!raw.sourceName?.trim()) add("required.source", "sourceName");
  if (!safeSourceUrl(raw.sourceUrl ?? ""))
    add("reference.invalid", "sourceUrl");
  for (const key of ["publishedAt", "sourceUpdatedAt"] as const) {
    const date = raw[key];
    if (date !== undefined) {
      const value = new Date(date);
      if (
        !Number.isFinite(value.getTime()) ||
        value.getTime() > now.getTime() + 86400000
      )
        add("date.invalid", key);
      else raw[key] = value;
    }
  }
  if (raw.publishedAtOrigin !== "retrieval" && !raw.publishedAt)
    add("date.unknown", "publishedAt", "warning");
  if (
    raw.publishedAt &&
    raw.sourceUpdatedAt &&
    raw.publishedAtOrigin !== "retrieval" &&
    +new Date(raw.sourceUpdatedAt) < +new Date(raw.publishedAt)
  )
    add("date.update_before_publication", "sourceUpdatedAt");
  for (const ioc of raw.iocs ?? [])
    if (!indicatorKey(ioc)) add("ioc.invalid", "iocs");
  for (const ioc of raw.iocs ?? [])
    if (!["low", "medium", "high"].includes(ioc.confidence))
      add("ioc.confidence_invalid", "iocs");
  for (const name of ["cvssScore", "epssScore"] as const) {
    const n = raw[name];
    if (
      n !== undefined &&
      (!Number.isFinite(n) || n < 0 || n > (name === "cvssScore" ? 10 : 1))
    )
      add("metric.invalid", name);
  }
  if (raw.cvssScore !== undefined && (raw.cves ?? []).length !== 1)
    add("metric.cvss_scope", "cvssScore");
  for (const warning of raw.metricWarnings ?? [])
    add("metric.contradiction", warning);
  raw.iocs = normalizeIndicators(raw.iocs ?? []);
  if (issues.some((i) => i.field === "iocs")) raw.iocSetComplete = false;
  const entities: EntityFact[] = [];
  const fact = (
    kind: string,
    original: string,
    field: string,
    origin: "structured" | "mention" = "structured",
    value = fold(original),
  ) =>
    entities.push({
      kind,
      value,
      original,
      field,
      origin,
      sourceUrl: raw.sourceUrl,
    });
  const text = (raw.title ?? "") + "\n" + (raw.description ?? "");
  const cves = unique(
    [...(raw.cves ?? []), ...(text.match(/\bCVE-\d{4}-\d{4,}\b/gi) ?? [])].map(
      (c) => c.toUpperCase(),
    ),
  );
  for (const cve of cves) {
    if (!/^CVE-\d{4}-\d{4,}$/.test(cve)) add("cve.invalid", "cves");
    else
      fact(
        "cve",
        cve,
        (input.cves ?? []).some((c) => c.toUpperCase() === cve)
          ? "cves"
          : "description",
        (input.cves ?? []).some((c) => c.toUpperCase() === cve)
          ? "structured"
          : "mention",
        cve,
      );
  }
  raw.cves = cves;
  for (const [kind, field, values] of [
    ["product", "affectedProducts", raw.affectedProducts],
    ["vendor", "vendors", raw.vendors],
    ["campaign", "campaigns", raw.campaigns],
    ["actor", "actors", raw.actors],
  ] as const)
    for (const value of values ?? []) fact(kind, value, field);
  for (const ioc of raw.iocs)
    fact("indicator", ioc.value, "iocs", "structured", indicatorKey(ioc)!);
  for (const candidate of [
    ...extractIocsFromText(text, raw.sourceName),
    ...(text.match(/https?:\/\/[^\s"'<>]+/g) ?? []).map((value) => ({
      type: "url" as const,
      value,
    })),
  ]) {
    const key = indicatorKey(candidate);
    if (key)
      fact("indicator-mention", candidate.value, "description", "mention", key);
  }
  for (const mapping of raw.mitreEvidence ?? []) {
    const validation = validateTechnique(mapping, sourceEvidence(raw));
    for (const issue of validation.issues) add(issue.code, "mitreEvidence");
    if (validation.technique)
      fact("technique", mapping.id, "mitreEvidence", "structured", mapping.id);
  }
  for (const id of unique(text.match(/\bT\d{4}(?:\.\d{3})?\b/g) ?? [])) {
    if (getTechnique(id))
      fact("technique-mention", id, "description", "mention", id);
    else add("mitre.invalid_mention", "description", "warning");
  }
  for (const match of text.matchAll(
    /\b(?:campaign named|campaign called|campanha denominada|campanha chamada)\s+["\u201c]([^"\u201d\n]{3,100})["\u201d]/gi,
  ))
    fact("campaign-mention", match[1], "description", "mention");
  const kind =
    raw.recordKind ??
    (["NVD", "CISA KEV"].includes(raw.sourceName) && cves.length === 1
      ? "vulnerability"
      : "event");
  raw.recordKind = kind;
  if (kind === "periodic-ioc" && !raw.periodicKey?.trim())
    add("required.periodic_key", "periodicKey");
  const exactKey =
    kind === "periodic-ioc" && raw.periodicKey
      ? "feed:" + hash([fold(raw.sourceName), fold(raw.periodicKey)])
      : kind === "vulnerability" && cves.length === 1
        ? "cve:" + cves[0]
        : undefined;
  const profile: EventProfile = {
    kind,
    exactKey,
    source: fold(raw.sourceName),
    periodicKey: raw.periodicKey ? fold(raw.periodicKey) : undefined,
    url: canonicalUrl(raw.sourceUrl, true) ?? raw.sourceUrl,
    title: tokens(raw.title ?? ""),
    body: tokens(raw.description ?? ""),
    bodyDigest: hash(fold(raw.description ?? "")),
    cves,
    campaigns: unique((raw.campaigns ?? []).map(fold)),
    indicators: raw.iocs.map((i) => indicatorKey(i)!),
    publishedAt:
      raw.publishedAt &&
      raw.publishedAtOrigin !== "retrieval" &&
      Number.isFinite(+new Date(raw.publishedAt))
        ? new Date(raw.publishedAt).toISOString()
        : null,
  };
  const identityHash = hash([
    fold(raw.sourceName ?? ""),
    kind === "periodic-ioc" ? raw.periodicKey : raw.externalId || hash(input),
  ]);
  const sourceData = {
    ...raw,
    evidenceSources: (raw.evidenceSources ?? []).map((s) => ({
      ...s,
      retrievedAt: undefined,
    })),
  };
  if (kind === "periodic-ioc") {
    sourceData.externalId = raw.periodicKey ?? raw.externalId;
    if (raw.publishedAtOrigin === "retrieval") delete sourceData.publishedAt;
  }
  const sourceFingerprint = hash(sourceData);
  return {
    original: input,
    raw,
    entities,
    issues,
    profile,
    identityHash,
    sourceFingerprint,
    materialFingerprint: materialFingerprint(raw),
  };
}
