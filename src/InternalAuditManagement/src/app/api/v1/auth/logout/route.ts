import { NextResponse } from "next/server";
import { authSessionCookieName } from "@/server/auth/session";
import { testUserCookieName } from "@/server/auth/test-users";

export async function POST() {
  const response = NextResponse.json({ message: "Signed out." });

  for (const name of [authSessionCookieName, testUserCookieName]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && process.env.APP_AUTH_MODE !== "test",
      path: "/",
      maxAge: 0
    });
  }

  return response;
}
