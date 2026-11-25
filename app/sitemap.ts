import { PUBLIC_BRIEFING_WHERE } from "@/lib/intelligence/publication";
import type { MetadataRoute } from "next";
import { getPublishedSnapshot } from "@/lib/publication/snapshot";
import { campaigns } from "@/data/campaigns";

async function storedRoutes() {
  const { prisma } = await import("@/lib/prisma");
  const [briefingsResult, newsResult, cvesResult] = await Promise.allSettled([
    prisma.briefing.findMany({
      where: { ...PUBLIC_BRIEFING_WHERE },
      select: { slug: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.newsCache.findMany({
      select: { slug: true, enrichedAt: true },
      orderBy: { enrichedAt: "desc" },
      take: 200,
    }),
    prisma.cveCache.findMany({
      select: { id: true, lastModified: true },
      orderBy: { published: "desc" },
      take: 200,
    }),
  ]);
  return {
    briefings: briefingsResult.status === "fulfilled" ? briefingsResult.value : [],
    newsArticles: newsResult.status === "fulfilled" ? newsResult.value.map(({ slug, enrichedAt }) => ({ slug, lastModified: enrichedAt })) : [],
    cves: cvesResult.status === "fulfilled" ? cvesResult.value : [],
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://statecraftcyber.vercel.app";
  const snapshot = await getPublishedSnapshot();
  const { briefings, newsArticles, cves } = snapshot ? {
    briefings: snapshot.briefings.briefings.map((briefing) => ({ slug: briefing.slug, updatedAt: briefing.updatedAt ?? briefing.createdAt })),
    newsArticles: snapshot.news.articles.map((article) => ({ slug: article.slug, lastModified: article.publishedAt })),
    cves: snapshot.cves,
  } : await storedRoutes();

  const staticRoutes = ["/", "/threat-briefings", "/campanhas", "/noticias", "/cves", "/iocs", "/sobre", "/metodologia", "/creditos-visuais", "/redacao"].map(
    (r) => ({
      url: `${base}${r}`,
      lastModified: snapshot?.generatedAt ?? new Date(),
      changeFrequency: "daily" as const,
      priority: r === "/" ? 1 : 0.8,
    })
  );

  const briefingRoutes = briefings.map((b) => ({
    url: `${base}/threat-briefings/${b.slug}`,
    lastModified: b.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  const newsRoutes = newsArticles.map((n) => ({
    url: `${base}/noticias/${n.slug}`,
    lastModified: n.lastModified,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));

  const campaignRoutes = campaigns.map((campaign) => ({
    url: `${base}/campanhas/${campaign.slug}`,
    lastModified: new Date(`${campaign.reviewedAt}T12:00:00Z`),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const cveRoutes = cves.map((cve) => ({
    url: `${base}/cves/${cve.id}`,
    lastModified: cve.lastModified,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...campaignRoutes, ...briefingRoutes, ...newsRoutes, ...cveRoutes];
}
