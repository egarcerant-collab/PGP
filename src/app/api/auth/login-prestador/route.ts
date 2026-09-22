import { NextResponse } from 'next/server';
import { signJWT, COOKIE_NAME } from '@/lib/auth-drive';

export const PRESTADORES_CATALOG = [
  { nit: '901226064', nombre: 'IPS VITAL SALUD GUAJIRA S.A.S' },
  { nit: '901182049', nombre: 'GRUPO IMB IPS SAS-RIOHACHA' },
  { nit: '901182049', nombre: 'GRUPO IMB IPS SAS-URIBIA' },
  { nit: '800194798', nombre: 'ORGANIZACION CLINICA BONNADONA PREVENIR SAS' },
  { nit: '900986941', nombre: 'UNIPSSAM SAS' },
  { nit: '900030445', nombre: 'UROMIL' },
  { nit: '900745500', nombre: 'FESALUD DEL CESAR' },
  { nit: '825002902', nombre: 'PROBIENESTAR' },
  { nit: '900563455', nombre: 'INSTITUTO OFTANMOLOGICO DEL CESAR DR HECTOR MARQUEZ' },
];

// POST /api/auth/login-prestador  body: { nit, password }
// La contraseña de cada prestador ES su NIT.
export async function POST(request: Request) {
  try {
    const { nit, password } = await request.json();
    if (!nit || !password) {
      return NextResponse.json({ message: 'Selecciona un prestador e ingresa la contraseña.' }, { status: 400 });
    }

    const match = PRESTADORES_CATALOG.find(p => p.nit === nit.trim());
    if (!match) {
      return NextResponse.json({ message: 'Prestador no reconocido.' }, { status: 401 });
    }

    if (password.trim() !== nit.trim()) {
      return NextResponse.json({ message: 'NIT o contraseña incorrectos.' }, { status: 401 });
    }

    const token = signJWT({
      id: match.nit,
      email: `${match.nit}@prestador.pgp`,
      nombre: match.nombre,
      rol: 'prestador',
    });

    const response = NextResponse.json({
      success: true,
      user: { id: match.nit, nombre: match.nombre, rol: 'prestador' },
    });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    });

    return response;
  } catch (e: any) {
    return NextResponse.json({ message: e.message || 'Error interno.' }, { status: 500 });
  }
}

// GET — devuelve el catálogo de prestadores (sin contraseñas)
export async function GET() {
  return NextResponse.json(
    PRESTADORES_CATALOG.map(p => ({ nit: p.nit, nombre: p.nombre }))
  );
}
