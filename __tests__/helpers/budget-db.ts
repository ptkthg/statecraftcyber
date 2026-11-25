// Simula somente a fronteira de persistência; a política de orçamento é real.
type Row = Record<string, unknown>;
type Query = { where?: Row; orderBy?: Row; take?: number; data?: Row };
export function budgetDb() {
  const ledger: Row[] = [], reservations: Row[] = [];
  const matches = (row: Row, where: Row = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'gte' in value) return Number(row[key]) >= Number(value.gte);
    if (value && typeof value === 'object' && 'in' in value) return (value.in as unknown[]).includes(row[key]);
    return row[key] === value;
  });
  const table = (rows: Row[]) => ({
    findMany: async ({ where, orderBy, take }: Query = {}) => {
      let result = rows.filter(r => matches(r, where));
      if (orderBy) { const [key, direction] = Object.entries(orderBy)[0]; result = result.sort((a,b) => (Number(a[key]) - Number(b[key])) * (direction === 'desc' ? -1 : 1)); }
      return take ? result.slice(0, take) : result;
    },
    findFirst: async ({ orderBy }: Query = {}) => [...rows].sort((a,b) => { const key = Object.keys(orderBy ?? {})[0]; return Number(a[key]) - Number(b[key]); })[0] ?? null,
    findUnique: async ({ where }: Query) => rows.find(r => matches(r, where)) ?? null,
    create: async ({ data }: Query) => { const row = { occurredAt: new Date(), liabilityUsd: 0, state: 'active', ...data }; rows.push(row); return row; },
    update: async ({ where, data }: Query) => { const row = rows.find(r => matches(r, where))!; Object.assign(row, data); return row; },
    updateMany: async ({ where, data }: Query) => { const found = rows.filter(r => matches(r, where)); found.forEach(r => Object.assign(r, data)); return { count: found.length }; },
    count: async ({ where }: Query) => rows.filter(r => matches(r, where)).length,
    groupBy: async () => [...new Set(rows.filter(r => r.purpose === 'news').sort((a,b) => Number(b.occurredAt) - Number(a.occurredAt)).map(r => r.itemKey))].slice(0,50).map(itemKey => ({ itemKey })),
  });
  const db = { aiUsageLedger: table(ledger), aiReservation: table(reservations), $executeRaw: async () => 1 };
  let tail = Promise.resolve();
  return { ...db, ledger, reservations, $transaction: <T>(fn: (tx: typeof db) => Promise<T>) => {
    const work = tail.then(() => fn(db)); tail = work.then(() => {}, () => {}); return work;
  } };
}
