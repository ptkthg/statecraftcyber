# Resultado da implementação da redação Claude

Data: 25/11/2026.
Spec: `docs/superpowers/specs/2026-11-25-redacao-claude.md`.
Plano: `docs/superpowers/plans/2026-11-25-redacao-claude.md`.

## Implementação

- `lib/ai/claude-client.ts`: cliente Anthropic tipado, modelos e esforço configuráveis, cache efêmero de sistema, beta de fallback, duas novas tentativas do SDK e resultados discriminados para recusa, resposta inválida e adiamento. Não envia temperature, top_p, top_k ou thinking.
- `lib/ai/token-usage.ts` e `lib/pipeline/context.ts`: consumo de entrada, saída, leitura e criação de cache; teto compartilhado por execução. O coletor local envolve a execução em um orçamento único.
- `lib/intelligence/editorial-validation.ts`: política editorial-v1 com checagem determinística de números, unidades, versões, CVEs, URLs, domínios, IPs, hashes, nomes próprios Unicode, estilo, rótulo de avaliação e limites de tamanho. O editor só é chamado após essa etapa. Fatos do repórter e citações do editor passam por originalQuote; aprovação exige cobertura dos campos e ausência de afirmações sem apoio ou problemas. Digests vinculam a aprovação à fonte e ao conteúdo.
- `lib/news-writing.ts`: pauta por ArticleType, ordem cronológica decrescente, limite padrão de 30 notícias, persistência de assinatura e avaliação e preservação do original em reprovações. Hold permite duas novas tentativas; kill bloqueia por sete dias. Fonte alterada reabre uma pauta antes aprovada; adiamentos transitórios não consomem tentativa editorial.
- `lib/publication/news.ts`, `lib/publication/export.ts`, `lib/news-store.ts` e `scripts/export-publication.ts`: leitura e exportação de matérias aprovadas com contentOrigin, porQueImporta, persona e desk. A aprovação é invalidada por alterações da fonte ou do conteúdo. Candidatos reprovados sem notícia original não são exportados.
- `lib/ai-news.ts` agora somente devolve o texto preparado; não há geração ao abrir notícias. `lib/news-localization.ts` encaminha para a redação Claude quando há chave Anthropic, preservando a reserva legada sem essa chave.
- `lib/ai/claude-briefing.ts`, `lib/ai-briefing.ts`, `lib/briefing-generator.ts` e `lib/intelligence/validation.ts`: persona de inteligência e fechamento editorial das narrativas. As travas estruturais, de risco, IOCs, MITRE, ações e procedência continuam. O relatório phase1-v1 do briefing guarda o fechamento editorial-v1 em editorialReport, preservando os contratos existentes do banco.
- `lib/pipeline/service.ts` e `lib/pipeline/durable-generation.ts`: briefings retidos retornam à fila; candidatos retidos não são cacheados como trabalho concluído. Uma atualização reprovada preserva a edição publicada, agenda nova tentativa conforme o estado e registra o relatório em um candidato de auditoria separado.
- `lib/ai/claude-cve.ts`, `lib/cves/fetch-cves.ts` e `lib/intelligence/cve-policy.ts`: redação e fechamento das descrições de CVE. Prioridade e métricas continuam determinísticas. Anthropic tem precedência; reservas só são usadas sem a chave Anthropic.
- `components/ui/AutomationCredit.tsx`, listas e detalhes: assinatura, selo com link para a fonte e avaliação separada somente em conteúdo automatizado. O bloco “Por que importa” usa borda lateral e IBM Plex Mono. Metodologia e README atualizados.
- `prisma/migrations/20261125000000_editorial_news/migration.sql`: migração aditiva para porQueImporta, persona e desk. **A migração foi criada, mas não aplicada. Deve ser aplicada antes da próxima coleta com esta versão.**
- `scripts/local/run-local.ps1`: inclusão de ANTHROPIC_API_KEY nas credenciais. `.gitignore` e `eslint.config.mjs` ignoram os diretórios de cache e artefatos temporários de verificação.

## Personas e particularidade do SDK

Os prompts de sistema em `lib/ai/editorial-personas.ts` foram preservados. A única adição é a exportação de FORBIDDEN_EXPRESSIONS, exigida pela spec. Dados variáveis permanecem nas mensagens do usuário.

No SDK instalado, messages.parse tenta interpretar os blocos textuais antes de devolver stop_reason. Isso perdia a categoria e o consumo de recusas textuais ou respostas truncadas. A implementação mantém messages.parse e betaZodOutputFormat, mas adia a interpretação JSON com um parser de formato que devolve o texto bruto. Primeiro confere refusal e max_tokens e contabiliza o uso; depois interpreta JSON e valida com Zod. Há regressão com o SDK real e transporte HTTP mockado. Nenhuma chamada real à API Anthropic foi feita.

## Verificação final

| Verificação | Resultado |
|---|---|
| `npx.cmd tsc --noEmit` | Aprovada, sem erros |
| `npm.cmd run lint` | Aprovada, zero erros; três avisos preexistentes em `__tests__/search-merge.test.ts` e `lib/ioc-extractor.ts` |
| `npm.cmd test` com compatibilidade temporária do sandbox | **68 arquivos e 424 testes aprovados; ExitCode=0**, sem testes ignorados |
| `npm.cmd run build` com engine binário do Prisma | Aprovada |
| Build com `STATECRAFT_DATA_SOURCE=snapshot` e engine binário | Aprovada |
| `git diff --check` | Aprovada |
| Leitura HTTP local em modo snapshot | `/metodologia`, `/noticias`, `/cves` e `/threat-briefings`: HTTP 200; metodologia contém a nova seção |

Os testes cobrem cliente e protocolo, orçamento, recusa, truncamento, saída nula, 429, entidades inventadas, estilo, citações falsas, fechamento aprovado e reprovado, digests, nova tentativa de notícias e briefings, suspensão por sete dias, atualização de publicação existente, exportação e renderização condicional do selo e da avaliação.

### Ajustes necessários neste Windows

1. O build sem ajuste falha em prisma generate com EPERM ao substituir `node_modules/.prisma/client/query_engine-windows.dll.node`. Os dois builds completos passaram com `PRISMA_CLIENT_ENGINE_TYPE=binary`, opção suportada pelo Prisma, sem alterar o schema para trocar o engine e sem encerrar processos preexistentes do usuário.
2. Sem ajuste, `__tests__/intelligence-cli.test.ts` falha porque o tsx chama os.userInfo e este sandbox retorna `uv_os_get_passwd / ENOMEM`. A suíte inteira passou com NODE_OPTIONS carregando um arquivo temporário que só fornece identidade local quando essa chamada específica do sistema falha. O CLI, os testes e as dependências não foram alterados para contornar a falha. O ajuste está em `.superpowers/redacao-claude/test-env.cjs`.
3. O host de acesso ao navegador estava indisponível. Portanto, **não houve inspeção visual nem captura de tela**. A interface foi verificada por renderização em testes e as páginas por leitura HTTP. O servidor local criado para essa verificação foi encerrado.

Logs locais, ignorados pelo Git:

- `.superpowers/redacao-claude/tsc-final.log`
- `.superpowers/redacao-claude/lint-final.log`
- `.superpowers/redacao-claude/tests-final.log`
- `.superpowers/redacao-claude/build-final.log`
- `.superpowers/redacao-claude/build-snapshot.log`

A revisão independente identificou problemas no parser, em nomes Unicode, na reabertura de pautas e no reagendamento de briefings. Esses problemas foram corrigidos e ganharam regressões. A implementação está disponível para a revisão do Claude prevista na spec.

## Escopo e preservação

Não executei coleta, exportação real ou publicação; não apliquei migrações; não fiz commit nem push. Não li nem alterei `.qa/.env*` e não alterei `data/publication/`. Os arquivos pendentes anteriores, incluindo package.json, package-lock.json e os prompts das personas, foram preservados.

A remoção do cache temporário `.cache/npm` foi rejeitada pela política automática com a mensagem “blocked by policy”. O cache permanece local e ignorado pelo Git e pelo lint.

## Orientação de interface

Usei a identidade visual existente e o guia html de Modern Web Guidance. A orientação “DON'T use <blockquote> for purely visual indentation of non-quoted text” motivou o uso de aside para a avaliação, com título e texto acessíveis, sem apresentá-la como citação da fonte. A checagem mecânica do componente de crédito e do CSS não encontrou violações.
