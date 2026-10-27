# Fase 01 — Publicação em produção

Publicação autorizada e executada em 27/10/2026.

- Projeto: Statecraft Cyber Intelligence, Vercel.
- Domínio: https://statecraftcyber.vercel.app
- Branch de produção: main.
- Migração: 20261027000000_intelligence_validation, aplicada em transação atômica PostgreSQL.
- Backup consistente das cinco tabelas da aplicação, histórico de migrações, colunas, constraints e índices.
- SHA-256 do backup: 801489563721545aace5f9a2ae849562b25166c36fdb1cae223df55d59216b5f.
- Backup local: .qa/production-backups/phase1-2026-10-27T22-48-13-345Z.json.
- Os 2.553 registros da aplicação foram restaurados em PostgreSQL isolado e a migração foi testada sobre a cópia real antes de sua aplicação.
- Os títulos, resumos e conteúdos dos 53 briefings legados foram conferidos após a migração, sem alterações.
- Auditoria pós-migração: 53 registros auditados, 53 mantidos em draft/preliminary.
- A migração não remove notícias, CVEs, indicadores ou histórico de execução.
- O comando de auditoria foi ajustado para o formato CommonJS do projeto e executado com sucesso; um teste de subprocesso cobre essa regressão.

Verificações públicas: página inicial, CVEs, IOCs, briefings, saúde, APIs de briefings e IOCs, exportação e busca responderam HTTP 200. Um slug legado retornou HTTP 404, conforme a política. Nenhum briefing ou IOC não validado apareceu na busca ou exportação.

As listagens de briefings e IOCs derivados ficam vazias enquanto os registros não satisfizerem os critérios da fase. O cron continuará recolhendo fontes para novos candidatos; publicação não implica revisão humana.

Verificação final de código: 180 testes aprovados, TypeScript válido e lint dos arquivos corrigidos sem erros. Credenciais, backup e logs locais permaneceram fora do Git.
