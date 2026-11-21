# Atualização confiável — PRD e plano de execução

Objetivo: restaurar briefings e IOCs, preservar o acervo e permitir retomada sem duplicação. Notícias recentes devem ser ordenadas por data, com coleta independente da IA.

## Arquitetura aprovada
- GitHub Actions a cada hora, minuto 17; LangGraph TypeScript com checkpoints PostgreSQL; Prisma para dados editoriais; Vercel para leitura.
- Até quatro briefings novos por execução; prazo global de 15 minutos; até três tentativas para falhas transitórias. Sem retries para autenticação inválida.
- Coletar, normalizar, deduplicar, priorizar, enriquecer, validar, publicar e verificar. Publicação automática somente de respostas estruturadas válidas.
- Publicação e IOCs na mesma transação; hash único; concorrência Actions mais lease no banco. Sem exclusão automática do acervo.
- Notícias persistidas separadamente do enriquecimento, com origem, publicação e coleta. Falhas preservam o último conjunto válido.
- Health distingue tentativa, coleta e publicação; degrada após três horas sem coleta. Ausência de publicação por 24h é aviso, não prova de falha.

## Entregas e aceite
1. Histórico, lease, notícias persistidas e testes de saúde/ordenação.
2. Grafo recuperável e publicação atômica, com testes de interrupção, duplicação e falha parcial.
3. APIs e interface consomem dados persistidos; atualização renova a página inteira; metadados de frescor.
4. Workflow de geração, verificação independente, migrações e runbook de ativação/rollback.
5. Testes, lint, build e revisão final; produção exige backup, migração e secrets, desativação de schedulers antigos e duas execuções verificadas.

Campanhas e pipeline de CVEs fora desta migração. Não prometer pontualidade do Actions nem recuperação de dados apagados sem backup.

## Decisões de implementação
- Preservar o diretório atual e arquivos não rastreados; trabalhar em branch dedicada, sem worktree adicional.
- Nenhuma mensagem externa ou issue automática. Falhas aparecem nos checks e notificações nativas do Actions.
- Deploy e migração de produção são uma etapa explícita posterior às verificações locais; não declarar atualização restaurada antes de evidência real.
