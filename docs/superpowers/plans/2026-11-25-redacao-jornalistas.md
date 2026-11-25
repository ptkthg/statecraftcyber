# Plano de implementação da redação com jornalistas

Spec: `docs/superpowers/specs/2026-11-25-redacao-jornalistas.md`.

Preservar o arquivo de personas fornecido, as alterações anteriores e os controles de orçamento. Implementar no diretório atual, sem coleta, publicação, commit ou push, conforme solicitado.

1. Migrar os contratos e testes antigos. Testar o sorteio em 5.000 slugs por tipo e o reaproveitamento da persona gravada nos fluxos normal e em lote. Usar Rafael nas CVEs e a Mesa nos briefings. Acrescentar versão do prompt e linha editorial aos relatórios.
2. Ajustar a política editorial com testes de avaliação sem cobertura, exceções brasileiras apenas na avaliação e intertítulos sem cobertura/nome próprio, mantendo identificadores, números, estilo e limite de quatro.
3. Exportar a identidade pública derivada do id gravado. Testar persona conhecida, desconhecida, automação e preservação da origem.
4. Criar a assinatura completa/compacta, integrar detalhe, lista e home, filtro compartilhável na URL e página de redação. Testar renderização, ficção, ausência de fotos e navegação. Incluir rodapé, metodologia, sitemap e verificação da publicação.
5. Executar TypeScript, lint, suíte completa e builds padrão/snapshot; revisar o diff e registrar resultados e limitações no documento pedido.

## Pontos de revisão

- A persona enviada ao lote deve ser a mesma usada no fechamento, mesmo depois de reiniciar a execução.
- Uma persona antiga/desconhecida não deve produzir identidade inventada na exportação.
- Intertítulos ainda devem reprovar entidades numéricas e estilo proibido.
- Voltar/avançar no navegador deve restaurar o filtro da URL, preservando outros parâmetros.
- Assinaturas nunca podem aparecer em conteúdo original.
