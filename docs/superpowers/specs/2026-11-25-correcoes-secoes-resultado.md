# Resultado — correções por seção (25/11/2026)

**Status: implementação parcial, bloqueada por negação de escrita em arquivos do workspace. Não atende ainda a todos os critérios de aceite.**

Base: spec `docs/superpowers/specs/2026-11-25-correcoes-secoes.md` e auditoria `docs/superpowers/specs/2026-11-25-auditoria-secoes.md`. Foram lidos `AGENTS.md` e os guias locais do Next para páginas, fontes, metadata e tratamento de erros. Sem commit ou push no repositório, coleta, publicação, alteração da configuração Vercel ou dos arquivos protegidos.

## O que foi aplicado

- **Resiliência:** `app/error.tsx`, `app/not-found.tsx`, `app/loading.tsx` em português; layout preservado. Erro oferece recuperação e home sem mensagem técnica. O leitor lança `SnapshotUnavailableError` com causa preservada e limpa a promessa rejeitada para permitir nova tentativa. Home, briefings, IOCs e detalhe de notícia distinguem falha de fonte de ausência de publicação.
- **Home:** hero seguido de faixa real de CVEs críticas em 72 h/KEV/data, seis notícias, campanhas, briefings somente quando existem e editorias. Links aplicam filtros correspondentes, incluindo `window=72h`.
- **Briefings:** cabeçalho compacto com data; um único briefing em Todos não produz falso estado vazio. IocTable orienta validar antes de bloquear.
- **CVEs:** leitura da listagem sem coleta externa, tanto no banco quanto no snapshot. EPSS vence pela mesma regra do detalhe, antes de filtrar, ordenar e paginar. Busca, severidade, KEV e ordenação ficam visíveis; filtros restantes em details fechado. Coleção indisponível difere de combinação sem resultados. CVE válido ausente recebe noindex, e aviso de snapshot antigo não sugere consulta externa. Marcador HTML de conteúdo é omitido se a fonte falhar.
- **Notícia individual:** falha da fonte tratada; publicação/data/canonical em metadata; CVEs convertidos apenas em nós de texto fora de links/atributos. `htmlparser2` é dependência direta, com lock atualizado. Proveniência opcional `contentOrigin` distingue texto original e automatizado na exportação futura; snapshot legado usa crédito neutro e não inventa autoria. Nenhum conteúdo do snapshot existente foi alterado. Sem skeleton de geração no modo snapshot.
- **IOCs:** aplica `?q=`, cancela busca anterior e ignora resposta obsoleta mesmo quando o transporte ignora abort; comunica falhas e permite tentar novamente. Link de briefing/confiança permanecem no mobile. Exportação informa truncamento acima de 500; CSV escapa todos os campos. Exemplos usam IP/documentação e `.example`. Título/código do diálogo KQL têm contraste para tema claro.
- **Global:** busca com combobox/listbox, ids de opções e aria-activedescendant/aria-selected; texto e seleção legíveis no tema claro. Canonicals e títulos sem marca repetida nas rotas acessíveis. Cabeçalho reutilizável em `components/PageHeader.tsx`, com CSS module próprio, título limitado por clamp e data em America/Sao_Paulo. Aplicado a CVEs, briefings, IOCs e metodologia.
- **Metodologia/README:** Postgres local, rotina horária no computador do operador, snapshot publicado e health degradado após 3 h. Defaults documentados: Groq `openai/gpt-oss-120b`, fallback OpenRouter `anthropic/claude-3.5-haiku`. Prioridade CVE determinística e nenhuma geração durante leitura snapshot.
- **Verificação de publicação:** inclui metodologia/sobre/créditos e detalhe de campanha descoberto pelo link real do índice. Notícias/CVEs exigem marcador HTML. Testes usam fetcher simulado; não se executou publicação. Corrigida interpretação de caminhos Windows pelo tar na fixture de staging usando caminhos relativos.

## Bloqueios e patches preparados

O ambiente negou escrita com `EPERM`/`UnauthorizedAccessException` nestes caminhos, inclusive por apply_patch. Não foram alteradas ACLs, solicitada elevação nem excluídos/recriados arquivos negados. Foi solicitado ao usuário liberar a escrita pelo ambiente, sem resposta durante a execução.

- `app/layout.tsx`: Newsreader com eixo opsz, remoção Plex Sans e metadataBase ainda pendentes.
- `app/editorial.css`, `app/editorial-extensions.css`, `app/editorial-final.css`, `app/news-editorial.css`, `app/article.css`: troca completa de aliases/fontes antigas, pesos/tracking/tamanhos globais ainda pendente. Existem referências antigas no CSS atual. Ajustes acessíveis foram feitos nos módulos CVE e editorial-overrides.
- `app/campanhas/page.tsx`, `app/sobre/page.tsx`: cabeçalhos compactos e canonical pendentes.
- `components/editorial/CampaignIndex.tsx`: correção de `datacenter.webp` para `datacenter-ache.webp` e data UTC pendentes.
- `app/creditos-visuais/page.tsx`: descrição própria/canonical pendentes.
- `app/noticias/page.tsx`: captura de falha, cabeçalho compacto, canonical e marcador de conteúdo ainda pendentes. A página pode continuar falhando quando a fonte estiver indisponível.
- `components/editorial/`: criação do cabeçalho foi negada; usado o caminho alternativo `components/PageHeader.tsx`, permitido pela spec como exemplo de localização.

Patches preparados e validados com `git apply --check`, **não aplicados**:

- `docs/superpowers/specs/2026-11-25-editorial-pendente.patch`
- `docs/superpowers/specs/2026-11-25-noticias-pendente.patch`

Os TSX desses patches também passaram em análise sintática com TypeScript. Isso não substitui testes/build após aplicação. O script de verificação de publicação rejeitará a página atual de notícias porque seu marcador depende do patch bloqueado.

## Testes e builds

Regressões foram reproduzidas em RED e verificadas em GREEN por grupo, incluindo retry de snapshot, ausência de coleta em leitura, validade EPSS, briefing único, busca IOC inicial/fora de ordem, CSV, linkificação de texto, home sem briefing, cabeçalho/data, proveniência e verificação de publicação. A última suíte completa tem os seguintes resultados:

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0; avisos preexistentes em search-merge e ioc-extractor |
| `npm test` | FAIL, exit 1: 370 passaram e 2 falharam; 56 arquivos passaram e 2 falharam |
| `npm run build` | PASS, exit 0; no modo padrão, consultas de prerenderização registraram DATABASE_URL ausente |
| `STATECRAFT_DATA_SOURCE=snapshot npm run build` | PASS, exit 0, com o current.json existente; sem acesso necessário ao banco |
| `git diff --check` | PASS |

Falhas da suíte, sem omissões ou skips adicionados:

1. `__tests__/news-iocs-corrections.test.ts` — `renders news source failure separately from an empty archive`: o índice ainda propaga `database unavailable`, pois seu arquivo está bloqueado para escrita. O patch pendente contém a correção.
2. `__tests__/intelligence-cli.test.ts` — validação de argumentos do audit CLI: Node/tsx falha em `os.userInfo`, `uv_os_get_passwd returned ENOMEM`, antes de executar a validação esperada. Reproduzido em execução isolada; não alterei o teste nem dependências para esconder a falha.

A configuração Vitest agora exclui `.qa/**` da descoberta: esse diretório contém cópias de releases antigas e não representa a árvore sob teste. Nenhum arquivo em `.qa` foi alterado. Testes existentes de staging usam apenas fixture temporária, sem publicar o projeto.

Saídas locais de validação (texto e caminhos normalizados relativos ao repositório): `2026-11-25-tsc.log`, `2026-11-25-lint.log`, `2026-11-25-tests.log`, `2026-11-25-build.log`, `2026-11-25-build-snapshot.log` e `2026-11-25-cli-retest.log`, neste mesmo diretório.

## Verificação runtime e limitações

Servidor local com build snapshot: home, CVEs, notícias, IOCs com q, briefings, campanhas, metodologia, sobre e créditos responderam 200. Health retornou 503, coerente com snapshot antigo. Cabeçalhos compactos foram observados no HTML das quatro rotas aplicadas; notícias/campanhas/sobre permanecem sem o componente enquanto os patches não forem aplicados. Resultados em `2026-11-25-runtime.json`.

Não foi feita comprovação visual em 1440×900/390 px; a altura compacta tem CSS próprio, mas a aceitação visual global depende das fontes/estilos bloqueados. Não se afirma ausência de sobreposição nem resultado da imagem de campanhas em produção. O snapshot antigo foi preservado como exigido; sua atualização/publicação cabe ao fluxo posterior autorizado.

Na listagem em modo banco, filtros seletivos continuam no SQL, mas normalização de EPSS e ordenação ocorrem antes da paginação em memória. Custo: O(N) memória e O(N log N) ordenação dos candidatos locais. O modo snapshot já trabalha em memória. Esse custo mantém coerência entre sinais exibidos e prioridade/filtros; não introduz coleta externa.

A revisão independente identificou e motivou correções adicionais de proveniência, validade EPSS no banco e marcador que aceitava página indisponível. Permanecem as limitações de escrita explicitadas acima.

Foi consultada Modern Web Guidance (`js`): preservou-se a causa estruturada do erro ao envolver a falha do snapshot, sem expor detalhes na interface ("Attach the original caught error via the `{ cause }` options parameter").

## Revisão (Claude) e fechamento

Os bloqueios de escrita vinham da ACL dos arquivos, não do código. Na revisão, os dois patches preparados
(`editorial-pendente` e `noticias-pendente`) foram aplicados sem alteração de conteúdo, e foram feitos três ajustes:

- Home: as notícias recentes usam o card só de texto (`story-tile--text`), porque o card com imagem espremia o texto
  numa coluna estreita sem foto.
- Rótulos de data da home e do cabeçalho compacto passam a dizer "(horário de Brasília)".
- Testes ajustados ao novo rótulo.

Validação depois disso: `npm test` com 372 testes passando, `npx tsc --noEmit` sem erros, `npm run lint` sem erros e
build em modo snapshot concluído. Todas as rotas responderam 200 no servidor local, os títulos não repetem mais a
marca e rotas inexistentes caem no 404 próprio. Os patches e logs de execução não foram versionados.
