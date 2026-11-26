export type AiPurpose = 'news' | 'translation' | 'briefing' | 'cve';
export interface BudgetConfig { usd: number; days: number; start?: string }
export const saoPauloDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export function budgetConfig(): BudgetConfig {
  const usd = Number(process.env.AI_BUDGET_USD ?? 5), days = Number(process.env.AI_BUDGET_DAYS ?? 20);
  const start = process.env.AI_BUDGET_START?.trim() || undefined;
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isSafeInteger(days) || days <= 0 || start && (!/^\d{4}-\d{2}-\d{2}$/.test(start) || new Date(start).toISOString().slice(0, 10) !== start)) throw new Error('Configuração de orçamento inválida');
  return { usd, days, start };
}
export function calculateQuota(config: BudgetConfig & { start: string }, today: string, spent: number, spentToday: number, reserved: number, reservedToday: number) {
  const elapsed = Math.floor((Date.parse(today) - Date.parse(config.start)) / 86400000);
  const daysLeft = config.days - elapsed;
  const usable = config.usd * .9;
  // A reserva já ocupa o período; para o rateio ela não reduz duas vezes a cota de hoje.
  const available = Math.max(0, usable - spent - reserved);
  const allowance = Math.min(Math.max(0, usable - spent + spentToday - (reserved - reservedToday)) / Math.max(1, daysLeft), 2 * config.usd / config.days);
  const remaining = elapsed < 0 || daysLeft <= 0 ? 0 : Math.max(0, Math.min(available, allowance - spentToday - reservedToday));
  return { remaining, allowance, daysLeft, spent, spentToday, reserved, exhausted: spent + reserved >= usable || daysLeft <= 0 };
}
