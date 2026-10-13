import type { NewsArticle } from "@/lib/news-feeds";

export function editorialImageForNews(article: Pick<NewsArticle, "type" | "sourceRegion" | "title">) {
  if (article.sourceRegion === "Brasil") return { src: "/editorial/congresso.webp", alt: "Congresso Nacional em Brasília; fotografia histórica usada como ilustração editorial" };
  if (article.type === "Supply Chain") return { src: "/editorial/porto.webp", alt: "Navios e guindastes portuários; fotografia ilustrativa de infraestrutura" };
  if (article.type === "Vulnerabilidade" || article.type === "Malware" || /CVE-|software|cloud|nuvem/i.test(article.title)) return { src: "/editorial/datacenter-ache.webp", alt: "Racks de servidores em um datacenter; fotografia ilustrativa" };
  return { src: "/editorial/antena.webp", alt: "Antena de telecomunicações em Teresópolis; fotografia ilustrativa" };
}
