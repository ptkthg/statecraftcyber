# Operação e ativação das atualizações

## Diagnóstico confirmado em 21/11/2026

O checkout inicial estava oito commits atrás da produção. A branch desta entrega foi atualizada até `fc93331` antes da implementação. A versão atual já possui histórico de evidências e removeu a antiga exclusão por idade.

No CronLog de 21/11 às 07:01 UTC, a coleta trouxe 1.387 itens, mas somente dois foram observados, nenhum foi gerado e nenhuma chamada de IA ocorreu. Há 8.399 itens/eventos diferidos nas métricas agregadas. A janela da função é consumida antes da geração. ThreatFox, URLhaus e MalwareBazaar retornaram 403; esses erros exigem revisar a autorização abuse.ch, sem desativar a validação das análises.

O health antigo só comprovava acesso ao banco. O watchdog aceitava uma tentativa recente como recuperação. A falta de publicação também pode decorrer de rejeição nas regras de evidência; não alterar essas regras para aumentar contagens.

## Ativação (ordem obrigatória)

1. Manter a variável do repositório `UPDATES_ENABLED` ausente ou `false` durante a preparação. Os workflows novos não devem processar antes da migração e do deploy.
2. Criar backup PostgreSQL consistente com a ferramenta do provedor ou `pg_dump`, incluindo dados editoriais e tabelas de pipeline. Verificar que o backup é restaurável. Guardar fora do Git.
3. Com `DATABASE_URL` de produção carregada no ambiente, executar `npx prisma migrate deploy` e `npm run updates:setup`. A segunda operação cria o schema separado `statecraft_checkpoints`; não é executada automaticamente a cada job.
4. Configurar secrets no GitHub: `DATABASE_URL`, `CRON_SECRET`, `GROQ_API_KEY` e/ou `OPENROUTER_API_KEY`; opcionais `NVD_API_KEY`, `OTX_API_KEY`, `ABUSE_CH_AUTH_KEY`. O `CRON_SECRET` deve corresponder ao deploy Vercel. Nunca imprimir esses valores.
5. Publicar a aplicação com os leitores persistidos e a rota autenticada de revalidação. Verificar `/api/cron/update-briefings`: 401 sem autenticação e 410 com autenticação.
6. Desativar qualquer agendamento externo em cron-job.org. O `vercel.json` desta entrega não contém cron; o watchdog antigo é substituído, sem criação automática de issues.
7. Definir `UPDATES_ENABLED=true` e executar manualmente **Atualizar inteligência**. Verificar resultados no `/admin/status`, health, API e páginas. Falhas parciais deixam o job vermelho para investigação, mas preservam os dados.
8. Verificar duas execuções horárias consecutivas. Só declarar atualização restabelecida quando existirem publicações aprovadas visíveis e as coletas estiverem recentes. Zero itens novos é legítimo; zero publicações com rejeições exige inspeção do relatório de qualidade.

## Recuperação

- O job seguinte retoma o mesmo thread quando uma execução fica `running` ou `failed`. Checkpoints são síncronos; o cursor dos lotes e candidatos de geração também ficam no banco. Após três tentativas do worker, a execução é abandonada para permitir nova coleta; o histórico é preservado.
- A lease dura 16 minutos; o processo encerra após 15. O workflow tem limite de 18 minutos. Não remover uma lease ativa manualmente.
- Cada evento tem até três tentativas para erros transitórios. Erros de autenticação são colocados em quarentena sem repetição. Após corrigir credenciais, usar o controle administrativo existente para solicitar reprocessamento.
- Uma falha na atualização de uma edição não substitui conteúdo validado por uma geração inválida. Contradições confirmadas da fonte continuam suspendendo a análise afetada, preservando a revisão anterior no histórico.
- `/api/health` retorna 503 após três horas sem coleta, falha do banco ou execução interrompida. Falhas parciais ficam explícitas; o workflow independente também falha para esse estado. A última publicação é um indicador separado, com aviso após 24 horas.
- Notícias preservam o último conjunto disponível e a data original. Consultar cache não avança o horário da coleta. Recarregar a página não dispara coleta nem IA.

## Rollback

Definir `UPDATES_ENABLED=false`, aguardar o worker terminar e reverter o deploy da aplicação. Preservar as migrações aditivas, checkpoints, candidatos e histórico; não apagar dados nem restaurar o cron destrutivo. Se o banco precisar ser restaurado, fazê-lo em instância separada e validar antes de trocar a conexão.

## Limites

O watchdog continua ativo quando `UPDATES_ENABLED=false`; pausar o processamento não deve silenciar a indisponibilidade do site.

Antes de reativar após erro de cota, conferir no painel Neon a categoria de uso excedida (compute, armazenamento ou transferência), restabelecer capacidade e validar novamente banco, health e páginas. Não repetir geração ou migrações enquanto o banco recusar conexões. Monitorar consumo e capacidade no provedor; o health detecta indisponibilidade, mas não prevê o esgotamento da franquia. Aumentar um plano pago exige decisão do responsável pela conta.

A geração automática seleciona identificadores de trechos originais; a aplicação expande os textos e as referências sem reescrevê-los. O limite Groq é de 6.000 tokens, com raciocínio baixo apenas para GPT-OSS. Os mesmos validadores continuam bloqueando incompletude, contradições e ações sem suporte. Trechos podem permanecer no idioma original; traduções exigem revisão semântica.

Campanhas são um catálogo editorial em `data/campaigns.ts`, com revisão registrada em 28/09/2026. A coleta de notícias não cria nem revisa automaticamente esses casos. Notícias relacionadas não comprovam atividade atual. Indicadores da API dependem de briefings publicados e validados; não interpretar coleta recente como novos indicadores aprovados.

GitHub Actions pode atrasar ou desativar schedules por inatividade do repositório. O monitor independente no mesmo GitHub não detecta indisponibilidade total do próprio GitHub; para essa cobertura, configurar futuramente um monitor externo de `/api/health`. Não há garantia de recuperação de conteúdo apagado sem backup.

## Validação desta entrega

- `npm test -- --maxWorkers=2`: 281 testes aprovados em 34 arquivos, incluindo retomada, colisão de slug, erro de autenticação, preservação da edição publicada e geração após coleta superior a 60 segundos.
- `npm run test:updates:migration`: cadeia de migrações, preservação de registros anteriores e rollback aprovados em PostgreSQL local em memória.
- `npm run build`: aprovado. Sem `DATABASE_URL` local, as consultas de fallback da renderização estática registram a ausência de configuração; isso não comprova conectividade com produção.
- `npm run lint`: zero erros; três avisos anteriores à mudança, em `search-merge.test.ts` e `ioc-extractor.ts`.
- Chrome headless isolado: página de notícias e botão Atualizar verificados com snapshot local, sem gravar em produção.
- A revisão independente encontrou três falhas importantes; todas foram reproduzidas e corrigidas. Nenhum apontamento menor ficou pendente.
- A auditoria de dependências de produção reportou 12 alertas existentes, sem alertas nos pacotes novos LangGraph/pg. Atualizações amplas de Next.js/Prisma não fazem parte desta migração e precisam de avaliação própria antes da publicação.

## Implantação de 21/11/2026

Migração aditiva e checkpoints aplicados após backup consistente e restauração local verificada. Aplicação publicada em produção. A coleta de notícias gravou 60 artigos e foi observada na API e na página. O primeiro workflow coletou ameaças, mas não publicou briefings: a fila antiga consumiu vagas com entradas sem metadados e as três chamadas Groq falharam com JSON incompleto. As correções posteriores filtram entradas inelegíveis e usam seleção de evidências por ID; a revisão adicionou cobertura para fontes em um único parágrafo.

Às 15:21 UTC, o banco Neon passou a recusar consultas por cota excedida. A verificação pública confirmou health degradado, notícias HTTP 503 e página HTTP 500. `UPDATES_ENABLED` foi mantido em `false`. Não foi possível confirmar novos briefings ou indicadores públicos nem duas execuções consecutivas após as correções. Não declarar o site normalizado até restabelecer a capacidade do banco e repetir a verificação completa. Nenhum dado editorial foi removido para contornar a cota.
