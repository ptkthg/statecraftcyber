import { prisma } from "../prisma";
import { PUBLIC_BRIEFING_WHERE } from "../intelligence/publication";
import { getTechnique } from "../intelligence/mitre";
import { safeSourceUrl } from "../intelligence/evidence";
export async function relatedCveEvidence(id: string) {
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
