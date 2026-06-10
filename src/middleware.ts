import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'pgp_session';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isLoginPage   = pathname.startsWith('/login');
  const isExcelExport = pathname.startsWith('/excel-export');
  const isPublic      = isLoginPage || isExcelExport;

  const isLocalBypass = process.env.NEXT_PUBLIC_LOCAL_BYPASS === 'true';

  // En modo local bypass: acceso libre
  if (isLocalBypass) {
    if (isLoginPage) {
      const hasCookie = !!request.cookies.get(COOKIE_NAME)?.value;
      if (hasCookie) {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
      }
    }
    return NextResponse.next({ request });
  }

  // Producción: verificar que la cookie existe
  // La validez real del JWT se verifica en cada API route
  const hasCookie = !!request.cookies.get(COOKIE_NAME)?.value;

  if (!hasCookie && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (hasCookie && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
