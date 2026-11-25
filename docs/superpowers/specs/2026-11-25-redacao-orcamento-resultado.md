# Resultado da implementação do orçamento da redação

Data: 25/11/2026.

Spec: `docs/superpowers/specs/2026-11-25-redacao-orcamento.md`.
Base preservada: implementação ainda não versionada descrita em `docs/superpowers/specs/2026-11-25-redacao-claude-resultado.md`.
Plano: `docs/superpowers/plans/2026-11-25-redacao-orcamento.md`.

## Implementação

- `lib/ai/pricing.ts`: tabela de referência da spec, com data e fonte; custo de entrada, saída, leitura e escrita de cache e desconto de 50% para lote. Modelo sem preço configurado bloqueia a operação. A escrita efêmera usa 1,25 vez o preço de entrada.
- `lib/ai/budget-policy.ts` e `lib/ai/budget.ts`: período de crédito configurável, datas em `America/Sao_Paulo`, margem de 10%, cota diária com teto de duas vezes a média, reserva de 20% para briefings e CVEs e histórico das últimas 50 matérias distintas, incluindo suas tentativas e fechamentos. Sem histórico, estima US$ 0,012 por notícia. Briefings usam estimativa conservadora de duas vezes esse valor.
- A cota diária é calculada sobre o saldo no início do dia, descontando o consumo e as reservas de hoje. Isso evita que execuções sucessivas reutilizem a mesma cota. Reservas de dias anteriores continuam ocupando o saldo do período. Além dessa estimativa, a responsabilidade pela maior resposta possível ocupa o teto absoluto do crédito antes da chamada.
- `lib/ai/claude-client.ts`: Sonnet 5.5 com esforço `low` para escrita; Haiku 5.5 com esforço `medium` para fechamento. O editor usa `messages.parse`, sem beta de fallback, `fallbacks`, `temperature` ou `thinking`. Cada resposta registra uso no ledger; erros definitivos sem uso também são registrados. Uma falha de contabilização após receber resposta é propagada e mantém a cobertura financeira.
- `lib/ai/batches.ts`: um lote por tipo e execução, `custom_id` igual ao slug ou ID da CVE, sistema com cache e JSON Schema derivado de Zod. O formato usa a transformação do SDK para o subconjunto aceito pela API, sem enviar parser. Resultados são associados pelo identificador, nunca pela posição. Há validação de recusa, truncamento e JSON/Zod, tratamento de todos os tipos de resultado e uma única tentativa normal com fallback após recusa. Essa tentativa é persistida antes do fechamento para permitir retomada.
- Os lotes têm lease persistente para impedir dois fechamentos concorrentes. A remoção do item pendente e o encerramento de sua reserva são transacionais. Depois de 24 horas, a pauta volta à fila e o cancelamento é solicitado; o lote continua sendo reconciliado até o término remoto, pois o cancelamento pode permitir cobranças de solicitações já em andamento.
- `lib/ai/news-priority.ts` e `lib/news-writing.ts`: corte de 72 horas, prioridade por importância, alerta oficial, vulnerabilidade no KEV, ransomware, APT, fonte brasileira e idade. Empates favorecem a mais recente. O fluxo normal continua disponível com `CLAUDE_USE_BATCH=false`. A publicação mantém o original até haver fechamento aprovado, e resultado de fonte alterada durante o lote é descartado.
- `lib/publication/news.ts`: evidência limpa e limitada a 6.000 caracteres. `lib/ai/claude-briefing.ts` aplica esse limite ao conjunto das fontes enviadas ao repórter. As evidências completas permanecem disponíveis para validação.
- `lib/ai/claude-briefing.ts`: reserva compartilhada entre repórter e editor; no máximo três admissões por dia, dentro da reserva financeira. Sem cota, devolve retenção transitória para o pipeline existente.
- `lib/ai/claude-cve.ts` e `lib/cves/fetch-cves.ts`: CVEs sem tradução, com CVSS maior ou igual a 9 ou no KEV, entram em lote, com limite de cinco admissões por dia e dentro da reserva. Os resultados são fechados e persistidos antes de confirmar o item do lote. Alteração da descrição ou da versão da CVE invalida o resultado antigo.
- `lib/intelligence/editorial-validation.ts`: recusa do editor produz `hold`.
- `scripts/run-local-updates.ts` e `scripts/run-updates.ts`: teto compartilhado de tokens e log de gasto diário, gasto mensal, cota restante e quantidade de itens excluídos pelo orçamento. O envio de lote reserva também uma estimativa conservadora de tokens, incluindo entrada e saída máxima.
- `README.md`: modelos, variáveis, funcionamento do lote, recarga e orientação sobre cobertura de cobranças incertas.

## Persistência e operação

`prisma/schema.prisma` e `prisma/migrations/20261125010000_ai_budget/migration.sql` acrescentam:

- `AiUsageLedger`: modelo, finalidade, item, tokens, cache, lote, custo e chave de deduplicação de resultados.
- `AiReservation`: estimativa financeira, cobertura de responsabilidade, período, dia e estado do item. A admissão e a contabilização usam lock transacional no PostgreSQL.
- `AiBatch`: identificador remoto, tipo, slugs pendentes, payload para retomada, estado, datas e lease.

**A migração foi criada e o cliente Prisma foi gerado; a migração não foi aplicada. Aplique as migrações pendentes antes da próxima coleta com esta versão.**

Um envio remoto cuja confirmação se perde mantém uma intenção `submitting`. Após 24 horas, uma intenção sem ID remoto fica `uncertain` e a pauta volta à fila. A cobertura financeira fica preservada como `awaiting_usage`, até conferir a cobrança e o lote no provedor. Esse tratamento conservador impede liberar crédito de uma operação que pode ter sido faturada. Modelos retornados sem preço conhecido e falhas de persistência também mantêm cobertura, em vez de assumir custo zero.

## Verificação

| Verificação | Resultado |
|---|---|
| `npx.cmd tsc --noEmit` | Aprovada |
| `npm.cmd run lint` | Aprovada; zero erros e três avisos preexistentes |
| `npm.cmd test` com compatibilidade do sandbox | 72 arquivos e 457 testes aprovados; código de saída 0 |
| `npm.cmd run build` com engine binário do Prisma | Aprovada; código de saída 0 |
| Build com `STATECRAFT_DATA_SOURCE=snapshot` e engine binário | Aprovada; código de saída 0 |
| `git diff --check` | Aprovada |

Os avisos de lint continuam em `__tests__/search-merge.test.ts` e `lib/ioc-extractor.ts`. Os builds usaram `PRISMA_CLIENT_ENGINE_TYPE=binary`, conforme a limitação do engine DLL já documentada na etapa anterior. Os testes usaram `NODE_OPTIONS` com o arquivo de compatibilidade preexistente `.superpowers/redacao-claude/test-env.cjs`, pois `os.userInfo` falha com `uv_os_get_passwd / ENOMEM` neste sandbox. Não alterei os testes do CLI nem dependências para contornar essa limitação.

Novos testes: `__tests__/ai-budget.test.ts`, `__tests__/ai-budget-store.test.ts`, `__tests__/ai-batches.test.ts`, `__tests__/ai-editorial-budget.test.ts` e apoio em `__tests__/helpers/budget-db.ts`. Os testes anteriores do cliente e da redação foram atualizados para os novos contratos. A cobertura inclui concorrência de reservas, recarga, último dia, margem, teto diário, limites de itens, prioridade, resultados fora de ordem, recusa, erros, cancelamento, expiração, reconciliação tardia, retomada sem repetir fallback e fonte alterada. O SDK real foi exercitado com transporte HTTP mockado. Nenhuma chamada real à API Anthropic foi feita.

A revisão independente apontou seis problemas: concorrência no fechamento, cobranças após cancelamento, falha de ledger após resposta, encerramento não atômico, fonte de briefing sem corte e agrupamento incorreto do histórico. Todos foram corrigidos e cobertos pelas verificações descritas acima.

Logs locais, ignorados pelo Git:

- `.superpowers/redacao-orcamento-tsc-final.log`
- `.superpowers/redacao-orcamento-lint-final.log`
- `.superpowers/redacao-orcamento-tests-final.log`
- `.superpowers/redacao-orcamento-build.log`
- `.superpowers/redacao-orcamento-build-snapshot.log`

Não executei coleta, publicação ou exportação de publicação; não apliquei migrações; não fiz commit ou push. As alterações anteriores foram preservadas. Não houve mudança de interface ou necessidade de inspeção visual nesta etapa.
