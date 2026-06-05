# IOC Feed Adapters — Design Spec

**Data:** 2026-06-05  
**Status:** Aprovado  
**Escopo:** Três novos adapters de threat intelligence focados em IOCs: ThreatFox, Feodo Tracker, CINS Score

---

## Objetivo

Aumentar o volume e a qualidade de IOCs no banco adicionando três feeds públicos e gratuitos ao pipeline existente de briefings. Os adapters seguem o padrão `SourceAdapter` já estabelecido e são transparentes para o restante do sistema.

---

## Arquitetura

### Padrão existente (sem mudanças)

Cada adapter implementa `SourceAdapter` (`lib/threat-sources/types.ts`):

```typescript
interface SourceAdapter {
  name: string;
  fetch(): Promise<RawThreatItem[]>;
}
```

Os adapters retornam `RawThreatItem[]`. O cron (`app/api/cron/update-briefings/route.ts`) chama `fetchAllSources()`, que agrega tudo e aplica deduplicação + cap de briefings.

**Sem mudanças de schema, sem novo modelo, sem nova rota de API.**

---

## Adapter 1: ThreatFox

**Arquivo:** `lib/threat-sources/threatfox.ts`  
**Nome:** `"abuse.ch / ThreatFox"`

### API

```
POST https://threatfox-api.abuse.ch/api/v1/
Content-Type: application/json
Body: {"query": "get_iocs", "days": 1}
```

Retorna IOCs das últimas 24h com campos relevantes: `ioc_value`, `ioc_type`, `threat_type`, `malware`, `confidence_level` (0–100), `first_seen`, `tags`.

### Agrupamento

Por campo `malware` (família de malware). Top 5 famílias por volume de IOCs. Até 20 IOCs por família.

### Mapeamento de tipos

| `ioc_type` ThreatFox | `type` IOC |
|---|---|
| `ip_port` | `ip` (extrai IP antes do `:porta`) |
| `domain` | `domain` |
| `url` | `url` |
| `md5_hash` | `hash` |
| `sha256_hash` | `hash` |
| outros | ignorado |

### Confidence

`confidence_level` 75–100 → `"high"` / 50–74 → `"medium"` / <50 → `"low"`

### Severity

`threat_type == "botnet_cc"` → `"high"` / `threat_type == "payload_delivery"` → `"high"` / demais → `"medium"`

### ExternalId

`threatfox-<família-slug>-<YYYY-MM-DD>` — garante deduplicação diária por família.

### Exemplo de item gerado

```typescript
{
  externalId: "threatfox-emotet-2026-06-05",
  title: "ThreatFox: 18 Indicadores Ativos de Emotet",
  description: "18 indicadores de comprometimento da família Emotet coletados do ThreatFox nas últimas 24 horas. Tipos: ip, url.",
  sourceName: "abuse.ch / ThreatFox",
  sourceUrl: "https://threatfox.abuse.ch/browse/malware/emotet/",
  severity: "high",
  iocs: [ /* 18 IOCs */ ],
  tags: ["emotet", "malware", "ioc-feed", "threatfox"],
  affectedSectors: ["Geral"],
  affectedRegions: ["Global"],
}
```

---

## Adapter 2: Feodo Tracker

**Arquivo:** `lib/threat-sources/feodo-tracker.ts`  
**Nome:** `"abuse.ch / Feodo Tracker"`

### API

```
GET https://feodotracker.abuse.ch/downloads/ipblocklist.json
```

Retorna array de entradas com: `ip_address`, `port`, `status`, `malware` (família de botnet), `first_seen`, `last_online`.

### Agrupamento

Por campo `malware` (ex: Emotet, QakBot, IcedID, Dridex, TrickBot). Top 5 famílias por volume. Até 20 IPs por família.

### IOC

- **type:** sempre `"ip"`
- **value:** o `ip_address` da entrada
- **confidence:** sempre `"high"` (IPs verificados manualmente pela abuse.ch como C2 ativos)
- **source:** `"Feodo Tracker"`

### Severity

Sempre `"high"` — são servidores de comando e controle ativos de botnets conhecidos.

### Filtro

Incluir apenas entradas com `status == "online"` para garantir que os IOCs são atualmente ativos.

### ExternalId

`feodo-<família-slug>-<YYYY-MM-DD>`

### Exemplo de item gerado

```typescript
{
  externalId: "feodo-emotet-2026-06-05",
  title: "Feodo Tracker: 15 Servidores C2 Ativos de Emotet",
  description: "15 endereços IP identificados como servidores de comando e controle ativos da botnet Emotet pelo Feodo Tracker.",
  sourceName: "abuse.ch / Feodo Tracker",
  sourceUrl: "https://feodotracker.abuse.ch/browse/",
  severity: "high",
  iocs: [ /* 15 IPs */ ],
  tags: ["emotet", "botnet", "c2", "feodo-tracker"],
  affectedSectors: ["Geral"],
  affectedRegions: ["Global"],
  mitreTechniques: ["T1071", "T1090"],
}
```

---

## Adapter 3: CINS Score

**Arquivo:** `lib/threat-sources/cins-score.ts`  
**Nome:** `"CINS Score"`

### API

```
GET https://cinsscore.com/list/ci-badguys.txt
```

Retorna texto plano com um IP por linha (~15.000 entradas). Sem contexto de família ou campanha.

### Agrupamento

Um único `RawThreatItem` por run. Primeiros 50 IPs válidos (IPv4) do arquivo.

### IOC

- **type:** `"ip"`
- **value:** o IP
- **confidence:** `"medium"` (lista comunitária, sem verificação manual)
- **source:** `"CINS Score"`

### Severity

`"medium"` — blocklist comunitária sem contexto de campanha específica.

### Validação

Filtrar linhas que não são IPv4 válido (linhas de comentário com `#`, linhas vazias).

### ExternalId

`cins-score-<YYYY-MM-DD>` — um item por dia, deduplicado.

### Exemplo de item gerado

```typescript
{
  externalId: "cins-score-2026-06-05",
  title: "CINS Score: 50 IPs Maliciosos da Blocklist Comunitária",
  description: "50 endereços IP listados na blocklist CINS (Critical Intelligence Network Score) como fontes ativas de tráfego malicioso.",
  sourceName: "CINS Score",
  sourceUrl: "https://cinsscore.com/",
  severity: "medium",
  iocs: [ /* 50 IPs */ ],
  tags: ["blocklist", "ip", "cins", "ioc-feed"],
  affectedSectors: ["Geral"],
  affectedRegions: ["Global"],
}
```

---

## Registro em `index.ts`

```typescript
// Novos imports
import { threatfoxAdapter } from "./threatfox";
import { feodoTrackerAdapter } from "./feodo-tracker";
import { cinsScoreAdapter } from "./cins-score";

const ALL_ADAPTERS: SourceAdapter[] = [
  cisaKevAdapter,
  nvdAdapter,
  otxAdapter,
  abusechAdapter,
  rssFeedsAdapter,
  threatfoxAdapter,    // novo
  feodoTrackerAdapter, // novo
  cinsScoreAdapter,    // novo
];
```

---

## Impacto no sistema existente

### Cap de briefings

Com 8 fontes ativas, a lógica de diversificação existente limita a 2 briefings por fonte por hora (`MAX_BRIEFINGS_PER_SOURCE`). Na prática, cada nova fonte gera 1–2 briefings por hora quando ganha um slot no ciclo, trazendo 10–40 IOCs por run.

### Deduplicação

`externalId` com data no slug garante que o mesmo feed não gera briefing duplicado na mesma hora. A deduplicação por `contentHash` no cron cobre qualquer divergência residual.

### Timeout

Cada adapter deve usar `AbortSignal.timeout(12_000)` para consistência com os demais adapters.

### Tratamento de erros

Falhas individuais de adapter são isoladas pelo `Promise.allSettled` existente em `fetchAllSources()` — não afetam os outros adapters.

---

## Arquivos a criar / modificar

| Arquivo | Ação |
|---|---|
| `lib/threat-sources/threatfox.ts` | Criar |
| `lib/threat-sources/feodo-tracker.ts` | Criar |
| `lib/threat-sources/cins-score.ts` | Criar |
| `lib/threat-sources/index.ts` | Modificar — adicionar imports e registros |

---

## Fora de escopo

- PhishTank (requer API key — implementar separadamente)
- Mudanças no schema Prisma
- Nova rota de API ou cron dedicado
- UI de visualização de feeds
- Retenção estendida de IOCs além dos 7 dias existentes
