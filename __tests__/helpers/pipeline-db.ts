/* eslint-disable @typescript-eslint/no-explicit-any */
// Transactional, in-memory test double. SQL lease/DDL semantics are tested separately in PostgreSQL.
import type { PrismaClient } from "@prisma/client";
export function memoryDatabase() {
  const tables: Record<string, any[]> = {
    briefing: [],
    ioc: [],
    intelligenceEvent: [],
    sourceRecord: [],
    sourceRevision: [],
    briefingRevision: [],
    pipelineRun: [],
    pipelineLease: [],
    cronLog: [],
    collectionBatch: [],
  };
  let sequence = 0;
  const db: any = {};
  function match(row: any, where: any): boolean {
    if (!where) return true;
    return Object.entries(where).every(([key, value]: [string, any]) => {
      if (key === "AND") return value.every((w: any) => match(row, w));
      if (key === "OR") return value.some((w: any) => match(row, w));
      if (key === "pipelineEvent")
        return !tables.intelligenceEvent.some((e) => e.briefingId === row.id);
      if (["briefingId_revision", "type_normalized_briefingId"].includes(key))
        return match(row, value);
      const actual = row[key];
      if (value instanceof Date) return +actual === +value;
      if (value && typeof value === "object")
        return Object.entries(value).every(([op, v]: [string, any]) =>
          op === "in"
            ? v.includes(actual)
            : op === "not"
              ? actual !== v
              : op === "gte"
                ? actual >= v
                : op === "lte"
                  ? actual <= v
                  : op === "lt"
                    ? actual < v
                    : op === "equals"
                      ? actual === v
                      : false,
        );
      return actual === value;
    });
  }
  function decorate(name: string, row: any, args: any) {
    if (!row) return row;
    const out = structuredClone(row);
    if (args?.include?.records)
      out.records = structuredClone(
        tables.sourceRecord.filter((r) => r.eventId === row.id),
      );
    if (args?.include?.briefing)
      out.briefing = structuredClone(
        tables.briefing.find((b) => b.id === row.briefingId) ?? null,
      );
    if (args?.select)
      return Object.fromEntries(
        Object.keys(args.select).map((k) => [k, out[k]]),
      );
    return out;
  }
  for (const name of Object.keys(tables)) {
    const create = async ({ data }: any) => {
      const now = new Date();
      const defaults: any = {
        id: "id-" + ++sequence,
        createdAt: now,
        observedAt: now,
        updatedAt: now,
        revision: name === "sourceRecord" ? 1 : 0,
        status:
          name === "pipelineRun"
            ? "running"
            : name === "intelligenceEvent"
              ? "pending"
              : "draft",
        attempts: 0,
        nextAttemptAt: null,
        lastErrorCode: null,
        briefingId: null,
        firstObservedAt: now,
        lastObservedAt: now,
        materialFingerprint: "",
        sourceUpdatedAt: null,
        isActive: true,
        pipelineManaged: false,
        cursor: 0,
        complete: false,
      };
      const row = { ...defaults, ...structuredClone(data) };
      tables[name].push(row);
      return structuredClone(row);
    };
    const findMany = async (args: any = {}) => {
      let rows = tables[name].filter((r) => match(r, args.where));
      if (args.orderBy) {
        const [key, direction] = Object.entries(args.orderBy)[0];
        rows = [...rows].sort(
          (a, b) =>
            (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) *
            (direction === "desc" ? -1 : 1),
        );
      }
      if (args.take) rows = rows.slice(0, args.take);
      return rows.map((row) => decorate(name, row, args));
    };
    const update = async ({ where, data }: any) => {
      const row = tables[name].find((r) => match(r, where));
      if (!row) throw new Error("missing " + name);
      for (const [k, v] of Object.entries(data) as [string, any][])
        row[k] =
          v && typeof v === "object" && "increment" in v
            ? row[k] + v.increment
            : structuredClone(v);
      return structuredClone(row);
    };
    db[name] = {
      create,
      findMany,
      findFirst: async (a: any) => (await findMany(a))[0] ?? null,
      findUnique: async (a: any) => (await findMany(a))[0] ?? null,
      findUniqueOrThrow: async (a: any) => {
        const row = (await findMany(a))[0];
        if (!row) throw new Error("missing " + name);
        return row;
      },
      update,
      updateMany: async ({ where, data }: any) => {
        const rows = tables[name].filter((r) => match(r, where));
        for (const row of rows) await update({ where: { id: row.id }, data });
        return { count: rows.length };
      },
      count: async (a: any = {}) => (await findMany(a)).length,
      deleteMany: async (a: any) => {
        const old = tables[name].length;
        tables[name] = tables[name].filter((r) => !match(r, a.where));
        return { count: old - tables[name].length };
      },
      upsert: async (a: any) =>
        tables[name].some((r) => match(r, a.where))
          ? update({ where: a.where, data: a.update })
          : create({ data: a.create }),
    };
  }
  db.$transaction = async (fn: any) => {
    const snapshot = structuredClone(tables);
    try {
      return await fn(db);
    } catch (e) {
      for (const key of Object.keys(tables)) tables[key] = snapshot[key];
      throw e;
    }
  };
  db.$queryRaw = async (strings: TemplateStringsArray, ...values: any[]) => {
    if (strings.join("").includes("INSERT")) {
      const [key, owner] = values,
        old = tables.pipelineLease.find((r) => r.key === key);
      if (old && old.expiresAt > new Date()) return [];
      tables.pipelineLease = tables.pipelineLease.filter((r) => r.key !== key);
      tables.pipelineLease.push({
        key,
        owner,
        expiresAt: new Date(Date.now() + 55000),
      });
      return [{ owner }];
    }
    const [key, owner] = values;
    return tables.pipelineLease
      .filter(
        (r) => r.key === key && r.owner === owner && r.expiresAt > new Date(),
      )
      .map((r) => ({ owner: r.owner }));
  };
  return {
    db: db as PrismaClient,
    tables,
    failIoc: () => {
      db.ioc.upsert = async () => {
        throw new Error("IOC unavailable");
      };
    },
  };
}
