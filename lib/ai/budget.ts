import { prisma } from '../prisma';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { budgetConfig, calculateQuota, saoPauloDay, type AiPurpose } from './budget-policy';
import { usageCost } from './pricing';
import type { TokenUsage } from './token-usage';

export interface AiItem { id: string; purpose: AiPurpose; itemKey: string }
const items = new AsyncLocalStorage<AiItem>();
export const currentAiItem = () => items.getStore();
export const withAiItem = <T>(item: AiItem, fn: () => Promise<T>) => items.run(item, fn);
let excluded = 0;
const dayStart = (day: string) => new Date(day + 'T00:00:00-03:00');
async function state(tx: Prisma.TransactionClient, now: Date) {
  const config = budgetConfig(), today = saoPauloDay(now);
  const first = await tx.aiUsageLedger.findFirst({ orderBy: { occurredAt: 'asc' } });
  const firstReservation = await tx.aiReservation.findFirst({ orderBy: { createdAt: 'asc' } });
  const start = config.start ?? (first ? saoPauloDay(first.occurredAt) : firstReservation?.periodStart ?? today);
  const ledger = await tx.aiUsageLedger.findMany({ where: { occurredAt: { gte: dayStart(start) } } });
  // Dívidas de lotes anteriores também ocupam o crédito da recarga atual.
  const reservations = await tx.aiReservation.findMany({ where: { state: { in: ['active', 'awaiting_usage'] } } });
  const sum = (rows: { costUsd: number }[]) => rows.reduce((s, r) => s + r.costUsd, 0);
  const spentTodayRows = ledger.filter(r => saoPauloDay(r.occurredAt) === today);
  const reserved = reservations.reduce((s, r) => s + r.reservedUsd, 0);
  const reservedToday = reservations.filter(r => r.day === today).reduce((s, r) => s + r.reservedUsd, 0);
  const quota = calculateQuota({ ...config, start }, today, sum(ledger), sum(spentTodayRows), reserved, reservedToday);
  const auxiliarySpent = spentTodayRows.filter(r => r.purpose !== 'news').reduce((s, r) => s + r.costUsd, 0);
  const auxiliaryReserved = reservations.filter(r => r.day === today && r.purpose !== 'news').reduce((s, r) => s + r.reservedUsd, 0);
  const newsSpent = sum(spentTodayRows) - auxiliarySpent;
  const newsReserved = reservedToday - auxiliaryReserved;
  return { ...quota, today, start, ledger, reservations, auxiliaryRemaining: Math.max(0, quota.allowance * .2 - auxiliarySpent - auxiliaryReserved), newsRemaining: Math.max(0, quota.allowance * .8 - newsSpent - newsReserved) };
}
export async function reserveAiItem(purpose: AiPurpose, itemKey: string, now = new Date()): Promise<AiItem | null> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(52711901)`;
    const current = await state(tx, now);
    if (current.reservations.some(r => r.state === 'active' && r.purpose === purpose && r.itemKey === itemKey)) return null;
    const latest = await tx.aiUsageLedger.groupBy({ by: ['itemKey'], where: { purpose: 'news' }, _max: { occurredAt: true }, orderBy: { _max: { occurredAt: 'desc' } }, take: 50 });
    const recent = await tx.aiUsageLedger.findMany({ where: { purpose: 'news', itemKey: { in: latest.map(row => row.itemKey) } } });
    const costs = new Map<string, number>();
    for (const row of recent) {
      const key = row.itemKey;
      costs.set(key, (costs.get(key) ?? 0) + row.costUsd);
    }
    const estimate = costs.size ? Math.max(.001, [...costs.values()].reduce((a, b) => a + b, 0) / costs.size) : .012;
    // Briefings são maiores; sua estimativa também precisa caber na reserva.
    const cost = estimate * (purpose === 'briefing' ? 2 : 1);
    const count = purpose === 'news' ? 0 : await tx.aiReservation.count({ where: { purpose, day: current.today } });
    if (current.remaining + 1e-10 < cost || (purpose === 'news' ? current.newsRemaining : current.auxiliaryRemaining) + 1e-10 < cost || purpose !== 'news' && count >= (purpose === 'briefing' ? 3 : 5)) {
      excluded++;
      if (current.exhausted) console.warn('orçamento do período esgotado');
      return null;
    }
    const item = { id: randomUUID(), purpose, itemKey };
    await tx.aiReservation.create({ data: { ...item, periodStart: current.start, day: current.today, reservedUsd: cost, createdAt: now } });
    return item;
  });
}
export async function releaseAiItem(item: AiItem) {
  await prisma.$transaction(async tx => {
    const row = await tx.aiReservation.findUnique({ where: { id: item.id } });
    if (!row) return;
    await tx.aiReservation.update({ where: { id: item.id }, data: { state: row.liabilityUsd > 0 ? 'awaiting_usage' : 'settled', reservedUsd: 0 } });
  });
}
export async function settleAiBatchItem(item: AiItem, batchId: string, slugs: string[]) {
  await prisma.$transaction(async tx => {
    await tx.aiReservation.update({ where: { id: item.id }, data: { state: 'settled', reservedUsd: 0, liabilityUsd: 0 } });
    await tx.aiBatch.update({ where: { id: batchId }, data: { slugs } });
  });
}
/** Trava absoluta separada da estimativa de pauta; cobre a maior resposta possível. */
export async function authorizeAiCall(item: AiItem, maximumUsd: number, now = new Date()) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(52711901)`;
    const current = await state(tx, now);
    const config = budgetConfig();
    const own = current.reservations.find(r => r.id === item.id);
    // Cobrança ambígua não pode ser sobrescrita por outra chamada.
    if (!own || own.liabilityUsd > 0) return false;
    const liability = current.reservations.filter(r => r.id !== item.id).reduce((s, r) => s + r.liabilityUsd, 0);
    if (current.today < current.start || current.spent >= config.usd * .9 || current.daysLeft <= 0 || current.spent + liability + maximumUsd > config.usd) {
      excluded++;
      console.warn('orçamento do período esgotado');
      return false;
    }
    const changed = await tx.aiReservation.updateMany({ where: { id: item.id, state: 'active' }, data: { liabilityUsd: maximumUsd } });
    return changed.count === 1;
  });
}
export async function recordAiUsage(item: AiItem, model: string, usage: TokenUsage, batch = false, deduplicationKey?: string) {
  const data = { model, purpose: item.purpose, itemKey: item.itemKey, reservationId: item.id, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cacheReadTokens: usage.cache_read_input_tokens, cacheWriteTokens: usage.cache_creation_input_tokens, batch, costUsd: usageCost(model, usage, batch), deduplicationKey };
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(52711901)`;
    if (deduplicationKey && await tx.aiUsageLedger.findUnique({ where: { deduplicationKey } })) return;
    await tx.aiUsageLedger.create({ data });
    // Substitui gradualmente a estimativa pelo custo real, sem dupla contagem.
    const reservation = await tx.aiReservation.findUnique({ where: { id: item.id } });
    if (reservation) await tx.aiReservation.update({ where: { id: item.id }, data: { reservedUsd: Math.max(0, reservation.reservedUsd - data.costUsd), liabilityUsd: 0 } });
  });
}
export async function logAiBudget(now = new Date()) {
  const current = await state(prisma, now);
  const month = saoPauloDay(now).slice(0, 7) + '-01';
  const monthly = await prisma.aiUsageLedger.aggregate({ where: { occurredAt: { gte: dayStart(month) } }, _sum: { costUsd: true } });
  console.log(JSON.stringify({ orçamento: { gastoDoDia: current.spentToday, gastoDoMês: monthly._sum.costUsd ?? 0, cotaRestante: current.remaining, itensForaPorOrçamento: excluded } }));
  excluded = 0;
}
