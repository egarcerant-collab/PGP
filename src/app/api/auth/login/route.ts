import { NextResponse } from 'next/server';
import {
  findUserByEmail,
  verifyPassword,
  signJWT,
  ensureDefaultAdmin,
  COOKIE_NAME,
} from '@/lib/auth-drive';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ message: 'Correo y contraseña requeridos.' }, { status: 400 });
    }

    // Crear admin por defecto si no hay usuarios
    await ensureDefaultAdmin();

    const user = await findUserByEmail(email);
    if (!user || !user.activo) {
      return NextResponse.json({ message: 'Correo o contraseña incorrectos.' }, { status: 401 });
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ message: 'Correo o contraseña incorrectos.' }, { status: 401 });
    }

    const token = signJWT({ id: user.id, email: user.email, nombre: user.nombre, rol: user.rol });

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol },
    });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 horas
      path: '/',
    });

    return response;
  } catch (e: any) {
    return NextResponse.json({ message: e.message || 'Error interno.' }, { status: 500 });
  }
}
