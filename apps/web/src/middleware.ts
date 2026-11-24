import { NextRequest, NextResponse } from 'next/server';

const PROTECTED = ['/dashboard', '/composer', '/planner', '/posts', '/inbox', '/analytics', '/growth', '/guide', '/connect', '/settings', '/beta', '/admin'];
const AUTH_PAGES = ['/login', '/signup'];

/**
 * Cheap edge check for a session cookie. The API remains the source of truth: an invalid cookie
 * results in a 401 → refresh → redirect to /login on the client.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.has('sh_rt') || req.cookies.has('sh_at');

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (AUTH_PAGES.includes(pathname) && req.cookies.has('sh_rt') && !req.nextUrl.searchParams.has('invite')) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
