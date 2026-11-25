# Redação automatizada dentro de US$ 5 por, no mínimo, 20 dias

**Implementador:** Codex. **Revisor:** Claude. Data: 25/11/2026. Base: o resultado de
[2026-11-25-redacao-claude.md](2026-11-25-redacao-claude.md), ainda não versionado.

## Contexto

O dono do projeto tem US$ 5 de crédito na Anthropic e quer que dure pelo menos 20 dias, até a próxima recarga. Decisões:
**Sonnet 5.5 escreve** (pedido explícito), **Haiku 5.5 confere** (editor de fechamento), orçamento de
**US$ 5 em 20 dias**. Com Sonnet em tudo e sem limite, o custo seria de ~US$ 0,05 por notícia e ~US$ 100 por mês. A meta é
~US$ 0,01 por notícia e um teto que nunca é ultrapassado.

Preços de referência (Anthropic, cache de 03/11/2026, por milhão de tokens): Sonnet 5.5 US$ 2 de entrada, US$ 10 de
saída e US$ 0,10 de leitura de cache; Haiku 5.5 US$ 0,10 de entrada e US$ 0,50 de saída (prompts até 100 mil
tokens). Batch API: 50% de desconto. Deixe a tabela em `lib/ai/pricing.ts`, com data e fonte num comentário.

## 1. Modelos e esforço

- `CLAUDE_WRITER_MODEL` default `claude-sonnet-5-5`, `CLAUDE_WRITER_EFFORT` default `low`.
- `CLAUDE_EDITOR_MODEL` default `claude-haiku-5-5`, `CLAUDE_EDITOR_EFFORT` default `medium`.
- Haiku 5.5 não tem fallback do lado do servidor: no editor, **não envie** `fallbacks` nem o beta. Também não envie
  `temperature` nem `thinking`. Recusa do editor = `hold`.
- Fonte enviada ao repórter: texto limpo, até 6.000 caracteres (era 12.000).

## 2. Batch API para o repórter

- Execução N: monta as matérias da cota do dia e envia **um lote** com `client.messages.batches.create`, com
  `custom_id` = slug. Cada `params` usa o mesmo sistema (persona + `cache_control`), `output_config.format` com o
  JSON Schema gerado do zod (sem o helper de parse) e `max_tokens: 16000`. Lote não aceita `fallbacks`.
- Execução N+1 (ou seguinte): para cada lote pendente, `batches.retrieve`; com `processing_status === "ended"`, lê
  `batches.results` e trata cada `result.type` (`succeeded`, `errored`, `canceled`, `expired`) pelo `custom_id`,
  nunca pela posição. `succeeded`: checa `stop_reason` (`refusal`, `max_tokens`), valida o JSON com zod e passa pela
  checagem determinística e pelo editor (Haiku, chamada normal, não em lote). `errored` com `invalid_request`:
  `kill`; demais erros e `expired`: volta para a fila.
- Recusa no lote: a notícia tenta uma vez em chamada normal com `fallbacks: "default"`. Se recusar de novo, `kill`.
- Persistência: tabela `AiBatch` (id do lote, tipo, slugs, estado, `submittedAt`, `endedAt`) via migração Prisma
  aditiva. Lote não concluído em 24 horas: marque como expirado e devolva as notícias à fila.
- `CLAUDE_USE_BATCH` (default `true`). Com `false`, tudo roda em chamada normal (útil para teste).

## 3. Orçamento por período de crédito

O dono coloca crédito de tempos em tempos e quer que cada recarga dure um número mínimo de dias. Hoje: **US$ 5 para
pelo menos 20 dias**. O orçamento não segue o mês do calendário.

- Variáveis: `AI_BUDGET_USD` (default `5`), `AI_BUDGET_DAYS` (default `20`) e `AI_BUDGET_START` (data `YYYY-MM-DD`
  em `America/Sao_Paulo`; sem valor, usa o dia da primeira chamada registrada no ledger). Numa recarga, o dono só
  muda essas três variáveis.
- Tabela `AiUsageLedger` (data e hora, modelo, finalidade, tokens de entrada, saída, leitura e escrita de cache, se foi
  lote, custo em US$ calculado por `pricing.ts`). Cada chamada e cada resultado de lote grava uma linha.
- Cota do dia = (orçamento − gasto desde `AI_BUDGET_START`) ÷ dias restantes do período, contando hoje, com teto de
  2 × (`AI_BUDGET_USD` ÷ `AI_BUDGET_DAYS`) por dia. O que sobra de um dia passa para os seguintes, mas nunca permite
  gastar mais que o dobro da média diária. Com os defaults: média de US$ 0,25 por dia, máximo de US$ 0,50.
- Antes de enviar trabalho, estime o custo por item pela média das últimas 50 matérias do ledger (sem histórico,
  US$ 0,012 por notícia) e envie só o que cabe. Reserve 20% da cota do dia para briefings e fichas de CVE.
- Custo de lote: conte o custo estimado como "reservado" no envio e troque pelo real quando o resultado chegar, para
  duas execuções seguidas não gastarem a mesma cota.
- Se o gasto do período atingir o orçamento, nenhuma chamada nova até o dono mudar as variáveis. As notícias
  continuam publicadas com o texto original e o link da fonte, e o log avisa "orçamento do período esgotado".
- Margem de segurança: a cota usa 90% de `AI_BUDGET_USD`, para a diferença entre a estimativa e a cobrança real não
  zerar o crédito na conta.
- O teto de tokens por execução (`AI_RUN_TOKEN_BUDGET`) continua valendo como segunda trava.
- Log de cada execução: gasto do dia, gasto do mês, cota restante e quantos itens ficaram de fora por orçamento.

## 4. Prioridade

- Só entram notícias publicadas nas últimas 72 horas. O acúmulo mais antigo fica com o texto original.
- Pontuação: `importance` da notícia, mais peso para `Alerta Oficial`, `Vulnerabilidade` com CVE no CISA KEV,
  `Ransomware` e `APT`, mais fontes brasileiras (`sourceRegion === "Brasil"`), e decaimento por idade. Empate:
  a mais recente primeiro.
- Briefings: no máximo 3 por dia, dentro da reserva.
- Fichas de CVE: só CVE nova com CVSS ≥ 9 ou no CISA KEV, no máximo 5 por dia, dentro da reserva, em lote.

## 5. Testes (cliente Anthropic sempre mockado)

- Cota: período com gasto parcial calcula a cota certa no 1º e no 20º dia; sobra de um dia respeita o teto de 2× a média; reserva de lote não é gasta duas vezes; orçamento esgotado não envia nada; recarga (novas variáveis) reabre a cota.
- Prioridade: ordem esperada para um conjunto fixo de notícias; notícia com mais de 72 horas fica de fora.
- Lote: envio com `custom_id` = slug; resultados fora de ordem casados pelo `custom_id`; `errored`, `expired` e
  `refusal` seguem o fluxo da seção 2; lote preso por mais de 24 horas devolve as notícias à fila.
- Editor com Haiku: requisição sem `fallbacks`, `temperature` e `thinking`.
- Ledger: custo calculado com a tabela de preços, inclusive o desconto de lote e a leitura de cache.

## 6. Aceite

`npx tsc --noEmit`, `npm run lint`, `npm test` e `npm run build` (também com `STATECRAFT_DATA_SOURCE=snapshot`)
passando. Não rode coleta nem publicação, não faça commit nem push. Resultado em
`docs/superpowers/specs/2026-11-25-redacao-orcamento-resultado.md`, com caminhos relativos ao repositório.
