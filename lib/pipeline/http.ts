import { currentContext, metricFor, errorCode } from "./context";
export interface HttpPolicy {
  maxAttempts?: number;
  baseDelayMs?: number;
  attemptTimeoutMs?: number;
  safeToRetry?: boolean;
  fetcher?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}
export function retryAfterMs(
  header: string | null,
  now = Date.now(),
): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}
export async function fetchWithPolicy(
  input: string | URL | Request,
  init: RequestInit = {},
  policy: HttpPolicy = {},
): Promise<Response> {
  const context = currentContext();
  let host = "unattributed";
  try {
    host = new URL(input instanceof Request ? input.url : String(input))
      .hostname;
  } catch {}
  const metric = context
    ? metricFor(context, context.source ?? "HTTP / " + host)
    : undefined;
  const ownMetric = !!context && !context.source;
  const fetcher = policy.fetcher ?? globalThis.fetch;
  const method = (
    init.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const safe = policy.safeToRetry ?? ["GET", "HEAD"].includes(method);
  const max = safe ? Math.max(1, Math.min(3, policy.maxAttempts ?? 2)) : 1;
  const deadline = context?.deadlineAt ?? Date.now() + 30000;
  const sleep = policy.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; attempt < max; attempt++) {
    if (Date.now() >= deadline) {
      if (metric) {
        metric.failures++;
        metric.timeouts++;
        metric.codes.push("timeout");
        if (ownMetric) metric.status = "failed";
      }
      throw Object.assign(new Error("Request deadline exceeded"), {
        name: "TimeoutError",
      });
    }
    const requestStarted = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(
          new DOMException("Request deadline exceeded", "TimeoutError"),
        ),
      Math.max(
        1,
        Math.min(policy.attemptTimeoutMs ?? 12000, deadline - Date.now()),
      ),
    );
    let release: (() => void) | undefined;
    try {
      const signal = init.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal;
      release = await context?.network.acquire(signal);
      if (metric) metric.requests++;
      let response = await fetcher(input, { ...init, signal });
      const retryable =
        response.status === 429 ||
        [500, 502, 503, 504].includes(response.status);
      if (response.status === 429 && metric) metric.rateLimits++;
      if (retryable && attempt + 1 < max) {
        const wait =
          retryAfterMs(response.headers.get("retry-after")) ??
          (policy.baseDelayMs ?? 300) * 2 ** attempt +
            Math.floor((policy.random ?? Math.random)() * 100);
        if (wait + Date.now() < deadline) {
          await response.body?.cancel();
          release?.();
          release = undefined;
          clearTimeout(timer);
          if (metric) metric.retries++;
          await sleep(wait);
          continue;
        }
      }
      if (!response.ok && metric) {
        metric.failures++;
        const code =
          response.status === 429
            ? "rate_limit"
            : response.status >= 500
              ? "upstream_5xx"
              : "upstream_4xx";
        if (!metric.codes.includes(code)) metric.codes.push(code);
      }
      if (response instanceof Response && response.body) {
        const buffer = await response.arrayBuffer();
        response = new Response(buffer, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
      return new Proxy(response, {
        get(target, key) {
          if (key === "json")
            return async () => {
              try {
                return await target.json();
              } catch (error) {
                if (metric) {
                  metric.parseErrors++;
                  metric.failures++;
                  if (!metric.codes.includes("parsing"))
                    metric.codes.push("parsing");
                }
                throw error;
              }
            };
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    } catch (error) {
      const code = errorCode(error);
      if (metric && code === "timeout") metric.timeouts++;
      if (attempt + 1 < max && !init.signal?.aborted) {
        const wait = (policy.baseDelayMs ?? 300) * 2 ** attempt;
        if (Date.now() + wait < deadline) {
          release?.();
          release = undefined;
          clearTimeout(timer);
          if (metric) metric.retries++;
          await sleep(wait);
          continue;
        }
      }
      if (metric) {
        metric.failures++;
        if (!metric.codes.includes(code)) metric.codes.push(code);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      release?.();
      if (ownMetric && metric) {
        metric.durationMs += Date.now() - requestStarted;
        metric.status = metric.failures ? "partial" : "success";
      }
    }
  }
  throw new Error("Unreachable retry state");
}
