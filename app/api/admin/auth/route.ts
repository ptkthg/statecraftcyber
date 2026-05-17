import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { password } = (await req.json()) as { password?: string };
  const secret = process.env.ADMIN_SECRET;

  if (!secret || !password || password !== secret) {
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_token", secret, {
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
