# Fase 01 — Confiabilidade técnica e validação de inteligência

## Escopo e resultado

Política implementada: phase1-v1. A arquitetura permanece Next.js App Router, Prisma/PostgreSQL, adapters de fontes e geradores existentes. As validações são funções determinísticas compartilhadas, executadas antes da publicação e da exposição pública.

Esta fase não comprova que toda afirmação de uma fonte externa é verdadeira. Ela verifica procedência capturada, correspondência literal, coerência de métricas e requisitos mínimos. A interface distingue relato de terceiros de observação própria e não declara revisão humana.

## Problemas encontrados

- Severidade, probabilidade de exploração e confiança estavam misturadas: KEV e EPSS elevavam severidade técnica; CVSS elevado aumentava confiança automaticamente.
- Nomes MITRE mantidos em duas tabelas divergentes. T1583.008 era descrita como aquisição de infraestrutura de rede, mas o nome oficial é Malvertising.
- Técnicas eram atribuídas por tipo de feed, sem evidência de comportamento. Listas de C2 não demonstram, por si só, técnica de protocolo ou de proxy.
- O parser convertia respostas inválidas/incompletas em objetos preenchidos com mensagens genéricas.
- AUTO_PUBLISH publicava fallbacks e candidatos incompletos sem avaliação de qualidade.
- O fallback inventava contexto operacional e recomendava bloquear todos os IOCs imediatamente.
- A regeneração reutilizava resumos gerados como se fossem descrições originais.
- Acesso direto a um slug e consultas/exportações de IOCs não aplicavam o mesmo critério dos briefings públicos.
- Limite superior excluído em CPE era interpretado como versão corrigida. Isso não comprova um patch.
- Prazos KEV eram apresentados como obrigação universal; a aplicabilidade do prazo BOD não é universal.
- Setores, regiões, datas de publicação e severidades eram presumidos pelos adapters.
- A deduplicação por identidade ignorava correções posteriores na fonte. O backfill podia pular registros ao usar offset sobre uma seleção que ele próprio alterava.
- structuredContent existia no schema, mas não em sua cadeia de migrações. A migração nova corrige essa lacuna quando a coluna ainda não existe.

## 1. MITRE ATT&CK

Catálogo oficial Enterprise ATT&CK armazenado em data/mitre-enterprise.json, com 867 registros, incluindo registros históricos para rejeição de técnicas revogadas/descontinuadas.

- Revisão Git: c2494b29dd268c46a5d0ea0990553e4327cd2253.
- SHA-256 do bundle oficial: 81113ba98afa2928f3dcff62022539f7ce30c315c32e14422f11ff95ce534352.
- Origem: repositório oficial mitre-attack/attack-stix-data, fixado pelo commit, não pelo conteúdo futuro de master.
- Consulta em runtime usa o snapshot local, sem depender de uma API MITRE por briefing.
- IDs fora do domínio Enterprise, inexistentes, malformados, revogados ou descontinuados são rejeitados; não são corrigidos por adivinhação.
- Os nomes são os nomes oficiais canônicos. Um nome incompatível com o ID bloqueia a associação.
- A aplicação de uma técnica exige associação estruturada capturada da fonte, ID, trecho literal e identificação do snapshot.
- OTX preserva os attack_ids originais e suas associações estruturadas. Uma menção textual isolada, negativa ou fora de contexto não é aceita como aplicação.
- observed exige telemetria própria e associação estruturada desse tipo. Nenhum adapter externo promove seus relatos a observações próprias.
- reported identifica associação explicitamente reportada.
- inferred permanece identificada como inferência e impede aprovação automática.
- Os IDs inseridos apenas na prosa ou em arrays da IA também são verificados.

Atualização deliberada do catálogo:

    npm run mitre:update

Revise o diff e execute os testes antes de incorporar uma nova revisão. A validação descrita aqui cobre Enterprise ATT&CK; outros domínios não são aceitos silenciosamente.

Fontes oficiais:
- https://attack.mitre.org/resources/attack-data-and-tools/
- https://github.com/mitre-attack/attack-stix-data/blob/master/USAGE.md

## 2. Classificação e confiança

Dimensões independentes em qualityReport.risk:

| Dimensão | Regra |
| --- | --- |
| Severidade técnica | CVSS aplicável a uma CVE identificada, finito, entre 0 e 10 |
| Probabilidade | EPSS finito entre 0 e 1, associado à CVE solicitada |
| Exploração conhecida | Evidência do catálogo/relato; não altera o CVSS |
| Prioridade operacional | Sugestão separada; KEV/exploração conhecida eleva prioridade, não severidade técnica |
| Confiança analítica | Procedência, conteúdo, temporalidade e corroboração independente |

CVSS 4.0, 3.1, 3.0 e 2.0 utilizam uma seleção comum: versão mais recente disponível e métrica Primary dentro da versão. Pontuações inválidas são descartadas. Contradições entre número e classificação da fonte bloqueiam o briefing. CVSS 0.0 é identificado como nenhuma severidade técnica; o enum legado de briefings continua compatível, com sua faixa interna baixa.

Sem CVE identificada, CVSS e EPSS não são usados. Uma pontuação escalar não é atribuída automaticamente a várias CVEs.

Classificações explícitas da fonte podem ser usadas para eventos. Severidade heurística do adapter é identificada como avaliação, sem substituir severidade estabelecida. Ausência de classificação mantém o candidato fora da publicação.

Critérios de confiança desta versão, configurados no código e documentados como política do produto:
- Alta: material original recente de NIST e CISA, organizações independentes, referenciando a mesma CVE.
- Média: ao menos uma dessas organizações primárias com material original recente e contexto suficiente.
- Baixa: fonte comunitária/desconhecida, material escasso, sem data original ou antigo.
- Recência para essa regra: até 30 dias; tolerância máxima de um dia para datas futuras.
- Endereços nvd.nist.gov e services.nvd.nist.gov contam como a mesma organização.
- Nome de fonte fornecido pela IA, contagem de indicadores e gravidade não concedem confiança.

Esse recorte de fontes primárias é intencionalmente conservador. Uma fonte de fornecedor ainda não cadastrada não ganha confiança alta automaticamente. Elevar confiança não constitui confirmação de todas as afirmações.

Probabilidade e severidade seguem as distinções de finalidade descritas pela FIRST:
https://www.first.org/epss/using-epss

## 3. Afirmações e alucinações

Cada campo factual e cada item de ação/detecção exige claims com field, kind, sourceId e quote.

- sourceId só pode identificar snapshots fornecidos pelos serviços de ingestão/enriquecimento.
- A IA não cria fontes autorizadas.
- quote precisa existir literalmente no snapshot original.
- A passagem deve preservar limites de sentença/parágrafo. Um recorte que elimine negação ou ressalva é rejeitado.
- Para aprovação automática, o valor do campo deve ser igual à passagem citada, após trim.
- A simples presença de uma citação não demonstra que uma paráfrase seja sustentada.
- Traduções, paráfrases e inferências permanecem como candidatos enriquecidos, sem exposição pública, até uma revisão semântica que esta fase não implementa.
- Inferências precisam de identificação explícita como Avaliação analítica:.
- Campos sem dados ficam vazios, em vez de receber textos repetidos para aparentar completude.
- IDs CVE, IDs MITRE e IOCs gerados sem correspondência com a ingestão são rejeitados.
- Métricas narradas e classificações explícitas são verificadas contra as métricas canônicas.
- Confiança e justificativa exibidas são calculadas no servidor. O markdown e o JSON estruturado recebem a mesma versão canônica.
- Notas de revisão humana inexistente bloqueiam a publicação.

Consequência deliberada: esta política reduz a quantidade de conteúdo gerado elegível para publicação automática. Mantém-se o texto original quando não há tradução validável. Não há aprovação semântica automática ou revisão humana implícita.

Caches de notícias e CVEs possuem relatório de qualidade. Conteúdo gerado legado sem comprovação não é tratado como validado. Candidatos retidos são armazenados em unpublishedCandidate; não são devolvidos como conteúdo editorial. Aprovações de texto são vinculadas ao SHA-256 da fonte e verificadas novamente contra ela.

## 4. Requisitos mínimos e estados

Requisitos universais:
- Fonte nomeada, URL HTTP/HTTPS sem credenciais, descrição original e data original válida.
- Título com pelo menos 10 caracteres.
- Resumo, evento, impacto, exposição e detalhes técnicos: ao menos 30 caracteres por seção.
- Seções essenciais distintas, sem preenchimento genérico.
- Evidências para todos os campos factuais preenchidos.
- Coerência de classificações e nenhuma pendência bloqueante.

| Tipo | Requisitos adicionais |
| --- | --- |
| Vulnerabilidade | CVE válida; ações fundamentadas; pontuações só quando efetivamente disponíveis |
| Relato de IOCs | Ações, detecções e contexto concreto de falsos positivos |
| Evento | Detecções fundamentadas; CVSS não aplicável sem vulnerabilidade identificada |

Os limites de caracteres detectam insuficiência; não são prova de suporte técnico.

Estados analíticos:
- preliminary: geração ausente/inválida, seções ausentes, genéricas ou repetidas.
- enriched: candidato estruturado retido por pendência, tradução, inferência ou contradição.
- validated: verificações automáticas aprovadas e nenhuma pendência.
- status editorial draft/published continua separado. validated não significa revisão humana.

AUTO_PUBLISH só pode promover um registro validated e publishable com issues vazio. A gravação começa sempre em draft; a promoção ocorre após a persistência dos IOCs. Erro intermediário mantém o registro fora do público.

A política pública é aplicada a página inicial, listagens, detalhe por slug, referências cruzadas, sitemap, estatísticas, APIs, busca textual, IOCs correlacionados e exportação.

A restrição PostgreSQL exige relatório da versão correta, conteúdo estruturado, snapshot, evidências, zero pendências e classificações coerentes para status published. A restrição é defesa adicional; a validação semântica não é delegada ao SQL.

## 5. Recomendações operacionais

A presença em feed comunitário não autoriza bloqueio.

A política de IOCs considera:
- Confiança do indicador e URL de procedência.
- Última observação válida, não data de coleta.
- Janela de sete dias para recência operacional.
- Confirmação por telemetria local.
- Avaliação explícita de infraestrutura compartilhada e falsos positivos.

Sem esses elementos, a ação é review. Mesmo com os requisitos, o resultado é conditional-containment: contenção temporária e reversível sujeita à decisão operacional, sem bloqueio indiscriminado.

Nenhum adapter atual fabrica confirmação local. Recomendações de bloqueio/contenção geradas pelo modelo ficam retidas para revisão operacional, mesmo quando copiadas de uma fonte.

Prazos CISA são contextualizados para seu escopo regulatório. Limites CPE não são tratados como confirmação de patch. Setores/regiões não são preenchidos por suposição; nome de adversário não é país.

## 6. Persistência, recoleta e auditoria

Briefing recebe analysisStatus, qualityReport, sourceSnapshot, operationalPriority e severityBasis. NewsCache recebe qualityReport, sourceSnapshot e sourcePublishedAt. CveCache recebe qualityReport.

A deduplicação continua usando a identidade estável do evento. A revisão da fonte considera seu conteúdo; fonte modificada ou registro legado sem snapshot é reprocessado sob o mesmo slug, sem duplicar o briefing. IOCs obsoletos desse registro são removidos antes da nova promoção.

A limpeza automática de briefings por idade foi removida desse fluxo: registros preliminares e retidos são preservados para auditoria. Retenção deve ser política separada.

Auditoria sem escrita por padrão:

    npm run audit:intelligence -- --limit 100

Para aplicar relatórios e reter registros inconsistentes, em um ambiente com DATABASE_URL configurada:

    npm run audit:intelligence -- --apply --limit 100

O modo apply não promove rascunhos. Um legado sem snapshot precisa de nova coleta; seu resumo anterior não é prova de origem. O backfill permanece preliminar e não concede validação retroativa.

## 7. Migração e implantação

Arquivo: prisma/migrations/20261027000000_intelligence_validation/migration.sql.

A migração preserva conteúdos e registros. Ela retira de publicação os briefings legados, que não possuem as evidências requeridas. Logo após a migração pode haver redução significativa ou ausência temporária de briefings públicos até a nova coleta e validação. Notícias originais/RSS e métricas originais de CVEs continuam disponíveis; enriquecimentos não comprovados são retidos.

Procedimento recomendado:
1. Fazer backup do banco.
2. Validar a cadeia de migrações em staging com os dados reais.
3. Coordenar migração e nova versão, evitando que o código anterior continue tentando publicar sem prova.
4. Executar prisma migrate deploy no ambiente desejado.
5. Publicar a versão desta branch.
6. Executar auditoria sem escrita e revisar as pendências.
7. Recoletar as fontes e verificar o resultado do cron e os relatórios administrativos.

Nesta execução, nenhum banco de produção foi migrado e nenhum deploy desta fase foi realizado. Não foram feitas chamadas pagas de geração para validar o sistema.

## 8. Verificações executadas

- npm test: 179 testes aprovados em 17 arquivos.
- npx tsc --noEmit: checagem TypeScript.
- npm run lint: sem erros; três avisos anteriores à fase, em search-merge.test.ts e ioc-extractor.ts.
- npx prisma validate: validação do schema.
- node scripts/verify-intelligence-migration.mjs: cadeia completa em PostgreSQL/PGlite em memória, preservação do legado, retenção e restrição de publicação.
- npm run build: concluída com sucesso, incluindo compilação, TypeScript e geração das páginas. Sem DATABASE_URL neste ambiente, as leituras do banco durante a prerenderização retornaram pelos caminhos de fallback; isso não equivale a um teste de integração com produção.

O teste de banco usa somente uma instalação temporária em .qa/phase1-db. Não adiciona dependência ao aplicativo. Para reproduzir:

    npm install --prefix .qa/phase1-db --no-save --package-lock=false @electric-sql/pglite
    npm run test:intelligence:migration

Principais cenários automatizados: ID/nome MITRE inválido, revogação, menção sem associação, inferência e observação própria; independência de CVSS/EPSS/confiança/prioridade; pontuações inválidas; citações fabricadas e recortes de negação; seções ausentes/repetidas; métricas contraditórias; CVEs/IOCs inventados; conteúdo legado e divergência de metadados; bloqueio indiscriminado; erros de persistência; autenticação; filtros públicos e exportação; alterações da fonte e recoleta.

## 9. Arquivos alterados

A relação completa desta fase está no manifesto docs/FASE_01_ARQUIVOS.txt. Principais grupos:

- lib/intelligence/: tipos, fontes, suporte literal, MITRE, CVSS, classificação, regras de publicação, textos, CVEs e auditoria.
- lib/ai-briefing.ts, lib/briefing-generator.ts, lib/briefing/parse-structured-briefing.ts: geração e validação.
- lib/severity-scoring.ts, lib/mitre-names.ts, data/mitre-enterprise.json: critérios e catálogo.
- lib/threat-sources/: correções dos adapters, procedência, classificações e datas.
- lib/cves/, lib/ai-news.ts, lib/news-localization.ts: proteção dos enriquecimentos/caches.
- prisma/schema.prisma e migração: persistência e restrição.
- app/api/, app/page.tsx, app/threat-briefings/, app/iocs/, app/sitemap.ts e referências cruzadas: leituras/escritas sob política uniforme.
- components/briefing/EvidenceNotes.tsx e app/admin/status/page.tsx: rastreabilidade e pendências.
- scripts/audit-intelligence.ts, scripts/update-attack-catalog.mjs, scripts/verify-intelligence-migration.mjs e backfill: manutenção.
- __tests__/intelligence-*.test.ts, fixtures e testes de adapters/notícias: cobertura.
- Configurações: comandos npm e exclusão de artefatos temporários de QA em lint/TypeScript/Git.