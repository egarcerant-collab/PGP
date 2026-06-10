/**
 * Helper compartido para obtener el usuario actual.
 * Prioridad: LOCAL_BYPASS → JWT cookie Drive → Supabase (fallback)
 */
import { verifyJWT, COOKIE_NAME } from './auth-drive';

export interface CurrentUser {
  id: string;
  nombre: string;
  rol: string;
}

export async function getCurrentUser(request?: Request): Promise<CurrentUser | null> {
  // 1. Modo local sin auth
  if (process.env.NEXT_PUBLIC_LOCAL_BYPASS === 'true') {
    return { id: 'local', nombre: 'Eduardo Garcerant', rol: 'superadmin' };
  }

  // 2. JWT cookie de auth Drive
  try {
    const cookieHeader = request?.headers.get('cookie') ?? '';
    const token = cookieHeader
      .split(';')
      .find(c => c.trim().startsWith(`${COOKIE_NAME}=`))
      ?.split('=').slice(1).join('=')
      .trim();

    if (token) {
      const session = verifyJWT(token);
      if (session) {
        return { id: session.id, nombre: session.nombre, rol: session.rol };
      }
    }
  } catch {}

  return null;
}
