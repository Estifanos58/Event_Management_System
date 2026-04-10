import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/core/auth/auth";

const AUTH_PAGES = new Set(["/login", "/register"]);
const PROTECTED_PREFIXES = [
  "/onboarding",
  "/context",
  "/profile",
  "/notifications",
  "/search",
  "/error",
  "/unauthorized",
  "/attendee",
  "/organizer",
  "/staff",
  "/admin",
  "/api/events",
  "/api/identity",
  "/api/organizations",
  "/api/ops",
];

function createCorrelationId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `corr-${Date.now()}`;
}

function isAuthPage(pathname: string) {
  return AUTH_PAGES.has(pathname);
}

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

async function hasActiveSession(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  return Boolean(session?.session?.id);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  const correlationId =
    requestHeaders.get("x-correlation-id")?.trim() ?? createCorrelationId();
  const traceId = requestHeaders.get("x-trace-id")?.trim() ?? correlationId;

  requestHeaders.set("x-correlation-id", correlationId);
  requestHeaders.set("x-trace-id", traceId);

  const responseWithObservabilityHeaders = (response: NextResponse) => {
    response.headers.set("x-correlation-id", correlationId);
    response.headers.set("x-trace-id", traceId);
    return response;
  };

  const next = () =>
    responseWithObservabilityHeaders(
      NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      }),
    );

  if (pathname.startsWith("/api/auth")) {
    return next();
  }

  const hasSession = await hasActiveSession(request).catch(() => false);

  if (isProtectedPath(pathname) && !hasSession) {
    return responseWithObservabilityHeaders(
      NextResponse.redirect(new URL("/login", request.url)),
    );
  }

  if (isAuthPage(pathname) && hasSession) {
    return responseWithObservabilityHeaders(
      NextResponse.redirect(new URL("/attendee/dashboard", request.url)),
    );
  }

  return next();
}

export const config = {
  matcher: [
    "/onboarding/:path*",
    "/context/:path*",
    "/profile/:path*",
    "/notifications/:path*",
    "/search/:path*",
    "/error/:path*",
    "/unauthorized/:path*",
    "/attendee/:path*",
    "/organizer/:path*",
    "/staff/:path*",
    "/admin/:path*",
    "/login",
    "/register",
    "/api/events/:path*",
    "/api/identity/:path*",
    "/api/organizations/:path*",
  ],
};
