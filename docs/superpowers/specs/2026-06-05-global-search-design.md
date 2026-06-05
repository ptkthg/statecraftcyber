# Global Search com Correlação — Design Spec

**Data:** 2026-06-05  
**Status:** Aprovado  
**Escopo:** Busca global unificada com correlação entre briefings, IOCs, CVEs e notícias

---

## Objetivo

Permitir que analistas de segurança pesquisem qualquer termo (CVE ID, endereço IP, domínio, hash, nome de ameaça) e vejam resultados correlacionados de todas as entidades do banco em uma interface unificada, sem precisar navegar página a página.

---

## Decisões de Design

| Decisão | Escolha | Justificativa |
|---|---|---|
| Motor de busca | PostgreSQL FTS (`tsvector` + GIN index) | Zero infra nova, suporte nativo a português, ranking por relevância |
| Ponto de entrada | Ícone `⌕` na navbar → overlay modal | Não ocupa espaço permanente, acessível de qualquer página |
| Atalho | `Cmd/Ctrl + K` abre, `Esc` fecha | Padrão reconhecido por desenvolvedores e analistas |
| Layout de resultados | Lista unificada com badge colorido por tipo | Correlação natural entre tipos, sem forçar o usuário a escolher onde buscar |
| Correlação CVE | Detecção automática de padrão `CVE-\d{4}-\d+` expande IOCs relacionados | Caso de uso central para analistas de Blue Team |

---

## Arquitetura

### Nova rota de API

`GET /api/search?q=<termo>`

- Mínimo de 2 caracteres para executar
- Timeout de 5 segundos
- Retorna `{ results: SearchResult[], total: number }`

### Queries em paralelo

```typescript
Promise.allSettled([
  searchBriefings(q),    // FTS em title + summary + content
  searchIocs(q),         // contains em value + normalized
  searchNews(q),         // FTS em title + summary
  searchCves(q),         // contains em id + description
])
```

**Correlação CVE:** se `q` bate com `/^CVE-\d{4}-\d+$/i`, executa query adicional:
```typescript
// IOCs dos briefings que referenciam aquela CVE
prisma.ioc.findMany({ where: { briefing: { cves: { has: q } } } })
```
Esses IOCs são marcados com `meta: "via <CVE ID>"` no resultado.

### Merge e ordenação

1. Máximo de 5 resultados por tipo antes do merge (evita que IOCs dominem)
2. Resultados com rank FTS (ts_rank) ordenados descrescentemente
3. IOCs de correlação CVE ficam logo após o primeiro briefing correspondente
4. Total de 20 resultados no payload

### Tipo SearchResult

```typescript
interface SearchResult {
  type: "briefing" | "ioc" | "noticia" | "cve"
  id: string
  title: string        // texto principal do card
  href: string         // link de navegação
  meta: string         // texto secundário (severidade, tipo, tempo, fonte)
  rank: number         // ts_rank do PostgreSQL (0–1)
  isMono?: boolean     // true para IOCs (renderiza em fonte monospace)
}
```

---

## Migration

Adiciona colunas `tsvector` geradas automaticamente nas tabelas maiores:

```sql
-- Briefing
ALTER TABLE "Briefing"
  ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('portuguese',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(content, '')
    )
  ) STORED;
CREATE INDEX briefing_search_idx ON "Briefing" USING GIN(search_vector);

-- NewsCache
ALTER TABLE "NewsCache"
  ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('portuguese',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '')
    )
  ) STORED;
CREATE INDEX newscache_search_idx ON "NewsCache" USING GIN(search_vector);
```

`Ioc` e `CveCache` usam `to_tsvector()` inline nas queries (tabelas menores, sem coluna gerada).

**Prisma schema:** adiciona `searchVector Unsupported("tsvector")?` nos dois modelos, marcado com `@default(dbgenerated())`.

---

## Frontend

### Componentes novos

```
components/
  search/
    SearchOverlay.tsx   — overlay completo (input + results + footer)
    SearchResult.tsx    — card individual por tipo
    useSearch.ts        — hook com debounce 300ms e chamada à API
```

### SearchOverlay

- Client component montado em `app/layout.tsx`
- Estado: `open: boolean`, `query: string`, `results: SearchResult[]`, `loading: boolean`
- `useEffect` registra listener global `Cmd/Ctrl+K` e `Esc`
- Backdrop fecha ao clicar fora (`onMouseDown` no backdrop)
- Navegação por teclado: `↑↓` move entre resultados, `↵` navega para `href`

### SearchResult

Renderiza um card com:
- Badge colorido por tipo (vermelho briefing, verde IOC, azul notícia, laranja CVE)
- Título: monospace verde para IOCs, texto normal para os demais
- Meta: severidade + fonte + tempo relativo

### Ícone na navbar

Adiciona `<SearchIcon />` (componente client) no `components/layout/Header.tsx` ou equivalente, que ao clicar chama `openSearch()` via context ou prop.

### Estados da UI

| Estado | Comportamento |
|---|---|
| Menos de 2 chars | Mostra placeholder "Digite para buscar..." |
| Loading | 3 skeleton cards animados |
| Sem resultados | "Nenhum resultado para `<termo>`" |
| Erro de API | "Erro ao buscar. Tente novamente." |
| Resultados | Lista com total no topo ("8 resultados") |

---

## Data Flow Completo

```
User digita (debounce 300ms)
      ↓
GET /api/search?q=termo
      ↓
Promise.allSettled([briefings, iocs, news, cves])
      ↓
Detecção CVE? → query extra de IOCs correlacionados
      ↓
Merge + sort por rank → slice(20)
      ↓
{ results, total }
      ↓
SearchOverlay renderiza SearchResult[]
```

---

## Arquivos a Criar / Modificar

| Arquivo | Ação |
|---|---|
| `app/api/search/route.ts` | Criar — rota de API |
| `components/search/SearchOverlay.tsx` | Criar |
| `components/search/SearchResult.tsx` | Criar |
| `components/search/useSearch.ts` | Criar |
| `app/layout.tsx` | Modificar — montar SearchOverlay |
| `components/layout/Header.tsx` (ou equivalente) | Modificar — adicionar ícone de busca |
| `prisma/schema.prisma` | Modificar — campos searchVector |
| `prisma/migrations/` | Criar — migration SQL |

---

## O que está fora de escopo

- Autocomplete / sugestões enquanto digita
- Histórico de buscas recentes
- Busca semântica / vetorial
- Filtros por tipo (pode vir depois)
- Indexação de conteúdo externo (feeds RSS não cacheados)
