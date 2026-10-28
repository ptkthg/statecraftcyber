# Fase 03 — Radar e fichas de CVEs

Implementação na branch `fase-03-radar-cves`. A Fase 02 foi publicada no commit `5bcf306`, com migração aplicada e rotas públicas verificadas. Esta fase possui sua própria migração e ainda não foi aplicada em produção.

## Comportamento do radar

`/cves` e `/api/cves` compartilham o serviço `lib/cves/query.ts`. Busca, fabricante/produto, tipo, severidade, CVSS, EPSS, KEV, intervalo de publicação e análise disponível podem ser combinados por AND. A busca textual consulta identificador, descrição, tipo e produto. Underscores de CPE são convertidos em espaços no índice de consulta por produto.

- CVSS usa escala 0–10. EPSS usa porcentagem 0–100 nos filtros e probabilidade 0–1 nos dados originais.
- Zero permanece zero. Valores ausentes não satisfazem faixas numéricas.
- Severidade é filtrada pelo score numérico, evitando confiar em uma classificação textual contraditória.
- KEV tem três estados: catalogada, não catalogada na consulta e não verificada. Falha de consulta não prova ausência no catálogo.
- Datas são dias UTC. O dia final é incluído por meio do limite exclusivo no início do dia seguinte.
- Faixas invertidas, datas inválidas e paginação fora dos limites recebem HTTP 400 antes da consulta.
- Ordenação por CVSS, EPSS, publicação ou prioridade; desempate por publicação e ID. Scores nulos ficam no fim das ordenações numéricas.
- PostgreSQL faz count e consulta limitada a uma página em transação RepeatableRead. Padrão de 12 registros, máximo de 50. Uma página que ficou fora do intervalo após filtragem é ajustada.
- Filtros são preservados na URL e renderizados inicialmente no servidor. Requisições do navegador são canceladas quando substituídas. Erros preservam a lista anterior.

O radar descreve sua cobertura como cache local, não como toda a base NVD. A coleta nativa utiliza a janela existente de sete dias, com até duas páginas de 2.000 registros; cobertura incompleta é registrada em warnings. Registros históricos continuam consultáveis no cache. Uma fonte externa indisponível permite usar dados armazenados. Cache indisponível usa uma consulta de contingência paginada sobre a coleta disponível.

NVD, CISA KEV e FIRST EPSS continuam sendo as fontes das métricas. EPSS consulta grupos de até 100 IDs com dois trabalhadores e orçamento de 12 segundos; a data exibida vem do campo `date`, nunca da hora local. O catálogo KEV vazio ou inválido é indisponível, não prova de ausência. Não há chamada de IA disparada automaticamente por leitura do radar; o enriquecimento existente foi preservado em `enrichAndSave`, com as validações da Fase 01.

## Ficha individual

As sete seções são visão geral; métricas e exploração; produtos e versões; descrição e análise; impacto e condições; remediação; referências e vínculos. A linguagem visual mantém papel claro, tinta, tipografia editorial e vermelho institucional.

`sourceMetadata` preserva origem e consulta do NVD, fornecedor da métrica, vetor CVSS, CPEs com limites inclusivos/exclusivos e condições AND/OR/NEGATE, referências e suas tags, data do EPSS, consulta e dados do KEV e correções recuperadas no OSV. Dados antigos sem esses campos continuam com estado não informado.

O resumo técnico em português utiliza metadados de produto, classe e CWE, sem inventar narrativa de exploração; é identificado como resumo de metadados. O texto original permanece disponível integralmente em disclosure. Uma análise enriquecida só aparece se passar novamente pelo validador de suporte à fonte da Fase 01. Texto cuja fonte mudou é invalidado, enquanto uma atualização só de métricas preserva o texto ainda fundamentado.

O vetor CVSS é decodificado com campos das versões 2, 3 e 4. A ficha explica que essas condições são características da métrica, sem constituir evidência de exploração observada. CWE-20 e CWE-362 não são mais rotuladas genericamente como negação de serviço: aparecem como validação de entrada e concorrência.

NVD indisponível permite uma ficha armazenada marcada como antiga; EPSS antigo é ocultado nesse caso. Sem registro utilizável, há estado de indisponibilidade e link para o NVD. Registros rejeitados não aparecem no radar e a ficha não os trata como vulnerabilidade confirmada.

## Priorização operacional v1

Regras em ordem, sem soma nem score agregado:

| Faixa | Critério |
| --- | --- |
| P1 | Presença reportada no CISA KEV. |
| P2 | Referência marcada como Exploit no NVD, ou CVSS ≥9 e EPSS ≥10%. |
| P3 | CVSS ≥7 ou EPSS ≥10%. |
| P4 | Dados disponíveis abaixo dos limiares anteriores. |
| Dados insuficientes | Ausência de CVSS e EPSS, sem sinal que satisfaça regra anterior. |

A faixa vem acompanhada de justificativa e dados ausentes. O limiar de 10% é uma escolha operacional da Statecraft, não uma classificação oficial do FIRST. As regras usam o último conjunto de dados disponível, cujas datas são expostas; ausência de data ou fonte limita a interpretação. Uma referência de exploit não confirma exploração ativa nem comprometimento local. Criticidade do ativo, exposição e controles do ambiente não são conhecidos pela plataforma e precisam de avaliação própria. Registros rejeitados ficam fora dessas decisões.

## Remediação e relações

Limites CPE, incluindo `versionEndExcluding`, **não** são convertidos em correções. Versões corrigidas exigem `fixed` explícito em um registro OSV que corresponda à CVE, com pacote e ecossistema identificados e faixa SEMVER ou ECOSYSTEM. Eventos `limit`, `last_affected` e hashes de ranges GIT não são apresentados como versões corrigidas. O link OSV e o pacote acompanham cada afirmação. O lookup público pode não resolver um alias CVE; nesse caso a ausência é declarada, sem prometer cobertura completa de correções.

Ações requeridas pela CISA são citadas como texto original. Advisories, patches e mitigações são links classificados pelo NVD, sem afirmar que seu conteúdo foi integralmente revisado. Mitigações específicas existentes só são exibidas após validação de suporte à descrição original. Ausência de informação é explícita; não são produzidos comandos, versões ou bloqueios por inferência.

Briefings precisam estar publicados, validados e citar a CVE. Técnicas exigem ID oficial ativo e evidência verificável no relatório validado; inferências são omitidas. IOCs exigem registro ativo, presença no snapshot original e CVE explícita no mesmo snapshot. A ficha identifica o vínculo como contexto do briefing, sem afirmar que cada IOC ou técnica explora a CVE. Campanhas mantêm apenas o relacionamento explícito do catálogo editorial e mostram suas fontes.

## Schema e migração

`20261028010000_cve_radar/migration.sql` é aditiva e transacional. Inclui `sourceMetadata`, `productSearch`, `analysisReady`, `priorityRank`, `recordStatus` e índices de publicação, scores, prioridade e análise. Preserva conteúdo legado e não atribui retrospectivamente datas de EPSS ou consultas KEV.

O backfill de disponibilidade de análise exige política da Fase 01, digest correspondente à fonte e textos literalmente contidos nela. Demais legados permanecem não validados. O upsert em lote é parametrizado, idempotente, elimina duplicação de IDs dentro do lote, rejeita sobrescrita por versão anterior e invalida enriquecimento quando descrição/data de atualização mudam.

Aplicar a migração antes de publicar o código: backup, homologação, `npx prisma migrate deploy`, geração do cliente Prisma e deployment. Esta fase não aplicou DDL nem publicou alterações em produção.

## Verificação e arquivos

- Testes: filtros combinados, limites/datas, zero vs. ausência, ordenação, paginação, prioridade, referências, remediação, fontes parciais, ficha indisponível e relações sustentadas.
- SQL: cadeia de migrações em PostgreSQL isolado via PGlite, preservação dos legados, índices, upsert parametrizado, idempotência, preservação de texto e invalidação após mudança da fonte.
- Navegador: desktop 1440 px e mobile 375 px, aplicação combinada de produto e EPSS, fichas completa/parcial/indisponível, sete seções, ausência de overflow de página e de painéis pretos. Dados sintéticos de QA; banco de produção desativado.

```text
npm test
npx tsc --noEmit
npm run lint
npm run test:cves:migration
npm run build
```

A verificação SQL usa o PGlite já disponível em `.qa/phase1-db` ou `PGLITE_MODULE`, sem adicionar uma dependência de produção. Evidências locais: `.qa/phase3-visual-verification.json` e capturas `.qa/phase3-*.png`.

Arquivos principais: `app/cves/page.tsx`, `app/cves/[id]/page.tsx` e CSS; `components/cves/CveExplorer.tsx` e CSS; `app/api/cves/route.ts`; `lib/cves/{assessment,record,sources,query,persist,relationships,vector,fetch-cves,get-cve-detail}.ts`; `lib/intelligence/cvss.ts`; `prisma/schema.prisma` e migração citada; `__tests__/cve-{assessment,filters,detail-data,relationships}.test.ts` e fixtures; `scripts/verify-cve-radar-migration.mjs`; `package.json`.

Referências técnicas: [NVD API](https://nvd.nist.gov/developers/vulnerabilities), [CPE e faixas](https://nvd.nist.gov/developers/products), [dados FIRST EPSS](https://www.first.org/epss/data), [semântica OSV](https://ossf.github.io/osv-schema/).

Resultado local: **262 testes em 27 arquivos aprovados**; TypeScript aprovado; lint sem erros e somente três avisos anteriores em `search-merge.test.ts` e `ioc-extractor.ts`; build de produção aprovado com banco e chaves de IA desativados; migração SQL aprovada em PostgreSQL isolado. Não houve chamadas pagas de IA. As capturas e o relatório do navegador estão em `.qa`, fora do controle de versão.
