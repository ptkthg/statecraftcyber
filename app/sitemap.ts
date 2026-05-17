import { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://statecraftcyber.vercel.app";

  const briefings = await prisma.briefing.findMany({
    where: { status: "published" },
    select: { slug: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const staticRoutes = ["/", "/threat-briefings", "/noticias", "/cves", "/iocs", "/sobre"].map(
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

  return [...staticRoutes, ...briefingRoutes];
}
