import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and auth API through without a token check
  if (pathname === "/admin/login" || pathname.startsWith("/api/admin/")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    const token = request.cookies.get("admin_token")?.value;
    const secret = process.env.ADMIN_SECRET;

    if (!secret || token !== secret) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
