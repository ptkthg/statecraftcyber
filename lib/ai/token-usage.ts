export interface TokenUsage { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
export const emptyUsage = (): TokenUsage => ({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return { input_tokens: a.input_tokens + b.input_tokens, output_tokens: a.output_tokens + b.output_tokens, cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens, cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens };
}
export const totalTokens = (usage: TokenUsage) => Object.values(usage).reduce((a, b) => a + b, 0);
