import { AsyncLocalStorage } from "node:async_hooks";
export interface SourceMetric {
  name: string;
  status: "running" | "success" | "partial" | "failed" | "skipped";
  durationMs: number;
  collected: number;
  requests: number;
  retries: number;
  failures: number;
  timeouts: number;
  rateLimits: number;
  parseErrors: number;
  codes: string[];
}
export interface RunMetrics {
  sources: Record<string, SourceMetric>;
  collected: number;
  observed: number;
  unchanged: number;
  deduplicated: number;
  eventsCreated: number;
  generated: number;
  created: number;
  updated: number;
  rejected: number;
  deferred: number;
  failures: number;
  indicatorsAdded: number;
  indicatorsRemoved: number;
  ai: {
    requests: number;
    successful: number;
    failed: number;
    inputTokens: number;
    outputTokens: number;
    usageKnown: number;
    usageUnknown: number;
    parseErrors: number;
  };
}
export function emptyMetrics(): RunMetrics {
  return {
    sources: {},
    collected: 0,
    observed: 0,
    unchanged: 0,
    deduplicated: 0,
    eventsCreated: 0,
    generated: 0,
    created: 0,
    updated: 0,
    rejected: 0,
    deferred: 0,
    failures: 0,
    indicatorsAdded: 0,
    indicatorsRemoved: 0,
    ai: {
      requests: 0,
      successful: 0,
      failed: 0,
      inputTokens: 0,
      outputTokens: 0,
      usageKnown: 0,
      usageUnknown: 0,
      parseErrors: 0,
    },
  };
}
export class Semaphore {
  private active = 0;
  private waiting: {
    resolve: () => void;
    reject: (e: Error) => void;
    signal?: AbortSignal;
    abort?: () => void;
  }[] = [];
  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1)
      throw new Error("Invalid concurrency");
  }
  async acquire(signal?: AbortSignal): Promise<() => void> {
    signal?.throwIfAborted();
    if (this.active < this.limit) this.active++;
    else
      await new Promise<void>((resolve, reject) => {
        const entry = {
          resolve,
          reject,
          signal,
          abort: undefined as (() => void) | undefined,
        };
        entry.abort = () => {
          this.waiting = this.waiting.filter((v) => v !== entry);
          reject(new Error("Queue deadline exceeded"));
        };
        signal?.addEventListener("abort", entry.abort, { once: true });
        this.waiting.push(entry);
      });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) {
        if (next.abort) next.signal?.removeEventListener("abort", next.abort);
        next.resolve();
      } else this.active--;
    };
  }
}
export interface PipelineContext {
  metrics: RunMetrics;
  deadlineAt: number;
  network: Semaphore;
  source?: string;
  lastAiFailure?: string;
}
const storage = new AsyncLocalStorage<PipelineContext>();
export const currentContext = () => storage.getStore();
export const remainingMs = () =>
  Math.max(
    0,
    (currentContext()?.deadlineAt ?? Date.now() + 60000) - Date.now(),
  );
export function withPipeline<T>(
  context: PipelineContext,
  fn: () => Promise<T>,
) {
  return storage.run(context, fn);
}
export function metricFor(
  context: PipelineContext,
  name = context.source ?? "unattributed",
): SourceMetric {
  if (!Object.hasOwn(context.metrics.sources, name))
    Object.defineProperty(context.metrics.sources, name, {
      value: {
        name,
        status: "running",
        durationMs: 0,
        collected: 0,
        requests: 0,
        retries: 0,
        failures: 0,
        timeouts: 0,
        rateLimits: 0,
        parseErrors: 0,
        codes: [],
      },
      enumerable: true,
      writable: true,
      configurable: true,
    });
  return context.metrics.sources[name];
}
export function errorCode(error: unknown): string {
  const e = error as {
    name?: string;
    status?: number;
    code?: string;
    pipelineCode?: string;
    message?: string;
  };
  if (e?.pipelineCode === "parsing") return "parsing";
  if (e?.code === "P2002") return "database_conflict";
  if (e?.code === "P2028") return "database_timeout";
  if (e?.code === "P1001" || e?.code === "P1002") return "database_unavailable";
  if (e?.status === 429 || /\b429\b/.test(e?.message ?? ""))
    return "rate_limit";
  if (e?.name === "SyntaxError") return "parsing";
  if (
    /abort|timeout|deadline/i.test((e?.name ?? "") + " " + (e?.message ?? ""))
  )
    return "timeout";
  if (e?.status && e.status >= 500) return "upstream_5xx";
  return "upstream_error";
}
export async function withSource<T extends unknown[]>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const parent = currentContext();
  if (!parent) return fn();
  const context = { ...parent, source: name };
  const metric = metricFor(context, name);
  const started = Date.now();
  return storage.run(context, async () => {
    try {
      const rows = await fn();
      metric.collected += rows.length;
      const childFailure = Object.values(context.metrics.sources).some(
        (s) => s.name.startsWith(name + " / ") && s.status !== "success",
      );
      if (metric.status !== "skipped")
        metric.status = metric.failures || childFailure ? "partial" : "success";
      return rows;
    } catch (error) {
      const code = errorCode(error);
      metric.status = "failed";
      if (!metric.codes.includes(code)) metric.codes.push(code);
      if (code === "parsing" && !metric.parseErrors) metric.parseErrors++;
      throw error;
    } finally {
      metric.durationMs += Date.now() - started;
    }
  });
}
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(items.length, Math.max(1, limit)) },
      async () => {
        while (next < items.length) {
          const index = next++;
          try {
            results[index] = {
              status: "fulfilled",
              value: await fn(items[index], index),
            };
          } catch (reason) {
            results[index] = { status: "rejected", reason };
          }
        }
      },
    ),
  );
  return results;
}
export function aiStarted() {
  const c = currentContext();
  if (c) c.metrics.ai.requests++;
}
export function aiFinished(
  usage?: { prompt_tokens?: number; completion_tokens?: number },
  failure?: string,
) {
  const c = currentContext();
  if (!c) return;
  if (failure) {
    c.metrics.ai.failed++;
    c.lastAiFailure = failure;
    return;
  }
  c.metrics.ai.successful++;
  if (
    usage &&
    Number.isFinite(usage.prompt_tokens) &&
    Number.isFinite(usage.completion_tokens)
  ) {
    c.metrics.ai.inputTokens += usage.prompt_tokens!;
    c.metrics.ai.outputTokens += usage.completion_tokens!;
    c.metrics.ai.usageKnown++;
  } else c.metrics.ai.usageUnknown++;
}

export function sourceSkipped(code: string) {
  const c = currentContext();
  if (c) {
    const m = metricFor(c);
    m.status = "skipped";
    m.codes.push(code);
  }
}
