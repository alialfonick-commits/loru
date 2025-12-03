// middleware.ts (project root) — using jose
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = process.env.JWT_COOKIE_NAME ?? "token";
const JWT_SECRET = process.env.JWT_SECRET ?? "";

async function verifyToken(token?: string) {
  if (!token) return false;
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    await jwtVerify(token, secret);
    return true;
  } catch (err) {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE_NAME)?.value;

  // If user hits the login page ("/") and has a valid token -> send them to dashboard
  if (pathname === "/") {
    const ok = await verifyToken(token);
    if (ok) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Protect dashboard routes (existing logic)
  const needsAuth = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  if (!needsAuth) return NextResponse.next();

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  const ok = await verifyToken(token);
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // run for root (login) and dashboard
  matcher: ["/", "/dashboard/:path*", "/dashboard"],
};
