// proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getSessionCookie } from 'better-auth/cookies';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/register', '/api/auth', '/', '/pricing', '/api/health'];
const STATIC_ROUTES = ['/_next', '/favicon.ico', '/api/payments/webhook'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static assets
  if (STATIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check for session cookie using Better Auth's helper
  const sessionCookie = getSessionCookie(request);

  // No session = redirect to login
  if (!sessionCookie) {
    const url = new URL('/login', request.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  // For all other routes with valid session, let the client-side determine where to go
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
