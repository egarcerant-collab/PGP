import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';

const COOKIE_NAME = 'pgp_session';
const JWT_SECRET = process.env.JWT_SECRET || 'pgp-dusakawi-secret-2026';

// ── JWT verify (sin importar auth-drive para mantener el middleware ligero) ──
function verifyJWT(token: string): { rol?: string } | null {
  try {
    const [header, body, sig] = token.split('.');
    if (!header || !body || !sig) return null;
    const expected = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isLoginPage   = pathname.startsWith('/login');
  const isExcelExport = pathname.startsWith('/excel-export');
  const isPublic      = isLoginPage || isExcelExport;

  // ── MODO LOCAL BYPASS (Supabase bloqueado) ───────────────────────────────
  // Con bypass, cualquiera puede acceder PERO se puede usar auth Drive opcional.
  const isLocalBypass = process.env.NEXT_PUBLIC_LOCAL_BYPASS === 'true';

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? verifyJWT(token) : null;

  if (isLocalBypass) {
    // Si ya hay sesión Drive y llega a /login → redirigir a /
    if (session && isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    // Sin sesión y sin bypass: /login está permitido para que el usuario se autentique
    // Con bypass activo: si no hay sesión, igual dejamos pasar (modo sin auth)
    return NextResponse.next({ request });
  }

  // ── MODO PRODUCCIÓN: auth Drive requerido ───────────────────────────────
  if (!session && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (session && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // Proteger /admin — solo superadmin
  if (session && pathname.startsWith('/admin')) {
    if (session.rol !== 'superadmin') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
