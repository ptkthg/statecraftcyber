# Redesign Bento "Painel Acionável" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o spec `docs/superpowers/specs/2026-06-12-redesign-bento-painel-acionavel.md` — redesign completo: tokens scarlet/grafite, Sora+Geist+Geist Mono, home bento com críticos dominantes, páginas internas na linguagem "painel acionável".

**Architecture:** Tokens novos em `globals.css` (Tailwind v4 `@theme inline`); fontes via next/font em `layout.tsx`; componentes base novos em `components/ui/` (BentoCard, Tag, FilterPill, PageHeader) consumidos por todas as páginas; dados derivados da home em `lib/home-stats.ts` (funções puras testadas + queries Prisma com fallback). Páginas redesenhadas consumindo os componentes base.

**Tech Stack:** Next.js App Router, Tailwind CSS v4, next/font (Sora, Geist, Geist_Mono), Prisma, Vitest.

**Referência visual obrigatória:** `docs/superpowers/mockups/2026-06-12-bento-mockup.html` (Task 0) — abrir no navegador antes de cada task de página. Os valores exatos de CSS (cores, radius, sombras, transições) estão lá.

---

## Tabela de migração de tokens (usar em TODAS as tasks)

| Antigo | Novo |
|---|---|
| `#E50914` / `bg-red-600` decorativo | `var(--primary)` #FF2D46 via utilities `bg-brand`/`text-brand` |
| `text-red-400`/`text-red-500` em tags/labels de alerta | `text-brand-soft` (#FF6B7A) |
| links de ação/setas em cards | `text-cold` (#7FA3B8) |
| `--bg #0A0A0A` | `#0B0B0D` |
| `--bg-raised #111113` | `#131316` |
| `--bg-overlay #1A1A1D` | `#1B1B20` |
| `--text-body #B8B8C0` | `#C2C2CB` |
| `--text-dim #76767F` | `#8E8E99` |
| `font-mono` (JetBrains) | Geist Mono (mesma classe `font-mono`, fonte trocada no layout) |
| headlines `font-bold tracking-tight` (Geist) | `font-display font-bold tracking-tight` (Sora) — apenas h1/h2 de página e números grandes |
| cards `rounded-xl`/`rounded-lg` + `card-dark` | componente `BentoCard` (radius 20px) |

**Severidade semântica** (badges/dots críticos, CVSS, confiança, KEV): permanece vermelha — mas o vermelho agora é `--primary`/`--primary-soft` (herdado automaticamente onde se usa `bg-red-600`? NÃO — substituir `red-600`→`brand` nos pontos semânticos para herdar o scarlet).

---

### Task 0: Mockup de referência no repositório

**Files:**
- Create: `docs/superpowers/mockups/2026-06-12-bento-mockup.html`

- [ ] **Step 1:** Copiar `C:\Users\User\AppData\Local\Temp\statecraft-options\index.html` para `docs/superpowers/mockups/2026-06-12-bento-mockup.html`.
- [ ] **Step 2:** Commit:
```bash
git add docs/superpowers/mockups/
git commit -m "docs: add approved bento mockup as design reference"
```

---

### Task 1: lib/home-stats.ts — funções puras (TDD)

**Files:**
- Create: `lib/home-stats.ts`
- Test: `__tests__/home-stats.test.ts`

- [ ] **Step 1: Escrever os testes (devem falhar)**

```ts
// __tests__/home-stats.test.ts
import { describe, it, expect } from "vitest";
import { classifyNewsTitle, aggregateRegions, summarizeCriticalTags } from "@/lib/home-stats";

describe("classifyNewsTitle", () => {
  it("classifica títulos acionáveis como alert", () => {
    expect(classifyNewsTitle("Microsoft corrige 67 falhas no Patch Tuesday")).toBe("alert");
    expect(classifyNewsTitle("Cisco publica patch para falha explorada")).toBe("alert");
    expect(classifyNewsTitle("Fortinet: atualização urgente para FortiOS")).toBe("alert");
    expect(classifyNewsTitle("Falha zero-day explorada ativamente em VPNs")).toBe("alert");
  });
  it("classifica o resto como context", () => {
    expect(classifyNewsTitle("Nacional ucraniano admite envolvimento em ransomware")).toBe("context");
    expect(classifyNewsTitle("ANPD multa empresa por vazamento de dados")).toBe("context");
  });
});

describe("aggregateRegions", () => {
  it("agrega briefings por região com contagem por severidade", () => {
    const rows = aggregateRegions([
      { affectedRegions: ["Europa"], severity: "critical" },
      { affectedRegions: ["Europa", "LATAM"], severity: "low" },
      { affectedRegions: ["LATAM"], severity: "medium" },
    ]);
    expect(rows).toEqual([
      { region: "Europa", critical: 1, medium: 0, low: 1, total: 2 },
      { region: "LATAM", critical: 0, medium: 1, low: 1, total: 2 },
    ]);
  });
  it("conta high como medium (3 faixas visuais) e ordena por críticos depois total", () => {
    const rows = aggregateRegions([
      { affectedRegions: ["Ásia"], severity: "high" },
      { affectedRegions: ["Global"], severity: "critical" },
    ]);
    expect(rows[0].region).toBe("Global");
    expect(rows[1]).toEqual({ region: "Ásia", critical: 0, medium: 1, low: 0, total: 1 });
  });
  it("retorna lista vazia sem briefings", () => {
    expect(aggregateRegions([])).toEqual([]);
  });
});

describe("summarizeCriticalTags", () => {
  it("monta resumo a partir das tags dos críticos", () => {
    const s = summarizeCriticalTags([
      { tags: ["exploração-ativa", "cisa-kev"] },
      { tags: ["ransomware"] },
      { tags: ["exploração-ativa"] },
    ]);
    expect(s).toBe("2 explorados ativamente · 1 com ransomware · 1 no KEV/CISA");
  });
  it("omite categorias zeradas e retorna null se todas zeradas", () => {
    expect(summarizeCriticalTags([{ tags: ["ransomware"] }])).toBe("1 com ransomware");
    expect(summarizeCriticalTags([{ tags: ["phishing"] }])).toBeNull();
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run __tests__/home-stats.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// lib/home-stats.ts
// Funções puras dos dados derivados da home (spec 2026-06-12 §7). Queries ficam em getHomeStats.

const ALERT_PATTERNS = /(corrige|patch|atualiza[çc][ãa]o|urgente|explorad[ao]|exploit|zero-day|kev|mitiga[çc][ãa]o)/i;

export function classifyNewsTitle(title: string): "alert" | "context" {
  return ALERT_PATTERNS.test(title) ? "alert" : "context";
}

export interface RegionRow {
  region: string;
  critical: number;
  medium: number;
  low: number;
  total: number;
}

export function aggregateRegions(
  briefings: { affectedRegions: string[]; severity: string }[]
): RegionRow[] {
  const map = new Map<string, RegionRow>();
  for (const b of briefings) {
    for (const region of b.affectedRegions) {
      const row = map.get(region) ?? { region, critical: 0, medium: 0, low: 0, total: 0 };
      if (b.severity === "critical") row.critical++;
      else if (b.severity === "high" || b.severity === "medium") row.medium++;
      else row.low++;
      row.total++;
      map.set(region, row);
    }
  }
  return [...map.values()].sort((a, b) => b.critical - a.critical || b.total - a.total);
}

const TAG_BUCKETS: { pattern: RegExp; label: (n: number) => string }[] = [
  { pattern: /explora[çc][ãa]o-?ativa|actively-?exploited/i, label: (n) => `${n} explorado${n > 1 ? "s" : ""} ativamente` },
  { pattern: /ransomware/i, label: (n) => `${n} com ransomware` },
  { pattern: /cisa-?kev|kev/i, label: (n) => `${n} no KEV/CISA` },
];

export function summarizeCriticalTags(briefings: { tags: string[] }[]): string | null {
  const parts: string[] = [];
  for (const bucket of TAG_BUCKETS) {
    const n = briefings.filter((b) => b.tags.some((t) => bucket.pattern.test(t))).length;
    if (n > 0) parts.push(bucket.label(n));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
```

- [ ] **Step 4:** Run: `npx vitest run __tests__/home-stats.test.ts` → PASS (7 testes). Depois `npx vitest run` → suíte inteira verde.

- [ ] **Step 5: Adicionar a query agregadora (sem teste unitário — é I/O com fallback)**

Acrescentar ao final de `lib/home-stats.ts`:

```ts
export interface HomeStats {
  criticalCount: number;
  criticalDelta24h: number;
  criticalSummary: string | null;
  criticalLatest: { slug: string; title: string; tags: string[]; createdAt: Date; sourceName: string }[];
  briefingsTotal: number;
  briefingsWeek: number;
  cvesToday: number;
  cvesKevToday: number;
  cvesPerDay: { day: string; count: number }[]; // 7 entradas, day = "seg".."dom"
  iocsTotal: number;
  regions: RegionRow[];
  latestBriefingSlug: string | null;
  lastRunAt: Date | null;
}

const DAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export async function getHomeStats(): Promise<HomeStats> {
  const empty: HomeStats = {
    criticalCount: 0, criticalDelta24h: 0, criticalSummary: null, criticalLatest: [],
    briefingsTotal: 0, briefingsWeek: 0, cvesToday: 0, cvesKevToday: 0,
    cvesPerDay: [], iocsTotal: 0, regions: [], latestBriefingSlug: null, lastRunAt: null,
  };
  try {
    const { prisma } = await import("@/lib/prisma");
    const now = Date.now();
    const d1 = new Date(now - 24 * 3600_000);
    const d7 = new Date(now - 7 * 24 * 3600_000);

    const [criticals, briefingsTotal, briefingsWeek, cvesToday, cvesKevToday, recentCves, iocsTotal, regionRows, latest, lastRun] =
      await Promise.all([
        prisma.briefing.findMany({
          where: { status: "published", severity: "critical", createdAt: { gte: d7 } },
          orderBy: { createdAt: "desc" },
          select: { slug: true, title: true, tags: true, createdAt: true, sourceName: true },
        }),
        prisma.briefing.count({ where: { status: "published" } }),
        prisma.briefing.count({ where: { status: "published", createdAt: { gte: d7 } } }),
        prisma.cveCache.count({ where: { published: { gte: d1 } } }),
        prisma.cveCache.count({ where: { published: { gte: d1 }, inCisaKev: true } }),
        prisma.cveCache.findMany({ where: { published: { gte: d7 } }, select: { published: true } }),
        prisma.ioc.count(),
        prisma.briefing.findMany({
          where: { status: "published", createdAt: { gte: d7 } },
          select: { affectedRegions: true, severity: true },
        }),
        prisma.briefing.findFirst({
          where: { status: "published" }, orderBy: { createdAt: "desc" }, select: { slug: true },
        }),
        prisma.cronLog.findFirst({ where: { success: true }, orderBy: { runAt: "desc" }, select: { runAt: true } }),
      ]);

    const perDay = new Map<string, number>();
    for (const c of recentCves) {
      const key = c.published.toISOString().slice(0, 10);
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    const cvesPerDay = [...Array(7)].map((_, i) => {
      const d = new Date(now - (6 - i) * 24 * 3600_000);
      return { day: DAY_LABELS[d.getDay()], count: perDay.get(d.toISOString().slice(0, 10)) ?? 0 };
    });

    return {
      criticalCount: criticals.length,
      criticalDelta24h: criticals.filter((c) => c.createdAt >= d1).length,
      criticalSummary: summarizeCriticalTags(criticals),
      criticalLatest: criticals.slice(0, 3),
      briefingsTotal, briefingsWeek, cvesToday, cvesKevToday, cvesPerDay,
      iocsTotal,
      regions: aggregateRegions(regionRows).slice(0, 4),
      latestBriefingSlug: latest?.slug ?? null,
      lastRunAt: lastRun?.runAt ?? null,
    };
  } catch {
    return empty;
  }
}
```

- [ ] **Step 6:** Run: `npx vitest run` → verde. Commit:
```bash
git add lib/home-stats.ts __tests__/home-stats.test.ts
git commit -m "feat: add home stats derivation with tested pure helpers"
```

---

### Task 2: Tokens e fontes

**Files:**
- Modify: `app/globals.css` (bloco de tema, linhas 1–39)
- Modify: `app/layout.tsx`

- [ ] **Step 1: globals.css — novos tokens**

Substituir o bloco `@theme inline` + `:root` por:

```css
@theme inline {
  --color-canvas: var(--bg);
  --color-raised: var(--bg-raised);
  --color-overlay: var(--bg-overlay);
  --color-ink: var(--text);
  --color-body: var(--text-body);
  --color-dim: var(--text-dim);
  --color-brand: var(--primary);
  --color-brand-soft: var(--primary-soft);
  --color-cold: var(--cold);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-display: var(--font-sora);
}

:root {
  --bg: #0B0B0D;
  --bg-raised: #131316;
  --bg-overlay: #1B1B20;
  --text: #F4F4F5;
  --text-body: #C2C2CB;
  --text-dim: #8E8E99;
  --primary: #FF2D46;
  --primary-soft: #FF6B7A;
  --primary-rgb: 255, 45, 70;
  --cold: #7FA3B8;
  --line: rgba(255, 255, 255, 0.05);
}
```

(`--font-jetbrains-mono` sai do `@theme`.) Manter html/body/scrollbar como estão (já usam vars).

- [ ] **Step 2: globals.css — substituir vermelhos hardcoded restantes**

`git grep -n 'E50914\|ff3344' -- app/globals.css` → trocar `#E50914` por `var(--primary)` e `#ff3344` (hover de link em prosa) por `var(--primary-soft)`.

- [ ] **Step 3: layout.tsx — fontes**

```tsx
import { Geist, Geist_Mono, Sora, Lora } from "next/font/google";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });
const lora = Lora({ variable: "--font-lora", subsets: ["latin"], display: "swap" });
```

`<html className={...}>` recebe `${sora.variable}` e perde `${jetbrainsMono.variable}`. Remover o bloco `const jetbrainsMono`.

- [ ] **Step 4:** `git grep -in 'jetbrains' -- app components` → vazio (se aparecer em components, trocar `var(--font-jetbrains-mono)`/`font-mono` continua funcionando pois `--font-mono` agora aponta para Geist Mono; remover referências diretas à var antiga).
`npx vitest run` → verde. `npm run build` → ok.

- [ ] **Step 5:** Commit:
```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: scarlet/graphite tokens, Sora display, Geist Mono"
```

---

### Task 3: Componentes base — BentoCard, Tag, FilterPill, PageHeader

**Files:**
- Create: `components/ui/BentoCard.tsx`
- Create: `components/ui/Tag.tsx`
- Create: `components/ui/FilterPill.tsx`
- Create: `components/ui/PageHeader.tsx`

- [ ] **Step 1: BentoCard**

```tsx
// components/ui/BentoCard.tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  className?: string;
  /** Quando presente, o card inteiro é clicável e mostra o footlink (UX hard rule: affordance). */
  href?: string;
  /** Texto do footlink — obrigatório junto com href. */
  action?: string;
  /** Label uppercase do canto sup. esquerdo. */
  label?: string;
  labelClassName?: string;
  /** Período padronizado do canto sup. direito (ex.: "últimas 24h"). */
  period?: string;
}

export function BentoCard({ children, className, href, action, label, labelClassName, period }: Props) {
  const inner = (
    <>
      {(label || period) && (
        <div className="flex items-center justify-between mb-3">
          {label && (
            <span className={cn("text-[11px] font-bold uppercase tracking-[0.1em] text-dim", labelClassName)}>
              {label}
            </span>
          )}
          {period && <span className="text-[11px] font-mono text-dim">{period}</span>}
        </div>
      )}
      {children}
      {href && action && (
        <span className="mt-auto flex items-center gap-1.5 pt-3.5 text-[12.5px] font-semibold text-cold transition-colors group-hover:text-white">
          {action}
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      )}
    </>
  );
  const base = cn(
    "relative flex flex-col overflow-hidden rounded-[20px] border border-white/[0.05] bg-raised p-6",
    "transition-all duration-200",
    href && "group cursor-pointer hover:-translate-y-0.5 hover:bg-overlay hover:border-white/10 hover:shadow-[0_8px_28px_rgba(0,0,0,0.45)]",
    className
  );
  return href ? <Link href={href} className={base}>{inner}</Link> : <div className={base}>{inner}</div>;
}
```

- [ ] **Step 2: Tag**

```tsx
// components/ui/Tag.tsx
import type { ReactNode } from "react";

type Variant = "alert" | "warn" | "info" | "plain" | "solid";

const STYLES: Record<Variant, string> = {
  alert: "bg-[rgba(var(--primary-rgb),0.14)] text-brand-soft",
  warn:  "bg-yellow-600/15 text-yellow-400",
  info:  "bg-[rgba(127,163,184,0.12)] text-cold",
  plain: "bg-white/[0.06] text-dim",
  solid: "bg-brand text-white",
};

export function Tag({ variant = "plain", children }: { variant?: Variant; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${STYLES[variant]}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 3: FilterPill**

```tsx
// components/ui/FilterPill.tsx
"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  active?: boolean;
  /** Pílula de severidade crítica: ativo fica vermelho semântico. */
  critical?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export function FilterPill({ active, critical, onClick, children }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-4 py-1.5 text-[12.5px] font-semibold transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
        active
          ? critical
            ? "border-[rgba(var(--primary-rgb),0.4)] bg-[rgba(var(--primary-rgb),0.16)] text-brand-soft"
            : "border-white/20 bg-white/10 text-white"
          : "border-white/[0.05] text-dim hover:border-white/15 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: PageHeader**

```tsx
// components/ui/PageHeader.tsx
import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  description?: string;
  /** Itens meta em mono (ex.: "142 publicados · 5 críticos"). O primeiro com `live` ganha dot pulsante. */
  meta?: { text: string; live?: boolean }[];
  children?: ReactNode; // breadcrumb/tags acima do título
}

export function PageHeader({ title, description, meta, children }: Props) {
  return (
    <div className="pb-7 pt-2">
      {children}
      <h1 className="font-display text-[32px] font-bold tracking-tight text-ink mb-2">{title}</h1>
      {description && <p className="max-w-2xl text-[14.5px] leading-relaxed text-body">{description}</p>}
      {meta && meta.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11.5px] text-dim">
          {meta.map((m, i) => (
            <span key={i} className={m.live ? "flex items-center gap-2 text-body" : undefined}>
              {m.live && <span className="h-[7px] w-[7px] rounded-full bg-brand pulse-dot" aria-hidden />}
              {m.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5:** `npx vitest run` → verde; `npm run build` → ok (componentes ainda não usados, só compilam). Commit:
```bash
git add components/ui/
git commit -m "feat: add bento base components (BentoCard, Tag, FilterPill, PageHeader)"
```

---

### Task 4: Header e Footer

**Files:**
- Modify: `components/layout/Header.tsx`
- Modify: `components/layout/Footer.tsx`

- [ ] **Step 1: Header**

- `navItems` vira: `[{ label: "Visão geral", href: "/" }, { label: "Briefings", href: "/threat-briefings" }, { label: "Notícias", href: "/noticias" }, { label: "Vulnerabilidades", href: "/cves", hint: "CVE" }, { label: "Indicadores", href: "/iocs", hint: "IOC" }, { label: "Sobre", href: "/sobre" }]`. Renderizar `hint` como `<span className="ml-1 text-[10px] text-dim/70">{hint}</span>`.
- Item ativo: `text-white font-semibold border-b-2 border-brand` (sublinhado vermelho, sem rounded). Inativo: `text-dim hover:text-white`.
- O CTA vermelho "Ver Briefings" SAI. No lugar: botão de busca outline `border border-white/15 rounded-full px-4 py-1.5 text-[13px] font-semibold text-ink hover:bg-overlay` com conteúdo `Buscar ⌘K` (mantém `onClick` que dispara `open-search`). Mobile mantém o item de busca textual; o link "Ver Briefings" do menu mobile vira link normal da lista.
- Logo: wordmark passa a `font-display` (Sora); estrutura do radar inalterada.

- [ ] **Step 2: Footer** — wordmark `font-display`; nada mais estrutural.

- [ ] **Step 3:** `npx vitest run` → verde. Verificar `git grep -n 'bg-red-600' -- components/layout/` → só o que for logo. Commit:
```bash
git add components/layout/
git commit -m "feat: redesigned nav with explicit labels and search button"
```

---

### Task 5: Home bento (app/page.tsx)

**Files:**
- Modify: `app/page.tsx` (reescrita do JSX; mantém `getCachedHomeNews`)
- Delete usage: `components/radar/RadarMap` sai da home (arquivo permanece — logo não o usa, mas não deletar o arquivo nesta task)

- [ ] **Step 1: Reescrever o page component**

Estrutura (substitui todo o JSX; data-fetching: `getHomeStats()` da Task 1 + `getCachedHomeNews` existente + `classifyNewsTitle` para separar alertas):

```tsx
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { BentoCard } from "@/components/ui/BentoCard";
import { Tag } from "@/components/ui/Tag";
import { getHomeStats, classifyNewsTitle } from "@/lib/home-stats";
import { fetchNewsArticles } from "@/lib/news-feeds";
// ... manter getCachedHomeNews atual (sem mudanças), aumentar take para 8

function formatTimeAgo(date: Date): string { /* manter o atual */ }

export default async function HomePage() {
  const [stats, news] = await Promise.all([getHomeStats(), getCachedHomeNews()]);
  const alerts = news.filter((n) => classifyNewsTitle(n.title) === "alert").slice(0, 3);
  const context = news.filter((n) => classifyNewsTitle(n.title) === "context").slice(0, 3);
  const heroHref = stats.latestBriefingSlug ? `/threat-briefings/${stats.latestBriefingSlug}` : "/threat-briefings";

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto grid max-w-[1140px] grid-cols-1 gap-4 px-6 pb-24 pt-28 md:grid-cols-2 lg:grid-cols-4">

        {/* HERO 2x2 */}
        <BentoCard className="md:col-span-2 lg:row-span-2 min-h-[330px] justify-end
          bg-[radial-gradient(ellipse_at_85%_15%,rgba(var(--primary-rgb),0.10),transparent_55%),radial-gradient(rgba(255,255,255,0.028)_1px,transparent_1px)] bg-[length:auto,22px_22px]">
          {stats.lastRunAt && (
            <span className="absolute left-6 top-6 flex items-center gap-2 font-mono text-[11.5px] text-body">
              <span className="h-[7px] w-[7px] rounded-full bg-brand pulse-dot" aria-hidden />
              atualizado {formatTimeAgo(stats.lastRunAt)}
            </span>
          )}
          <div className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.1em] text-cold">
            Threat intel global com contexto para o Brasil
          </div>
          <h1 className="font-display mb-3 text-[27px] font-bold leading-[1.22] tracking-tight text-ink">
            Briefings de ameaças cibernéticas em português para SOC, GRC e times de segurança.
          </h1>
          <p className="mb-5 max-w-[430px] text-sm leading-relaxed text-body">
            Resumo acionável de ameaças: severidade, CVEs, IOCs, fontes e técnicas MITRE ATT&CK em um só lugar.
          </p>
          <Link href={heroHref}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-brand-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
            Ver briefing mais recente →
          </Link>
        </BentoCard>

        {/* CRÍTICOS 2x2 */}
        <BentoCard href="/threat-briefings?sev=critical" action="Ver críticos ativos"
          label="Críticos ativos agora" labelClassName="text-brand-soft" period="últimas 24h"
          className="md:col-span-2 lg:row-span-2 border-[rgba(var(--primary-rgb),0.3)]
            bg-[radial-gradient(ellipse_at_top_left,rgba(var(--primary-rgb),0.08),transparent_55%)]">
          <div className="font-display text-[40px] font-bold leading-none text-ink">
            {stats.criticalCount}
            {stats.criticalDelta24h > 0 && (
              <span className="ml-2 text-[15px] font-semibold text-body">+{stats.criticalDelta24h} nas últimas 24h</span>
            )}
          </div>
          {stats.criticalSummary && <div className="mt-1 mb-3 text-[12.5px] text-body">{stats.criticalSummary}</div>}
          {stats.criticalLatest.map((b) => (
            <div key={b.slug} className="border-t border-white/[0.05] py-3">
              <div className="flex items-baseline justify-between gap-3 text-sm font-semibold text-ink">
                {b.title}<span aria-hidden className="text-dim">›</span>
              </div>
              <div className="mt-1 font-mono text-[11px] text-dim">{formatTimeAgo(b.createdAt)} · {b.sourceName}</div>
            </div>
          ))}
          {stats.criticalLatest.length === 0 && (
            <p className="py-4 text-sm text-dim">Nenhum briefing crítico nos últimos 7 dias.</p>
          )}
        </BentoCard>

        {/* MÉTRICAS (4 cards 1x1) — padrão: número display, rótulo completo, microtexto, footlink */}
        <BentoCard href="/threat-briefings" action="Explorar briefings" className="min-h-[158px]">
          <div className="font-display text-4xl font-bold tracking-tight">{stats.briefingsTotal}</div>
          <div className="mt-1.5 text-[13px] font-semibold text-ink">briefings publicados</div>
          <div className="mt-1 text-[11.5px] text-dim">{stats.briefingsWeek} novos nesta semana</div>
        </BentoCard>
        <BentoCard href="/cves" action="Ver CVEs recentes" className="min-h-[158px]">
          <div className="font-display text-4xl font-bold tracking-tight">{stats.cvesToday}</div>
          <div className="mt-1.5 text-[13px] font-semibold text-ink">CVEs analisadas hoje</div>
          <div className="mt-1 text-[11.5px] text-dim">{stats.cvesKevToday} com exploração conhecida</div>
        </BentoCard>
        <BentoCard href="/iocs" action="Ver IOCs" className="min-h-[158px]">
          <div className="font-display text-4xl font-bold tracking-tight">{stats.iocsTotal.toLocaleString("pt-BR")}</div>
          <div className="mt-1.5 text-[13px] font-semibold text-ink">IOCs ativos</div>
          <div className="mt-1 text-[11.5px] text-dim">coletados de 19 fontes abertas</div>
        </BentoCard>
        <BentoCard className="min-h-[158px]">
          <div className="font-display pt-2 text-[22px] font-bold text-cold">● Operacional</div>
          <div className="mt-1.5 text-[13px] font-semibold text-ink">pipeline de coleta</div>
          <div className="mt-1 text-[11.5px] leading-relaxed text-dim">
            19 fontes · execução horária{stats.lastRunAt && <><br />último run: {stats.lastRunAt.toISOString().slice(11, 16)} UTC</>}
          </div>
        </BentoCard>

        {/* CVEs POR DIA 2x1 */}
        <BentoCard href="/cves" action="Ver CVEs recentes" label="Vulnerabilidades por dia" period="últimos 7 dias" className="md:col-span-2">
          {stats.cvesPerDay.map((d, i) => {
            const max = Math.max(...stats.cvesPerDay.map((x) => x.count), 1);
            const isPeak = d.count === max && d.count > 0;
            return (
              <div key={i} className="flex items-center gap-2.5 py-1 font-mono text-[11px] text-dim">
                <b className="w-7 font-medium">{d.day}</b>
                <span className="flex-1">
                  <span className={`block h-2 rounded ${isPeak ? "bg-gradient-to-r from-brand to-[rgba(var(--primary-rgb),0.3)]" : "bg-gradient-to-r from-[rgba(127,163,184,0.85)] to-[rgba(127,163,184,0.25)]"}`}
                    style={{ width: `${Math.max((d.count / max) * 100, 2)}%` }} />
                </span>
                {d.count}
              </div>
            );
          })}
        </BentoCard>

        {/* REGIÕES 2x1 */}
        <BentoCard href="/threat-briefings" action="Ver análise por região" label="Regiões afetadas" period="últimos 7 dias" className="md:col-span-2">
          {stats.regions.length > 0 && (
            <div className="mb-3 text-[12.5px] text-body">
              Mais afetada: <b className="text-ink">{stats.regions[0].region}</b>
              {stats.regions[0].critical > 0 && <> · maior severidade: <b className="text-ink">{stats.regions[0].critical} crítico{stats.regions[0].critical > 1 ? "s" : ""}</b></>}
            </div>
          )}
          {stats.regions.map((r) => (
            <div key={r.region} className="grid grid-cols-[80px_1fr_90px] items-center gap-3 border-t border-white/[0.05] py-1.5 text-[12.5px]">
              <span className="font-semibold text-ink">{r.region}</span>
              <span className="flex h-2 gap-[3px]">
                {r.critical > 0 && <i className="rounded-[3px] bg-brand" style={{ width: `${r.critical * 17}%` }} />}
                {r.medium > 0 && <i className="rounded-[3px] bg-yellow-600/80" style={{ width: `${r.medium * 17}%` }} />}
                {r.low > 0 && <i className="rounded-[3px] bg-white/[0.18]" style={{ width: `${r.low * 17}%` }} />}
              </span>
              <span className="text-right font-mono text-[11px] text-dim">{r.critical}C · {r.medium}M · {r.low}B</span>
            </div>
          ))}
          {stats.regions.length === 0 && <p className="py-3 text-sm text-dim">Sem dados regionais nos últimos 7 dias.</p>}
        </BentoCard>

        {/* ALERTAS OPERACIONAIS 2x1 + NOTÍCIAS 2x1 */}
        <BentoCard href="/noticias" action="Ver todos os alertas" label="Alertas operacionais" labelClassName="text-brand-soft" period="exigem ação" className="md:col-span-2">
          {alerts.map((n) => (
            <div key={n.slug} className="flex gap-3 border-t border-white/[0.05] py-2.5 text-[13.5px]">
              <span className="flex-1 leading-snug text-body">{n.title} <span aria-hidden className="text-dim">›</span></span>
            </div>
          ))}
          {alerts.length === 0 && <p className="py-3 text-sm text-dim">Nenhum alerta operacional agora.</p>}
        </BentoCard>
        <BentoCard href="/noticias" action="Ver todas as notícias" label="Notícias relevantes" period="contexto" className="md:col-span-2">
          {context.map((n) => (
            <div key={n.slug} className="flex gap-3 border-t border-white/[0.05] py-2.5 text-[13.5px]">
              <span className="flex-1 leading-snug text-body">{n.title} <span aria-hidden className="text-dim">›</span></span>
            </div>
          ))}
          {context.length === 0 && <p className="py-3 text-sm text-dim">Sem notícias no momento.</p>}
        </BentoCard>
      </div>
    </main>
  );
}
```

Observações de implementação: tipar itens de notícia com o tipo retornado por `fetchNewsArticles`; se o item tiver timestamp, formatar `HH:MM`, senão omitir o span; remover imports não usados (RadarMap, BriefingCard, NewsSection, ícones lucide antigos); manter `export` de metadata se houver.

- [ ] **Step 2:** `npm run build` → ok. `npx vitest run` → verde.
- [ ] **Step 3:** Subir `npm run dev`, abrir `/`, comparar com o mockup (`docs/superpowers/mockups/...html#home`). Conferir: CTA único, footlinks visíveis, períodos nos cards, hero sem radar.
- [ ] **Step 4:** Commit:
```bash
git add app/page.tsx
git commit -m "feat: bento actionable-panel home"
```

---

### Task 6: Briefings — listagem

**Files:**
- Modify: `app/threat-briefings/page.tsx` (usar PageHeader)
- Modify: `components/threat/BriefingExplorer.tsx` (filtros → FilterPill; destaque 2-col; cards → BentoCard/Tag)
- Modify: `components/threat/BriefingCard.tsx` (variants em BentoCard + Tag)

- [ ] **Step 1:** Page: substituir o header atual por `<PageHeader title="Threat Briefings" description="Análises operacionais de ameaças ativas com severidade, IOCs e recomendações diretas para o Blue Team." meta={[{text: "pipeline ativo · atualizado há X min", live: true}, {text: "N publicados · M críticos"}]} />` (os números já existem nos dados da página/explorer — reusar o que o componente já busca; se não houver, omitir meta).
- [ ] **Step 2:** BriefingExplorer:
  - Filtros de severidade/categoria → `FilterPill` (crítico com `critical`); input de busca → pílula `rounded-full bg-raised border border-white/[0.05]`.
  - Card destaque (FeaturedCard): grid `1.4fr 1fr`, borda `rgba(var(--primary-rgb),0.3)` + glow radial, coluna direita com fatos (publicado / EPSS / nº IOCs) separada por `border-l border-white/[0.05]`, footlink "Ler briefing completo".
  - Cards da grade: `BentoCard href=... action="Ler briefing"`, topo com `Tag solid|warn|plain` (severidade) + data mono à direita, h3 15px semibold, resumo 13px `text-dim`, linha de `Tag`s de contexto.
- [ ] **Step 3:** BriefingCard (usado na home? não mais — usado no explorer/related): variants `default`/`featured` migram para a estética BentoCard; `compact` mantém estrutura com tokens novos.
- [ ] **Step 4:** `npx vitest run` (BriefingExplorer tem testes — atualizar SOMENTE strings de classe esperadas, nunca lógica; flagar no commit message se tocar em teste). `npm run dev` → comparar com mockup `#briefings`.
- [ ] **Step 5:** Commit: `git add app/threat-briefings components/threat && git commit -m "feat: bento briefings listing"`

---

### Task 7: Briefing — detalhe

**Files:**
- Modify: `app/threat-briefings/[slug]/page.tsx`
- Modify: `components/briefing/ExecutiveSummary.tsx`, `components/briefing/BriefingSection.tsx`, `components/briefing/RecommendedActions.tsx`, `components/briefing/IocTable.tsx`, `components/briefing/ConfidenceBlock.tsx`

- [ ] **Step 1:** Page `[slug]`: topo vira padrão PageHeader-like: breadcrumb `Briefings / <título>` 12px dim; linha de `Tag`s (severidade solid + alert/plain das tags + EPSS plain); h1 `font-display text-[28px]`; meta mono (leitura · data · "Fonte original ↗" em `text-cold`). Sidebar: card único de scores em grid 3 colunas — CVSS `font-display text-3xl text-brand` (sublabel "crítico/alto/…"), EPSS `text-cold` (sublabel "30 dias"), Confiança `text-green-400` (sublabel fontes) — substituindo os cards separados atuais; MITRE como `Tag info` ("T1068 · Escalada de privilégios" usando lib/mitre-names); card Contexto (setores/regiões/fonte); card críticos relacionados com footlink (BentoCard).
- [ ] **Step 2:** ExecutiveSummary: `BentoCard` com `border-l-[3px] border-l-brand`, label "Resumo executivo" em `text-brand-soft`.
- [ ] **Step 3:** BriefingSection: h2 16px bold com marcador `w-[3px] h-4 bg-white/15 rounded` (já neutro — manter), tudo dentro de BentoCard por seção OU manter seções e só padronizar espaçamento — seguir o mockup `#detalhe` (seções dentro de cards).
- [ ] **Step 4:** RecommendedActions: itens numerados `01/02/03` em mono dim + texto body, separados por `border-t border-white/[0.05]`.
- [ ] **Step 5:** IocTable: header da tabela 10px uppercase dim; células mono 11.5px; coluna "copiar" em dim→cold no hover; botão "Exportar CSV ↓" em `text-cold` no topo direito do card.
- [ ] **Step 6:** `npx vitest run` → verde (mesma regra de testes). `npm run dev` → comparar com mockup `#detalhe`. Commit: `git add app/threat-briefings components/briefing && git commit -m "feat: bento briefing detail"`

---

### Task 8: Vulnerabilidades (CVEs)

**Files:**
- Modify: `app/cves/page.tsx` (PageHeader: title "Vulnerabilidades" + `<span className="text-dim text-lg ml-2">CVE</span>`)
- Modify: `components/cves/CveExplorer.tsx`

- [ ] **Step 1:** Lista vira linhas-card (estrutura do mockup `#cves`): cada CVE em um card `rounded-2xl bg-raised border border-white/[0.05] hover:bg-overlay cursor-pointer` com grid `[80px_1fr_220px_40px]`:
  - CVSS `font-display text-[22px] font-bold` colorido: ≥9 `text-brand`, ≥7 `text-orange-400`, senão `text-yellow-400`; sublabel "cvss" 10px uppercase dim.
  - CVE-ID `font-mono text-[12.5px] text-cold`; título semibold (manter texto vindo do banco); linha "EPSS X% · publicada …" 12px dim.
  - Tags: `Tag alert` p/ "CISA KEV"/"Exploração ativa", `Tag warn` p/ "Patch disponível", `Tag plain` p/ demais.
  - Chevron `›` dim → branco no hover.
- [ ] **Step 2:** Filtros → FilterPill (severidades com semântica; extras "Só KEV/CISA" e "Com exploit público" mapeando os filtros já existentes no componente — se um filtro não existir na lógica atual, NÃO criar lógica nova: renderizar apenas os filtros que o componente já suporta).
- [ ] **Step 3:** `npx vitest run` → verde. Comparar com mockup `#cves`. Commit: `git add app/cves components/cves && git commit -m "feat: bento cve rows"`

---

### Task 9: Notícias + IOCs

**Files:**
- Modify: `app/noticias/page.tsx`, `components/news/NewsExplorer.tsx`, `components/news/NewsSection.tsx`
- Modify: `app/iocs/page.tsx`, `components/iocs/IocSearch.tsx`

- [ ] **Step 1:** Notícias: PageHeader; filtros FilterPill incluindo "Alertas operacionais"/"Contexto" usando `classifyNewsTitle` (client-safe: a função é pura — importar em client component é ok); feed em grid `2fr 1fr`: principal com day-headers mono uppercase + cards (hora mono | tags | h3 | resumo | fonte), card classificado como alerta ganha `border-[rgba(var(--primary-rgb),0.25)]` + `Tag alert "Alerta operacional"`; sidebar sticky `top-20` "Alertas operacionais — exigem ação" listando os 3 últimos alertas com footlink.
- [ ] **Step 2:** NewsSection (usada na home? não mais — verificar com `git grep -n 'NewsSection' -- app`; se ficou órfã, deletar o arquivo e o import).
- [ ] **Step 3:** IOCs: PageHeader ("Indicadores" + hint IOC); filtros → FilterPill; tabela: aplicar mono Geist, headers 10px uppercase dim, linhas com `border-white/[0.05]`; sem redesenho estrutural além disso.
- [ ] **Step 4:** `npx vitest run` → verde. Comparar com mockup `#noticias`. Commit: `git add app/noticias app/iocs components/news components/iocs && git commit -m "feat: bento news and iocs"`

---

### Task 10: Sobre, Metodologia, admin + varredura final de tokens

**Files:**
- Modify: `app/sobre/page.tsx`, `app/metodologia/page.tsx`, `app/admin/login/page.tsx`, `app/admin/status/page.tsx`, `components/search/SearchOverlay.tsx`, `components/search/SearchResult.tsx`, `components/ui/Badge.tsx`, `components/ui/EmptyState.tsx`, `components/threat/ThreatFeed.tsx`, `lib/source-colors.ts`

- [ ] **Step 1:** Sobre/Metodologia/admin: h1/h2 de página → `font-display`; nenhuma mudança estrutural.
- [ ] **Step 2:** Badge: `critical: "text-white bg-brand border-transparent"` (herda scarlet). Demais variantes inalteradas.
- [ ] **Step 3:** Varredura: `git grep -nE 'bg-red-600|text-red-400|text-red-500|border-red' -- app components` → para cada hit decidir pela tabela: semântico-severidade → `brand`/`brand-soft`; decorativo → não deveria existir (remover). Logo (Header/Footer) → `border-brand`/`bg-brand`/`text-brand`.
- [ ] **Step 4:** `git grep -inE '#E50914|jetbrains|red-600|red-500|red-400' -- app components lib` → justificar cada resto (esperado: zero, exceto `red-950`? não — zero).
- [ ] **Step 5:** `npx vitest run` → verde. Commit: `git add -A && git commit -m "feat: apply bento tokens to remaining pages and shared ui"`

---

### Task 11: Verificação final

- [ ] **Step 1:** `git grep -inE '#E50914|jetbrains|playfair|#0A0A0A|#111113|#1A1A1D|#B8B8C0|#76767F' -- app components lib` → vazio.
- [ ] **Step 2:** `npm run build` → ok. `npx vitest run` → verde.
- [ ] **Step 3:** `npm run start` + screenshots (mesmo método da última vez: playwright via `D:\CodexNpmCache\_npx\e41f203b7505f1fb\node_modules\playwright\index.mjs`): `/`, `/threat-briefings`, detalhe, `/noticias`, `/cves`, `/iocs`. Comparar com o mockup lado a lado.
- [ ] **Step 4:** Teste dos 5 segundos na home (critério de aceite 3) + conferir critérios 4 e 5 do spec nas screenshots.
- [ ] **Step 5:** Commit final de ajustes, se houver.
