// src/middleware.ts (or proxy.ts)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getSessionCookie } from 'better-auth/cookies';

import { getOnboardingStatus } from '@/lib/actions/onboarding';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/register', '/api/auth', '/', '/pricing', '/api/health'];
const STATIC_ROUTES = ['/_next', '/favicon.ico', '/api/payments/webhook'];
const ONBOARDING_ROUTES = ['/onboarding'];

// Step mapping for redirect URLs
const STATUS_TO_STEP: Record<string, string> = {
  needs_organization: 'organization',
  needs_exam_setup: 'exam_center',
  needs_subscription: 'subscription',
};

const ONBOARDING_COOKIE = 'onboarding_complete';

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

  // Allow onboarding routes (to prevent redirect loops)
  if (ONBOARDING_ROUTES.some((route) => pathname.startsWith(route))) {
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

  // Check if onboarding is already marked complete in cookies
  const onboardingComplete = request.cookies.get(ONBOARDING_COOKIE)?.value === 'true';

  // If onboarding is marked complete, proceed
  if (onboardingComplete) {
    return NextResponse.next();
  }

  // Only check onboarding status once (when cookie is missing)
  try {
    const onboardingStatus = await getOnboardingStatus();

    // If onboarding is complete, set cookie and proceed
    if (onboardingStatus.status === 'complete') {
      const response = NextResponse.next();
      response.cookies.set(ONBOARDING_COOKIE, 'true', {
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      return response;
    }

    // If there's an error, redirect to onboarding with error step
    if (onboardingStatus.status === 'error') {
      console.error('Onboarding status error:', onboardingStatus.error);
      const url = new URL('/onboarding', request.url);
      url.searchParams.set('step', 'organization');
      url.searchParams.set('error', 'true');
      return NextResponse.redirect(url);
    }

    // For all other statuses, redirect to the appropriate step
    const step = STATUS_TO_STEP[onboardingStatus.status] || 'organization';
    const url = new URL('/onboarding', request.url);
    url.searchParams.set('step', step);
    return NextResponse.redirect(url);
  } catch (error) {
    // If onboarding check fails, redirect to onboarding as fallback
    console.error('Onboarding check failed:', error);
    const url = new URL('/onboarding', request.url);
    url.searchParams.set('step', 'organization');
    url.searchParams.set('error', 'true');
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};