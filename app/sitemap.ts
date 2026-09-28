import { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { campaigns } from "@/data/campaigns";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://statecraftcyber.vercel.app";

  const [briefingsResult, newsResult] = await Promise.allSettled([
    prisma.briefing.findMany({
      where: { status: "published" },
      select: { slug: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.newsCache.findMany({
      select: { slug: true, enrichedAt: true },
      orderBy: { enrichedAt: "desc" },
      take: 200,
    }),
  ]);
  const briefings = briefingsResult.status === "fulfilled" ? briefingsResult.value : [];
  const newsArticles = newsResult.status === "fulfilled" ? newsResult.value : [];

  const staticRoutes = ["/", "/threat-briefings", "/campanhas", "/noticias", "/cves", "/iocs", "/sobre", "/metodologia"].map(
    (r) => ({
      url: `${base}${r}`,
      lastModified: new Date(),
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
    lastModified: n.enrichedAt,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));

  const campaignRoutes = campaigns.map((campaign) => ({
    url: `${base}/campanhas/${campaign.slug}`,
    lastModified: new Date(`${campaign.reviewedAt}T12:00:00Z`),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...campaignRoutes, ...briefingRoutes, ...newsRoutes];
}
