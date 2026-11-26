import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import type { Persona } from './editorial-personas';
import { aiStarted, aiFinished, currentContext } from '../pipeline/context';
import { currentAiItem, reserveAiItem, recordAiUsage, releaseAiItem, authorizeAiCall } from './budget';
import { usageCost, maximumCallCost } from './pricing';

import { emptyUsage, totalTokens, type TokenUsage } from './token-usage';
export { emptyUsage, addUsage, totalTokens, type TokenUsage } from './token-usage';
export function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
export const createTokenBudget = (limit = positiveInteger(process.env.AI_RUN_TOKEN_BUDGET, 2_000_000)) => ({ limit, used: 0 });
const budgets = new AsyncLocalStorage<ReturnType<typeof createTokenBudget>>();
export const withTokenBudget = <T>(budget: ReturnType<typeof createTokenBudget>, fn: () => Promise<T>) => budgets.run(budget, fn);
export type ClaudeResult<T> = { status: 'ok'; data: T; model: string; usage: TokenUsage } | { status: 'refused'; category: string | null; usage: TokenUsage } | { status: 'invalid' | 'deferred'; reason: string; usage: TokenUsage };
export type ClaudeRole = 'writer' | 'editor' | 'translator';
const ROLE_ENV = { writer: 'WRITER', editor: 'EDITOR', translator: 'TRANSLATOR' } as const;
export function effort(role: ClaudeRole): 'low' | 'medium' | 'high' | 'xhigh' | 'max' {
  const value = process.env['CLAUDE_' + ROLE_ENV[role] + '_EFFORT'];
  return value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh' || value === 'max' ? value : role === 'editor' ? 'medium' : 'low';
}
export const claudeModel = (role: ClaudeRole) => process.env['CLAUDE_' + ROLE_ENV[role] + '_MODEL']?.trim() || (role === 'writer' ? 'claude-sonnet-5-5' : 'claude-haiku-5-5');
export function consumeTokens(usage: TokenUsage) {
  const budget = budgets.getStore();
  if (budget) budget.used += totalTokens(usage);
}
export function tokensAvailable(estimate = 1) {
  const budget = budgets.getStore(), metrics = currentContext()?.metrics.ai;
  const used = budget?.used ?? (metrics ? metrics.inputTokens + metrics.outputTokens + (metrics.cacheReadInputTokens ?? 0) + (metrics.cacheCreationInputTokens ?? 0) : 0);
  return used + estimate <= (budget?.limit ?? positiveInteger(process.env.AI_RUN_TOKEN_BUDGET, 2_000_000));
}
export async function claudeJson<S extends z.ZodType>({ schema, persona, prompt, role = 'writer', maxTokens = 16000 }: { schema: S; persona: Pick<Persona, 'system'>; prompt: string; role?: ClaudeRole; maxTokens?: number }): Promise<ClaudeResult<z.infer<S>>> {
  const budget = budgets.getStore();
  const metrics = currentContext()?.metrics.ai;
  const used = budget?.used ?? (metrics ? metrics.inputTokens + metrics.outputTokens + (metrics.cacheReadInputTokens ?? 0) + (metrics.cacheCreationInputTokens ?? 0) : 0);
  if (used >= (budget?.limit ?? positiveInteger(process.env.AI_RUN_TOKEN_BUDGET, 2_000_000))) return { status: 'deferred', reason: 'token_budget', usage: emptyUsage() };
  const model = claudeModel(role);
  // Modelo sem tabela de preços não pode gerar uma cobrança invisível.
  usageCost(model, emptyUsage(), false);
  const inherited = currentAiItem();
  const item = inherited ?? await reserveAiItem('news', 'call:' + crypto.randomUUID());
  if (!item) return { status: 'deferred', reason: 'period_budget', usage: emptyUsage() };
  if (!await authorizeAiCall(item, maximumCallCost(model, persona.system + prompt + JSON.stringify(z.toJSONSchema(schema)), false, maxTokens))) {
    if (!inherited) await releaseAiItem(item);
    return { status: 'deferred', reason: 'period_budget', usage: emptyUsage() };
  }
  aiStarted();
  let received = false;
  try {
    const client = new Anthropic({ maxRetries: 2 });
    const params = {
      model, max_tokens: maxTokens,
      system: [{ type: 'text' as const, text: persona.system, cache_control: { type: 'ephemeral' as const } }],
      output_config: { effort: effort(role), format: { ...betaZodOutputFormat(schema), parse: (raw: string) => raw } },
      messages: [{ role: 'user' as const, content: prompt }],
    };
    const response = role === 'writer'
      ? await client.beta.messages.parse({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.parse(params);
    const usage: TokenUsage = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens, cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0, cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0 };
    received = true;
    if (budget) budget.used += totalTokens(usage);
    await recordAiUsage(item, response.model ?? model, usage);
    const failure = response.stop_reason === 'refusal' ? 'refusal' : response.stop_reason === 'max_tokens' ? 'max_tokens' : undefined;
    aiFinished(usage, failure);
    if (response.stop_reason === 'refusal') return { status: 'refused', category: response.stop_details?.category ?? null, usage };
    if (response.stop_reason === 'max_tokens') return { status: 'invalid', reason: 'max_tokens', usage };
    // O SDK 1.14 interpreta o texto antes de devolver stop_reason. Adiamos essa
    // interpretação para preservar recusas e respostas truncadas com seu uso.
    if (response.parsed_output === null) return { status: 'invalid', reason: 'parsed_output', usage };
    let output: unknown = response.parsed_output;
    if (typeof output === 'string') {
      try { output = JSON.parse(output); } catch { return { status: 'invalid', reason: 'parsed_output', usage }; }
    }
    const parsed = schema.safeParse(output);
    if (!parsed.success) return { status: 'invalid', reason: 'parsed_output', usage };
    return { status: 'ok', data: parsed.data, model: response.model ?? model, usage };
  } catch (error) {
    // A resposta pode ter sido faturada. Falha de ledger ou preço desconhecido
    // deve interromper a execução, mantendo a cobertura financeira persistente.
    if (received) throw error;
    if (error instanceof Anthropic.APIError && error.status !== undefined && error.status < 500) await recordAiUsage(item, model, emptyUsage());
    const transient = error instanceof Anthropic.RateLimitError || error instanceof Anthropic.APIConnectionError || (error instanceof Anthropic.APIError && (error.status ?? 0) >= 500);
    const reason = transient ? 'upstream_retry' : error instanceof Anthropic.APIError ? 'api_error' : 'invalid_response';
    aiFinished(undefined, reason);
    return { status: transient ? 'deferred' : 'invalid', reason, usage: emptyUsage() };
  } finally { if (!inherited) await releaseAiItem(item); }
}
