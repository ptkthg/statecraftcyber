# Redesign — Bento "painel acionável" (v2)

**Data:** 2026-06-12
**Status:** Aprovado via mockups interativos (localhost:4173, 5 páginas + seletores de paleta/fonte)
**Escopo:** Redesign completo do frontend público — layout, tokens, tipografia e copy de UI. Backend, rotas, Prisma e testes de lógica intactos.

## Direção

Evolução da identidade dark+vermelho para um **painel acionável** estilo bento: menos dashboard decorativo, mais clareza operacional. Público-alvo explícito: SOC, GRC e times de segurança. Princípios (do feedback aprovado): urgência domina a hierarquia, todo card clicável confessa sua função, períodos de tempo padronizados, vermelho exclusivamente para urgência, acento frio para informação.

## 1. Tokens (substituem os atuais em globals.css)

```css
:root {
  --bg: #0B0B0D;          /* grafite neutro */
  --bg-raised: #131316;
  --bg-overlay: #1B1B20;
  --text: #F4F4F5;        /* ink */
  --text-body: #C2C2CB;   /* corpo — mais claro que o atual #B8B8C0 */
  --text-dim: #8E8E99;    /* metadados — mais claro que o atual #76767F (feedback de contraste) */
  --primary: #FF2D46;     /* scarlet vibrante (substitui #E50914) */
  --primary-soft: #FF6B7A;/* texto vermelho sobre fundo escuro (tags, labels) */
  --primary-rgb: 255,45,70; /* para rgba() em glows/tags */
  --cold: #7FA3B8;        /* acento frio — links de ação, dados informativos */
  --line: rgba(255,255,255,0.05); /* borda padrão de cards */
}
```

Utilities Tailwind v4 via `@theme inline`: as atuais (`bg-canvas`, `bg-raised`, `bg-overlay`, `text-ink`, `text-body`, `text-dim`) + novas `text-brand-soft`, `text-cold`, `border-line`.

**Regra do vermelho** (mantida e reforçada): apenas urgência — severidade crítica, CTA primário (1 por página), indicador "ao vivo", logo. **Novo:** links de ação em cards e dados informativos usam `--cold`; nunca vermelho.

## 2. Tipografia

| Papel | Fonte | Uso |
|---|---|---|
| Display | **Sora** (next/font, weights 500–700) | h1/h2 de página, números grandes, logo |
| Corpo/UI | **Geist** (já instalada) | todo o resto |
| Mono | **Geist Mono** (substitui JetBrains Mono) | IOCs, timestamps, períodos, contadores, CVE-IDs |

Lora permanece no corpo de artigos de notícias (`.article-content`). JetBrains Mono e a var `--font-jetbrains-mono` saem do projeto; classes `.mono`/`font-mono` passam a Geist Mono.

## 3. Componentes base (linguagem comum)

- **Card bento**: `bg-raised`, borda `--line`, **radius 20px**, padding 26px. Hover de card clicável: `translateY(-2px)` + `bg-overlay` + borda `white/10` + sombra `0 8px 28px rgba(0,0,0,0.45)` + transição 180ms.
- **Footlink** (affordance obrigatória em card clicável): texto 12.5px semibold em `--cold`, seta `→` que desliza 3px no hover do card; vira branco no hover.
- **Header de card**: label uppercase 11px (`.k`) à esquerda + **período padronizado** em mono 11px à direita (`últimas 24h` / `últimos 7 dias` / `exigem ação` / `contexto`).
- **Tags** (pílulas 10.5px): `alert` (rgba vermelho/0.14 + `--primary-soft`), `warn` (âmbar), `info` (rgba cold + `--cold`), `plain` (white/6 + dim), `solid` (fundo `--primary` + branco, só severidade crítica).
- **Pills de filtro**: radius 99px; ativo neutro = `bg-white/10 text-white border-white/20`; ativo crítico = rgba vermelho (semântico); inativo = `text-dim` + borda `--line`.
- **Nav global**: links com aba ativa `text-white font-semibold` + sublinhado 2px vermelho; labels **"Visão geral · Briefings · Notícias · Vulnerabilidades (CVE) · Indicadores (IOC) · Sobre"** (rotas inalteradas); botão "Buscar ⌘K" em outline discreto (o CTA vermelho sai do header).
- **Indicador vivo**: dot vermelho pulsante + texto mono ("pipeline ativo · atualizado há X min").

## 4. Home (`app/page.tsx`) — bento grid 4 colunas

Linha 1–2:
- **Hero (2×2)**: kicker frio "Threat intel global com contexto para o Brasil"; h1 Sora "Briefings de ameaças cibernéticas em português para SOC, GRC e times de segurança."; sub "Resumo acionável de ameaças: severidade, CVEs, IOCs, fontes e técnicas MITRE ATT&CK em um só lugar."; CTA único **"Ver briefing mais recente →"** (pílula vermelha, linka para o briefing mais novo); indicador vivo no topo. Fundo: gradiente radial vermelho sutil + grid de pontos CSS. O radar visual SAI da home (permanece só no logo).
- **Críticos ativos (2×2, dominante)**: borda avermelhada + glow sutil; número grande Sora + delta "+N nas últimas 24h"; linha-resumo derivada das tags ("X explorados ativamente · Y com ransomware · Z no KEV/CISA"); 3 briefings críticos com título produto-primeiro, tags e chevron; footlink "Ver críticos ativos" → /threat-briefings?sev=critical.

Linha 3 — métricas com rótulo completo + microtexto + footlink:
- "N briefings publicados / M novos nesta semana / Explorar briefings"
- "N CVEs analisadas hoje / M com exploração conhecida / Ver CVEs recentes"
- "N IOCs ativos / validados nas últimas 24h / Ver IOCs"
- "● Operacional / pipeline de coleta / 19 fontes · execução horária · último run HH:MM" (sem link)

Linha 4:
- **Vulnerabilidades por dia (2×1)**: mini gráfico de barras (7 dias, CSS puro, barra do pico em vermelho), footlink.
- **Regiões afetadas (2×1)** — substitui o radar: linha de insight ("Mais afetada: X · maior severidade: N críticos · tendência: …") + tabela região × severidade com mini-barras empilhadas (crítico vermelho / médio âmbar / baixo branco-18%), contagens em mono "2C · 1M · 1B". Fonte de dados: `affectedRegions` + `severity` dos briefings (7 dias).

Linha 5:
- **Alertas operacionais (2×1)**: notícias classificadas como acionáveis (heurística por palavras-chave: patch, corrige, atualização, urgente, explora). Label em `--primary-soft`, período "exigem ação".
- **Notícias relevantes (2×1)**: as demais, período "contexto".

## 5. Páginas internas (conforme mockup aprovado)

- **Briefings (listagem)**: header de página (h1 Sora + descrição + meta vivo "pipeline ativo · N publicados · M críticos"); busca em pílula; filtros (sev. com crítico semântico; categorias); **briefing destaque** em card 2-colunas (tags + título + resumo | fatos: publicado, EPSS, nº de IOCs); grid 3 colunas de cards com tags e footlink "Ler briefing".
- **Briefing (detalhe)**: breadcrumb; tags no topo; h1 Sora produto-primeiro; meta (leitura, data, fonte ↗ em cold). Coluna principal: resumo executivo (borda esquerda vermelha), prosa com h2 com marcador neutro, **ações recomendadas numeradas** (01/02/03 em mono), tabela de IOCs (tipo/indicador/confiança/copiar + "Exportar CSV ↓" em cold). Sidebar: card de scores (CVSS vermelho · EPSS cold · Confiança verde, com sublabels), MITRE ATT&CK como tags info, contexto (setores/regiões/fonte), críticos relacionados com footlink.
- **Vulnerabilidades (CVEs)**: header + meta vivo; filtros incl. "Só KEV/CISA" e "Com exploit público"; **linhas-card** (border-radius 16px, espaçadas): CVSS gigante Sora colorido por faixa (≥9 vermelho, ≥7 laranja, senão âmbar) | CVE-ID mono cold + título produto-primeiro + "EPSS X% · publicada…" | tags | chevron.
- **Notícias**: filtros (Tudo/Alertas operacionais/Contexto/Brasil/Global); feed agrupado por dia ("Hoje · 12 jun"), cards com hora mono + tags + título + resumo + fonte; card de alerta com borda avermelhada; **sidebar sticky "Alertas operacionais — exigem ação"**.
- **IOCs (Indicadores)**: aplica a mesma linguagem (header de página, pills, tabela com linhas-card, mono Geist) — sem redesenho estrutural além disso.
- **Sobre/Metodologia/admin**: somente tokens/fontes novos; estrutura atual mantida.

## 6. Títulos produto-primeiro

Onde o título é renderizado a partir de dados, NÃO se reescreve conteúdo do banco (fora de escopo de backend). A regra aplica-se a copy estática e à geração futura. Pendência registrada: ajustar prompt do gerador de briefings para títulos "Produto: CVE-XXXX com …" (fora deste spec).

## 7. Dados derivados necessários (sem mudança de schema)

| Dado | Derivação |
|---|---|
| Críticos ativos + delta 24h | count briefings severity=critical (janela 7d) e createdAt nas últimas 24h |
| Linha-resumo de críticos | tags dos briefings críticos (exploração-ativa, ransomware, cisa-kev) |
| Briefings novos na semana | count createdAt ≥ 7 dias |
| CVEs hoje / com exploração | tabela CVE existente (count por dia; flag KEV) |
| CVEs por dia (gráfico) | group by date, 7 dias |
| Regiões afetadas | affectedRegions × severity, 7 dias |
| Alertas vs contexto (notícias) | heurística de palavras-chave no título (patch, corrige, atualização, urgente) |
| IOCs ativos | count existente |

Tudo server-side nos page components, com fallback gracioso (caixa some ou mostra zero — nunca quebra).

## 8. Fora de escopo

Rotas/URLs, schema Prisma, lógica de coleta, geração de briefings, textos de artigos, admin redesign estrutural, modo claro.

## 9. Critérios de aceite

1. `npm run build` ok; suíte Vitest existente verde (asserções de classe podem ser atualizadas, lógica não).
2. Grep: zero `#E50914`, zero `JetBrains`, zero `Playfair` em app/components; Sora e Geist Mono via next/font.
3. Home responde ao teste dos 5 segundos: que site é, para quem, o que dá pra fazer, o que é mais importante agora (críticos).
4. Todo card clicável tem footlink visível; todo card de dados tem período no canto.
5. Vermelho apenas em: severidade crítica, CTA "Ver briefing mais recente", indicador vivo, logo, tags alert.
6. Screenshots das 6 páginas principais para comparação.
