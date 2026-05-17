import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Web Crypto equivalent of hashAdminSecret (Edge Runtime compatible)
async function computeTokenHash(secret: string): Promise<string> {
  const encoded = new TextEncoder().encode(`statecraft-admin:${secret}`);
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and auth API through without a token check
  if (pathname === "/admin/login" || pathname.startsWith("/api/admin/")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    const token = request.cookies.get("admin_token")?.value;
    const secret = process.env.ADMIN_SECRET;

    if (!secret || !token) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    const expected = await computeTokenHash(secret);
    if (token !== expected) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
