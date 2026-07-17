import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const publicRoutes = ['/auth', '/', '/403', '/landing', '/register'];
const JWT_ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET || 'sonic-coffee-access-secret-change-in-production',
);

interface JwtPayload {
  sub: string;
  role: string;
  phone: string;
}

const ROLE_ROUTE_MAP: Record<string, string[]> = {
  OWNER: ['/owner', '/barista', '/driver'],
  BARISTA: ['/barista'],
  DRIVER: ['/driver'],
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicRoutes.some((route) => pathname === route || pathname.startsWith('/_next'))) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get('access_token')?.value
    || request.headers.get('authorization')?.replace('Bearer ', '');

  if (!accessToken) {
    return NextResponse.redirect(new URL('/auth', request.url));
  }

  let payload: JwtPayload;
  try {
    const { payload: verified } = await jwtVerify(accessToken, JWT_ACCESS_SECRET);
    payload = verified as unknown as JwtPayload;
  } catch {
    return NextResponse.redirect(new URL('/auth', request.url));
  }

  const role = payload.role?.toUpperCase();
  const allowedRoutes = ROLE_ROUTE_MAP[role];

  if (!allowedRoutes) {
    return NextResponse.redirect(new URL('/auth', request.url));
  }

  const matchedRoute = allowedRoutes.find((route) => pathname.startsWith(route));
  if (!matchedRoute) {
    return NextResponse.redirect(new URL('/403', request.url));
  }

  const response = NextResponse.next();
  response.headers.set('x-user-id', payload.sub);
  response.headers.set('x-user-role', role);
  return response;
}

export const config = {
  matcher: ['/owner/:path*', '/barista/:path*', '/driver/:path*'],
};
