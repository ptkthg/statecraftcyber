# Cinco jornalistas fictícios, sorteio ponderado e assinatura no site

**Implementador:** Codex. **Revisor:** Claude. Data: 25/11/2026. Base: o resultado das specs
[2026-11-25-redacao-claude.md](2026-11-25-redacao-claude.md) e
[2026-11-25-redacao-orcamento.md](2026-11-25-redacao-orcamento.md), ainda não versionado.

## Contexto

O dono do projeto quer que cada matéria tenha a identidade de um jornalista fictício: Helena Duarte (plantão),
Rafael Nogueira (análise técnica), Marina Tavares (investigação), Caio Montenegro (geopolítica) e Luiza Campos
(explicação). Decisões: **sorteio ponderado pelo tipo da notícia**, fixo por notícia; **monograma** (iniciais e cor)
no lugar de foto; os jornalistas mudam a forma, nunca o padrão de fatos.

O revisor já escreveu as personas, os pesos e o sorteio: o novo `lib/ai/editorial-personas.ts` (mesmas exportações
`STYLE_GUIDE`, `PERSONAS`, `EDITOR_FECHAMENTO`, `FORBIDDEN_EXPRESSIONS` e `Persona`, mais `JOURNALISTS`, `ANALYST`,
`DRAW_WEIGHTS`, `drawJournalist` e `PROMPT_VERSION`; sai `personaForArticle`). **Use o arquivo como está.**

**Regra inegociável:** nenhuma foto ou imagem de pessoa real. O site sempre identifica a assinatura como persona
editorial fictícia e a matéria como redação automatizada.

## 1. Pauta e gravação

- Notícias: `drawJournalist(article.slug, article.type)` no lugar de `personaForArticle`. Se o `NewsCache` já tiver
  `persona` gravada para o slug, use essa persona (não sorteie de novo).
- Fichas de CVE: Rafael Nogueira (`JOURNALISTS["rafael-nogueira"]`). Briefings: `ANALYST` (Mesa de Inteligência).
- Gravação: `persona` = id do jornalista, `desk` = nome. No `qualityReport`, acrescente `promptVersion`
  (`PROMPT_VERSION`) e `journalistBeat`.
- Exportação: `NewsArticle` ganha `journalist?: { id, name, beat, initials, color }` montado a partir de `PERSONAS`
  pelo id gravado (não grave cor e iniciais no banco). Persona desconhecida: omita `journalist`.

## 2. Ajustes na política `editorial-v1`

- **Cobertura do editor:** a exigência de que cada campo seja coberto por `afirmacoes` vale para `chamada`,
  `linhaFina`, `lide` e `corpo`. **Não** vale para `porQueImporta`, que é avaliação. Ele continua sujeito ao rótulo,
  à checagem determinística de entidades e ao item 4 do checklist do editor.
- **Intertítulos:** linhas de markdown que começam com `###` ficam fora da exigência de cobertura e da checagem de
  nome próprio, mas continuam sujeitas à checagem de identificadores, números e estilo. Máximo de 4 por matéria.
- **"Brasil" na avaliação:** em `porQueImporta`, "Brasil", "brasileiro", "brasileira", "brasileiros" e "brasileiras"
  são permitidos mesmo sem aparecer na fonte. Nos demais campos, a regra continua: só se estiverem na fonte.
- Atualize o prompt de usuário do editor para refletir essas três regras.

## 3. Interface

- Componente `JournalistByline`: monograma (quadrado de 40 px, iniciais em IBM Plex Mono, fundo `color`, texto
  branco), nome, linha editorial e o rótulo "Persona editorial do Statecraft". Logo abaixo, o selo existente
  "Redação automatizada a partir de {fonte}" com link. O monograma tem `aria-hidden`; o nome é o texto acessível.
- Detalhe da notícia: byline no topo, abaixo do título. Lista de notícias e cards da home: versão compacta
  (monograma de 24 px e nome).
- Filtro **Jornalistas** em `/noticias`, ao lado dos filtros existentes, com os cinco nomes e "Todos". O estado vai
  na URL (`?jornalista=helena-duarte`) para o link ser compartilhável. Notícias sem matéria automatizada aparecem
  só em "Todos".
- Nova página `/redacao` ("Nossa redação"): os cinco jornalistas e a Mesa de Inteligência com monograma, nome, linha
  editorial e `tagline`, uma explicação curta do fluxo (sorteio ponderado, redação pelo Claude Sonnet 5.5, conferência
  pelo editor de fechamento, publicação só do que tem apoio na fonte) e o aviso: "Os nomes são personagens editoriais
  fictícios, sem relação com jornalistas reais." Link no rodapé e na metodologia. Inclua `/redacao` no sitemap e na
  verificação de publicação (`scripts/lib/publication-deploy.mjs`).
- Cabeçalho compacto (`PageHeader`) na página nova, como nas demais páginas internas.

## 4. Testes

- `drawJournalist`: mesmo slug, mesmo jornalista; distribuição em 5.000 slugs dentro de ±3 pontos percentuais dos
  pesos para cada tipo; persona gravada é reaproveitada sem novo sorteio.
- Política: `porQueImporta` com "Brasil" aprovado sem a palavra na fonte; "Brasil" no corpo sem a palavra na fonte
  reprovado; intertítulo fora da cobertura; mais de 4 intertítulos reprovado.
- Exportação: `journalist` montado pelo id; persona desconhecida omitida.
- Interface: byline e monograma só em conteúdo automatizado; filtro por `?jornalista=`; página `/redacao` com o aviso
  de ficção e sem nenhuma `<img>` de pessoa.

## 5. Aceite

`npx tsc --noEmit`, `npm run lint`, `npm test` e `npm run build` (também com `STATECRAFT_DATA_SOURCE=snapshot`)
passando. Não rode coleta nem publicação, não faça commit nem push. Resultado em
`docs/superpowers/specs/2026-11-25-redacao-jornalistas-resultado.md`, com caminhos relativos ao repositório.
