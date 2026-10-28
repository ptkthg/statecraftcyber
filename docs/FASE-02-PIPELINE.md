# Fase 02 — Pipeline de inteligência

## Escopo e arquitetura

Mantidos Next.js, Prisma/PostgreSQL, Groq/OpenRouter e os adaptadores NVD, CISA KEV, FIRST EPSS, AlienVault OTX e RSS, além de abuse.ch, Feodo e CINS. Não há serviço de fila novo: o PostgreSQL existente armazena lotes recebidos, eventos pendentes e versões. A condição editorial e o CHECK de publicação da Fase 01 continuam obrigatórios. “Processado” significa tentativa de análise concluída; não significa validado ou publicado.

Fluxo: coleta com falhas isoladas → lote persistido → validação/normalização → identidade de fonte e correspondência de eventos → fila de enriquecimento → validação da Fase 01 → transação com briefing, inventário de IOCs e versão auditável.

`CollectionBatch` guarda o conjunto completo recebido antes do limite de geração. Um cursor é confirmado na mesma transação que a observação correspondente. Lotes incompletos sobrevivem ao encerramento da função; conjuntos idênticos ainda pendentes são coalescidos por fingerprint. Uma nova observação de conjunto já processado volta a atualizar os timestamps sem gerar outro artigo. O consumo pode demandar várias execuções; não há promessa de processamento imediato de todo o backlog.

## Identidade e critérios verificáveis

SHA-256 com serialização ordenada, sem embeddings nem decisão de IA:

| Regra | Condições |
| --- | --- |
| Identidade da fonte | Nome normalizado + identificador externo. Feeds periódicos usam nome + chave estável da família, em vez do identificador diário. |
| Vulnerabilidade canônica | Registro explicitamente nativo de vulnerabilidade e exatamente uma CVE. NVD e CISA podem contribuir ao mesmo evento. Um artigo que cita essa CVE continua um evento distinto. |
| Feed periódico | Mesma fonte e mesma `periodicKey`; famílias distintas permanecem separadas. Ausência de uma família na coleta não prova sua remoção. |
| Mesma publicação | Mesma URL canônica de artigo, com caminho diferente de `/`, mesmo tipo, datas dentro de 72h e sem CVEs/campanhas explicitamente disjuntas. |
| Republicação literal | Mesmos título e corpo normalizados, corpo com pelo menos 20 tokens distintos, mesmo tipo e janela de 72h. |
| Similaridade ancorada | Pelo menos 12 tokens distintos em cada corpo; Jaccard de título ≥0,85 e corpo ≥0,88; e CVE/campanha explícita compartilhada ou ≥3 IOCs estruturados compartilhados com Jaccard de IOCs ≥0,80. |
| Ambiguidade | Duas correspondências por similaridade ancorada com diferença de score <0,02: criar outro evento e associar o candidato, sem fusão automática. |

Score de apoio: `0,4*título + 0,5*corpo + 0,1*IOCs`. Score ≥0,55 sem os requisitos de equivalência permite apenas associação. Campanha, CVE, fonte ou indicador isolado não bastam. Candidatos textuais são eventos observados nos últimos sete dias; as identidades canônicas e de fonte não dependem dessa janela. O perfil fundador é preservado para evitar fusões transitivas por deriva. `SourceRecord.matchEvidence` registra a regra e o perfil utilizados.

A normalização de URL de publicação remove fragmentos e parâmetros de rastreamento. A identidade de IOC URL preserva caminho, consulta e suas maiúsculas/minúsculas; dois payloads no mesmo domínio não viram um único IOC. A função antiga de normalização continua disponível para os consumidores legados.

## Atualização e rastreabilidade

- `firstObservedAt`/`lastObservedAt`: observações locais; lotes atrasados usam os instantes registrados na coleta, não a hora da geração. Em registros legados, o backfill usa `createdAt`, sem fabricar uma data da fonte.
- `sourcePublishedAt`/`sourceUpdatedAt`: datas fornecidas pela fonte; atualização desconhecida continua nula. Uma consulta nova não é uma atualização da fonte.
- `sourceLastSeenAt`: informação temporal explícita do provedor do IOC, separada da observação local.
- `SourceRecord.rawPayload` e, quando disponível, `originalPayload`: entrada original antes da IA; entidades normalizadas e problemas são campos separados.
- `SourceRevision`: versão de mudanças da entrada, inclusive alterações apenas de metadados. Alterações materiais, entidades, métricas e dados técnicos nativos são comparados separadamente para decidir sobre enriquecimento.
- `BriefingRevision`: snapshot editorial e fontes originais, com revisão de cada registro, IOCs adicionados/removidos e relação com outro evento. Antes de atualizar um artigo legado, salva a revisão zero e preserva seu slug.
- Triggers PostgreSQL impedem UPDATE/DELETE das versões. FKs impedem apagar suas fontes e execuções. Retenção e arquivamento exigem uma política explícita posterior.

Snapshots atrasados não substituem uma atualização mais recente da fonte; sem data de atualização confiável, a ordem de observação serve como proteção conservadora. O lote bruto continua auditável. Atualizações materiais retiram a versão anterior da circulação enquanto a nova análise está pendente. Briefing, IOCs, versão e confirmação da fila são gravados em uma única transação. Uma revisão mais nova da fonte ou perda do lease impede a gravação de uma geração antiga. Alterações apenas de observação preservam o `updatedAt` editorial.

## IOCs, entidades e qualidade

Conjuntos parciais unem os indicadores recebidos aos anteriores e nunca inferem remoções. Apenas snapshots explicitamente completos podem substituir o conjunto daquela fonte. O inventário utiliza a união das fontes do evento; ausência em uma fonte não elimina um IOC ainda presente em outra. IOCs aposentados continuam armazenados, com `isActive=false` e `retiredAt`, e são excluídos dos filtros públicos e exportações. Indicadores legados de completude desconhecida não são aposentados automaticamente. Ausência de coleta, truncamento e ausência de uma família não provam remoção.

CVEs, produtos, fabricantes, campanhas, atores e IOCs estruturados preservam campo e URL de origem. CVEs/IOCs/técnicas encontradas no texto são marcadas como menções; menções de IOC e campanha não são promovidas a evidência estruturada nem usadas para justificar bloqueios. Técnicas estruturadas passam pelo validador oficial da Fase 01; IDs/nomes/evidências incompatíveis impedem o enriquecimento. Não há atribuição automática de fabricante ou campanha por adivinhação.

Verificações incluem campos obrigatórios, referência HTTP(S), datas inválidas ou mais de 24h no futuro, atualização anterior à publicação, formato de IOC, confiança fora do enum, métricas fora da faixa/escopo e inconsistências apontadas pelo seletor CVSS. Um contribuinte inválido não é silenciosamente descartado para tornar o restante publicável: o evento fica em quarentena. Os motivos permanecem em `qualityIssues` e `lastErrorCode`.

Enriquecimento exige descrição original com pelo menos 80 caracteres e ausência de erros estruturais. Descrições sintéticas dos feeds periódicos são marcadas como geradas e preservadas para consulta/reprocessamento; não sustentam por si uma análise editorial. Referências, fatos e recomendações ainda precisam passar integralmente pela Fase 01.

NVD consulta alterações das últimas 24h, incluindo redução de pontuação e rejeições. Um registro rejeitado invalida a análise anterior. A página NVD é limitada a 2.000 entradas; truncamento é sinalizado como falha parcial, não como coleta completa. OTX mantém o limite de coleta existente e sinaliza paginação pendente como coleta parcial; o pipeline não transforma cobertura limitada em prova de ausência. EPSS divide as consultas em grupos de até 100 CVEs. Os limites de RSS e amostras de feeds permanecem; listas truncadas/incrementais não recebem a marca de snapshot completo. Não há garantia de recuperação de mudanças que ocorreram fora das janelas dos provedores durante uma interrupção prolongada.

## Execução, retries e métricas

- Lease global no PostgreSQL: 55s; aquisição condicional atômica e verificação do proprietário dentro das transações. Execução concorrente recebe HTTP 409.
- Orçamento interno: até 52s, coleta até 22s; geração limitada a 1–5 eventos por chamada e ao tempo restante. O backlog permanece persistido.
- `Idempotency-Key`: 1–128 caracteres `[a-zA-Z0-9:_.-]`; padrão por minuto UTC. Uma chave já finalizada devolve seu resultado armazenado sem refazer trabalho. Use outra chave para a próxima execução, inclusive após falha finalizada.
- Execuções encerradas sem finalização são marcadas `abandoned` quando outro proprietário assume. Donos antigos não podem gravar os resultados nem remover o lease novo.
- Até três adaptadores e quatro requisições HTTP simultâneas; RSS/EPSS têm grupos de dois trabalhadores. Timeouts consideram fila, cabeçalhos e leitura do corpo.
- GET/HEAD: até duas tentativas padrão em erro de rede, 429 e 500/502/503/504, com backoff, jitter e respeito a `Retry-After`. Não antecipar retry que exceda o orçamento.
- POSTs de IA não têm retry HTTP automático; retries internos do SDK Groq estão desativados. Um fallback para outro provedor é outra chamada, contabilizada. Consumo usa exclusivamente tokens reportados pelo provedor; ausência é `usageUnknown`, sem estimativa de custo.
- Falhas de geração/persistência: até três tentativas por revisão, com espera de 1 e 2 minutos; depois `quarantined`. Uma alteração material reinicia o ciclo. Conteúdo incompleto concluído fica em draft e não gera chamadas repetidas sem mudança ou solicitação explícita.

`PipelineRun.metrics` e `CronLog.metrics` registram coleta, observações, inalterados, agrupamentos, eventos novos, gerações, criações/atualizações, rejeições, pendências, falhas e deltas de IOCs. Fontes sem credencial configurada ficam como `skipped`, sem simular uma coleta bem-sucedida. Por fonte: duração, quantidade recebida, requisições, retries, timeouts, parsing, rate limits e códigos de erro. IA: tentativas, sucesso/falha, tokens conhecidos/desconhecidos e parsing. `partial` é distinto de `success`; falhas não são disfarçadas por um HTTP 200 de coleta parcialmente útil. `/admin/status` mostra fila e métricas das últimas dez execuções. Payloads originais e segredos não são enviados como erros públicos.

## Reprocessamento controlado

`POST /api/admin/pipeline`, autenticado com o Bearer `CRON_SECRET` existente:

```json
{"eventId":"id-real-do-evento","revision":3,"reason":"Evidência original corrigida e pronta para nova validação"}
```

Retorna 202 e apenas enfileira. Revisão divergente ou execução ativa retorna 409. A solicitação e o motivo ficam auditados em `PipelineRun`; não há bypass da validação ou declaração de revisão humana. `/api/admin/regenerate` mantém os seletores `slug`, `last` e `all`, mas agora também enfileira trabalho e retorna 202 com `queued`; não executa IA síncrona nem sobrescreve histórico. Legados sem snapshot original são sinalizados para nova coleta. Cookies administrativos continuam com o escopo existente; para chamadas operacionais use o Bearer.

## Migração e validação

Migração aditiva: `prisma/migrations/20261028000000_intelligence_pipeline/migration.sql`, transacional, sem apagar conteúdo e sem alterar o CHECK editorial da Fase 01. Inclui tabelas de lote/fila/execução/lease/fontes/versões, metadados de observação e atividade, índices, FKs e triggers de auditoria.

Antes da publicação: backup PostgreSQL, aplicação em homologação e execução de `npx prisma migrate deploy`, depois publicação da aplicação com o cliente Prisma gerado para esse schema. Não executar a nova aplicação contra schema anterior. Rollback do código deve preservar as tabelas de auditoria; não excluir versões para reverter uma interface. Esta implementação não aplicou DDL em produção nem publicou a Fase 02.

Comandos de verificação:

```text
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:intelligence:migration
npm run test:pipeline:migration
```

As verificações de migração usam PostgreSQL isolado via PGlite, sem conexão de produção. Dependência já instalada em `.qa/phase1-db`; em outro ambiente, instale `@electric-sql/pglite` em diretório de ferramentas isolado ou forneça `PGLITE_MODULE` apontando para seu `dist/index.js`. Não é uma dependência de runtime da aplicação. Os testes do serviço usam um double transacional; o script SQL valida separadamente migrações, constraints, FKs, imutabilidade, lease/fencing e rollback no PostgreSQL. Testes de adaptadores usam respostas controladas e não consomem APIs pagas.

## Arquivos principais

- `lib/pipeline/{normalize,dedup,context,http,service,control}.ts`: regras, correspondência, observabilidade, rede, persistência e reprocessamento.
- `lib/threat-sources/*.ts`: metadados, proveniência, feeds periódicos, retries e concorrência.
- `lib/ai-briefing.ts`, `lib/cves/enrich-cve.ts`: orçamento de rede/IA e consumo real reportado.
- `app/api/cron/update-briefings/route.ts`: autenticação e orquestração.
- `app/api/admin/{pipeline,regenerate}/route.ts`, `app/admin/status/page.tsx`: operação auditada e diagnóstico.
- `lib/intelligence/publication.ts`, `app/api/search/route.ts`: exclusão de IOCs aposentados.
- `prisma/schema.prisma` e migração citada: schema compatível e histórico.
- `__tests__/pipeline-*.test.ts`, `__tests__/helpers/pipeline-db.ts`: consistência, falhas e contratos; testes de publicação e Feodo atualizados.
- `scripts/verify-pipeline-migration.mjs`, `package.json`: verificação SQL reproduzível.

## Resultado da verificação local

- `npm test`: 225 testes em 23 arquivos aprovados.
- `npx tsc --noEmit`: aprovado.
- `npm run lint`: nenhum erro; três avisos anteriores, em `search-merge.test.ts` e `ioc-extractor.ts`.
- `npm run build`: compilação e geração das rotas aprovadas, com banco e chaves de IA desativados. As páginas registraram os avisos esperados de banco indisponível nesse modo; esse build não valida conectividade de produção.
- Verificações SQL das Fases 01 e 02: aprovadas em PostgreSQL isolado. Nenhuma migração aplicada em produção e nenhuma chamada de IA paga executada.
