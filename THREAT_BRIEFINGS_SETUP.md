# Statecraft — Sistema de Threat Briefings Automáticos

## Visão Geral

```
Fontes externas → Adaptadores → Pipeline de análise → Banco de dados → Frontend
     (APIs)        (/lib/threat-sources)   (scoring, IOC, dedup)    (PostgreSQL)    (/threat-briefings)
```

## Configuração Inicial

### 1. Banco de Dados PostgreSQL

Você precisa de um banco PostgreSQL. Opções rápidas:

**Neon (gratuito, serverless):**
```
npx create-db     ← cria automaticamente via Prisma
```

**Supabase (gratuito):**
1. Crie um projeto em supabase.com
2. Copie a Connection String (modo Transaction Pooler)

**Local com Docker:**
```bash
docker run -d --name statecraft-db \
  -e POSTGRES_PASSWORD=senha123 \
  -e POSTGRES_DB=statecraft \
  -p 5432:5432 postgres:16
```

### 2. Variáveis de Ambiente

Edite `.env` (local) e configure em `Settings → Environment Variables` na Vercel:

```env
# Obrigatório
DATABASE_URL="postgresql://usuario:senha@host:5432/statecraft"

# Obrigatório para o cron job
CRON_SECRET="gere-com: openssl rand -hex 32"

# Controle de publicação
AUTO_PUBLISH="false"    # true = publica automaticamente
MAX_DAILY_BRIEFINGS="8" # máximo de briefings por execução

# Opcionais (sem chave a fonte é ignorada)
OTX_API_KEY=""   # em: https://otx.alienvault.com → API Keys
NVD_API_KEY=""   # em: https://nvd.nist.gov/developers/request-an-api-key
```

### 3. Aplicar o Schema do Banco

```bash
npx prisma migrate dev --name init
```

Para produção:
```bash
npx prisma migrate deploy
```

### 4. Deploy na Vercel

O arquivo `vercel.json` já configura o cron para rodar às **7h UTC diariamente**:

```json
{
  "crons": [
    {
      "path": "/api/cron/update-briefings",
      "schedule": "0 7 * * *"
    }
  ]
}
```

> **Nota:** Vercel Cron Jobs exigem o plano Pro para produção. No Hobby plan, use GitHub Actions.

### 5. (Alternativa) GitHub Actions

```yaml
# .github/workflows/daily-briefings.yml
name: Daily Threat Briefings

on:
  schedule:
    - cron: "0 7 * * *"   # 7h UTC = 4h Brasília
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger cron endpoint
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://seu-site.vercel.app/api/cron/update-briefings
```

Adicione `CRON_SECRET` nos Secrets do repositório.

## Testar Localmente

Com o banco configurado e rodando:

```bash
# Trigger manual
curl -X GET \
  -H "Authorization: Bearer seu-cron-secret" \
  http://localhost:3000/api/cron/update-briefings
```

Resposta esperada:
```json
{
  "ok": true,
  "briefingsCreated": 5,
  "sources": ["CISA KEV", "NVD", "abuse.ch", "RSS Feeds"],
  "durationMs": 4231
}
```

## Publicar Briefings

Por padrão, briefings são criados como `draft`. Para publicar:

```sql
-- Publicar todos os rascunhos
UPDATE "Briefing" SET status = 'published' WHERE status = 'draft';

-- Publicar apenas críticos
UPDATE "Briefing" SET status = 'published'
WHERE status = 'draft' AND severity = 'critical';
```

Ou defina `AUTO_PUBLISH=true` para publicação automática.

## Fontes Configuradas

| Fonte | API | Chave necessária | Dados |
|-------|-----|-----------------|-------|
| CISA KEV | JSON | Não | Vulnerabilidades exploradas ativamente |
| NVD | REST | Opcional (rate limit melhor) | CVEs com CVSS |
| FIRST EPSS | REST | Não | Probabilidade de exploração de CVEs |
| AlienVault OTX | REST | Sim (`OTX_API_KEY`) | Pulses, IOCs, campanhas |
| abuse.ch URLhaus | REST | Não | URLs maliciosas |
| abuse.ch MalwareBazaar | REST | Não | Hashes de malware |
| Microsoft Security Blog | RSS | Não | Artigos de ameaças |
| Mandiant Blog | RSS | Não | APTs, ransomware |
| Palo Alto Unit 42 | RSS | Não | Research de ameaças |
| CrowdStrike Blog | RSS | Não | Endpoint, adversários |
| CERT.br | RSS | Não | Incidentes brasileiros |
| CTIR Gov | RSS | Não | Alertas governo brasileiro |

## Estrutura de Arquivos

```
lib/
├── prisma.ts                    ← Prisma Client singleton
├── threat-sources/
│   ├── types.ts                 ← Tipos compartilhados
│   ├── cisa-kev.ts              ← Adaptador CISA KEV
│   ├── nvd.ts                   ← Adaptador NVD
│   ├── epss.ts                  ← Utilitário EPSS
│   ├── otx.ts                   ← Adaptador AlienVault OTX
│   ├── abuse-ch.ts              ← Adaptadores URLhaus + MalwareBazaar
│   ├── rss-feeds.ts             ← Adaptador RSS (blogs)
│   └── index.ts                 ← Agregador + exports
├── severity-scoring.ts          ← Classificação de severidade
├── ioc-extractor.ts             ← Extração de IOCs
├── deduplication.ts             ← Hash, slug, deduplicação
└── briefing-generator.ts        ← Gerador de briefings em PT-BR

app/
├── api/
│   ├── briefings/route.ts       ← GET /api/briefings (leitura)
│   └── cron/update-briefings/   ← POST/GET (job diário)
│       └── route.ts
└── threat-briefings/
    ├── page.tsx                 ← Listagem com mock fallback
    └── [slug]/
        └── page.tsx             ← Página individual do briefing

prisma/schema.prisma             ← Modelos Briefing e CronLog
vercel.json                      ← Configuração do Vercel Cron
```
