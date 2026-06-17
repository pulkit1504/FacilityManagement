import { NextResponse, type NextRequest } from "next/server";

const testUserCookieName = "fm_test_user";
const authSessionCookieName = "fm_session";
const publicFilePattern = /\.(?:avif|css|gif|ico|jpg|jpeg|js|map|png|svg|webp|woff2?)$/i;

export function middleware(request: NextRequest) {
  if (publicFilePattern.test(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (process.env.APP_AUTH_MODE === "development") {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(authSessionCookieName)?.value);
  const hasTestUser = process.env.APP_AUTH_MODE === "test" && Boolean(request.cookies.get(testUserCookieName)?.value);
  const isAuthenticated = hasSession || hasTestUser;
  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!isAuthenticated && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuthenticated && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};
