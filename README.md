# Statecraft Cyber Intelligence

Plataforma de threat intelligence em português construída do zero como projeto pessoal de Blue Team. Agrega dados de fontes abertas globais e os transforma em briefings técnicos, notícias classificadas, CVEs enriquecidos e IOCs estruturados — tudo em PT-BR, atualizado continuamente.

**Site:** [statecraftcyber.vercel.app](https://statecraftcyber.vercel.app)

---

## O que a plataforma oferece

- **Threat Briefings** — fichas técnicas geradas por IA (Groq / LLaMA 3.3 70B) a cada hora, com severidade, IOCs, CVEs e recomendações diretas para o Blue Team
- **CVEs** — vulnerabilidades das últimas 72h com CVSS, EPSS, CISA KEV e classificação por tipo (Execução de Código, Injeção, Estouro de Buffer etc.)
- **Notícias** — 19 feeds RSS de fontes globais (CISA, Krebs, The Hacker News, CERT.br, SANS ISC e outras), classificadas por tipo de ameaça e região. Quando o usuário abre um artigo, a IA Statecraft enriquece o conteúdo sob demanda, gerando uma matéria jornalística completa em PT-BR. O resultado é cacheado em `NewsCache` para servir leituras subsequentes sem nova chamada ao LLM
- **IOC Search** — busca de indicadores de comprometimento extraídos dos briefings, com suporte a IP, domínio, hash, URL e e-mail
- **Health Endpoint** — `/api/health` para monitoramento de disponibilidade e integridade do banco
- **Sobre** — contexto técnico da plataforma e do pipeline de dados

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend / Backend | Next.js 16.2.6 (App Router), TypeScript, Tailwind CSS v4 |
| Banco de dados | PostgreSQL (Neon) + Prisma 6 |
| IA | Groq API (LLaMA 3.3 70B) |
| Sanitização | isomorphic-dompurify + marked |
| Fontes de ameaça | NVD API, CISA KEV, OTX AlienVault, EPSS (FIRST.org) |
| Feeds de notícias | 19 fontes RSS globais |
| Deploy | Vercel (app) + cron-job.org (scheduler horário externo, plano Hobby) |

---

## Arquitetura e Pipeline de Dados

```
Fontes externas (NVD, CISA KEV, OTX, RSS)
        │
        ▼
  cron-job.org → Vercel — executa a cada hora (Hobby plan)
  vercel.json define o schedule para migração futura ao plano Pro
        │
        ├── Coleta notícias (RSS feeds) → NewsCache (PostgreSQL)
        │
        └── Coleta ameaças (NVD, CISA, OTX)
                │
                ▼
          Groq LLaMA 3.3 70B
          Gera briefing estruturado (título, resumo,
          severidade, IOCs, CVEs, MITRE ATT&CK)
                │
                ▼
          Briefing → PostgreSQL (status: published)
                │
                ├── IOCs estruturados → tabela Ioc
                └── Expostos via API REST → Frontend (Next.js)
```

---

## Modelos Prisma

| Modelo | Descrição |
|---|---|
| `Briefing` | Briefing completo gerado por IA com metadados de ameaça |
| `Ioc` | Indicadores de comprometimento normalizados com índices |
| `NewsCache` | Notícias enriquecidas dos feeds RSS |
| `CronLog` | Log de execução dos cron jobs |

---

## Setup local

### Pré-requisitos

- Node.js 20+
- PostgreSQL (ou conta Neon gratuita)
- Chaves de API: Groq, NVD (opcional), OTX (opcional)

### Instalação

```bash
git clone https://github.com/ptkthg/statecraftcyber
cd statecraftcyber
npm install
```

### Variáveis de ambiente

Copie o arquivo de exemplo e preencha as variáveis:

```bash
cp .env.example .env
```

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | URL de conexão PostgreSQL com `?sslmode=require` |
| `GROQ_API_KEY` | Chave da API Groq (groq.com) |
| `NVD_API_KEY` | Chave da API NVD — opcional, sem chave o rate limit é mais baixo |
| `OTX_API_KEY` | Chave AlienVault OTX — opcional |
| `CRON_SECRET` | Token secreto para autenticar chamadas de cron (header `Authorization: Bearer`) |
| `ADMIN_SECRET` | Senha de acesso ao painel `/admin/status` |
| `AUTO_PUBLISH` | `true` para publicar briefings automaticamente |
| `MAX_HOURLY_BRIEFINGS` | Limite de briefings por hora (padrão: 3) |

### Banco de dados

```bash
# Criar tabelas e aplicar migrações
npx prisma migrate dev

# Visualizar dados no browser
npx prisma studio
```

### Desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

### Build para produção

```bash
npm run build
npm start
```

---

## Comandos Prisma úteis

```bash
# Aplicar migrações em produção (sem gerar arquivos de migração)
npx prisma migrate deploy

# Regenerar o Prisma Client após mudanças no schema
npx prisma generate

# Resetar banco (CUIDADO: apaga todos os dados)
npx prisma migrate reset
```

---

## Fontes de dados

| Fonte | Tipo | Endpoint |
|---|---|---|
| NVD (NIST) | CVEs | `services.nvd.nist.gov/rest/json/cves/2.0` |
| CISA KEV | Vulnerabilidades exploradas | `www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json` |
| EPSS (FIRST.org) | Score de exploração | `api.first.org/data/v1/epss` |
| AlienVault OTX | IOCs e pulsos | `otx.alienvault.com/api/v1` |
| 19x RSS feeds | Notícias | CISA, Krebs on Security, The Hacker News, CERT.br, SANS ISC, Bleeping Computer e outros |

---

## Aviso

> Dados de Threat Intelligence devem ser validados em fontes primárias antes de qualquer ação crítica em produção.

---

Desenvolvido por [Patrick Santos](https://portfolioptk.vercel.app) — Analista de Segurança, Blue Team.
