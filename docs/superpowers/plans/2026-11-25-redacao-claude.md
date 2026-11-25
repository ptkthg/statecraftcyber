# Plano de implementação da redação Claude

**Objetivo:** implementar `docs/superpowers/specs/2026-11-25-redacao-claude.md`.
**Arquitetura:** cliente Anthropic tipado, validação determinística seguida de fechamento editorial e persistência dos relatórios vinculados à fonte. Leituras públicas apenas consomem resultados aprovados.
**Tecnologias:** Next.js 16.2.6, Prisma 6, Zod 4, Anthropic SDK 1.14 e Vitest.

## Restrições

Não executar coleta ou publicação; não fazer commit ou push; não alterar `data/publication/`; não ler nem alterar `.qa/.env*`. Preservar os prompts das personas; exportar apenas a lista de expressões proibidas. Usar o diretório atual para preservar os arquivos pendentes fornecidos pelo usuário.

## Tarefas e verificações

- [x] Cliente (`lib/ai/claude-client.ts`, `lib/pipeline/context.ts`): testes mockados de parâmetros, recusa, truncamento, erros tipados, consumo e teto por execução; implementação tipada contra o SDK instalado.
- [x] Política (`lib/intelligence/editorial-validation.ts`): testes de números, identificadores, nomes próprios, estilo, citações falsas e fechamento incompleto; manter `phase1-v1` e vincular os relatórios ao texto e à fonte.
- [x] Notícias (`lib/news-writing.ts`, cache Prisma, exportação e leitores): testar ordem, limite, hold com duas novas tentativas, kill por sete dias, preservação da fonte e nenhuma geração durante leitura.
- [x] Briefings e CVEs: testar aprovação editorial das narrativas mantendo as demais travas; Anthropic tem precedência e reserva só sem chave Anthropic.
- [x] Interface e documentação: assinatura e selo somente para automação, avaliação separada no detalhe e metodologia atualizada.
- [x] Verificação final: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` e build com `STATECRAFT_DATA_SOURCE=snapshot`. Registrar resultados e limitações no arquivo de resultado solicitado.

## Foco da revisão

Fonte modificada invalida aprovação; respostas incompletas nunca publicam; erros transitórios não consomem tentativa editorial; o teto inclui tokens de cache; trechos de fontes distintas não podem ser combinados para validar afirmações; a política literal permanece válida para os caminhos legados.

## Resultado

Implementa??o e verifica??o conclu?das. Limita??es do sandbox e ajustes usados est?o em docs/superpowers/specs/2026-11-25-redacao-claude-resultado.md. Nenhum commit, push, coleta ou publica??o foi executado.
