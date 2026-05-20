import { createHmac, timingSafeEqual } from "crypto";

const TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function sign(secret: string, exp: number): string {
  return createHmac("sha256", secret).update(String(exp)).digest("hex");
}

export function createAdminToken(secret: string): string {
  const exp = Date.now() + TTL_MS;
  return `${exp}.${sign(secret, exp)}`;
}

export function verifyAdminToken(token: string, secret: string): boolean {
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const exp = parseInt(token.slice(0, dot), 10);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const sig = token.slice(dot + 1);
  const expected = sign(secret, exp);
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
