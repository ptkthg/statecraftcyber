import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { randomUUID } from 'node:crypto';
import type { MessageBatchIndividualResponse } from '@anthropic-ai/sdk/resources/messages/batches';
import { claudeJson, claudeModel, effort, consumeTokens, tokensAvailable, type ClaudeResult } from './claude-client';
import { recordAiUsage, releaseAiItem, settleAiBatchItem, withAiItem, authorizeAiCall, type AiItem } from './budget';
import { maximumCallCost } from './pricing';
import { emptyUsage } from './token-usage';
import type { AiPurpose } from './budget-policy';
export const claudeBatchEnabled = () => process.env.CLAUDE_USE_BATCH !== 'false';
export const batchTokenEstimate = (prompt: string, system: string, schema: z.ZodType) => 16000 + Buffer.byteLength(prompt + system + JSON.stringify(z.toJSONSchema(schema)), 'utf8') + 4096;
export interface BatchInput<T> { slug: string; input: T; prompt: string; persona: { system: string }; item: AiItem; fallbackResult?: ClaudeResult<unknown> }
export async function submitAiBatch<T>(type: AiPurpose, entries: BatchInput<T>[], schema: z.ZodType, now = new Date()) {
  const admitted: BatchInput<T>[] = [];
  for (const entry of entries) {
    if (await authorizeAiCall(entry.item, maximumCallCost(claudeModel('writer'), entry.persona.system + entry.prompt + JSON.stringify(z.toJSONSchema(schema)), true), now)) admitted.push(entry);
    else await releaseAiItem(entry.item);
  }
  entries = admitted;
  if (!entries.length) return;
  const { prisma } = await import('../prisma');
  const id = 'submission:' + randomUUID();
  const payload = JSON.parse(JSON.stringify(entries));
  // Intenção e reservas ficam duráveis antes da chamada remota. Falha ambígua
  // mantém a reserva: não se reenvia automaticamente um lote que pode existir.
  await prisma.aiBatch.create({ data: { id, type, slugs: entries.map(e => e.slug), payload, state: 'submitting', submittedAt: now } });
  const client = new Anthropic({ maxRetries: 0 });
  const format = zodOutputFormat(schema);
  const response = await client.messages.batches.create({ requests: entries.map(entry => ({ custom_id: entry.slug, params: {
    model: claudeModel('writer'), max_tokens: 16000,
    system: [{ type: 'text', text: entry.persona.system, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: effort('writer'), format: { type: 'json_schema', schema: format.schema } },
    messages: [{ role: 'user', content: entry.prompt }],
  } })) });
  await prisma.aiBatch.update({ where: { id }, data: { id: response.id, state: 'pending' } });
  consumeTokens({ ...emptyUsage(), output_tokens: entries.reduce((sum, entry) => sum + batchTokenEstimate(entry.prompt, entry.persona.system, schema), 0) });
}
function parseResult<S extends z.ZodType>(result: MessageBatchIndividualResponse['result'], schema: S): ClaudeResult<z.infer<S>> {
  if (result.type !== 'succeeded') {
    const invalid = result.type === 'errored' && result.error.error.type === 'invalid_request_error';
    return { status: invalid ? 'invalid' : 'deferred', reason: invalid ? 'invalid_request' : 'batch_' + result.type, usage: emptyUsage() };
  }
  const message = result.message;
  const usage = { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens, cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0, cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0 };
  if (message.stop_reason === 'refusal') return { status: 'refused', category: message.stop_details?.category ?? null, usage };
  if (message.stop_reason === 'max_tokens') return { status: 'invalid', reason: 'max_tokens', usage };
  try {
    const raw = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const data = schema.safeParse(JSON.parse(raw));
    if (data.success) return { status: 'ok', data: data.data, model: message.model, usage };
  } catch { /* JSON inválido permanece retido. */ }
  return { status: 'invalid', reason: 'parsed_output', usage };
}
/** O callback só confirma depois de persistir o fechamento; false retoma na próxima execução. */
export async function pollAiBatches<T, S extends z.ZodType>(type: AiPurpose, schema: S, complete: (input: T, result: ClaudeResult<z.infer<S>>, entry: BatchInput<T>) => Promise<boolean>, now = new Date()): Promise<Set<string>> {
  const { prisma } = await import('../prisma');
  const batches = await prisma.aiBatch.findMany({ where: { type, state: { in: ['pending', 'submitting', 'expired'] } } });
  const occupied = new Set<string>();
  if (!batches.length) return occupied;
  const client = new Anthropic({ maxRetries: 2 });
  for (const batch of batches) {
    const entries = batch.payload as unknown as BatchInput<T>[];
    if (batch.state !== 'expired') for (const slug of batch.slugs) occupied.add(slug);
    const leaseUntil = new Date(now.getTime() + 20 * 60000);
    const claim = await prisma.aiBatch.updateMany({ where: { id: batch.id, state: { in: ['pending', 'submitting', 'expired'] }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { leaseUntil } });
    if (!claim.count) continue;
    try {
    const stale = now.getTime() - batch.submittedAt.getTime() >= 86400000;
    const remote = batch.state === 'submitting' ? null : await client.messages.batches.retrieve(batch.id);
    if (remote?.processing_status !== 'ended') {
      if (!stale) continue;
      if (batch.state === 'expired') continue;
      if (remote) await client.messages.batches.cancel(batch.id);
      for (const entry of entries.filter(e => batch.slugs.includes(e.slug))) {
        await complete(entry.input, { status: 'deferred', reason: 'batch_expired', usage: emptyUsage() }, entry);
        await releaseAiItem(entry.item);
      }
      await prisma.aiBatch.update({ where: { id: batch.id }, data: { state: remote ? 'expired' : 'uncertain', endedAt: now } });
      continue;
    }
    let remaining = [...batch.slugs];
    for await (const response of await client.messages.batches.results(batch.id)) {
      if (!remaining.includes(response.custom_id)) continue;
      const entry = entries.find(e => e.slug === response.custom_id);
      if (!entry) throw new Error('Resultado sem custom_id conhecido: ' + response.custom_id);
      let result = parseResult(response.result, schema);
      await recordAiUsage(entry.item, response.result.type === 'succeeded' ? response.result.message.model : claudeModel('writer'), result.usage, true, batch.id + ':' + entry.slug);
      if (response.result.type === 'succeeded') {
        consumeTokens(result.usage);
      }
      if (batch.state === 'expired') {
        remaining = remaining.filter(slug => slug !== entry.slug);
        await settleAiBatchItem(entry.item, batch.id, remaining);
        continue;
      }
      if (!tokensAvailable()) break;
      if (result.status === 'refused') {
        if (entry.fallbackResult) result = entry.fallbackResult as ClaudeResult<z.infer<S>>;
        else {
          result = await withAiItem(entry.item, () => claudeJson({ schema, persona: entry.persona, prompt: entry.prompt }));
          if (result.status === 'deferred') continue;
          entry.fallbackResult = result;
          // Persiste a única tentativa normal antes do editor, inclusive se o
          // fechamento precisar aguardar a próxima execução.
          await prisma.aiBatch.update({ where: { id: batch.id }, data: { payload: JSON.parse(JSON.stringify(entries)) } });
        }
      }
      if (!await withAiItem(entry.item, () => complete(entry.input, result, entry))) continue;
      remaining = remaining.filter(slug => slug !== entry.slug);
      await settleAiBatchItem(entry.item, batch.id, remaining);
    }
    if (!remaining.length) await prisma.aiBatch.update({ where: { id: batch.id }, data: { state: 'ended', endedAt: now } });
    } finally {
      await prisma.aiBatch.updateMany({ where: { id: batch.id, leaseUntil }, data: { leaseUntil: null } });
    }
  }
  return occupied;
}
