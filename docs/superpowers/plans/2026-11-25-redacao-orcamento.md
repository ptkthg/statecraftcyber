# Plano de implementação do orçamento da redação

**Objetivo:** executar a spec `docs/superpowers/specs/2026-11-25-redacao-orcamento.md` sobre a implementação pendente da redação Claude.

**Arquitetura:** ledger permanente e reservas transacionais em PostgreSQL; cliente Claude compartilhado com controle de gasto; lotes persistentes para notícias e CVEs, com fechamento normal pelo Haiku. Sem mudanças de interface.

**Restrições:** preservar alterações anteriores; não coletar, publicar, aplicar migrações, fazer commit ou push. Usar português brasileiro. Execução direta autorizada pelo pedido de implementação.

- [x] 1. Testar e implementar preços, cálculo de cota em São Paulo e prioridade com corte de 72 horas.
- [x] 2. Criar migração aditiva para AiUsageLedger, AiBatch e reservas; implementar admissão transacional, histórico das últimas 50 matérias e limites diários.
- [x] 3. Testar e implementar modelos/esforço, ausência de fallback no editor, ledger de chamadas e limite de fonte.
- [x] 4. Testar e implementar protocolo de lotes, associação por custom_id, retomada, expiração e recusa com uma tentativa normal.
- [x] 5. Integrar notícias, briefings e CVEs, preservar originais e registrar gasto/cota por execução.
- [x] 6. Executar TypeScript, lint, suíte completa e ambos os builds; revisar e escrever o resultado com caminhos relativos.

**Foco da revisão:** concorrência entre execuções, reserva atravessando a meia-noite/recarga, falhas após envio remoto, resultados duplicados e fonte alterada durante um lote. Os testes devem verificar bloqueio conservador e ausência de publicação de fonte obsoleta.

**Decisões:** manter o diretório atual porque a base solicitada não está versionada; a autorização de implementação dispensa uma nova aprovação do plano. Reservas precisam cobrir também chamadas normais para impedir que o editor ou outra execução reutilize a cota.
