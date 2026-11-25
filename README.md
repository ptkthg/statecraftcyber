# Statecraft Cyber Intelligence

Publicação independente de inteligência de ameaças em português com briefings, notícias, CVEs e IOCs baseados em fontes abertas, contextualizados para o Brasil e a América Latina.

**Site:** [statecraftcyber.vercel.app](https://statecraftcyber.vercel.app)

## Fluxo de dados

A rotina horária roda no computador do operador e usa PostgreSQL local para a coleta. A publicação na Vercel leva um snapshot de leitura:

Fontes abertas → rotina local horária → PostgreSQL local → deduplicação, enriquecimento e validação → exportação do snapshot → publicação na Vercel → leitura pública do arquivo.

O fluxo completo está em `scripts/local/run-local.ps1`: coleta com `updates:local`, backup, exportação com `publication:export` e publicação com `publication:deploy`. O publicador `scripts/publish-local.mjs` recebe o snapshot já exportado; não faz coleta. O modo banco continua disponível para processamento local.

Em produção, `STATECRAFT_DATA_SOURCE=snapshot` lê `data/publication/current.json`. Abrir uma notícia, briefing ou ficha de CVE nesse modo não inicia coleta externa nem geração de texto. A interface apresenta a data da coleta.

O computador do operador precisa estar ligado e conectado para a rotina horária executar. Se uma etapa falhar, o site pode continuar servindo o último snapshot. `/api/health` indica `degraded` e responde HTTP 503 quando o snapshot passa de **3 horas sem publicação**, quando falta um arquivo válido ou quando os pipelines indicam degradação. Nesse modo, o banco não é necessário para a leitura pública.

## Conteúdo e critérios

- **Briefings:** análise estruturada com evidências e validação antes da publicação. Um item coletado pode ser rejeitado pelos controles de qualidade.
- **CVEs:** CVSS, EPSS, CISA KEV, produtos afetados e referências das fontes. A prioridade operacional é determinística e aplica regras em ordem: P1 para presença reportada no KEV; P2 para referência Exploit no NVD ou CVSS ≥ 9 com EPSS ≥ 10%; P3 para CVSS ≥ 7 ou EPSS ≥ 10%; P4 para os demais registros com dados. Sem CVSS e EPSS e sem os sinais anteriores, o estado é de dados insuficientes. O limiar EPSS de 10% é uma escolha operacional da Statecraft.
- **Notícias:** arquivo de fontes brasileiras e internacionais. Não há geração ao abrir a página no modo snapshot.
- **IOCs:** indicadores estruturados com confiança e vínculo com o briefing. Valide fonte, contexto e possíveis falsos positivos antes de bloquear.
- **Campanhas:** dossiês editoriais documentados no repositório.

## Stack e modelos

| Camada | Tecnologia |
|---|---|
| Aplicação | Next.js 16.2.6 App Router, TypeScript, Tailwind CSS v4 |
| Coleta e persistência | PostgreSQL local + Prisma 6 |
| Leitura em produção | Snapshot JSON publicado com a aplicação na Vercel |
| Briefings: padrão | Groq, `openai/gpt-oss-120b` |
| Briefings: fallback | OpenRouter, `anthropic/claude-3.5-haiku` |
| Markdown e sanitização | marked, sanitize-html e DOMPurify |
| Fontes | NVD, CISA KEV, FIRST EPSS, AlienVault OTX e feeds RSS |

Os modelos acima são os defaults de `lib/ai-briefing.ts`. `GROQ_MODEL` e `OPENROUTER_MODEL` permitem configuração pelo operador; o fallback depende de credenciais válidas. A IA apoia a organização de evidências e o enriquecimento textual e pode errar. A prioridade operacional das CVEs não é determinada pelo modelo.

## Desenvolvimento local

Pré-requisitos: Node.js 20+ e PostgreSQL local para o modo banco. Instale as dependências e copie `.env.example` para `.env`, preenchendo as credenciais necessárias ao ambiente.

```bash
npm install
npx prisma migrate dev
npm run dev
```

A aplicação fica em [localhost:3000](http://localhost:3000).

| Variável | Uso |
|---|---|
| `DATABASE_URL` | Conexão PostgreSQL local; SSL conforme o ambiente |
| `STATECRAFT_DATA_SOURCE` | `snapshot` para o arquivo publicado; modo banco para coleta local |
| `GROQ_API_KEY`, `GROQ_MODEL` | Credencial e modelo principal de briefings |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Credencial e modelo de fallback |
| `NVD_API_KEY`, `OTX_API_KEY` | Credenciais opcionais das fontes |
| `CRON_SECRET` | Autenticação das rotas protegidas de atualização |
| `ADMIN_SECRET` | Acesso ao painel administrativo |

Consulte `.env.example` e os scripts locais para as demais opções. Não versione credenciais.

## Verificação

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Para verificar o build com o snapshot existente no PowerShell:

```powershell
$env:STATECRAFT_DATA_SOURCE = 'snapshot'
npm run build
```

Coleta e publicação são operações separadas da verificação de código e devem ser executadas pelo operador no fluxo local autorizado.

## Limitações

Cobertura e atualidade dependem das fontes e da última coleta publicada. CVSS mede severidade técnica; EPSS estima a probabilidade em 30 dias e não confirma exploração. Dados de inteligência devem ser validados em fontes primárias antes de ações críticas.

Desenvolvido por [Patrick Santos](https://portfolioptk.vercel.app).
