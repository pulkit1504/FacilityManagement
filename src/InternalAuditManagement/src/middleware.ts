import { NextResponse, type NextRequest } from "next/server";

const testUserCookieName = "fm_test_user";

export function middleware(request: NextRequest) {
  if (process.env.APP_AUTH_MODE === "development") {
    return NextResponse.next();
  }

  const hasTestUser = Boolean(request.cookies.get(testUserCookieName)?.value);
  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!hasTestUser && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (hasTestUser && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};
