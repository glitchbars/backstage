import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/not-authorized', '/api/auth'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Fetch session via HTTP to avoid importing Prisma/Node.js APIs in Edge runtime
  const res = await fetch(new URL('/api/auth/get-session', request.nextUrl.origin), {
    headers: { cookie: request.headers.get('cookie') ?? '' },
  });

  if (!res.ok) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const session = await res.json();

  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (session.user.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/not-authorized', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
