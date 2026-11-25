import type { TokenUsage } from './token-usage';
// Referência da spec: cache Anthropic de 03/11/2026, USD por milhão de tokens.
// Fonte: https://platform.claude.com/docs/en/about-claude/pricing
// Escrita efêmera de 5 minutos: 1,25 × entrada; Batch: desconto de 50%.
export const PRICING = {
  'claude-sonnet-5-5': { input: 2, output: 10, read: .1, write: 2.5 },
  'claude-haiku-5-5': { input: .1, output: .5, read: .005, write: .125 },
} as const;
export function usageCost(model: string, usage: TokenUsage, batch: boolean): number {
  const price = PRICING[model as keyof typeof PRICING];
  if (!price) throw new Error('Modelo sem preço configurado: ' + model);
  return (usage.input_tokens * price.input + usage.output_tokens * price.output + usage.cache_read_input_tokens * price.read + usage.cache_creation_input_tokens * price.write) / 1_000_000 * (batch ? .5 : 1);
}
// Um byte de UTF-8 por token é um limite conservador para entrada textual.
// Inclui sobrecarga de mensagens/esquema e criação do cache no preço mais alto.
export function maximumCallCost(model: string, text: string, batch: boolean) {
  return usageCost(model, { input_tokens: 0, output_tokens: 16000, cache_read_input_tokens: 0, cache_creation_input_tokens: Buffer.byteLength(text, 'utf8') + 4096 }, batch);
}
