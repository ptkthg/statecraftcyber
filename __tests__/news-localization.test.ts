import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewsArticle } from "@/lib/news-feeds";

const mocks = vi.hoisted(() => ({
  completeNewsJson: vi.fn(),
  findMany: vi.fn(),
  createMany: vi.fn(),
}));

vi.mock("@/lib/news-ai-client", () => ({ completeNewsJson: mocks.completeNewsJson }));
vi.mock("@/lib/prisma", () => ({
  prisma: { newsCache: { findMany: mocks.findMany, createMany: mocks.createMany } },
}));

import { localizeNewsArticles, parseNewsTranslations } from "@/lib/news-localization";

function article(slug: string, region: "Global" | "Brasil" = "Global"): NewsArticle {
  return {
    id: slug, slug, title: `English ${slug}`, summary: `Original ${slug}`,
    url: `https://example.com/${slug}`, source: "Example", sourceRegion: region,
    publishedAt: "2026-09-27T12:00:00Z", tags: [], cves: [], importance: 1,
    type: "Ameaça",
  };
}

describe("news localization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.createMany.mockResolvedValue({ count: 1 });
  });

  it("ignores invented slugs and incomplete AI translations", () => {
    const result = parseNewsTranslations(JSON.stringify({ articles: [
      { slug: "wanted", title: "Título", summary: "Resumo" },
      { slug: "invented", title: "Outro", summary: "Outro" },
      { slug: "bad", title: "", summary: "Resumo" },
    ] }), [article("wanted"), article("bad")]);
    expect([...result.keys()]).toEqual(["wanted"]);
  });

  it("reuses cached Portuguese and persists only new global previews", async () => {
    mocks.findMany.mockResolvedValue([{ slug: "cached", title: "Já traduzida", summary: "Resumo salvo" }]);
    mocks.completeNewsJson.mockResolvedValue(JSON.stringify({ articles: [
      { slug: "new", title: "Nova notícia", summary: "Resumo traduzido" },
    ] }));

    const result = await localizeNewsArticles([
      article("cached"), article("new"), article("br", "Brasil"),
    ]);

    expect(result.map((item) => item.title)).toEqual(["Já traduzida", "Nova notícia", "English br"]);
    expect(mocks.completeNewsJson).toHaveBeenCalledTimes(1);
    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [{
        slug: "new", title: "Nova notícia", summary: "Resumo traduzido",
        content: "", source: "Example", originalUrl: "https://example.com/new",
      }],
      skipDuplicates: true,
    });
  });
});
