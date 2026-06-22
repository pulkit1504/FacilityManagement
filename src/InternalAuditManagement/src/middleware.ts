import { NextResponse, type NextRequest } from "next/server";

const testUserCookieName = "fm_test_user";
const authSessionCookieName = "fm_session";
const publicFilePattern = /\.(?:avif|css|gif|ico|jpg|jpeg|js|map|png|svg|webp|woff2?)$/i;

function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

function contentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests"
  ].join("; ");
}

function applySecurityHeaders(response: NextResponse, nonce: string) {
  response.headers.set("Content-Security-Policy", contentSecurityPolicy(nonce));
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  return response;
}

function nextWithSecurityHeaders(request: NextRequest) {
  const nonce = createNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy(nonce));

  return applySecurityHeaders(NextResponse.next({
    request: {
      headers: requestHeaders
    }
  }), nonce);
}

function redirectWithSecurityHeaders(url: URL) {
  return applySecurityHeaders(NextResponse.redirect(url), createNonce());
}

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
    return redirectWithSecurityHeaders(new URL("/login", request.url));
  }

  if (isAuthenticated && isLoginPage) {
    return redirectWithSecurityHeaders(new URL("/", request.url));
  }

  return nextWithSecurityHeaders(request);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};
