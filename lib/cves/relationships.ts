import { PUBLIC_BRIEFING_WHERE } from "../intelligence/publication";
import { getTechnique } from "../intelligence/mitre";
import { originalQuote, safeSourceUrl } from "../intelligence/evidence";
import { POLICY_VERSION } from "../intelligence/validation";
import { getPublishedSnapshot, type PublishedSnapshot } from "../publication/snapshot";

export function snapshotCveEvidence(snapshot: PublishedSnapshot, id: string) {
  return snapshot.briefings.briefings.flatMap((briefing) => {
    const structured = briefing.structuredContent;
    const quality = structured?.quality;
    if (!briefing.cves.includes(id) || !structured?.relatedCves.includes(id) ||
      !safeSourceUrl(briefing.sourceUrl) || quality?.policyVersion !== POLICY_VERSION ||
      quality.analysisStatus !== "validated" || !quality.publishable || quality.issues.length) return [];

    const techniques = quality.techniques.flatMap((technique) => {
      const official = getTechnique(technique.id);
      const source = quality.sources.find((entry) => entry.id === technique.sourceId);
      if (!official || !source || !safeSourceUrl(source.url) ||
        (technique.kind !== "reported" && technique.kind !== "observed") ||
        !originalQuote(source, technique.quote)) return [];
      return [{ id: technique.id, name: official.name, url: official.url, kind: technique.kind, quote: technique.quote, sourceUrl: source.url }];
    });

    const iocs = snapshot.iocs.filter((ioc) =>
      ioc.briefingSlug === briefing.slug && structured.identifiedIocs.some((original) =>
        original.type === ioc.type && original.value === ioc.value),
    ).slice(0, 20).map((ioc) => ({
      type: ioc.type, value: ioc.value,
      sourceUrl: ioc.source && safeSourceUrl(ioc.source) ? ioc.source : briefing.sourceUrl,
    }));

    return techniques.length || iocs.length ? [{
      slug: briefing.slug, title: briefing.title, sourceUrl: briefing.sourceUrl, techniques, iocs,
    }] : [];
  }).slice(0, 6);
}

export async function relatedCveEvidence(id: string) {
  const snapshot = await getPublishedSnapshot();
  if (snapshot) return snapshotCveEvidence(snapshot, id);
  const { prisma } = await import("../prisma");
  const rows = await prisma.briefing
    .findMany({
      where: { ...PUBLIC_BRIEFING_WHERE, cves: { has: id } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        slug: true,
        title: true,
        sourceUrl: true,
        sourceSnapshot: true,
        qualityReport: true,
        iocsRel: {
          where: { isActive: true },
          take: 20,
          select: { type: true, value: true, sourceUrl: true },
        },
      },
    })
    .catch(() => []);
  return rows.map((row) => {
    const original = row.sourceSnapshot as {
      cves?: string[];
      iocs?: { type: string; value: string }[];
    } | null;
    const quality = row.qualityReport as {
      techniques?: {
        id: string;
        name: string;
        kind: string;
        quote: string;
        sourceId: string;
      }[];
      sources?: { id: string; url: string; text: string; origin: string }[];
    } | null;
    const techniques = (quality?.techniques ?? []).flatMap((t) => {
      const official = getTechnique(t.id),
        source = quality?.sources?.find(
          (s) =>
            s.id === t.sourceId &&
            s.origin === "original" &&
            s.text.includes(t.quote),
        );
      return official &&
        source &&
        t.kind !== "inferred" &&
        safeSourceUrl(source.url)
        ? [
            {
              id: t.id,
              name: official.name,
              url: official.url,
              kind: t.kind,
              quote: t.quote,
              sourceUrl: source.url,
            },
          ]
        : [];
    });
    const iocs = (row.iocsRel ?? [])
      .filter(
        (i) =>
          original?.cves?.includes(id) &&
          original.iocs?.some(
            (raw) => raw.type === i.type && raw.value === i.value,
          ),
      )
      .map((i) => ({
        ...i,
        sourceUrl: safeSourceUrl(i.sourceUrl ?? "")
          ? i.sourceUrl!
          : row.sourceUrl,
      }))
      .filter((i) => safeSourceUrl(i.sourceUrl));
    return {
      slug: row.slug,
      title: row.title,
      sourceUrl: row.sourceUrl,
      techniques,
      iocs,
    };
  });
}
