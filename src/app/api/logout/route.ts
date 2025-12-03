// app/api/logout/route.ts
import { NextResponse } from "next/server";
import { serialize } from "cookie";

const COOKIE_NAME = process.env.JWT_COOKIE_NAME || "token";

export async function POST() {
  const isProd = process.env.NODE_ENV === "production";
  const cookie = serialize(COOKIE_NAME, "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", cookie);
  return res;
}