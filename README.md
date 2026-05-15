# Statecraft Cyber Intelligence

Plataforma de threat intelligence em português, construída do zero como projeto pessoal de Blue Team. Agrega dados de fontes abertas globais e os transforma em briefings técnicos, notícias classificadas, CVEs enriquecidos e IOCs estruturados — tudo em PT-BR, atualizado continuamente.

**Site:** [statecraftcyber.vercel.app](https://statecraftcyber.vercel.app)

---

## O que a plataforma oferece

- **Threat Briefings** — fichas técnicas geradas por IA (Groq / LLaMA 3.3 70B) a cada hora, com severidade, IOCs, CVEs e recomendações diretas para o Blue Team
- **CVEs** — vulnerabilidades das últimas 72h com CVSS, EPSS, CISA KEV e classificação por tipo (Execução de Código, Injeção, Estouro de Buffer etc.)
- **Notícias** — 19 feeds RSS de fontes globais (CISA, Krebs, The Hacker News, CERT.br, SANS ISC e outras), classificadas por tipo de ameaça
- **IOC Search** — busca de indicadores de comprometimento com lookup em fontes OSINT
- **Sobre** — contexto técnico da plataforma e do pipeline de dados

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend / Backend | Next.js 15, TypeScript, Tailwind CSS |
| Banco de dados | PostgreSQL + Prisma |
| IA | Groq API (LLaMA 3.3 70B) |
| Fontes de ameaça | NVD API, CISA KEV, OTX AlienVault, EPSS (FIRST.org) |
| Feeds de notícias | 19 fontes RSS globais |
| Deploy | Vercel (cron jobs para atualização automática) |

---


---

## Rodando localmente

```bash
npm install
npx prisma migrate dev
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

---

Desenvolvido por [Patrick Santos](https://portfolioptk.vercel.app) — Analista de Segurança, Blue Team.
