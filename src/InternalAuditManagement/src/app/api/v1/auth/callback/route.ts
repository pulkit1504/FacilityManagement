import { NextResponse } from "next/server";
import {
  exchangeCodeForProfile,
  oauthNonceCookieName,
  oauthStateCookieName,
  oauthVerifierCookieName
} from "@/server/auth/entra-id";
import { authSessionCookieName, createSessionCookieValue } from "@/server/auth/session";
import { getRepository } from "@/server/services/service-factory";

const sessionMaxAgeSeconds = 60 * 60 * 8;

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const error = requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");
  const redirectUrl = new URL("/", request.url);

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, request.url));
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = parseCookieHeader(cookieHeader);
  const expectedState = cookies.get(oauthStateCookieName);
  const verifier = cookies.get(oauthVerifierCookieName);
  const nonce = cookies.get(oauthNonceCookieName);

  if (!code || !state || !expectedState || state !== expectedState || !verifier || !nonce) {
    return NextResponse.redirect(new URL("/login?error=Invalid%20sign-in%20session", request.url));
  }

  try {
    const profile = await exchangeCodeForProfile({
      origin: requestUrl.origin,
      code,
      verifier,
      nonce
    });
    const employee = await getRepository().getEmployeeByEmail(profile.email);

    if (!employee) {
      return NextResponse.redirect(new URL("/login?error=Your%20account%20is%20not%20configured%20in%20Facility%20Control", request.url));
    }

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(
      authSessionCookieName,
      createSessionCookieValue(
        {
          userId: employee.employeeId,
          role: employee.role,
          email: employee.email,
          name: employee.fullName
        },
        sessionMaxAgeSeconds
      ),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: sessionMaxAgeSeconds
      }
    );
    clearOAuthCookies(response);
    return response;
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Microsoft sign-in failed";
    const response = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, request.url));
    clearOAuthCookies(response);
    return response;
  }
}

function clearOAuthCookies(response: NextResponse) {
  for (const name of [oauthStateCookieName, oauthVerifierCookieName, oauthNonceCookieName]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0
    });
  }
}

function parseCookieHeader(header: string) {
  return new Map(
    header
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const [name, ...value] = cookie.split("=");
        return [name, decodeURIComponent(value.join("="))] as const;
      })
  );
}
