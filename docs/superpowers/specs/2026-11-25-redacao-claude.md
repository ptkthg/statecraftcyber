# Redação automatizada com Claude Sonnet 5.5 e política editorial verificada

**Implementador:** Codex. **Revisor:** Claude. Data: 25/11/2026. Base: `main` (`f0ef3e8`) mais os arquivos não
versionados `lib/ai/editorial-personas.ts`, `package.json` e `package-lock.json` (SDK já instalado).

## Contexto

As notícias seguem em inglês e há só 1 briefing publicado. O motivo não é o provedor de IA: `validateTextFields`
(`lib/intelligence/text-validation.ts`) só aprova texto que seja cópia literal da fonte (`isVerbatimPassage`), e toda
tradução ou reescrita vira `claim.semantic_review`. O dono do projeto decidiu:

- **Provedor:** Anthropic, com **Claude Sonnet 5.5** (`claude-sonnet-5-5`) escrevendo as notícias.
- **Política:** "editorial verificado". O Claude escreve; um editor de fechamento (segunda chamada) confere cada
  afirmação contra a fonte; há checagem determinística de entidades. A matéria aprovada sai com selo de automação, e a
  reprovada fica com o texto original.
- **Tom:** analítico com contexto. Chamada, linha fina, lide e corpo só com fatos da fonte, mais um bloco "Por que
  importa" rotulado como avaliação.

O revisor já escreveu as personas em `lib/ai/editorial-personas.ts` (manual de redação, três repórteres, analista e
editor de fechamento). **Use esse arquivo como está.** Se precisar mudar um prompt, registre o motivo no resultado.

## 1. Cliente Anthropic (`lib/ai/claude-client.ts`)

- SDK oficial `@anthropic-ai/sdk` (já instalado, 1.14). `new Anthropic()` lê `ANTHROPIC_API_KEY`; `maxRetries: 2`.
- Uma função genérica para JSON validado, com zod (já instalado, v4):
  ```ts
  client.beta.messages.parse({
    model, max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: persona.system, cache_control: { type: "ephemeral" } }],
    output_config: { effort, format: betaZodOutputFormat(Schema) },
    messages: [{ role: "user", content: prompt }],
  })
  ```
  `betaZodOutputFormat` vem de `@anthropic-ai/sdk/helpers/beta/zod`. Confira as assinaturas nos `.d.ts` instalados;
  o `tsc` é o juiz.
- **Proibido** enviar `temperature`, `top_p`, `top_k` ou `thinking: {type: "disabled"}`: o Sonnet 5.5 rejeita com 400.
  Não envie `thinking`; a profundidade é controlada por `output_config.effort`.
- Modelos e esforço por env: `CLAUDE_WRITER_MODEL` (default `claude-sonnet-5-5`), `CLAUDE_EDITOR_MODEL` (default
  `claude-sonnet-5-5`), `CLAUDE_WRITER_EFFORT` (default `medium`), `CLAUDE_EDITOR_EFFORT` (default `medium`).
- **Recusa:** antes de ler o conteúdo, cheque `stop_reason === "refusal"`. Registre `stop_details?.category` e devolva
  um resultado `{ status: "refused", category }`, sem lançar erro. Notícia de segurança pode acionar o classificador
  `cyber`; o `fallbacks: "default"` tenta o modelo reserva, e se a cadeia toda recusar a matéria vai para Kill.
- Também cheque `stop_reason === "max_tokens"` e `parsed_output === null` (resultado `invalid`).
- Erros pelas classes tipadas do SDK (`Anthropic.RateLimitError`, `Anthropic.APIError` etc.), nunca por texto da
  mensagem. 429 e 5xx: a matéria fica para a próxima rodada.
- Uso: registre `usage.input_tokens`, `output_tokens`, `cache_read_input_tokens` e `cache_creation_input_tokens` em
  `aiStarted`/`aiFinished` (`lib/pipeline/context.ts`) e some por execução. Teto `AI_RUN_TOKEN_BUDGET` (default
  2.000.000 tokens somando entrada e saída). Ao atingir o teto, as matérias restantes ficam para a próxima rodada.
- Mantenha o prompt de sistema estável (sem data nem ID), para o cache funcionar. Dados variáveis vão no `user`.

## 2. Política `editorial-v1` (`lib/intelligence/editorial-validation.ts`)

Convive com a `phase1-v1`, que continua valendo para tudo o que não passar por aqui.

- **Determinística** (roda antes do editor; se reprovar, nem chama o editor):
  - todo CVE, número (com ou sem unidade e porcentagem), versão, URL, domínio, IP e hash do texto precisa aparecer
    na fonte. Normalize separador de milhar e vírgula decimal (`1,5` = `1.5`);
  - nomes próprios com inicial maiúscula fora do começo de frase (empresas, produtos, grupos, países) precisam
    aparecer na fonte, com lista de exceções para palavras comuns em PT-BR (Brasil só se estiver na fonte);
  - `porQueImporta` começa com `Avaliação Statecraft:` e passa pela mesma checagem de entidades;
  - sem travessão; sem as expressões proibidas do manual (exporte a lista de `editorial-personas.ts`);
  - limites de tamanho (`chamada` ≤ 90, `linhaFina` ≤ 160, `lide` ≤ 400, `corpo` ≤ 4.000 caracteres).
- **Editor de fechamento** (`EDITOR_FECHAMENTO`): recebe a fonte e a matéria e devolve `afirmacoes`, `problemas` e
  `decisao`. Só publica se `decisao === "publicar"`, nenhuma afirmação estiver `sem_apoio` **e** cada `trechoDaFonte`
  existir na fonte (reaproveite `originalQuote` de `lib/intelligence/validation.ts`, ou extraia para um módulo
  comum). Os `fatosUsados` do repórter passam pela mesma conferência de trecho.
- **Estados** (modelo da redação): `draft` → `edit` → `published` | `hold` | `kill`. `hold` volta à fila na rodada
  seguinte, até 2 tentativas; `kill` não tenta de novo por 7 dias. Grave o estado e o motivo no `qualityReport`.
- `qualityReport` de aprovação: `{ policyVersion: "editorial-v1", publishable: true, sourceDigest, persona,
  writerModel, editorModel, editorDecision, claims, usage }`. `validTextReport` passa a aceitar as duas políticas,
  sempre exigindo o `sourceDigest`.

## 3. Notícias criadas na coleta

- Em `scripts/run-local-updates.ts`, o passo `enrichNews` chama uma nova função `writeNewsBatch` (em
  `lib/news-writing.ts`) para até `NEWS_ARTICLES_PER_RUN` notícias (default 30), das mais novas para as mais antigas,
  sem matéria aprovada nem `kill` vigente. Remova o `.slice(0, 4)`.
- Pauta: `personaForArticle(article.type)`. Prompt do usuário com fonte, título, resumo e conteúdo original (texto
  limpo, até 12.000 caracteres), data de publicação, CVEs e tags.
- Resultado aprovado vai para o `NewsCache`: `title = chamada`, `summary = linhaFina`, `content` = lide + corpo em
  markdown, e campos novos para `porQueImporta`, `persona` e `desk` (migração Prisma aditiva).
- `lib/ai-news.ts` e `lib/news-localization.ts` passam a usar o novo caminho ou são removidos, se ficarem sem uso.
  Nada de geração ao abrir a página.
- `newsForPublication` (`lib/publication/news.ts`) exporta as matérias `editorial-v1` com `contentOrigin: "automated"`,
  `porQueImporta`, `persona` e `desk`. O tipo `NewsArticle` ganha esses campos opcionais.

## 4. Briefings e fichas de CVE

- `generateAiBriefing` (`lib/ai-briefing.ts`) usa o cliente Claude com a persona `inteligencia`. As travas de
  `validateBriefing` continuam. Os campos narrativos que hoje caem em `claim.semantic_review` passam a ser aprovados
  quando o editor de fechamento confirma as afirmações com trechos reais da fonte.
- `enrichBatch` (`lib/cves/fetch-cves.ts`) usa o cliente Claude com a persona `vulnerabilidades`; `ptBrDescription`
  passa pela `editorial-v1`.
- Groq e OpenRouter ficam como reserva só quando não houver `ANTHROPIC_API_KEY`. Remova o `temperature` dessas
  chamadas apenas se for necessário; elas não usam Sonnet.

## 5. Interface

- Notícia (lista e detalhe), briefing e ficha de CVE com `contentOrigin === "automated"` mostram a assinatura
  "{desk}" e o selo "Redação automatizada a partir de {fonte}", com link para o original.
- Bloco "Por que importa" no detalhe, visualmente separado (borda lateral, rótulo em IBM Plex Mono), com o texto da
  avaliação.
- Metodologia: nova seção "Redação automatizada" explicando as personas, o editor de fechamento, a política
  `editorial-v1` e o uso do Claude Sonnet 5.5. Atualize também o README.

## 6. Configuração

- `ANTHROPIC_API_KEY` em `$credentialKeys` de `scripts/local/run-local.ps1`. No `hasAI` de `run-local-updates.ts`,
  considere `ANTHROPIC_API_KEY`.
- Nenhuma chave em arquivo versionado. Não leia nem altere `.qa/.env*`.

## 7. Testes (Vitest, cliente Anthropic sempre mockado; nenhum teste chama a API)

- `editorial-v1`: aprova matéria fiel; reprova número, CVE, versão, empresa ou país ausente da fonte; reprova
  `trechoDaFonte` inexistente; reprova `porQueImporta` sem rótulo ou com entidade nova; reprova travessão e
  expressão proibida.
- Cliente: monta a requisição sem `temperature`/`thinking`, com `fallbacks: "default"`, beta e `cache_control`;
  trata `refusal`, `max_tokens`, `parsed_output` nulo e 429; respeita o teto de tokens.
- Fluxo: `hold` volta na rodada seguinte até 2 vezes; `kill` não volta antes de 7 dias.
- `personaForArticle` para cada `ArticleType`.
- Export: snapshot inclui matéria `editorial-v1` com `porQueImporta` e omite as reprovadas.
- Interface: selo e bloco "Por que importa" aparecem só em `automated`.

## 8. Aceite

`npx tsc --noEmit`, `npm run lint`, `npm test` e `npm run build` (também com `STATECRAFT_DATA_SOURCE=snapshot`)
passando. Não rode a coleta nem a publicação, não faça commit nem push, não altere `data/publication/`. Registre o
resultado em `docs/superpowers/specs/2026-11-25-redacao-claude-resultado.md`, com caminhos relativos ao repositório.
