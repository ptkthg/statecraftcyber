# Refactor visual do frontend — Refactoring UI + Don't Make Me Think

**Data:** 2026-06-12
**Status:** Aprovado
**Escopo:** Todas as páginas públicas + componentes compartilhados. Zero mudança de lógica, rotas, data-fetching, testes ou textos.

## Objetivo

Aplicar os princípios de *Refactoring UI* (Wathan/Schoger) e *Don't Make Me Think* (Krug) ao frontend do statecraftcyber, **refinando** a identidade atual (dark + vermelho #E50914) em vez de substituí-la. Problemas atuais: cinzas inconsistentes espalhados em valores hardcoded, vermelho usado para tudo (nav ativa, links, bullets, badges, CTAs — nada se destaca), excesso de decoração (glows, grid de fundo, animações), e duas famílias serif (Playfair + Lora) competindo com a sans (Geist).

## Decisões aprovadas

1. **Direção:** refinar identidade atual (dark + vermelho). Não migrar para tema claro nem slate.
2. **Escopo:** site inteiro de uma vez (home, threat-briefings, noticias, cves, iocs, sobre, metodologia, admin) + componentes compartilhados.
3. **Radar do hero:** mantido como assinatura visual, mas discreto — `opacity-40`, sem glow, oculto em `<md`.
4. **Tipografia:** Playfair Display removida do projeto. Lora permanece **só** no corpo de `.article-content` (notícias). Todo o resto (UI, headlines, headings de artigos) em Geist.

## 1. Sistema de design (globals.css)

Tokens em CSS variables no `:root`, consumidos via `@theme inline` do Tailwind v4.

### Fundos — exatamente 3 níveis

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0A0A0A` | fundo de página (substitui #050505) |
| `--bg-raised` | `#111113` | cards, header scrolled (substitui #0D0D0D, #111, #080808) |
| `--bg-overlay` | `#1A1A1D` | hover de cards, inputs, code inline |

A alternância de fundo entre sections (`bg-[#080808]`) é removida; separação entre seções passa a ser por espaçamento vertical (`py-20`/`py-24` consistentes) e, quando necessário, borda `white/[0.04]`.

### Texto — exatamente 3 níveis

| Token | Valor | Uso |
|---|---|---|
| `--text` | `#F4F4F5` | títulos, texto de destaque |
| `--text-body` | `#B8B8C0` | corpo de texto |
| `--text-dim` | `#76767F` | metadados, timestamps, labels |

Substituem todos os hardcoded: `#A1A1AA`, `#C8C8D2`, `#B4B4BE`, `#C0C0C0`, `#C4C4D0`, `#D0D0DA`, `#D8D8E0`, `#E8E8F0`, `#777`, `text-neutral-400`.

### Regra de uso do vermelho (#E50914)

Permitido **apenas** em:
- CTA primário (botão "Ver Briefings" e equivalentes — 1 por tela);
- Severidade crítica (badge, indicadores);
- Logo e indicador "ao vivo" do hero;
- Hover de links de prosa em artigos (`hover:text-red-500`) — única exceção, como affordance secundária.

Deixam de ser vermelhos: item ativo da nav (vira branco + `font-semibold`), links em prosa (viram `--text` com underline), bullets de listas (viram `--text-dim`), labels de seção "eyebrow" (viram `--text-dim` uppercase), numeração de `ol`, hover de borda de cards.

### Decoração removida

- Classes `glow-red`, `glow-red-sm`, `text-glow-red` e todos os `hover:shadow-[0_0_…rgba(229,9,20…)]`: deletadas.
- Classe `bg-grid`: deletada (junto com o uso no hero).
- Animações `blink`/`pulse-red`: permanecem definidas, mas usadas só no indicador "Monitoramento contínuo" do hero e no logo (radar-sweep). Qualquer outro uso é removido.
- Scrollbar hover deixa de ser vermelho (vira `#555`).

## 2. Tipografia

- **Famílias:** Geist (UI e headings, inclusive dentro de artigos) + Lora (apenas corpo de `.article-content`) + JetBrains Mono (código, dados). Playfair Display sai do `layout.tsx` e do CSS.
- **Hierarquia por peso/cor, não por família:** headlines `font-bold tracking-tight text-[--text]`; eyebrows `text-xs uppercase tracking-widest text-[--text-dim]` (não mais vermelhos).
- **Escala fixa:** 12 / 14 / 16 / 18 / 24 / 32 / 48px (`text-xs` a `text-5xl`). Tamanhos arbitrários (`text-[1.0625rem]`, `text-[10px]` etc.) são normalizados para o degrau mais próximo — exceto o subtítulo do logo, que pode manter 10px.

## 3. Componentes compartilhados

### Header
- Item ativo: `text-white font-semibold` (era `text-red-500`).
- CTA mantém `bg-red-600 hover:bg-red-500`, sem glow no hover.
- Logo radar inalterado.

### Badge (`components/ui/Badge.tsx`)
- `critical` ganha contraste real: `bg-red-600 text-white border-transparent` (sólido). Demais variantes mantêm o padrão atual translúcido — cria hierarquia entre crítico e o resto.
- `neutral` usa `--text-dim`.

### Cards (BriefingCard, NewsSection/Explorer, CveExplorer, IocSearch, etc.)
- Fundo `--bg-raised`, borda `white/[0.04]` (ou nenhuma quando o fundo já separa).
- Hover: fundo `--bg-overlay`; **sem** borda/glow vermelho.
- `.card-dark` no CSS atualizada para esses valores.

## 4. Páginas

- **Home (`app/page.tsx`):** headline em Geist (remover `fontFamily: var(--font-playfair)`); `bg-grid` removido; radar `opacity-40` e `hidden md:flex`; section de briefings perde `bg-[#080808]`; eyebrows vermelhos viram `--text-dim`; cards de features sem hover vermelho.
- **Listagens (threat-briefings, noticias, cves, iocs):** aplicação dos tokens; estados ativos de filtros seguem a regra da nav (branco/peso, não vermelho); links "ver todos" em `--text-dim hover:text-white`.
- **Detalhe de artigo (`.article-content`):** corpo Lora inalterado em espírito, cores migram para tokens; `h2`/`h3` passam de Playfair para Geist bold; blockquote perde as aspas decorativas gigantes (`::before`) e mantém só a borda esquerda; links de prosa: `--text` + underline (hover vermelho é aceitável como affordance secundária: `hover:text-red-500`).
- **Briefing detalhe (`.briefing-prose`, componentes de briefing):** mesma migração de tokens; bullets vermelhos viram `--text-dim`.
- **Sobre, Metodologia, admin:** somente migração de tokens/cores.

## 5. Fora de escopo

- Qualquer mudança de lógica, rotas, fetching, schema, testes ou copy.
- Redesenho estrutural de layout (posições de seções permanecem).
- Tema claro, modo de acessibilidade adicional, novas features.

## 6. Critérios de aceite

1. `npm run build` passa sem erros; suíte Vitest existente continua verde.
2. Nenhuma ocorrência restante das classes deletadas (`glow-red`, `bg-grid`, `text-glow-red`) nem de `font-playfair` no código.
3. Cores de texto/fundo nas páginas públicas referenciam os tokens (sem novos hex hardcoded fora do globals.css).
4. Vermelho aparece apenas nos 3 usos permitidos (inspeção visual por screenshots das páginas principais).
5. Screenshots antes/depois das páginas principais (home, listagem e detalhe de briefing, notícias, CVEs, IOCs) gerados para comparação.
