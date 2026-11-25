# Correções seção por seção, fontes e organização das páginas

**Implementador:** Codex. **Revisor:** Claude. Data: 25/11/2026. Base: commit `fdfc06c`.

Leia antes: `AGENTS.md` (e os guias de `node_modules/next/dist/docs/` que ele manda ler) e a auditoria
[2026-11-25-auditoria-secoes.md](2026-11-25-auditoria-secoes.md), que traz arquivo:linha de cada problema citado aqui.

## Contexto

Em produção o domínio ainda roda em modo banco e o Neon está indisponível: `/noticias` responde 500 com a tela padrão
do Next em inglês, `/api/health` 503 e as listas ficam vazias. A publicação passará a ser feita pelo fluxo local com
`STATECRAFT_DATA_SOURCE=snapshot` (`scripts/local/run-local.ps1` → `scripts/publish-local.mjs`). Esta spec trata do
código; a publicação é feita depois pelo revisor. **Tudo precisa funcionar em modo snapshot**, que é o modo de
produção; o modo banco continua existindo para a coleta local.

Decisões já tomadas pelo dono do projeto (não reabrir):
1. Fontes: sai o **Bodoni Moda** e entra **Newsreader** (Google Fonts, com eixo óptico) nos títulos; ficam
   **Source Serif 4** no texto e **IBM Plex Mono** nos rótulos; sai o **IBM Plex Sans**. Três famílias.
2. O hero grande (título enorme + imagem) fica **só na home**. As páginas internas ganham um cabeçalho compacto.
3. A home abre com o que sempre tem dado (CVEs, KEV, notícias, campanhas). Briefings viram seção secundária e só
   aparecem em destaque quando existirem.

## 1. Resiliência (P0)

- Criar `app/error.tsx`, `app/not-found.tsx` e `app/loading.tsx` em português, no estilo editorial do site (header e
  footer preservados pelo layout). O `error.tsx` oferece "Tentar de novo" (`reset`) e link para a home, sem expor
  mensagem técnica.
- `lib/publication/snapshot.ts`: o leitor não pode memorizar uma promessa rejeitada (a próxima chamada tenta de novo)
  e deve lançar um erro identificável (ex.: classe `SnapshotUnavailableError`) que as páginas tratem.
- `/noticias` e `/noticias/[slug]`: capturar falha da fonte e mostrar estado de indisponibilidade em vez de 500
  (`app/noticias/page.tsx:12`, `lib/news-store.ts:37`).
- `/cves`: nenhuma coleta externa (NVD/KEV/EPSS) no caminho de leitura de página. Sem dados, mostra estado de
  indisponibilidade com a data da última coleta (`lib/cves/query.ts:299,353`).
- Distinguir "falha da fonte" de "nada publicado" nos estados vazios de home, briefings e IOCs.

## 2. Fontes

- `app/layout.tsx`: trocar `Bodoni_Moda` por `Newsreader` (`next/font/google`, `subsets: ["latin", "latin-ext"]` se
  disponível, `display: "swap"`, com o eixo `opsz`), remover `IBM_Plex_Sans`. Manter os nomes de variáveis CSS que o
  resto do código usa, ajustando os aliases em `app/editorial.css` (e nos demais `editorial-*.css` que citem as
  fontes antigas).
- Títulos de display: `letter-spacing` normal (nada negativo), peso entre 500 e 650, e teto de tamanho com `clamp()`
  para que nenhuma linha cole letras em 1440 px nem quebre feio em 390 px.
- Botões de filtro e controles que hoje usam Plex Sans passam a usar Plex Mono (mesmo papel dos demais rótulos).
- Não deixar nenhuma referência a Bodoni ou Plex Sans no CSS.

## 3. Organização das páginas

- Criar um componente de cabeçalho compacto reutilizável (ex.: `components/editorial/PageHeader.tsx`): rótulo,
  título (h1), uma linha de apoio e, quando houver dado, "Dados de {data da última coleta}" a partir do snapshot
  (`capturedAt`/`generatedAt`, exibido em `America/Sao_Paulo` com a indicação do fuso). Altura máxima de ~180 px em
  1440 px. Sem imagem.
- Usar esse cabeçalho em `/threat-briefings`, `/cves`, `/iocs`, `/campanhas`, `/noticias`, `/metodologia` e `/sobre`.
  `components/editorial/EditorialHero.tsx` fica só em `app/page.tsx`.
- **Home** (`app/page.tsx`), nesta ordem: hero (como hoje, com fontes novas); faixa de dados com números reais do
  snapshot (CVEs críticas nas últimas 72 h, CVEs no catálogo CISA KEV, data da última coleta), cada número com link
  para o filtro correspondente em `/cves`; notícias recentes (5 a 6); campanhas; briefings em destaque **somente se
  houver pelo menos um briefing publicado** (sem estado vazio na home); editorias.
- **CVEs:** busca e três filtros principais (severidade, CISA KEV, ordenação) visíveis; os demais num bloco
  "Mais filtros" recolhido (`<details>` ou botão com `aria-expanded`). Em 1440×900 os primeiros resultados precisam
  aparecer sem rolar.
- **IOCs:** a busca e a tabela logo abaixo do cabeçalho compacto.

## 4. Bugs por seção (detalhes na auditoria)

- Briefings: com um único briefing, ele não pode sumir da lista nem gerar "Nenhum briefing corresponde ao filtro" em
  "Todos" (`components/threat/BriefingExplorer.tsx:117,189`). IocTable: trocar "Adicione ao SIEM, EDR e firewall" por
  orientação de validar antes de bloquear (`components/briefing/IocTable.tsx:47`).
- CVEs: usar a mesma regra de validade do EPSS na lista e no detalhe (`lib/cves/query.ts:294`,
  `lib/cves/get-cve-detail.ts:102`); texto "Consulta atual indisponível" não pode sugerir consulta externa no modo
  snapshot; CVE válido ausente sem metadata de ficha indexável (`app/cves/[id]/page.tsx:76,91`).
- Notícias: autoria correta conforme a origem do texto e sem skeleton de "geração" no snapshot
  (`app/noticias/[slug]/page.tsx:65,149`); conversão de CVEs em links só em nós de texto, sem mexer em atributos ou
  links existentes (`:117`); metadata de artigo com data de publicação.
- IOCs: aplicar `?q=` vindo da busca global (`app/iocs/page.tsx:105`, `components/iocs/IocSearch.tsx:385`); mostrar
  erro de busca e descartar respostas fora de ordem (`AbortController`, `:397`); manter link para o briefing e a
  confiança visíveis no mobile (`:175`); exportação avisa quando trunca em 500 e o CSV escapa aspas, vírgulas e
  quebras de linha em todos os campos (`app/api/iocs/export/route.ts:32`, `IocSearch.tsx:313`); trocar o placeholder
  `185.220.101.45` por um IP de documentação (RFC 5737, ex.: `198.51.100.23`) e domínio `.example`.
- Campanhas: corrigir a imagem `/editorial/datacenter.webp` que retorna 400 no `/_next/image` da lista; datas do
  índice formatadas em UTC como no detalhe (`components/editorial/CampaignIndex.tsx:21`).
- Global: corrigir títulos com a marca duplicada (páginas definem só o próprio nome; o template acrescenta a marca);
  `metadataBase` = `https://statecraftcyber.vercel.app` e canonical por página; descrição própria em `/sobre` e
  `/creditos-visuais`; contraste dos diálogos em Portal (busca global e KQL) legível no tema claro
  (`components/search/SearchOverlay.tsx:63,84`, `components/search/SearchResult.tsx:46`,
  `components/iocs/IocSearch.tsx:244`); busca global com semântica de combobox/listbox e item ativo anunciado.
- Metodologia e README: descrever o fluxo atual (Postgres local, snapshot publicado pela rotina horária no computador
  do operador, `/api/health` degradado após 3 h sem publicação), os modelos realmente usados (conferir os defaults em
  `lib/ai-briefing.ts`) e remover cron-job.org e LLaMA 3.3 70B onde não forem mais verdade
  (`app/metodologia/page.tsx:22,48`, `README.md`).
- Verificação da publicação (`scripts/lib/publication-deploy.mjs:58,74`): incluir detalhe de campanha, metodologia,
  sobre e créditos, e conferir que o HTML de `/noticias` e `/cves` contém um marcador de conteúdo (não só HTTP 200).

## 5. Testes e critérios de aceite

- Vitest para cada mudança de comportamento: leitor do snapshot (falha não memorizada), notícias com fonte
  indisponível, CVEs sem coleta externa na leitura, BriefingExplorer com 1 briefing, IOCs com `?q=` e respostas fora de
  ordem, CSV com escape, conversão de CVE só em nós de texto, home sem bloco de briefings quando não há briefing,
  cabeçalho compacto com data da coleta.
- `npx tsc --noEmit`, `npm run lint`, `npm test` e `npm run build` passando. Rode o build também com
  `STATECRAFT_DATA_SOURCE=snapshot` usando o `data/publication/current.json` existente.
- Não altere `data/publication/`, `.qa/`, `.env*`, `scripts/local/*.ps1` nem a configuração da Vercel. Não rode a
  coleta nem a publicação. Não faça commit nem push.
- Registre o resultado em `docs/superpowers/specs/2026-11-25-correcoes-secoes-resultado.md`: o que mudou por seção,
  saída dos testes, desvios e limitações. Use caminhos relativos ao repositório (nada de `C:\Users\...` ou
  `D:\Temp\...`).
