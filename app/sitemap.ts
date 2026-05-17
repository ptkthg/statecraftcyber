import { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://statecraftcyber.vercel.app";

  const [briefings, newsArticles] = await Promise.all([
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

  const staticRoutes = ["/", "/threat-briefings", "/noticias", "/cves", "/iocs", "/sobre", "/metodologia"].map(
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

  return [...staticRoutes, ...briefingRoutes, ...newsRoutes];
}
