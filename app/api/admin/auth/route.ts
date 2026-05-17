import { NextRequest, NextResponse } from "next/server";
import { hashAdminSecret } from "@/lib/security/hash-secret";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  // 5 attempts per 15 minutes per IP
  const { allowed, retryAfterMs } = checkRateLimit(`admin-login:${ip}`, 5, 15 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      }
    );
  }

  const { password } = (await req.json()) as { password?: string };
  const secret = process.env.ADMIN_SECRET;

  if (!secret || !password || password !== secret) {
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  // Store a hash of the secret — never the raw value
  const tokenHash = hashAdminSecret(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_token", tokenHash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_token", "", { maxAge: 0, path: "/" });
  return res;
}
