import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { jwtVerify } from 'jose';

const intlMiddleware = createMiddleware(routing);

const PROTECTED = ['/', '/wine-map', '/game', '/recap', '/profile', '/quiz', '/admin'];
const AUTH_ONLY = ['/login', '/register'];
const COOKIE_NAME = 'sommelier_session';

async function getSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(en|it)/, '') || '/';
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const path = stripLocale(pathname);

  const isProtected = PROTECTED.some((p) => p === '/' ? path === '/' : path.startsWith(p));
  const isAuthOnly = AUTH_ONLY.some((p) => path.startsWith(p));

  if (isProtected || isAuthOnly) {
    const loggedIn = await getSession(req);

    if (isProtected && !loggedIn) {
      const url = req.nextUrl.clone();
      const locale = pathname.split('/')[1] || 'en';
      url.pathname = `/${locale}/login`;
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }

    if (isAuthOnly && loggedIn) {
      const url = req.nextUrl.clone();
      const locale = pathname.split('/')[1] || 'en';
      url.pathname = `/${locale}`;
      url.searchParams.delete('next');
      return NextResponse.redirect(url);
    }
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
