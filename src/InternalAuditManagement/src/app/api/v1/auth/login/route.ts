import { NextResponse } from "next/server";
import {
  createAuthorizationRequest,
  oauthNonceCookieName,
  oauthStateCookieName,
  oauthVerifierCookieName
} from "@/server/auth/entra-id";

export async function GET(request: Request) {
  const { url, state, nonce, verifier } = createAuthorizationRequest(new URL(request.url).origin);
  const response = NextResponse.redirect(url);
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set(oauthStateCookieName, state, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 10 * 60
  });
  response.cookies.set(oauthVerifierCookieName, verifier, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 10 * 60
  });
  response.cookies.set(oauthNonceCookieName, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 10 * 60
  });

  return response;
}
