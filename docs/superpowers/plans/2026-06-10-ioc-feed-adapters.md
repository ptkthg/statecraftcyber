# IOC Feed Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar três adapters de feeds de IOC (ThreatFox, Feodo Tracker, CINS Score) ao pipeline existente de threat intelligence, conforme o spec aprovado `docs/superpowers/specs/2026-06-05-ioc-feeds-design.md`.

**Architecture:** Cada adapter implementa a interface `SourceAdapter` (`lib/threat-sources/types.ts`) e é registrado em `ALL_ADAPTERS` (`lib/threat-sources/index.ts`). A lógica de transformação (parse, agrupamento, mapeamento de tipos/confidence/severity) é exportada como funções puras testáveis com fixtures; a função `fetch()` do adapter apenas faz a chamada HTTP com `AbortSignal.timeout(12_000)` e delega às funções puras. Sem mudanças de schema, sem novas rotas.

**Tech Stack:** TypeScript, Next.js (fetch nativo), Vitest (`npx vitest run`), testes em `__tests__/`.

**Nota de risco:** as APIs da abuse.ch passaram a exigir Auth-Key em alguns endpoints. O spec aprovado não inclui chave; se o ThreatFox retornar erro de autenticação em produção, a falha é isolada pelo `Promise.allSettled` existente e não afeta os demais adapters.

---

### Task 1: Adapter ThreatFox

**Files:**
- Create: `lib/threat-sources/threatfox.ts`
- Test: `__tests__/threatfox.test.ts`

- [ ] **Step 1: Write the failing test**

Criar `__tests__/threatfox.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  mapConfidence,
  mapThreatFoxIoc,
  buildThreatFoxItems,
  type ThreatFoxEntry,
} from "../lib/threat-sources/threatfox";

const NOW = new Date("2026-06-10T12:00:00Z");

function entry(overrides: Partial<ThreatFoxEntry> = {}): ThreatFoxEntry {
  return {
    ioc_value: "1.2.3.4:443",
    ioc_type: "ip_port",
    threat_type: "botnet_cc",
    malware: "win.emotet",
    malware_printable: "Emotet",
    confidence_level: 90,
    first_seen: "2026-06-10 08:00:00 UTC",
    tags: ["emotet"],
    ...overrides,
  };
}

describe("mapConfidence", () => {
  it("75-100 → high", () => {
    expect(mapConfidence(75)).toBe("high");
    expect(mapConfidence(100)).toBe("high");
  });

  it("50-74 → medium", () => {
    expect(mapConfidence(50)).toBe("medium");
    expect(mapConfidence(74)).toBe("medium");
  });

  it("<50 → low", () => {
    expect(mapConfidence(49)).toBe("low");
    expect(mapConfidence(0)).toBe("low");
  });
});

describe("mapThreatFoxIoc", () => {
  it("ip_port → ip, extraindo o IP antes da porta", () => {
    const ioc = mapThreatFoxIoc(entry({ ioc_value: "10.0.0.1:8080", ioc_type: "ip_port" }));
    expect(ioc).toEqual({ type: "ip", value: "10.0.0.1", confidence: "high", source: "ThreatFox" });
  });

  it("domain → domain", () => {
    const ioc = mapThreatFoxIoc(entry({ ioc_value: "evil.com", ioc_type: "domain" }));
    expect(ioc?.type).toBe("domain");
    expect(ioc?.value).toBe("evil.com");
  });

  it("url → url", () => {
    expect(mapThreatFoxIoc(entry({ ioc_value: "http://evil.com/x", ioc_type: "url" }))?.type).toBe("url");
  });

  it("md5_hash e sha256_hash → hash", () => {
    expect(mapThreatFoxIoc(entry({ ioc_type: "md5_hash" }))?.type).toBe("hash");
    expect(mapThreatFoxIoc(entry({ ioc_type: "sha256_hash" }))?.type).toBe("hash");
  });

  it("tipo desconhecido → null", () => {
    expect(mapThreatFoxIoc(entry({ ioc_type: "envelope_from" }))).toBeNull();
  });
});

describe("buildThreatFoxItems", () => {
  it("agrupa por família de malware", () => {
    const items = buildThreatFoxItems(
      [
        entry({ malware: "win.emotet", malware_printable: "Emotet" }),
        entry({ malware: "win.emotet", malware_printable: "Emotet", ioc_value: "5.6.7.8:80" }),
        entry({ malware: "win.qakbot", malware_printable: "QakBot" }),
      ],
      NOW
    );
    expect(items).toHaveLength(2);
    const emotet = items.find((i) => i.externalId === "threatfox-emotet-2026-06-10");
    expect(emotet).toBeDefined();
    expect(emotet!.iocs).toHaveLength(2);
  });

  it("limita ao top 5 de famílias por volume", () => {
    const entries: ThreatFoxEntry[] = [];
    for (let f = 0; f < 7; f++) {
      // família f tem f+1 entradas — fam6 é a maior
      for (let n = 0; n <= f; n++) {
        entries.push(entry({ malware: `fam${f}`, malware_printable: `Fam${f}`, ioc_value: `10.0.${f}.${n}:80` }));
      }
    }
    const items = buildThreatFoxItems(entries, NOW);
    expect(items).toHaveLength(5);
    // as duas menores (fam0, fam1) ficam de fora
    expect(items.some((i) => i.externalId.includes("fam0"))).toBe(false);
    expect(items.some((i) => i.externalId.includes("fam1"))).toBe(false);
  });

  it("limita a 20 IOCs por família", () => {
    const entries = Array.from({ length: 30 }, (_, n) =>
      entry({ ioc_value: `10.1.1.${n}:80` })
    );
    const items = buildThreatFoxItems(entries, NOW);
    expect(items[0].iocs).toHaveLength(20);
  });

  it("severity high para botnet_cc e payload_delivery, medium para demais", () => {
    const [cc] = buildThreatFoxItems([entry({ threat_type: "botnet_cc" })], NOW);
    expect(cc.severity).toBe("high");
    const [pd] = buildThreatFoxItems([entry({ threat_type: "payload_delivery" })], NOW);
    expect(pd.severity).toBe("high");
    const [other] = buildThreatFoxItems([entry({ threat_type: "phishing" })], NOW);
    expect(other.severity).toBe("medium");
  });

  it("ignora entradas com ioc_type não mapeado", () => {
    const items = buildThreatFoxItems([entry({ ioc_type: "envelope_from" })], NOW);
    expect(items).toHaveLength(0);
  });

  it("gera externalId com slug da família e data", () => {
    const [item] = buildThreatFoxItems(
      [entry({ malware: "win.cobalt_strike", malware_printable: "Cobalt Strike" })],
      NOW
    );
    expect(item.externalId).toBe("threatfox-cobalt-strike-2026-06-10");
    expect(item.sourceName).toBe("abuse.ch / ThreatFox");
    expect(item.tags).toContain("threatfox");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/threatfox.test.ts`
Expected: FAIL — `Cannot find module '../lib/threat-sources/threatfox'` (ou equivalente).

- [ ] **Step 3: Write minimal implementation**

Criar `lib/threat-sources/threatfox.ts`:

```typescript
import type { SourceAdapter, RawThreatItem, RawIOC, Confidence, Severity } from "./types";

const THREATFOX_API = "https://threatfox-api.abuse.ch/api/v1/";

export interface ThreatFoxEntry {
  ioc_value: string;
  ioc_type: string;
  threat_type: string;
  malware: string;
  malware_printable: string | null;
  confidence_level: number;
  first_seen: string;
  tags: string[] | null;
}

interface ThreatFoxResponse {
  query_status: string;
  data: ThreatFoxEntry[];
}

const TYPE_MAP: Record<string, RawIOC["type"]> = {
  ip_port: "ip",
  domain: "domain",
  url: "url",
  md5_hash: "hash",
  sha256_hash: "hash",
};

export function mapConfidence(level: number): Confidence {
  if (level >= 75) return "high";
  if (level >= 50) return "medium";
  return "low";
}

export function mapThreatFoxIoc(entry: ThreatFoxEntry): RawIOC | null {
  const type = TYPE_MAP[entry.ioc_type];
  if (!type) return null;
  const value =
    entry.ioc_type === "ip_port" ? entry.ioc_value.split(":")[0] : entry.ioc_value;
  return { type, value, confidence: mapConfidence(entry.confidence_level), source: "ThreatFox" };
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function buildThreatFoxItems(entries: ThreatFoxEntry[], now: Date): RawThreatItem[] {
  const byFamily = new Map<string, ThreatFoxEntry[]>();
  for (const e of entries) {
    if (!TYPE_MAP[e.ioc_type]) continue;
    const key = e.malware_printable ?? e.malware;
    if (!byFamily.has(key)) byFamily.set(key, []);
    byFamily.get(key)!.push(e);
  }

  const topFamilies = [...byFamily.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5);

  const date = now.toISOString().slice(0, 10);
  const items: RawThreatItem[] = [];

  for (const [family, familyEntries] of topFamilies) {
    const iocs = familyEntries
      .slice(0, 20)
      .map(mapThreatFoxIoc)
      .filter((i): i is RawIOC => i !== null);
    if (!iocs.length) continue;

    const severity: Severity = familyEntries.some(
      (e) => e.threat_type === "botnet_cc" || e.threat_type === "payload_delivery"
    )
      ? "high"
      : "medium";

    const slug = slugify(family);
    const types = [...new Set(iocs.map((i) => i.type))].join(", ");

    items.push({
      externalId: `threatfox-${slug}-${date}`,
      title: `ThreatFox: ${iocs.length} Indicadores Ativos de ${family}`,
      description: `${iocs.length} indicadores de comprometimento da família ${family} coletados do ThreatFox nas últimas 24 horas. Tipos: ${types}.`,
      sourceUrl: `https://threatfox.abuse.ch/browse/malware/${slug}/`,
      sourceName: "abuse.ch / ThreatFox",
      publishedAt: now,
      cves: [],
      iocs,
      severity,
      tags: [slug, "malware", "ioc-feed", "threatfox"],
      affectedSectors: ["Geral"],
      affectedRegions: ["Global"],
    });
  }

  return items;
}

export const threatfoxAdapter: SourceAdapter = {
  name: "abuse.ch / ThreatFox",

  async fetch(): Promise<RawThreatItem[]> {
    const res = await fetch(THREATFOX_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "get_iocs", days: 1 }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`ThreatFox retornou ${res.status}`);

    const data: ThreatFoxResponse = await res.json();
    if (data.query_status !== "ok" || !data.data?.length) return [];

    return buildThreatFoxItems(data.data, new Date());
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/threatfox.test.ts`
Expected: PASS (todos os testes).

- [ ] **Step 5: Commit**

```bash
git add __tests__/threatfox.test.ts lib/threat-sources/threatfox.ts
git commit -m "feat(threat-sources): add ThreatFox IOC feed adapter"
```

---

### Task 2: Adapter Feodo Tracker

**Files:**
- Create: `lib/threat-sources/feodo-tracker.ts`
- Test: `__tests__/feodo-tracker.test.ts`

- [ ] **Step 1: Write the failing test**

Criar `__tests__/feodo-tracker.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  buildFeodoItems,
  type FeodoEntry,
} from "../lib/threat-sources/feodo-tracker";

const NOW = new Date("2026-06-10T12:00:00Z");

function entry(overrides: Partial<FeodoEntry> = {}): FeodoEntry {
  return {
    ip_address: "1.2.3.4",
    port: 443,
    status: "online",
    malware: "Emotet",
    first_seen: "2026-06-09 10:00:00",
    last_online: "2026-06-10",
    ...overrides,
  };
}

describe("buildFeodoItems", () => {
  it("inclui apenas entradas com status online", () => {
    const items = buildFeodoItems(
      [entry({ status: "online" }), entry({ status: "offline", ip_address: "5.6.7.8" })],
      NOW
    );
    expect(items).toHaveLength(1);
    expect(items[0].iocs).toHaveLength(1);
    expect(items[0].iocs![0].value).toBe("1.2.3.4");
  });

  it("agrupa por família de botnet", () => {
    const items = buildFeodoItems(
      [
        entry({ malware: "Emotet" }),
        entry({ malware: "QakBot", ip_address: "9.9.9.9" }),
      ],
      NOW
    );
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.externalId).sort()).toEqual([
      "feodo-emotet-2026-06-10",
      "feodo-qakbot-2026-06-10",
    ]);
  });

  it("limita ao top 5 de famílias e 20 IPs por família", () => {
    const entries: FeodoEntry[] = [];
    for (let f = 0; f < 6; f++) {
      for (let n = 0; n <= f * 5; n++) {
        entries.push(entry({ malware: `Fam${f}`, ip_address: `10.${f}.0.${n}` }));
      }
    }
    const items = buildFeodoItems(entries, NOW);
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.iocs!.length).toBeLessThanOrEqual(20);
    }
  });

  it("IOCs são sempre ip com confidence high; severity sempre high", () => {
    const [item] = buildFeodoItems([entry()], NOW);
    expect(item.severity).toBe("high");
    expect(item.iocs![0]).toEqual({
      type: "ip",
      value: "1.2.3.4",
      confidence: "high",
      source: "Feodo Tracker",
    });
    expect(item.sourceName).toBe("abuse.ch / Feodo Tracker");
    expect(item.mitreTechniques).toEqual(["T1071", "T1090"]);
  });

  it("retorna vazio se nada está online", () => {
    expect(buildFeodoItems([entry({ status: "offline" })], NOW)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/feodo-tracker.test.ts`
Expected: FAIL — `Cannot find module '../lib/threat-sources/feodo-tracker'`.

- [ ] **Step 3: Write minimal implementation**

Criar `lib/threat-sources/feodo-tracker.ts`:

```typescript
import type { SourceAdapter, RawThreatItem, RawIOC } from "./types";

const FEODO_API = "https://feodotracker.abuse.ch/downloads/ipblocklist.json";

export interface FeodoEntry {
  ip_address: string;
  port: number;
  status: string;
  malware: string;
  first_seen: string;
  last_online?: string;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function buildFeodoItems(entries: FeodoEntry[], now: Date): RawThreatItem[] {
  const online = entries.filter((e) => e.status === "online");

  const byFamily = new Map<string, FeodoEntry[]>();
  for (const e of online) {
    if (!byFamily.has(e.malware)) byFamily.set(e.malware, []);
    byFamily.get(e.malware)!.push(e);
  }

  const topFamilies = [...byFamily.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5);

  const date = now.toISOString().slice(0, 10);
  const items: RawThreatItem[] = [];

  for (const [family, familyEntries] of topFamilies) {
    const iocs: RawIOC[] = familyEntries.slice(0, 20).map((e) => ({
      type: "ip" as const,
      value: e.ip_address,
      confidence: "high" as const,
      source: "Feodo Tracker",
    }));

    items.push({
      externalId: `feodo-${slugify(family)}-${date}`,
      title: `Feodo Tracker: ${iocs.length} Servidores C2 Ativos de ${family}`,
      description: `${iocs.length} endereços IP identificados como servidores de comando e controle ativos da botnet ${family} pelo Feodo Tracker.`,
      sourceUrl: "https://feodotracker.abuse.ch/browse/",
      sourceName: "abuse.ch / Feodo Tracker",
      publishedAt: now,
      cves: [],
      iocs,
      severity: "high",
      mitreTechniques: ["T1071", "T1090"],
      tags: [slugify(family), "botnet", "c2", "feodo-tracker"],
      affectedSectors: ["Geral"],
      affectedRegions: ["Global"],
    });
  }

  return items;
}

export const feodoTrackerAdapter: SourceAdapter = {
  name: "abuse.ch / Feodo Tracker",

  async fetch(): Promise<RawThreatItem[]> {
    const res = await fetch(FEODO_API, {
      method: "GET",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`Feodo Tracker retornou ${res.status}`);

    const data: FeodoEntry[] = await res.json();
    if (!Array.isArray(data) || !data.length) return [];

    return buildFeodoItems(data, new Date());
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/feodo-tracker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add __tests__/feodo-tracker.test.ts lib/threat-sources/feodo-tracker.ts
git commit -m "feat(threat-sources): add Feodo Tracker C2 blocklist adapter"
```

---

### Task 3: Adapter CINS Score

**Files:**
- Create: `lib/threat-sources/cins-score.ts`
- Test: `__tests__/cins-score.test.ts`

- [ ] **Step 1: Write the failing test**

Criar `__tests__/cins-score.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  isValidIpv4,
  parseCinsIps,
  buildCinsItem,
} from "../lib/threat-sources/cins-score";

const NOW = new Date("2026-06-10T12:00:00Z");

describe("isValidIpv4", () => {
  it("aceita IPv4 válido", () => {
    expect(isValidIpv4("192.168.1.1")).toBe(true);
    expect(isValidIpv4("8.8.8.8")).toBe(true);
    expect(isValidIpv4("255.255.255.255")).toBe(true);
  });

  it("rejeita octetos > 255", () => {
    expect(isValidIpv4("256.1.1.1")).toBe(false);
    expect(isValidIpv4("1.1.1.999")).toBe(false);
  });

  it("rejeita comentários, vazio e lixo", () => {
    expect(isValidIpv4("# comment")).toBe(false);
    expect(isValidIpv4("")).toBe(false);
    expect(isValidIpv4("not-an-ip")).toBe(false);
    expect(isValidIpv4("1.2.3")).toBe(false);
    expect(isValidIpv4("::1")).toBe(false);
  });
});

describe("parseCinsIps", () => {
  it("extrai apenas linhas IPv4 válidas, com trim", () => {
    const text = "# CINS bad guys\n1.2.3.4\n  5.6.7.8  \n\ninvalid\n999.0.0.1\n9.9.9.9";
    expect(parseCinsIps(text)).toEqual(["1.2.3.4", "5.6.7.8", "9.9.9.9"]);
  });

  it("limita a 50 IPs", () => {
    const text = Array.from({ length: 80 }, (_, i) => `10.0.0.${i % 250}`).join("\n");
    expect(parseCinsIps(text)).toHaveLength(50);
  });
});

describe("buildCinsItem", () => {
  it("gera um único item com IOCs ip/medium", () => {
    const item = buildCinsItem(["1.2.3.4", "5.6.7.8"], NOW);
    expect(item).not.toBeNull();
    expect(item!.externalId).toBe("cins-score-2026-06-10");
    expect(item!.severity).toBe("medium");
    expect(item!.sourceName).toBe("CINS Score");
    expect(item!.iocs).toHaveLength(2);
    expect(item!.iocs![0]).toEqual({
      type: "ip",
      value: "1.2.3.4",
      confidence: "medium",
      source: "CINS Score",
    });
  });

  it("retorna null sem IPs", () => {
    expect(buildCinsItem([], NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/cins-score.test.ts`
Expected: FAIL — `Cannot find module '../lib/threat-sources/cins-score'`.

- [ ] **Step 3: Write minimal implementation**

Criar `lib/threat-sources/cins-score.ts`:

```typescript
import type { SourceAdapter, RawThreatItem } from "./types";

const CINS_URL = "https://cinsscore.com/list/ci-badguys.txt";
const MAX_IPS = 50;

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isValidIpv4(line: string): boolean {
  const match = IPV4_RE.exec(line);
  if (!match) return false;
  return match.slice(1).every((octet) => Number(octet) <= 255);
}

export function parseCinsIps(text: string, limit = MAX_IPS): string[] {
  const ips: string[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!isValidIpv4(line)) continue;
    ips.push(line);
    if (ips.length >= limit) break;
  }
  return ips;
}

export function buildCinsItem(ips: string[], now: Date): RawThreatItem | null {
  if (!ips.length) return null;

  return {
    externalId: `cins-score-${now.toISOString().slice(0, 10)}`,
    title: `CINS Score: ${ips.length} IPs Maliciosos da Blocklist Comunitária`,
    description: `${ips.length} endereços IP listados na blocklist CINS (Critical Intelligence Network Score) como fontes ativas de tráfego malicioso.`,
    sourceUrl: "https://cinsscore.com/",
    sourceName: "CINS Score",
    publishedAt: now,
    cves: [],
    iocs: ips.map((ip) => ({
      type: "ip" as const,
      value: ip,
      confidence: "medium" as const,
      source: "CINS Score",
    })),
    severity: "medium",
    tags: ["blocklist", "ip", "cins", "ioc-feed"],
    affectedSectors: ["Geral"],
    affectedRegions: ["Global"],
  };
}

export const cinsScoreAdapter: SourceAdapter = {
  name: "CINS Score",

  async fetch(): Promise<RawThreatItem[]> {
    const res = await fetch(CINS_URL, {
      method: "GET",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`CINS Score retornou ${res.status}`);

    const text = await res.text();
    const item = buildCinsItem(parseCinsIps(text), new Date());
    return item ? [item] : [];
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/cins-score.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add __tests__/cins-score.test.ts lib/threat-sources/cins-score.ts
git commit -m "feat(threat-sources): add CINS Score community blocklist adapter"
```

---

### Task 4: Registrar adapters em `index.ts` e verificação final

**Files:**
- Modify: `lib/threat-sources/index.ts:1-17`

- [ ] **Step 1: Adicionar imports e registro**

Em `lib/threat-sources/index.ts`, adicionar após o import de `rssFeedsAdapter` (linha 6):

```typescript
import { threatfoxAdapter } from "./threatfox";
import { feodoTrackerAdapter } from "./feodo-tracker";
import { cinsScoreAdapter } from "./cins-score";
```

E alterar `ALL_ADAPTERS` para:

```typescript
const ALL_ADAPTERS: SourceAdapter[] = [
  cisaKevAdapter,
  nvdAdapter,
  otxAdapter,
  abusechAdapter,
  rssFeedsAdapter,
  threatfoxAdapter,
  feodoTrackerAdapter,
  cinsScoreAdapter,
];
```

- [ ] **Step 2: Rodar a suíte completa de testes**

Run: `npx vitest run`
Expected: PASS — todos os arquivos de teste, incluindo os 4 pré-existentes.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add lib/threat-sources/index.ts
git commit -m "feat(threat-sources): register ThreatFox, Feodo Tracker and CINS Score adapters"
```
