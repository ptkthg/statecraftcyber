type Level = "info" | "warn" | "error";

function log(
  level: Level,
  context: string,
  message: string,
  data?: Record<string, unknown>
) {
  const entry = {
    level,
    context,
    message,
    ts: new Date().toISOString(),
    ...(data ?? {}),
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

export const logger = {
  info: (ctx: string, msg: string, data?: Record<string, unknown>) =>
    log("info", ctx, msg, data),
  warn: (ctx: string, msg: string, data?: Record<string, unknown>) =>
    log("warn", ctx, msg, data),
  error: (ctx: string, msg: string, data?: Record<string, unknown>) =>
    log("error", ctx, msg, data),
};
