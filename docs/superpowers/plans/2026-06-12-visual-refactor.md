# Visual Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar o spec `docs/superpowers/specs/2026-06-12-visual-refactor-design.md` — sistema de tokens (3 fundos, 3 textos), vermelho restrito, remoção de glow/grid/Playfair — em todas as páginas públicas, sem mudar lógica, rotas, dados ou textos.

**Architecture:** Os tokens entram em `app/globals.css` via CSS variables + `@theme inline` (Tailwind v4), gerando utilities `bg-canvas`, `bg-raised`, `bg-overlay`, `text-ink`, `text-body`, `text-dim`. Depois, migração mecânica por arquivo usando a tabela de substituição fixa abaixo, mais edições estruturais pontuais (Header, Badge, BriefingCard, hero da home, blocos de prosa).

**Tech Stack:** Next.js (App Router), Tailwind CSS v4 (`@theme inline`), next/font (Geist, Lora, JetBrains Mono), Vitest.

**Natureza dos testes:** Refactor é 100% de estilo — não há lógica nova para testar via TDD. Cada task verifica por: (a) `git grep` provando que os padrões antigos sumiram do arquivo tocado, (b) suíte Vitest existente continua verde, (c) `npm run build` no final. Screenshots antes/depois na última task.

---

## Tabela de substituição (usar em TODAS as tasks)

| Padrão antigo | Substituir por |
|---|---|
| `bg-[#050505]`, `bg-[#0A0A0A]`, `bg-[#080808]` | `bg-canvas` |
| `bg-[#0D0D0D]`, `bg-[#111]`, `bg-[#111111]` | `bg-raised` |
| `text-[#A1A1AA]`, `text-[#777]`, `text-neutral-400`, `text-neutral-500`, `text-[#71717A]` | `text-dim` |
| `text-[#C8C8D2]`, `text-[#B4B4BE]`, `text-[#C0C0C0]`, `text-[#D4D4D8]`, `text-[#B8B8C0]` | `text-body` |
| `text-[#E8E8F0]`, `text-[#D8D8E0]`, `text-[#F5F5F5]`, `text-[#E4E4E7]` | `text-ink` |
| eyebrow/label `text-red-500`/`text-red-400` + `uppercase tracking-wide*` | `text-dim` (mantém uppercase/tracking) |
| nav/filtro ativo `text-red-500` | `text-white font-semibold` |
| link inline `text-red-500 hover:text-red-400` (fora de CTA primário) | `text-dim hover:text-white` |
| `hover:border-red-600/20`, `hover:border-red-500/...` em cards | remover (hover passa a ser `hover:bg-overlay`) |
| `hover:shadow-[0_0_*rgba(229,9,20*]` | remover |
| `group-hover:text-red-400` em títulos de card | remover |
| classes `glow-red`, `glow-red-sm`, `text-glow-red`, `bg-grid` | remover o uso |
| `text-[10px]`, `text-[11px]` | `text-xs` (exceto subtítulo do logo no Header, que mantém 10px) |
| `font-black` em headings | `font-bold tracking-tight` |

**Exceções — vermelho PERMANECE em:** CTA primário (`bg-red-600 hover:bg-red-500`), severidade crítica (badges, dots, `text-red-*` ligado a severity), logo do Header, indicador "ao vivo" do hero, `hover:text-red-500` em links de prosa de artigo, e cores de feedback de erro em formulários/admin.

---

### Task 1: Tokens e limpeza no globals.css

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Substituir o bloco de tema (linhas 1–32) por tokens**

```css
@import "tailwindcss";

@theme inline {
  --color-canvas: var(--bg);
  --color-raised: var(--bg-raised);
  --color-overlay: var(--bg-overlay);
  --color-ink: var(--text);
  --color-body: var(--text-body);
  --color-dim: var(--text-dim);
  --color-brand: var(--primary);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-jetbrains-mono);
}

:root {
  --bg: #0A0A0A;
  --bg-raised: #111113;
  --bg-overlay: #1A1A1D;
  --text: #F4F4F5;
  --text-body: #B8B8C0;
  --text-dim: #76767F;
  --primary: #E50914;
  --primary-dark: #B00710;
}

html {
  scroll-behavior: smooth;
}

body {
  background-color: var(--bg);
  color: var(--text);
}

/* Custom scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #555; }
```

- [ ] **Step 2: Deletar as classes de decoração**

Remover integralmente os blocos `.glow-red`, `.glow-red-sm`, `.text-glow-red` (seção "Glow effects") e `.bg-grid` (seção "Grid pattern") do final do arquivo.

- [ ] **Step 3: Atualizar `.card-dark`**

```css
.card-dark {
  background-color: var(--bg-raised);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.card-dark:hover {
  background-color: var(--bg-overlay);
  border-color: rgba(255, 255, 255, 0.04);
}
```

- [ ] **Step 4: Verificar**

Run: `git grep -nE 'glow-red|bg-grid|text-glow' -- app/globals.css` → sem resultados.
Run: `npx vitest run` → todos passam.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "refactor(ui): add design tokens, remove glow/grid decoration"
```

---

### Task 2: Blocos de prosa no globals.css (article-content, briefing-prose, prose-like)

**Files:**
- Modify: `app/globals.css` (seções `.article-content`, `.briefing-prose`, `.prose-like`)

- [ ] **Step 1: `.article-content` — headings para Geist, blockquote simplificado, tokens**

Aplicar nestas mudanças na seção `.article-content`:

```css
.article-content {
  font-family: var(--font-lora, Georgia, serif);
  font-size: 1.0625rem;
  line-height: 1.875;
  color: var(--text-body);
  letter-spacing: 0.01em;
}

.article-content > p:first-of-type {
  font-size: 1.125rem;
  color: var(--text);
  font-weight: 500;
  line-height: 1.8;
  margin-bottom: 1.75rem;
}

.article-content h2 {
  font-family: var(--font-geist-sans, sans-serif);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text);
  margin: 3rem 0 1rem;
  padding-bottom: 0.625rem;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  line-height: 1.3;
  letter-spacing: -0.01em;
}
.article-content h3 {
  font-family: var(--font-geist-sans, sans-serif);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text);
  margin: 2.25rem 0 0.875rem;
  line-height: 1.35;
}

.article-content blockquote {
  border: none;
  border-left: 4px solid var(--primary);
  background: var(--bg-raised);
  padding: 1.25rem 1.5rem;
  margin: 2.5rem 0;
  border-radius: 0 0.625rem 0.625rem 0;
  font-size: 1.1rem;
  font-style: italic;
  color: var(--text-body);
  line-height: 1.7;
}
```

Deletar o bloco `.article-content blockquote::before` (aspas decorativas) e a `font-family` Playfair do blockquote. Bullets de `ul li::before` e numeração de `ol li::before`: trocar `background: #E50914` / `color: #E50914` por `var(--text-dim)`.

Links: `.article-content a { color: var(--text); text-decoration: underline; ... }` e `.article-content a:hover { color: #ff3344; }` → manter hover vermelho (exceção do spec). Demais cores hardcoded da seção (strong, em, td, th, h4) → tokens equivalentes pela tabela.

- [ ] **Step 2: `.briefing-prose` e `.prose-like` — tokens**

Mesma migração mecânica: `#C0C0C0`/`#B4B4BE` → `var(--text-body)`; `#E8E8F0`/`#fff` em strong/headings → `var(--text)`; `#A1A1AA` → `var(--text-dim)`; `#111`/`#0D0D0D` em code/pre → `var(--bg-raised)`; bullets `background: #E50914` → `var(--text-dim)`; links `color: #E50914` → `color: var(--text); text-decoration: underline;` com hover vermelho mantido.

- [ ] **Step 3: Verificar**

Run: `git grep -cE '#A1A1AA|#C8C8D2|#B4B4BE|#C0C0C0|#E8E8F0|#D8D8E0|#D0D0DA|#C4C4D0|playfair' -- app/globals.css` → 0 ocorrências.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "refactor(ui): migrate prose styles to tokens, sans headings in articles"
```

---

### Task 3: Remover Playfair do layout e tokens no body

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Remover a fonte Playfair**

No import: `import { Geist, Geist_Mono, JetBrains_Mono, Lora } from "next/font/google";`
Deletar o bloco `const playfair = Playfair_Display({...})` e remover `${playfair.variable}` do `className` do `<html>`.

- [ ] **Step 2: Body com tokens**

```tsx
<body className="min-h-screen flex flex-col bg-canvas text-ink">
```

(remover o `style={{ backgroundColor: "#050505", color: "#F5F5F5" }}`)

- [ ] **Step 3: Verificar**

Run: `git grep -n 'playfair' -- app components` → restam apenas usos em `app/page.tsx` e CSS já tratados/que serão tratados nas tasks 2 e 6. Ao final do plano este grep deve retornar vazio.
Run: `npx vitest run` → verde.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "refactor(ui): drop Playfair font, tokenize body colors"
```

---

### Task 4: Header e Footer

**Files:**
- Modify: `components/layout/Header.tsx`
- Modify: `components/layout/Footer.tsx`

- [ ] **Step 1: Header — nav ativa branca, sem glow**

- Item ativo desktop: `"text-red-500"` → `"text-white font-semibold"`.
- Item ativo mobile: `"text-red-500 bg-red-950/20"` → `"text-white font-semibold bg-white/5"`.
- CTA desktop: remover `hover:shadow-[0_0_20px_rgba(229,9,20,0.4)]`.
- Header scrolled: `bg-[#050505]/95` → `bg-canvas/95`.
- `text-[#A1A1AA]` / `text-neutral-400` → `text-dim` (tabela).
- Logo radar: NÃO mexer.

- [ ] **Step 2: Footer — aplicar tabela de substituição**

Migração mecânica pela tabela (fundos, cinzas, links vermelhos → `text-dim hover:text-white`). Vermelho permanece apenas se houver logo/elemento de marca.

- [ ] **Step 3: Verificar**

Run: `git grep -nE '#A1A1AA|#050505|shadow-\[0_0|text-red-500' -- components/layout/` → só ocorrências permitidas (nenhuma esperada).
Run: `npx vitest run` → verde.

- [ ] **Step 4: Commit**

```bash
git add components/layout/
git commit -m "refactor(ui): tokenize header/footer, white active nav state"
```

---

### Task 5: Badge e BriefingCard

**Files:**
- Modify: `components/ui/Badge.tsx`
- Modify: `components/threat/BriefingCard.tsx`

- [ ] **Step 1: Badge — crítico sólido, neutral com token**

```tsx
const STYLES: Record<Variant, string> = {
  critical: "text-white bg-red-600 border-transparent",
  high:     "text-orange-400 bg-orange-600/10 border-orange-600/20",
  medium:   "text-yellow-400 bg-yellow-600/10 border-yellow-600/20",
  low:      "text-blue-400 bg-blue-600/10 border-blue-600/20",
  neutral:  "text-dim bg-white/[0.04] border-white/[0.08]",
  green:    "text-green-400 bg-green-600/10 border-green-600/20",
};
```

- [ ] **Step 2: BriefingCard — severidade crítica sólida + remover vermelho decorativo**

- `severityConfig.critical` → `{ label: "Crítico", color: "text-white", bg: "bg-red-600", border: "border-transparent" }` (consistente com Badge).
- Nos 3 variants: `hover:border-red-600/20` → remover (o `.card-dark` já cobre o hover); `group-hover:text-red-400` nos `h3` → remover; "Ler briefing" `text-red-500 group-hover:text-red-400` → `text-dim group-hover:text-white`; seta `text-red-600` → `text-dim`.
- Cinzas pela tabela: `text-[#A1A1AA]` → `text-dim`, `text-[#D4D4D8]` → `text-body`.

- [ ] **Step 3: Verificar**

Run: `git grep -nE 'hover:border-red|group-hover:text-red|#A1A1AA|#D4D4D8' -- components/threat/BriefingCard.tsx components/ui/Badge.tsx` → vazio.
Run: `npx vitest run` → verde.

- [ ] **Step 4: Commit**

```bash
git add components/ui/Badge.tsx components/threat/BriefingCard.tsx
git commit -m "refactor(ui): solid critical badges, remove decorative red from cards"
```

---

### Task 6: Home (app/page.tsx)

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Hero**

- `<main className="min-h-screen bg-[#050505]">` → `bg-canvas`.
- Deletar `<div className="absolute inset-0 bg-grid opacity-40" />`.
- Gradientes `from-[#050505]` → `from-canvas` (2 ocorrências).
- Radar: contêiner `opacity-70` → `opacity-40`, e `flex` → `hidden md:flex`.
- `<h1>`: remover `style={{ fontFamily: "var(--font-playfair)" }}` e ajustar classe para `text-5xl md:text-6xl font-bold tracking-tight text-white leading-tight mb-6`.
- CTA primário: remover `hover:shadow-[0_0_30px_rgba(229,9,20,0.35)]`.
- Badge "Monitoramento contínuo": mantém vermelho e blink (exceção "ao vivo").
- `text-[#C8C8D2]` → `text-body`; `text-[#A1A1AA]` → `text-dim`.

- [ ] **Step 2: Sections**

- Section briefings: `bg-[#080808]` → remover (fica no fundo da página); manter `border-t border-white/[0.04]`.
- Eyebrows `text-red-500 uppercase tracking-widest` (2×) → `text-dim`.
- `h2` `font-black` → `font-bold tracking-tight`.
- Links "Ver todos"/"Saiba mais" vermelhos → `text-dim hover:text-white`.
- Cards de features: `bg-[#0D0D0D]` → `bg-raised`; `hover:border-red-600/20` → `hover:bg-overlay`; ícones `text-red-500` → `text-dim`; container do ícone `bg-red-600/10 border-red-600/20` → `bg-white/5 border-white/10`.
- `text-[#C8C8D2]`/`text-[#A1A1AA]` → tabela.

- [ ] **Step 3: Verificar**

Run: `git grep -nE 'bg-grid|playfair|#080808|#0D0D0D|#C8C8D2|#A1A1AA|shadow-\[0_0' -- app/page.tsx` → vazio.
Run: `npx vitest run` → verde.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "refactor(ui): clean home hero and sections per design tokens"
```

---

### Task 7: Explorers e feed (briefings, notícias, CVEs, IOCs)

**Files:**
- Modify: `components/threat/BriefingExplorer.tsx`
- Modify: `components/threat/ThreatFeed.tsx`
- Modify: `components/news/NewsExplorer.tsx`
- Modify: `components/news/NewsSection.tsx`
- Modify: `components/cves/CveExplorer.tsx`
- Modify: `components/iocs/IocSearch.tsx`
- Modify: `components/ui/EmptyState.tsx`

- [ ] **Step 1: Aplicar a tabela de substituição em cada arquivo**

Em todos: fundos → `bg-canvas`/`bg-raised`/`bg-overlay`; cinzas → `text-dim`/`text-body`/`text-ink`; hovers vermelhos de borda → remover; links/setas vermelhos decorativos → `text-dim hover:text-white`.

Regras específicas:
- **Filtros/tabs ativos** (BriefingExplorer, NewsExplorer, CveExplorer, IocSearch): estado ativo vermelho → `bg-white/10 text-white font-semibold`; inativo → `text-dim hover:text-white`.
- **Severidade/score** (CveExplorer CVSS, IocSearch confidence, ThreatFeed): cores semânticas (red/orange/yellow/green) PERMANECEM — são informação.
- **Inputs de busca**: `bg-[#0D0D0D]` → `bg-raised`; focus ring vermelho pode permanecer (`focus:ring-red-500/...` é affordance de foco) ou virar `focus:ring-white/20` — usar `focus:ring-white/20` para consistência.

- [ ] **Step 2: Verificar**

Run: `git grep -cE '#A1A1AA|#C8C8D2|#B4B4BE|#C0C0C0|#D4D4D8|#E8E8F0|#050505|#0D0D0D|#080808|hover:border-red' -- components/threat components/news components/cves components/iocs components/ui` → 0.
Run: `npx vitest run` → verde (BriefingExplorer/CveExplorer/IocSearch têm testes — se algum testar classes, ajustar a asserção do teste para o novo token, nunca a lógica).

- [ ] **Step 3: Commit**

```bash
git add components/
git commit -m "refactor(ui): tokenize explorers, feeds and empty state"
```

---

### Task 8: Componentes de briefing (detalhe)

**Files:**
- Modify: `components/briefing/BriefingSection.tsx`
- Modify: `components/briefing/ConfidenceBlock.tsx`
- Modify: `components/briefing/CopyButton.tsx`
- Modify: `components/briefing/DetectionSuggestions.tsx`
- Modify: `components/briefing/ExecutiveSummary.tsx`
- Modify: `components/briefing/IocTable.tsx`
- Modify: `components/briefing/RecommendedActions.tsx`
- Modify: `components/briefing/RichText.tsx`

- [ ] **Step 1: Aplicar a tabela de substituição**

Mesmas regras da Task 7. Severidade/confiança mantêm cores semânticas. IocTable: cabeçalhos/células com cinzas → tokens; botões de copiar → `text-dim hover:text-white`.

- [ ] **Step 2: Verificar**

Run: `git grep -cE '#A1A1AA|#C8C8D2|#B4B4BE|#C0C0C0|#D4D4D8|#E8E8F0|#0D0D0D|hover:border-red' -- components/briefing` → 0.
Run: `npx vitest run` → verde.

- [ ] **Step 3: Commit**

```bash
git add components/briefing/
git commit -m "refactor(ui): tokenize briefing detail components"
```

---

### Task 9: Páginas restantes

**Files:**
- Modify: `app/threat-briefings/page.tsx`, `app/threat-briefings/[slug]/page.tsx`
- Modify: `app/noticias/page.tsx`, `app/noticias/[slug]/page.tsx`
- Modify: `app/cves/page.tsx`, `app/iocs/page.tsx`
- Modify: `app/sobre/page.tsx`, `app/metodologia/page.tsx`
- Modify: `app/admin/login/page.tsx`, `app/admin/status/page.tsx`

- [ ] **Step 1: Aplicar a tabela de substituição em cada página**

- Fundos de página `bg-[#050505]` → `bg-canvas`; sections alternadas `bg-[#080808]` → remover.
- Eyebrows vermelhos → `text-dim`; headlines com `font-playfair` (se houver em `[slug]` de notícias) → remover o style e usar `font-bold tracking-tight`.
- Cinzas → tokens. Links decorativos vermelhos → `text-dim hover:text-white`.
- Admin: mensagens de erro vermelhas PERMANECEM (feedback semântico).

- [ ] **Step 2: Verificar**

Run: `git grep -cE '#A1A1AA|#C8C8D2|#B4B4BE|#C0C0C0|#D4D4D8|#E8E8F0|#050505|#0D0D0D|#080808|playfair|bg-grid|glow' -- app` → 0.
Run: `npx vitest run` → verde.

- [ ] **Step 3: Commit**

```bash
git add app/
git commit -m "refactor(ui): tokenize remaining pages"
```

---

### Task 10: Verificação final

**Files:** nenhum (verificação)

- [ ] **Step 1: Grep global dos critérios de aceite**

Run: `git grep -nE 'glow-red|bg-grid|text-glow|playfair|#A1A1AA|#C8C8D2|#B4B4BE|#C0C0C0|#D4D4D8|#E8E8F0|#050505|#0D0D0D|#080808' -- app components`
Expected: vazio.

- [ ] **Step 2: Build e testes**

Run: `npm run build` → sucesso.
Run: `npx vitest run` → todos os testes verdes.

- [ ] **Step 3: Screenshots para comparação**

Subir `npm run dev` e capturar: `/`, `/threat-briefings`, `/threat-briefings/<slug existente>`, `/noticias`, `/noticias/<slug>`, `/cves`, `/iocs`. Conferir visualmente: vermelho só em CTA/severidade/logo/indicador; 3 cinzas; sem glow.

- [ ] **Step 4: Commit final (se houver ajustes da verificação)**

```bash
git add -A && git commit -m "refactor(ui): final polish from visual verification"
```
