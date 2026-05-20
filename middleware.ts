import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Edge Runtime: verify HMAC-signed admin token (format: "<exp>.<hex-signature>")
async function verifyAdminToken(token: string, secret: string): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot === -1) return false;

  const exp = parseInt(token.slice(0, dot), 10);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  const sig = token.slice(dot + 1);

  try {
    const keyData = new TextEncoder().encode(secret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const msgData = new TextEncoder().encode(String(exp));
    const sigBytes = await crypto.subtle.sign("HMAC", key, msgData);
    const expected = [...new Uint8Array(sigBytes)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return sig === expected;
  } catch {
    return false;
  }
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

    const valid = await verifyAdminToken(token, secret);
    if (!valid) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
