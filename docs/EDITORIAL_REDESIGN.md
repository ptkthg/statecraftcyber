# Reformulação editorial — Statecraft Cyber Intelligence

## Referências inspecionadas

As seis imagens em `imagens referencia/` especificam, na ordem do sufixo, Briefings, Campanhas, Vulnerabilidades, Indicadores, Notícias e Sobre. Todas usam papel claro, marca Bodoni de grande escala, navegação monoespaçada, divisórias finas e colagens documentais em preto, branco e vermelho. A home adota a mesma gramática visual.

## Arquitetura preservada

- Next.js 16 App Router, React 19, Prisma e PostgreSQL.
- Rotas públicas existentes, APIs, autenticação e administração existentes.
- Consulta, paginação e filtros de briefings; busca e exportações CSV, JSON, TXT e KQL de IOCs; triagem e ordenação de CVEs; notícias agregadas e casos documentados de campanhas.
- Conteúdo, identificadores, links de fontes e SEO das páginas internas.

## Implementação

- `app/editorial.css` define os tokens, o grid e os módulos visuais; `app/editorial-overrides.css` adapta os exploradores operacionais e páginas de leitura.
- `components/editorial/` contém hero e índice de histórias reutilizáveis.
- Fotografias locais otimizadas em WebP, um mapa SVG derivado do Natural Earth e créditos em `/creditos-visuais`.
- A home seleciona o briefing de maior severidade entre os 30 mais recentes, com desempate pela data mais recente. Sem dados, exibe estado vazio.
- Montagens cartográficas são ilustrações editoriais; suas conexões não representam eventos medidos.
- Notícias exibem o resumo integral fornecido pelo feed ou pela tradução, com leitura ampliada no destaque, nas editorias e no arquivo. Novos resumos aceitam até 900 caracteres da fonte; a tradução mantém até 700 caracteres sem acrescentar fatos.

## Fontes dos visuais

| Arquivo | Autor e origem | Licença | Uso |
| --- | --- | --- | --- |
| `congresso.webp` | Autor não identificado / Acervo Arquivo Nacional, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Congresso_Nacional_Bras%C3%ADlia_-_BR_RJANRIO_PH_0_FOT_00743_0018,_Acervo_do_Arquivo_Nacional.jpg) | Domínio público; crédito solicitado: Domínio público / Acervo Arquivo Nacional | Brasil, governo, home, Sobre |
| `antena.webp` | Vitor Paladini, [Unsplash](https://unsplash.com/photos/a-satellite-dish-sitting-on-top-of-a-building-Pi3TvIKNmjM) | Unsplash License | Redes e campanhas |
| `porto.webp` | Wolfgang Weiser, [Unsplash](https://unsplash.com/photos/container-ships-and-cranes-at-a-busy-port-azTSkG93BG4) | Unsplash License | Logística e notícias |
| `datacenter-ache.webp` | Kevin Ache, [Unsplash](https://unsplash.com/photos/a-rack-of-servers-in-a-server-room-2JJ3wBHu4_0) | Unsplash License | Infraestrutura e CVEs |
| `south-america.svg` | [Natural Earth admin 0 countries](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/), modificado pela Statecraft | Domínio público | Montagens cartográficas |

Os WebP têm até 1280 px de largura e qualidade 78. Os arquivos da pasta de referências não foram alterados.

## Validação e limites

Executar `npm run build`, `npm run lint` e `npm test`. Na validação local, o build e o TypeScript concluíram; o lint não apresentou erros (sete avisos preexistentes); 94 testes passaram. As capturas em `screenshots-refactor/editorial-*-desktop.png` e `screenshots-refactor/editorial-*-mobile.png` cobrem home, seis seções, metodologia e páginas internas. O script `scripts/capture-editorial.mjs` captura desktop e `scripts/capture-mobile-cdp.mjs` emula viewport real de 390 px no Chrome. Todas as dez páginas mobile capturadas tiveram largura de documento igual à viewport. As rotas públicas testadas responderam HTTP 200; `/admin/status` redirecionou para login (307).

Sem `DATABASE_URL`, o caminho normal de execução usa os estados vazios existentes e registra a indisponibilidade do banco. Notícias dependem dos feeds e do serviço de localização em português. Detalhes de CVEs dependem da consulta ao NVD: quando a fonte não responde, o dossiê mostra um estado de indisponibilidade e o link ao registro original. Nenhum deploy foi feito.

### Contrato público com dados reais

`node scripts/validate-live-data.mjs` executa somente requisições GET na API pública da Statecraft. Em 12/10/2026, a checagem confirmou banco operacional, 49 briefings publicados, 80 IOCs, filtro por tipo, busca textual, segunda página e exportação de 80 registros; os endpoints de CVEs e notícias também retornaram listas válidas.

### Prévia local isolada

Como não havia credencial de banco disponível no workspace, `node scripts/validate-live-data.mjs https://statecraftcyber.vercel.app --snapshot` salvou apenas os dados públicos retornados pela API em `.qa/live-preview.json`. O arquivo e `.env.local` estão ignorados pelo Git. Com `STATECRAFT_LIVE_PREVIEW=1` em `.env.local`, a home, os índices e as APIs locais de briefings, IOCs e notícias leem essa captura. O modo é desativado automaticamente na Vercel e não faz escrita no banco de produção.

Para atualizar e conferir a prévia:

```powershell
node scripts/validate-live-data.mjs https://statecraftcyber.vercel.app --snapshot
npm run build
npm run start -- -p 3146
node scripts/qa-live-ui.mjs
```

O teste interativo verificou 25 IOCs na primeira página, busca textual, filtro de IP, downloads CSV/JSON/TXT, geração de KQL, listagem de 49 briefings e busca por “Vidar”. As páginas internas de briefing e notícia na prévia mostram título, resumo, fonte e link ao dossiê publicado. A API pública não fornece o corpo integral desses artigos, portanto a validação do conteúdo completo ainda requer conexão ao banco de prévia ou à Vercel. A prévia é uma captura datada dos dados públicos, não uma conexão contínua ao banco.
