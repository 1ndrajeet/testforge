import { type NextRequest, NextResponse } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

const PUBLIC = [
  '/',
  '/login',
  '/docs',
  '/api/health',
  '/api/payments/webhook',
  '/_next',
  '/api/subjects',
  '/favicon.ico',
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const { response, user, supabase } = await updateSession(request);

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  const onboarded = request.cookies.get('onboarding_complete')?.value === 'true';

  if (!onboarded && !pathname.startsWith('/onboarding')) {
    const { data: ec } = await supabase
      .from('exam_centers')
      .select('id')
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .maybeSingle();

    if (!ec) {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      return NextResponse.redirect(url);
    }

    response.cookies.set('onboarding_complete', 'true', {
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

export default proxy;
