import { NextResponse, type NextRequest } from "next/server";

const testUserCookieName = "fm_test_user";
const authSessionCookieName = "fm_session";

export function middleware(request: NextRequest) {
  if (process.env.APP_AUTH_MODE === "development") {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  const isApiRequest = pathname.startsWith("/api/");
  const isPublicApi =
    pathname === "/api/v1/health" ||
    pathname === "/api/v1/auth/login" ||
    pathname === "/api/v1/auth/logout" ||
    (process.env.APP_AUTH_MODE === "test" && pathname === "/api/v1/auth/test-user");
  const hasSession = Boolean(request.cookies.get(authSessionCookieName)?.value);
  const hasTestUser = process.env.APP_AUTH_MODE === "test" && Boolean(request.cookies.get(testUserCookieName)?.value);
  const isAuthenticated = hasSession || hasTestUser;
  const isLoginPage = pathname === "/login";

  if (isPublicApi) {
    return NextResponse.next();
  }

  if (!isAuthenticated && isApiRequest) {
    return NextResponse.json(
      {
        type: "https://httpstatuses.com/403",
        title: "Forbidden",
        status: 403,
        detail: "Please sign in to continue.",
        traceId: request.headers.get("x-correlation-id") ?? crypto.randomUUID()
      },
      { status: 403 }
    );
  }

  if (!isAuthenticated && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuthenticated && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
