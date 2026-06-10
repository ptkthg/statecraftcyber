# Global Search com Correlação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar busca global unificada (Cmd+K) que pesquisa briefings, IOCs, CVEs e notícias via PostgreSQL FTS, com correlação automática de IOCs quando o termo é um CVE ID.

**Architecture:** API route `/api/search` executa queries em paralelo com `Promise.allSettled` contra quatro entidades do banco; briefings e notícias usam colunas `tsvector` geradas com índice GIN; IOCs e CVEs usam `contains` inline. O SearchOverlay é um modal Radix Dialog client-side que ouve Cmd+K e um custom event `open-search`; o Header dispara o evento ao clicar no ícone.

**Tech Stack:** Next.js 16 App Router, Prisma 6 + PostgreSQL, `@radix-ui/react-dialog` (já instalado), `lucide-react` (já instalado), Vitest 4 (testes), Tailwind 4.

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `prisma/schema.prisma` | Modificar | Adicionar campo `searchVector` em Briefing e NewsCache |
| `prisma/migrations/20260605000000_add_search_vectors/migration.sql` | Criar | SQL com GENERATED ALWAYS + índice GIN |
| `lib/search/types.ts` | Criar | Interface `SearchResult` |
| `lib/search/merge.ts` | Criar | Funções puras: `detectCveId`, `mergeResults` |
| `__tests__/search-merge.test.ts` | Criar | Testes unitários para merge.ts |
| `app/api/search/route.ts` | Criar | GET /api/search?q= — queries paralelas + correlação CVE |
| `components/search/useSearch.ts` | Criar | Hook com debounce 300ms + AbortController |
| `components/search/SearchResult.tsx` | Criar | Card individual por tipo (badge + título + meta) |
| `components/search/SearchOverlay.tsx` | Criar | Modal Radix Dialog com input, resultados, teclado |
| `app/layout.tsx` | Modificar | Montar `<SearchOverlay />` no body |
| `components/layout/Header.tsx` | Modificar | Adicionar ícone de busca que dispara `open-search` event |

---

## Task 1: Database — Schema + Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260605000000_add_search_vectors/migration.sql`

- [ ] **Step 1: Adicionar campos `searchVector` no schema.prisma**

Em `prisma/schema.prisma`, adicionar ao final do model `Briefing` (antes do fechamento `}`):

```prisma
model Briefing {
  id                String     @id @default(cuid())
  title             String
  slug              String     @unique
  summary           String     @db.Text
  content           String     @db.Text
  severity          Severity
  category          String
  tags              String[]
  affectedSectors   String[]
  affectedRegions   String[]
  sourceName        String
  sourceUrl         String
  sourcePublishedAt DateTime?
  /// @deprecated Use the Ioc relation table instead. Kept for snapshot compatibility.
  iocs              Json       @default("[]")
  /// Structured JSON content for the new rendering pipeline. Null for briefings generated before this field was added.
  structuredContent Json?
  cves              String[]
  mitreTechniques   String[]
  epssScore         Float?
  cvssScore         Float?
  confidence        Confidence
  status            Status     @default(draft)
  contentHash       String     @unique
  readingTime       Int        @default(5)
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt
  iocsRel           Ioc[]
  searchVector      Unsupported("tsvector")? @map("search_vector")

  @@index([status, severity])
  @@index([status, createdAt(sort: Desc)])
  @@index([category])
}
```

E ao final do model `NewsCache`:

```prisma
model NewsCache {
  slug         String   @id
  title        String
  summary      String   @db.Text
  content      String   @db.Text
  source       String
  originalUrl  String
  enrichedAt   DateTime @default(now())
  searchVector Unsupported("tsvector")? @map("search_vector")
}
```

- [ ] **Step 2: Criar a pasta da migration e o arquivo SQL**

```bash
mkdir -p prisma/migrations/20260605000000_add_search_vectors
```

Criar o arquivo `prisma/migrations/20260605000000_add_search_vectors/migration.sql` com este conteúdo exato:

```sql
-- AddSearchVectors: tsvector columns with GIN indexes for full-text search
-- Uses GENERATED ALWAYS so PostgreSQL keeps the column in sync automatically.

ALTER TABLE "Briefing"
  ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
    to_tsvector('portuguese',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(content, '')
    )
  ) STORED;

CREATE INDEX "briefing_search_idx" ON "Briefing" USING GIN("search_vector");

ALTER TABLE "NewsCache"
  ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
    to_tsvector('portuguese',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '')
    )
  ) STORED;

CREATE INDEX "newscache_search_idx" ON "NewsCache" USING GIN("search_vector");
```

- [ ] **Step 3: Aplicar a migration e regenerar o cliente Prisma**

```bash
npx prisma migrate dev --name add_search_vectors
```

Expected output:
```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database

Applying migration `20260605000000_add_search_vectors`

The following migration(s) have been applied:

migrations/
  └─ 20260605000000_add_search_vectors/
    └─ migration.sql

Your database is now in sync with your schema.

✔ Generated Prisma Client
```

Se aparecer erro de "drift detected" porque o Prisma quer criar sua própria migration, rodar:
```bash
npx prisma migrate resolve --applied 20260605000000_add_search_vectors
npx prisma generate
```

- [ ] **Step 4: Verificar que a coluna foi criada**

```bash
npx prisma db execute --stdin <<'SQL'
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('Briefing', 'NewsCache')
  AND column_name = 'search_vector';
SQL
```

Expected: duas linhas com `column_name = search_vector` e `data_type = tsvector`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add tsvector columns + GIN indexes for full-text search"
```

---

## Task 2: Search Types + Pure Functions + Testes (TDD)

**Files:**
- Create: `lib/search/types.ts`
- Create: `lib/search/merge.ts`
- Test: `__tests__/search-merge.test.ts`

- [ ] **Step 1: Criar `lib/search/types.ts`**

```typescript
export interface SearchResult {
  type: "briefing" | "ioc" | "noticia" | "cve"
  id: string
  title: string
  href: string
  meta: string
  rank: number
  isMono?: boolean
}
```

- [ ] **Step 2: Escrever os testes que devem falhar**

Criar `__tests__/search-merge.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { detectCveId, mergeResults } from "@/lib/search/merge";
import type { SearchResult } from "@/lib/search/types";

// ── helpers ────────────────────────────────────────────────────────────────

const makeBriefing = (rank: number): SearchResult => ({
  type: "briefing",
  id: `b-${rank}`,
  title: `Briefing ${rank}`,
  href: `/threat-briefings/briefing-${rank}`,
  meta: "HIGH",
  rank,
});

const makeIoc = (rank: number, meta = "IP · HIGH"): SearchResult => ({
  type: "ioc",
  id: `i-${rank}`,
  title: `192.168.1.${rank}`,
  href: `/iocs?q=192.168.1.${rank}`,
  meta,
  rank,
  isMono: true,
});

// ── detectCveId ────────────────────────────────────────────────────────────

describe("detectCveId", () => {
  it("detects standard CVE ID", () => {
    expect(detectCveId("CVE-2024-12345")).toBe("CVE-2024-12345");
  });

  it("is case-insensitive", () => {
    expect(detectCveId("cve-2024-12345")).toBe("cve-2024-12345");
  });

  it("handles 4-digit CVE IDs", () => {
    expect(detectCveId("CVE-2024-1234")).toBe("CVE-2024-1234");
  });

  it("returns null for non-CVE strings", () => {
    expect(detectCveId("ransomware")).toBeNull();
  });

  it("returns null for incomplete CVE pattern", () => {
    expect(detectCveId("CVE-2024")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(detectCveId("  CVE-2024-1234  ")).toBe("CVE-2024-1234");
  });
});

// ── mergeResults ───────────────────────────────────────────────────────────

describe("mergeResults", () => {
  it("sorts results by rank descending", () => {
    const result = mergeResults([
      [makeBriefing(0.9), makeBriefing(0.5)],
      [makeIoc(0.7)],
    ]);
    expect(result.map((r) => r.rank)).toEqual([0.9, 0.7, 0.5]);
  });

  it("limits total output to 20", () => {
    const group = Array.from({ length: 15 }, (_, i) => makeBriefing(i / 15));
    const result = mergeResults([group, group]);
    expect(result).toHaveLength(20);
  });

  it("handles empty groups", () => {
    expect(mergeResults([[], [], [], []])).toEqual([]);
  });

  it("inserts correlated IOCs after first briefing", () => {
    const corr = makeIoc(0.7, "via CVE-2024-1234 · HIGH");
    const result = mergeResults(
      [[makeBriefing(0.9), makeBriefing(0.4)], [makeIoc(0.6)]],
      [corr]
    );
    expect(result[0].type).toBe("briefing");
    expect(result[1].meta).toContain("via CVE-2024-1234");
    expect(result[2].type).toBe("ioc"); // regular IOC stays after
  });

  it("inserts correlated IOCs at start when no briefings present", () => {
    const corr = makeIoc(0.8, "via CVE-2024-1234 · HIGH");
    const result = mergeResults([[makeIoc(0.5)], []], [corr]);
    expect(result[0].meta).toContain("via CVE");
  });

  it("works without correlated IOCs argument", () => {
    const result = mergeResults([[makeBriefing(0.9)]]);
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Verificar que os testes falham**

```bash
npx vitest run __tests__/search-merge.test.ts
```

Expected: `FAIL — Cannot find module '@/lib/search/merge'`

- [ ] **Step 4: Implementar `lib/search/merge.ts`**

```typescript
import type { SearchResult } from "./types";

const CVE_PATTERN = /^CVE-\d{4}-\d+$/i;

export function detectCveId(q: string): string | null {
  const trimmed = q.trim();
  return CVE_PATTERN.test(trimmed) ? trimmed : null;
}

export function mergeResults(
  groups: SearchResult[][],
  correlatedIocs: SearchResult[] = []
): SearchResult[] {
  const all = groups.flat().sort((a, b) => b.rank - a.rank);

  if (correlatedIocs.length === 0) {
    return all.slice(0, 20);
  }

  const firstBriefingIdx = all.findIndex((r) => r.type === "briefing");
  const insertAt = firstBriefingIdx === -1 ? 0 : firstBriefingIdx + 1;
  all.splice(insertAt, 0, ...correlatedIocs);

  return all.slice(0, 20);
}
```

- [ ] **Step 5: Verificar que os testes passam**

```bash
npx vitest run __tests__/search-merge.test.ts
```

Expected:
```
✓ __tests__/search-merge.test.ts (11)
  ✓ detectCveId (6)
  ✓ mergeResults (5)

Test Files  1 passed (1)
Tests       11 passed (11)
```

- [ ] **Step 6: Commit**

```bash
git add lib/search/ __tests__/search-merge.test.ts
git commit -m "feat(search): add SearchResult type + merge/detectCveId pure functions with tests"
```

---

## Task 3: API Route `/api/search`

**Files:**
- Create: `app/api/search/route.ts`

- [ ] **Step 1: Criar `app/api/search/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { detectCveId, mergeResults } from "@/lib/search/merge";
import type { SearchResult } from "@/lib/search/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const { allowed, retryAfterMs } = checkRateLimit(`search:${ip}`, 60, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [], total: 0 });
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const cveId = detectCveId(q);

    type BriefingRow = {
      id: string;
      title: string;
      slug: string;
      severity: string;
      rank: number;
    };
    type NewsRow = {
      slug: string;
      title: string;
      source: string;
      rank: number;
    };

    const [briefingRes, iocRes, newsRes, cveRes] = await Promise.allSettled([
      prisma.$queryRaw<BriefingRow[]>`
        SELECT id, title, slug, severity::text,
          ts_rank(search_vector, plainto_tsquery('portuguese', ${q})) AS rank
        FROM "Briefing"
        WHERE status = 'published'
          AND search_vector @@ plainto_tsquery('portuguese', ${q})
        ORDER BY rank DESC
        LIMIT 5
      `,
      prisma.ioc.findMany({
        where: {
          OR: [
            { value: { contains: q, mode: "insensitive" } },
            { normalized: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { briefing: { select: { slug: true, severity: true } } },
      }),
      prisma.$queryRaw<NewsRow[]>`
        SELECT slug, title, source,
          ts_rank(search_vector, plainto_tsquery('portuguese', ${q})) AS rank
        FROM "NewsCache"
        WHERE search_vector @@ plainto_tsquery('portuguese', ${q})
        ORDER BY rank DESC
        LIMIT 5
      `,
      prisma.cveCache.findMany({
        where: {
          OR: [
            { id: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 5,
        orderBy: { published: "desc" },
      }),
    ]);

    const briefings: SearchResult[] =
      briefingRes.status === "fulfilled"
        ? briefingRes.value.map((r) => ({
            type: "briefing",
            id: r.id,
            title: r.title,
            href: `/threat-briefings/${r.slug}`,
            meta: r.severity.toUpperCase(),
            rank: Number(r.rank),
          }))
        : [];

    const iocs: SearchResult[] =
      iocRes.status === "fulfilled"
        ? iocRes.value.map((r) => ({
            type: "ioc",
            id: r.id,
            title: r.value,
            href: `/iocs?q=${encodeURIComponent(r.value)}`,
            meta: `${r.type.toUpperCase()} · ${r.briefing.severity.toUpperCase()}`,
            rank: 0.5,
            isMono: true,
          }))
        : [];

    const noticias: SearchResult[] =
      newsRes.status === "fulfilled"
        ? newsRes.value.map((r) => ({
            type: "noticia",
            id: r.slug,
            title: r.title,
            href: `/noticias/${r.slug}`,
            meta: r.source,
            rank: Number(r.rank),
          }))
        : [];

    const cves: SearchResult[] =
      cveRes.status === "fulfilled"
        ? cveRes.value.map((r) => ({
            type: "cve",
            id: r.id,
            title: r.id,
            href: `/cves?q=${encodeURIComponent(r.id)}`,
            meta: r.severity ? r.severity.toUpperCase() : "N/A",
            rank: r.id.toLowerCase() === q.toLowerCase() ? 1 : 0.3,
            isMono: true,
          }))
        : [];

    let correlatedIocs: SearchResult[] = [];
    if (cveId) {
      try {
        const corr = await prisma.ioc.findMany({
          where: { briefing: { cves: { has: cveId.toUpperCase() } } },
          take: 5,
          include: { briefing: { select: { slug: true, severity: true } } },
        });
        correlatedIocs = corr.map((r) => ({
          type: "ioc",
          id: r.id,
          title: r.value,
          href: `/iocs?q=${encodeURIComponent(r.value)}`,
          meta: `via ${cveId.toUpperCase()} · ${r.briefing.severity.toUpperCase()}`,
          rank: 0.7,
          isMono: true,
        }));
      } catch {
        // best-effort: proceed without correlated IOCs
      }
    }

    const results = mergeResults([briefings, iocs, noticias, cves], correlatedIocs);
    return NextResponse.json({ results, total: results.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("P1001")) {
      return NextResponse.json({ error: "Banco de dados indisponível" }, { status: 503 });
    }
    console.error("[search] Unexpected error:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Testar a rota manualmente**

Com o servidor de desenvolvimento em execução (`npm run dev`), executar:

```bash
curl "http://localhost:3000/api/search?q=ransomware" | npx -y json
```

Expected: `{ "results": [...], "total": <número> }` com resultados de briefings, IOCs ou notícias.

```bash
curl "http://localhost:3000/api/search?q=CVE-2024-1234" | npx -y json
```

Expected: resultado com `results` contendo entradas com `meta: "via CVE-2024-1234..."` se existir correlação.

```bash
curl "http://localhost:3000/api/search?q=a" | npx -y json
```

Expected: `{ "results": [], "total": 0 }` (menos de 2 chars).

- [ ] **Step 3: Commit**

```bash
git add app/api/search/
git commit -m "feat(api): add GET /api/search with parallel FTS + CVE correlation"
```

---

## Task 4: Hook `useSearch`

**Files:**
- Create: `components/search/useSearch.ts`

- [ ] **Step 1: Criar `components/search/useSearch.ts`**

```typescript
"use client";

import { useState, useEffect } from "react";
import type { SearchResult } from "@/lib/search/types";

interface UseSearchReturn {
  results: SearchResult[];
  total: number;
  loading: boolean;
  error: string | null;
}

export function useSearch(query: string): UseSearchReturn {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setTotal(0);
      setError(null);
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setTotal(data.total ?? 0);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError("Erro ao buscar. Tente novamente.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { results, total, loading, error };
}
```

- [ ] **Step 2: Commit**

```bash
git add components/search/useSearch.ts
git commit -m "feat(search): add useSearch hook with 300ms debounce and AbortController"
```

---

## Task 5: Componente `SearchResult`

**Files:**
- Create: `components/search/SearchResult.tsx`

- [ ] **Step 1: Criar `components/search/SearchResult.tsx`**

```tsx
"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { SearchResult } from "@/lib/search/types";

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  briefing: "Briefing",
  ioc: "IOC",
  noticia: "Notícia",
  cve: "CVE",
};

const TYPE_COLOR: Record<SearchResult["type"], string> = {
  briefing: "bg-red-500/20 text-red-400 border-red-500/30",
  ioc: "bg-green-500/20 text-green-400 border-green-500/30",
  noticia: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  cve: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

interface Props {
  result: SearchResult;
  selected: boolean;
  onSelect: () => void;
}

export function SearchResultCard({ result, selected, onSelect }: Props) {
  return (
    <Link
      href={result.href}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
        selected ? "bg-white/10" : "hover:bg-white/5"
      )}
    >
      <span
        className={cn(
          "shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border",
          TYPE_COLOR[result.type]
        )}
      >
        {TYPE_LABEL[result.type]}
      </span>

      <span
        className={cn(
          "flex-1 text-sm truncate",
          result.isMono
            ? "font-mono text-green-400"
            : "text-white"
        )}
      >
        {result.title}
      </span>

      <span className="shrink-0 text-xs text-neutral-500 truncate max-w-[140px]">
        {result.meta}
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/search/SearchResult.tsx
git commit -m "feat(search): add SearchResultCard component with type badges"
```

---

## Task 6: Componente `SearchOverlay`

**Files:**
- Create: `components/search/SearchOverlay.tsx`

Depende de: `useSearch`, `SearchResultCard`, `@radix-ui/react-dialog`, `lucide-react`, `next/navigation`.

- [ ] **Step 1: Criar `components/search/SearchOverlay.tsx`**

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import { useSearch } from "./useSearch";
import { SearchResultCard } from "./SearchResult";

export function SearchOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const { results, total, loading, error } = useSearch(query);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIdx(-1);
  }, [results]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setSelectedIdx(-1);
  }, []);

  // Cmd/Ctrl+K to open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Custom event from Header search icon
  useEffect(() => {
    const onOpen = () => setIsOpen(true);
    window.addEventListener("open-search", onOpen);
    return () => window.removeEventListener("open-search", onOpen);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && selectedIdx >= 0 && results[selectedIdx]) {
      router.push(results[selectedIdx].href);
      handleClose();
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); else setIsOpen(true); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed top-[18%] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-2xl z-50 bg-[#0A0A0A] border border-neutral-800 rounded-xl shadow-2xl overflow-hidden focus:outline-none"
          onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}
          onKeyDown={handleKeyDown}
          aria-label="Busca global"
        >
          <Dialog.Title className="sr-only">Busca global</Dialog.Title>

          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-neutral-800">
            <Search size={16} className="shrink-0 text-neutral-500" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar CVEs, IOCs, briefings, notícias…"
              className="flex-1 bg-transparent text-sm text-white placeholder-neutral-500 outline-none"
              aria-label="Termo de busca"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="shrink-0 text-neutral-500 hover:text-white transition-colors"
                aria-label="Limpar busca"
              >
                <X size={14} aria-hidden />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-neutral-500 bg-neutral-900 border border-neutral-700 rounded font-mono">
              ESC
            </kbd>
          </div>

          {/* Results area */}
          <div className="max-h-[420px] overflow-y-auto p-2">
            {query.length < 2 && (
              <p className="px-4 py-8 text-sm text-neutral-500 text-center">
                Digite para buscar CVEs, IOCs, briefings e notícias…
              </p>
            )}

            {query.length >= 2 && loading && (
              <div className="space-y-1 p-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 rounded-lg bg-white/5 animate-pulse"
                  />
                ))}
              </div>
            )}

            {query.length >= 2 && !loading && error && (
              <p className="px-4 py-8 text-sm text-red-400 text-center">{error}</p>
            )}

            {query.length >= 2 && !loading && !error && results.length === 0 && (
              <p className="px-4 py-8 text-sm text-neutral-500 text-center">
                Nenhum resultado para{" "}
                <span className="text-white font-mono">"{query}"</span>
              </p>
            )}

            {results.length > 0 && (
              <>
                <p className="px-4 pt-2 pb-1 text-[11px] text-neutral-500">
                  {total} resultado{total !== 1 ? "s" : ""}
                </p>
                {results.map((result, idx) => (
                  <SearchResultCard
                    key={`${result.type}-${result.id}`}
                    result={result}
                    selected={selectedIdx === idx}
                    onSelect={handleClose}
                  />
                ))}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-neutral-800 text-[11px] text-neutral-600">
            <span className="flex items-center gap-1.5">
              <kbd className="px-1 py-0.5 bg-neutral-900 border border-neutral-700 rounded font-mono">↑↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1 py-0.5 bg-neutral-900 border border-neutral-700 rounded font-mono">↵</kbd>
              abrir
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1 py-0.5 bg-neutral-900 border border-neutral-700 rounded font-mono">ESC</kbd>
              fechar
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/search/SearchOverlay.tsx
git commit -m "feat(search): add SearchOverlay modal with Cmd+K, keyboard nav, and all states"
```

---

## Task 7: Wire Up — Layout + Header

**Files:**
- Modify: `app/layout.tsx`
- Modify: `components/layout/Header.tsx`

- [ ] **Step 1: Montar o `SearchOverlay` em `app/layout.tsx`**

Adicionar a import no topo de `app/layout.tsx`:

```typescript
import { SearchOverlay } from "@/components/search/SearchOverlay";
```

Substituir o bloco `<body>` atual:

```tsx
// ANTES:
<body className="min-h-screen flex flex-col" style={{ backgroundColor: "#050505", color: "#F5F5F5" }}>
  <a href="#main-content" ...>Pular para conteúdo</a>
  <Header />
  <div id="main-content" className="flex-1 flex flex-col">{children}</div>
  <Footer />
</body>

// DEPOIS:
<body className="min-h-screen flex flex-col" style={{ backgroundColor: "#050505", color: "#F5F5F5" }}>
  <a
    href="#main-content"
    className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-red-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg text-sm font-semibold"
  >
    Pular para conteúdo
  </a>
  <Header />
  <div id="main-content" className="flex-1 flex flex-col">{children}</div>
  <Footer />
  <SearchOverlay />
</body>
```

O arquivo completo `app/layout.tsx` após a mudança:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono, Playfair_Display, Lora } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { SearchOverlay } from "@/components/search/SearchOverlay";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Statecraft Cyber",
    template: "%s | Statecraft Cyber",
  },
  description:
    "Plataforma de threat intelligence em PT-BR. CVEs, briefings operacionais, IOCs e notícias de segurança de fontes abertas e feeds especializados.",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Statecraft Cyber",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable} ${playfair.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-screen flex flex-col" style={{ backgroundColor: "#050505", color: "#F5F5F5" }}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-red-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg text-sm font-semibold"
        >
          Pular para conteúdo
        </a>
        <Header />
        <div id="main-content" className="flex-1 flex flex-col">{children}</div>
        <Footer />
        <SearchOverlay />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Adicionar ícone de busca no `Header.tsx`**

Adicionar `Search` ao import do lucide-react na linha 6:

```typescript
import { Menu, X, Search } from "lucide-react";
```

Substituir o bloco `{/* CTA */}` (linhas 82–90) pelo seguinte:

```tsx
{/* CTA + Search */}
<div className="hidden md:flex items-center gap-2">
  <button
    onClick={() => window.dispatchEvent(new Event("open-search"))}
    className="p-2 text-neutral-400 hover:text-white transition-colors rounded"
    aria-label="Abrir busca global (Ctrl+K)"
    title="Buscar (Ctrl+K)"
  >
    <Search size={18} aria-hidden />
  </button>
  <Link
    href="/threat-briefings"
    className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white rounded transition-all duration-200 hover:shadow-[0_0_20px_rgba(229,9,20,0.4)]"
  >
    Ver Briefings
  </Link>
</div>
```

No menu mobile, adicionar o botão de busca antes do `Ver Briefings` (dentro do `div.pt-3.border-t`):

```tsx
<div className="pt-3 border-t border-white/5 space-y-2">
  <button
    onClick={() => {
      setMobileOpen(false);
      window.dispatchEvent(new Event("open-search"));
    }}
    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-neutral-400 hover:text-white rounded transition-colors"
  >
    <Search size={16} aria-hidden />
    Buscar
  </button>
  <Link
    href="/threat-briefings"
    className="block w-full text-center px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded"
    onClick={() => setMobileOpen(false)}
  >
    Ver Briefings
  </Link>
</div>
```

- [ ] **Step 3: Verificar build sem erros**

```bash
npx tsc --noEmit
```

Expected: sem erros de tipagem.

- [ ] **Step 4: Testar no browser**

Iniciar o servidor de desenvolvimento:

```bash
npm run dev
```

Abrir `http://localhost:3000` e verificar:
1. Ícone de lupa aparece na navbar (desktop), ao lado de "Ver Briefings"
2. Clicar no ícone abre o modal
3. Cmd+K (ou Ctrl+K) abre o modal
4. Digitar menos de 2 chars mostra placeholder
5. Digitar "ransomware" exibe skeleton → resultados com badges coloridos
6. `↑`/`↓` navega entre os resultados (o item selecionado fica com fundo claro)
7. `Enter` navega para o href do resultado selecionado e fecha o modal
8. `Esc` fecha o modal e limpa o input
9. Clicar fora do painel fecha o modal
10. No mobile: menu hamburguer tem botão "Buscar" que abre o overlay

- [ ] **Step 5: Commit final**

```bash
git add app/layout.tsx components/layout/Header.tsx
git commit -m "feat(search): wire up SearchOverlay in layout and add search icon to Header"
```

---

## Self-Review

### Spec coverage

| Requisito do spec | Task que implementa |
|---|---|
| Motor: PostgreSQL FTS (tsvector + GIN) | Task 1 |
| UI: ícone na navbar abre overlay, Cmd+K | Task 6 + Task 7 |
| Resultados: lista unificada com badge por tipo | Task 5 |
| Correlação CVE ID → IOCs de briefings relacionados | Task 3 |
| Queries em paralelo com allSettled | Task 3 |
| Debounce 300ms | Task 4 |
| Max 5 por tipo, max 20 total | Task 2 (mergeResults) + Task 3 (LIMIT 5 no SQL) |
| Navegação ↑↓ + Enter + Esc | Task 6 |
| Estados: loading (skeleton), empty, error | Task 6 |
| Meta: correlated IOCs com `via <CVE>` | Task 3 |
| Arquivos novos: api/search, SearchOverlay, SearchResult, useSearch | Tasks 3-6 |
| Migration tsvector + GIN | Task 1 |
| Prisma schema com Unsupported("tsvector") | Task 1 |

Cobertura completa. ✓

### Placeholder scan

Nenhum "TBD", "TODO", "implement later", ou "add appropriate error handling" sem código real. ✓

### Type consistency

- `SearchResult` definido em `lib/search/types.ts` (Task 2) e usado em `merge.ts` (Task 2), `route.ts` (Task 3), `useSearch.ts` (Task 4), `SearchResult.tsx` (Task 5), `SearchOverlay.tsx` (Task 6). ✓
- `SearchResultCard` exportado de `SearchResult.tsx` e importado em `SearchOverlay.tsx` com o mesmo nome. ✓
- `useSearch` exportado de `useSearch.ts` e importado em `SearchOverlay.tsx`. ✓
- `detectCveId` e `mergeResults` exportados de `merge.ts` e importados em `route.ts` e testados em `search-merge.test.ts`. ✓
- `SearchOverlay` exportado de `SearchOverlay.tsx` e importado em `layout.tsx`. ✓
