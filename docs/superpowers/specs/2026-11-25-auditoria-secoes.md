# Auditoria seção por seção (Codex, somente leitura, commit fdfc06c, 25/11/2026)

A estrutura para servir o snapshot **já existe nas rotas auditadas**. A troca depende de `STATECRAFT_DATA_SOURCE=snapshot` e do arquivo empacotado; a indisponibilidade do Neon, sozinha, não ativa esse modo.

Auditoria estática da árvore atual, commit `fdfc06c`, sem alterar arquivos, executar coleta ou publicar. Não reproduzi os HTTP 500 nem medi os ~10 segundos em produção: abaixo estão os caminhos de código que explicam esses sintomas.

**1. Publicação e snapshot — transversal**

- O leitor usa `data/publication/current.json`, valida o formato e mantém a promessa em memória. `getLivePreview()` também devolve esse snapshot em produção, antes da condição que restringe o preview de QA. Portanto, o nome “preview” não significa que essas páginas estejam sem suporte a snapshot. [snapshot.ts:43](../../../lib/publication/snapshot.ts:43), [live-preview.ts:35](../../../lib/live-preview.ts:35).
- O arquivo local passou pela validação existente: gerado em **21/11/2026 às 19:13 UTC**, contém **1 briefing, 60 notícias, 13.221 CVEs e 0 IOCs**, ocupando 28.189.273 bytes. Isso descreve o arquivo local, não o deployment.
- O publicador rejeita arquivo com mais de duas horas. Assim, o snapshot encontrado está vencido para publicação em 25/11. `publish-local.mjs` não faz coleta/exportação: recebe o arquivo existente. O fluxo completo está em `run-local.ps1`. [publication-deploy.mjs:22](../../../scripts/lib/publication-deploy.mjs:22), [run-local.ps1:99](../../../scripts/local/run-local.ps1:99).
- O deploy define a variável tanto no build quanto no runtime; o Next inclui o JSON no rastreamento de arquivos. [publish-local.mjs:33](../../../scripts/publish-local.mjs:33), [next.config.ts:22](../../../next.config.ts:22).
- Arquivo ausente, JSON inválido ou formato rejeitado fazem o leitor lançar erro. Não existe recuperação nesse leitor; a promessa rejeitada permanece em cache. Diversas páginas chamam o leitor antes de seus `try/catch`.
- A verificação da publicação confere identidade/hash, contagens e HTTP das principais páginas e primeiros detalhes. **Não verifica o conteúdo renderizado**, nem inclui detalhe de campanha, metodologia, sobre ou créditos. [publication-deploy.mjs:58](../../../scripts/lib/publication-deploy.mjs:58).

**2. Home `/`**

- **Dados/snapshot:** briefings e notícias vêm de `getLivePreview()` no modo snapshot; fora dele, Prisma e `getStoredNews()`. Campanhas vêm de `data/campaigns.ts`. [page.tsx:15](../../../app/page.tsx:15).
- **Falhas/vazios:** consultas normais rejeitadas viram listas vazias. Briefings mostram “Nenhum briefing publicado”; notícias usam uma chamada genérica. A interface não distingue falha de fonte de ausência de publicação. Falha ao carregar o snapshot ocorre antes dessas capturas.
- **Acessibilidade/SEO/responsividade:** há `main`, título principal, alternativas nas imagens e adaptação para uma coluna no mobile. A home herda metadata global. Não apresenta data da coleta nem aviso de snapshot antigo.
- **Links/textos:** os destinos internos explícitos correspondem às rotas existentes. “Em observação” pode ficar sem itens quando há somente um briefing, como no snapshot encontrado.

**3. `/threat-briefings`**

- **Dados/snapshot:** usa os briefings e IOCs publicados no JSON. No banco, busca no máximo 50 briefings; busca, filtros e paginação posteriores operam apenas nesses registros carregados. [page.tsx:10](../../../app/threat-briefings/page.tsx:10).
- **Falhas/vazios:** erro de banco vira arquivo vazio, sem aviso de indisponibilidade. Há mensagens para ausência de publicações, filtros sem resultado e ausência de IOCs. Snapshot inválido escapa do tratamento.
- **Defeito visível com o snapshot atual:** o único briefing é removido da lista para aparecer como destaque; depois, `filtered.length === 0` mostra “Nenhum briefing corresponde ao filtro selecionado”, mesmo em “Todos”, sem busca. [BriefingExplorer.tsx:117](../../../components/threat/BriefingExplorer.tsx:117), [BriefingExplorer.tsx:189](../../../components/threat/BriefingExplorer.tsx:189).
- **Acessibilidade/SEO/responsividade:** busca tem label e filtros usam `aria-pressed`; grade e sidebar se reorganizam. Metadata e estado vazio prometem geração “a cada hora”, sem informar quando a última publicação ocorreu. [layout.tsx:3](../../../app/threat-briefings/layout.tsx:3), [BriefingExplorer.tsx:183](../../../components/threat/BriefingExplorer.tsx:183).

**4. `/threat-briefings/[slug]`**

- **Dados/snapshot:** busca o briefing completo no JSON. O modo snapshot usa o renderizador completo; `PreviewDetail` fica restrito ao preview de QA. [page.tsx:109](../../../app/threat-briefings/[slug]/page.tsx:109), [page.tsx:238](../../../app/threat-briefings/[slug]/page.tsx:238).
- **Falhas/vazios:** erro de banco e slug inexistente retornam `null` e terminam em `notFound()`: indisponibilidade vira página de não encontrado. Falha no JSON propaga. Existem estado de IOC vazio e omissão das recomendações/detecções ausentes.
- **Acessibilidade/SEO/responsividade:** metadata por briefing inclui título, descrição e Open Graph de artigo com publicação. Artigo/sidebar usam layout responsivo; IOCs longos têm `break-all`.
- **Textos:** a tabela instrui “Adicione ao SIEM, EDR e firewall”, enquanto a página recomenda validar antes de bloquear. É uma orientação operacional inconsistente dentro da mesma leitura. [IocTable.tsx:47](../../../components/briefing/IocTable.tsx:47).

**5. `/cves`**

- **Dados/snapshot:** `queryCves()` filtra, ordena e pagina os registros do JSON, sem NVD ao vivo nesse ramo. [query.ts:288](../../../lib/cves/query.ts:288).
- **Falhas:** fora do snapshot, tenta banco e pode executar `fetchCves()` como contingência. A coleta consulta até duas páginas NVD de 2.000 registros, com timeout de **15 segundos por requisição**, além de KEV e EPSS. Isso comprova dependência de rede e possibilidade de espera; não comprova exatamente 10 segundos. [query.ts:299](../../../lib/cves/query.ts:299), [fetch-cves.ts:426](../../../lib/cves/fetch-cves.ts:426).
- **Vazios/erros:** o servidor captura qualquer erro, inclusive filtro inválido, e entrega lista vazia com cobertura “Fontes indisponíveis”. O componente também mostra “Nenhum resultado nesta combinação”. No cliente, há tratamento melhor: erro anunciado e preservação dos resultados anteriores. [page.tsx:19](../../../app/cves/page.tsx:19), [CveExplorer.tsx:305](../../../components/cves/CveExplorer.tsx:305).
- **Inconsistência de dados:** a listagem mantém EPSS antigo e usa-o para ordenar/priorizar; o detalhe oculta EPSS após seis horas. No JSON encontrado, **13.197 registros possuem EPSS com coleta anterior a esse limite** em 25/11. [query.ts:294](../../../lib/cves/query.ts:294), [get-cve-detail.ts:102](../../../lib/cves/get-cve-detail.ts:102).
- **Acessibilidade/SEO/responsividade:** formulário tem labels, fieldsets, estado ocupado e anúncio de resultados; há regras mobile. O título já contém a marca que o template global acrescenta novamente. [page.tsx:7](../../../app/cves/page.tsx:7).

**6. `/cves/[id]`**

- **Dados/snapshot:** CVE e relacionamentos vêm do JSON; campanhas associadas vêm do arquivo estático. Não há atualização externa quando o modo snapshot está ativo. [get-cve-detail.ts:106](../../../lib/cves/get-cve-detail.ts:106), [relationships.ts:38](../../../lib/cves/relationships.ts:38).
- **Falhas/vazios:** identificador inválido usa `notFound()`. Identificador válido ausente mostra “Registro indisponível” e link NVD, sem chamar `notFound()`. Essa página continua com metadata normal da ficha, sem `noindex` específico. Falha no arquivo snapshot propaga. [page.tsx:76](../../../app/cves/[id]/page.tsx:76).
- **Atualização:** registro antigo recebe aviso e EPSS é ocultado. Entretanto, “Consulta atual indisponível” sugere uma tentativa externa que o ramo snapshot não realizou.
- **Acessibilidade/SEO/responsividade:** seções nomeadas, navegação interna, tabelas com contêiner de rolagem e vários breakpoints estão implementados. O título também repete a marca pelo template global.
- **Links:** CVE ausente do próximo snapshot deixará de ter ficha local completa, mesmo que continue referenciada por uma campanha. O único CVE cadastrado nas campanhas atuais está presente no JSON encontrado.

**7. `/noticias`**

- **Dados/snapshot:** usa `getStoredNews()`, que lê diretamente o JSON nesse modo. Fora dele, consulta `NewsArticleRecord`, `UpdateHealth` e `NewsCache`. Não consulta RSS durante essa renderização. [news-store.ts:31](../../../lib/news-store.ts:31).
- **Falha que explica o 500 relatado:** a página aguarda `getStoredNews()` sem captura, e as consultas do store também não capturam erro. Já `/api/noticias` captura e devolve **503**. São comportamentos diferentes. [page.tsx:12](../../../app/noticias/page.tsx:12), [route.ts:32](../../../app/api/noticias/route.ts:32).
- **Vazios/erros:** existem mensagem de arquivo vazio, filtros vazios e erro de atualização preservando conteúdo. A mensagem de vazio não é alcançada quando a leitura inicial lança erro. Data da coleta e atraso são apresentados.
- **Acessibilidade/SEO/responsividade:** botões indicam seleção, atualização tem status/progresso, imagens têm alternativas e o layout possui breakpoints. As duas abas e atualização compartilham uma linha flex sem quebra explícita; isso merece verificação em viewport estreito, sem afirmar overflow medido. [NewsExplorer.tsx:193](../../../components/news/NewsExplorer.tsx:193).

**8. `/noticias/[slug]`**

- **Dados/snapshot:** artigo, corpo e relacionados usam o conteúdo publicado. `getEnrichedArticle()` retorna imediatamente no snapshot, sem LLM ou cache no banco. [ai-news.ts:104](../../../lib/ai-news.ts:104).
- **Falhas/vazios:** a leitura inicial da coleção não tem captura; falha impede chegar à busca individual e ao `notFound()`. Artigo sem corpo mostra o resumo. Quatro notícias do JSON encontrado não têm `content`.
- **Texto incorreto:** a autoria mostra sempre “IA Statecraft”, inclusive quando o conteúdo é o original retornado pelo snapshot. O skeleton anuncia geração em português, embora nesse modo não exista geração durante a leitura. [page.tsx:65](../../../app/noticias/[slug]/page.tsx:65), [page.tsx:149](../../../app/noticias/[slug]/page.tsx:149).
- **Links/HTML:** a conversão de CVEs em links aplica regex ao HTML inteiro já renderizado, podendo substituir também ocorrências dentro de atributos ou links existentes e produzir marcação inválida. [page.tsx:117](../../../app/noticias/[slug]/page.tsx:117).
- **SEO/responsividade:** há título/descrição/imagem por artigo, mas não metadata de artigo com publicação como nos briefings. As imagens OG usam caminhos relativos sem `metadataBase` explícito. Corpo, referências e relacionados têm tratamento responsivo.

**9. `/iocs`**

- **Dados/snapshot:** primeira carga, busca e exportação usam `snapshot.iocs`; o JSON atual produz legitimamente zero resultados. No banco, a página tenta tabela relacional e depois `Briefing.iocs`. [page.tsx:20](../../../app/iocs/page.tsx:20), [export/route.ts:28](../../../app/api/iocs/export/route.ts:28).
- **Falhas/vazios:** erro inicial de banco vira zero IOCs. No cliente, HTTP não OK retorna silenciosamente; exceções também são silenciadas. Filtros/página podem mudar mantendo resultados anteriores sem explicação. Não há cancelamento nem proteção contra respostas fora de ordem. [IocSearch.tsx:397](../../../components/iocs/IocSearch.tsx:397).
- **Link funcionalmente incompleto:** busca global gera `/iocs?q=...`, mas a página não recebe `searchParams` e o componente inicia a consulta como `""`. O link abre a seção sem aplicar o IOC pesquisado. [snapshot.ts:53](../../../lib/search/snapshot.ts:53), [IocSearch.tsx:385](../../../components/iocs/IocSearch.tsx:385).
- **Responsividade:** abaixo de `lg`, desaparece o único link da linha para o briefing; abaixo de `sm`, confiança também desaparece. O valor é truncado, sem expansão própria. Isso reduz contexto justamente no mobile. [IocSearch.tsx:175](../../../components/iocs/IocSearch.tsx:175).
- **Exportação:** limita a 500 sem indicar truncamento. Erro HTTP tem toast, mas exceção de rede não tem `catch` no manipulador. CSV não escapa aspas internas nem todos os campos. [IocSearch.tsx:95](../../../components/iocs/IocSearch.tsx:95), [IocSearch.tsx:313](../../../components/iocs/IocSearch.tsx:313).

**10. `/campanhas` e `/campanhas/[slug]`**

- **Dados/snapshot:** os três dossiês são estáticos, em `data/campaigns.ts`. Somente a cobertura relacionada depende de notícias/briefings; possui ramo snapshot. [campaigns.ts:25](../../../data/campaigns.ts:25), [page.tsx:27](../../../app/campanhas/[slug]/page.tsx:27).
- **Falhas/vazios:** `Promise.allSettled()` preserva o dossiê quando consultas relacionadas falham, mas apresenta a mesma mensagem de “Nenhuma cobertura recente”. Falha no leitor snapshot ocorre antes desse `allSettled`. Slug desconhecido usa `notFound()`.
- **Acessibilidade/responsividade:** filtros têm labels, detalhes usam títulos e listas, IOCs quebram linha e layouts passam para uma coluna.
- **SEO/textos:** título do detalhe repete a marca. Todos os dossiês foram revisados em 28/09/2026; “Em acompanhamento” é acompanhado de ressalva de que não confirma atividade atual.
- **Datas inconsistentes:** índice usa `new Date(reviewedAt)` sem timezone fixo; detalhe fixa UTC. A apresentação pode divergir conforme timezone. [CampaignIndex.tsx:21](../../../components/editorial/CampaignIndex.tsx:21), [page.tsx:72](../../../app/campanhas/[slug]/page.tsx:72).

**11. `/metodologia`**

- **Dados/falhas:** página inteiramente estática, independente de Neon e snapshot; não necessita estado vazio.
- **Documentação desatualizada:** informa cron-job.org, LLaMA 3.3 70B e geração de notícias ao abrir o artigo. A rota cron foi aposentada com 410; o código contém workflows GitHub Actions e fluxo local; os defaults dos modelos são `openai/gpt-oss-120b`; snapshot não gera notícias durante a leitura. [page.tsx:22](../../../app/metodologia/page.tsx:22), [route.ts:7](../../../app/api/cron/update-briefings/route.ts:7), [ai-briefing.ts:167](../../../lib/ai-briefing.ts:167).
- A descrição de prioridade operacional produzida pela IA também diverge do código de CVEs, que grava `aiPriority: null`. [page.tsx:48](../../../app/metodologia/page.tsx:48), [fetch-cves.ts:126](../../../lib/cves/fetch-cves.ts:126).
- **SEO/acessibilidade/responsividade:** navegação de seções nomeada, âncoras existentes e elementos flexíveis. Título repete a marca.
- **README:** repete as referências antigas. Porém, **“20 feeds” está correto no cadastro atual**: contei 20 entradas em `lib/news-feeds.ts`; não classifico esse número como defeito. [README.md:11](../../../README.md:11).

**12. `/sobre` e `/creditos-visuais`**

- **Dados/falhas:** ambas estáticas; continuam independentes do banco e snapshot, sem necessidade de estados de carregamento ou vazio.
- **Sobre:** título específico, mas descrição herdada da raiz. Imagens têm alternativas; grids possuem breakpoints. O link da metodologia chega a conteúdo desatualizado. [page.tsx:6](../../../app/sobre/page.tsx:6).
- **Créditos:** lista autores, licenças e origens, explica o caráter ilustrativo das imagens e do mapa; grade vira uma coluna. Tem título específico e descrição herdada. [page.tsx:3](../../../app/creditos-visuais/page.tsx:3).
- Os arquivos editoriais referenciados existem. Não verifiquei disponibilidade HTTP nem validade jurídica das licenças externas; não há base nesta leitura para declarar esses URLs quebrados.

**13. Layout global, navegação e fontes**

- Header/footer são independentes de dados. Há `lang="pt-BR"`, skip link, navegações nomeadas, `aria-current`, botão mobile com estado e controles de busca. Header tem ajuste até 320 px; footer reorganiza colunas. [layout.tsx:25](../../../app/layout.tsx:25), [Header.tsx:20](../../../components/layout/Header.tsx:20).
- **Fontes estão conectadas:** `globals.css` referencia nomes antigos, mas `editorial.css` define os aliases para IBM Plex Sans/Mono, Bodoni e Source Serif. Não são variáveis simplesmente ausentes. [globals.css:13](../../../app/globals.css:13), [editorial.css:1](../../../app/editorial.css:1).
- **Contraste nos diálogos:** busca e KQL usam Radix Portal, fora de `main`/`.editorial-page`. Os overrides que corrigem `text-white` não os alcançam. Assim, input/títulos de resultados da busca e título KQL continuam brancos sobre `bg-raised`, redefinido para claro. [SearchOverlay.tsx:63](../../../components/search/SearchOverlay.tsx:63), [SearchResult.tsx:46](../../../components/search/SearchResult.tsx:46), [IocSearch.tsx:244](../../../components/iocs/IocSearch.tsx:244).
- **Teclado na busca:** setas alteram seleção visual, mas não há semântica equivalente de combobox/listbox nem anúncio do item selecionado. [SearchOverlay.tsx:42](../../../components/search/SearchOverlay.tsx:42).
- **SEO global:** não encontrei canonical nem `metadataBase` explícitos. O sitemap contempla snapshot e campanhas, mas no modo banco lista notícias de `NewsCache`, enquanto a página depende primeiro de `NewsArticleRecord`. [layout.tsx:19](../../../app/layout.tsx:19), [sitemap.ts:15](../../../app/sitemap.ts:15).
- Não há `error.tsx`, `loading.tsx` ou `not-found.tsx` próprios sob `app/`. As exceções não tratadas dependem das respostas padrão do framework.

**Prioridades finais**

- **P0 — concluir a transição operacional com snapshot recente:** o arquivo local atual é rejeitado pelo publicador. Regenerar antes de publicar; o script já define snapshot no build/runtime. [publication-deploy.mjs:25](../../../scripts/lib/publication-deploy.mjs:25), [publish-local.mjs:33](../../../scripts/publish-local.mjs:33).
- **P0 — indisponibilidade inicial de notícias:** falha de banco propaga na listagem e detalhe enquanto o deployment continuar no modo banco. [app/noticias/page.tsx:12](../../../app/noticias/page.tsx:12), [lib/news-store.ts:37](../../../lib/news-store.ts:37).
- **P1 — retirar coleta externa do caminho de leitura de CVEs no modo banco:** contingência atual aguarda NVD/KEV/EPSS. [lib/cves/query.ts:353](../../../lib/cves/query.ts:353).
- **P1 — uniformizar validade do EPSS entre lista e detalhe:** hoje produzem prioridades com bases diferentes. [lib/cves/query.ts:294](../../../lib/cves/query.ts:294), [lib/cves/get-cve-detail.ts:102](../../../lib/cves/get-cve-detail.ts:102).
- **P1 — tratar publicação ausente/inválida explicitamente:** erro fica memorizado e propaga em várias páginas. [lib/publication/snapshot.ts:47](../../../lib/publication/snapshot.ts:47).
- **P1 — corrigir contraste dos Portals de busca/KQL.** [components/search/SearchOverlay.tsx:84](../../../components/search/SearchOverlay.tsx:84), [components/iocs/IocSearch.tsx:247](../../../components/iocs/IocSearch.tsx:247).
- **P1 — corrigir busca de IOCs:** aplicar `?q=`, comunicar falhas e impedir respostas antigas de sobrescreverem a consulta atual. [app/iocs/page.tsx:105](../../../app/iocs/page.tsx:105), [components/iocs/IocSearch.tsx:397](../../../components/iocs/IocSearch.tsx:397).
- **P1 — converter CVEs apenas em nós de texto, preservando HTML existente.** [app/noticias/[slug]/page.tsx:118](../../../app/noticias/[slug]/page.tsx:118).
- **P2 — corrigir autoria e mensagens de geração no snapshot.** [app/noticias/[slug]/page.tsx:65](../../../app/noticias/[slug]/page.tsx:65), [app/noticias/[slug]/page.tsx:151](../../../app/noticias/[slug]/page.tsx:151).
- **P2 — atualizar metodologia/README para os fluxos e modelos existentes.** [app/metodologia/page.tsx:23](../../../app/metodologia/page.tsx:23), [README.md:30](../../../README.md:30).
- **P2 — corrigir vazio contraditório de briefings, contexto mobile dos IOCs e exportações truncadas/CSV.** [BriefingExplorer.tsx:189](../../../components/threat/BriefingExplorer.tsx:189), [IocSearch.tsx:186](../../../components/iocs/IocSearch.tsx:186), [export/route.ts:32](../../../app/api/iocs/export/route.ts:32).
- **P2 — padronizar metadata, títulos, canonical e estado de CVE inexistente; ampliar verificação da publicação além de HTTP 200.** [app/layout.tsx:19](../../../app/layout.tsx:19), [app/cves/[id]/page.tsx:91](../../../app/cves/[id]/page.tsx:91), [publication-deploy.mjs:74](../../../scripts/lib/publication-deploy.mjs:74).

