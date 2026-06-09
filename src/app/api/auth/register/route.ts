import { NextResponse } from 'next/server';
import { createUser, verifyJWT, COOKIE_NAME } from '@/lib/auth-drive';
import type { DriveUser } from '@/lib/auth-drive';

export async function POST(request: Request) {
  try {
    const { email, password, nombre, rol } = await request.json();

    if (!email || !password || !nombre) {
      return NextResponse.json({ message: 'Faltan campos requeridos.' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ message: 'La contraseña debe tener al menos 6 caracteres.' }, { status: 400 });
    }

    // Solo superadmin puede asignar roles distintos a 'auditor'
    const cookieHeader = request.headers.get('cookie') || '';
    const token = cookieHeader.split(';').find(c => c.trim().startsWith(`${COOKIE_NAME}=`))?.split('=')[1];
    const caller = token ? verifyJWT(token) : null;

    const assignedRol: DriveUser['rol'] =
      (caller?.rol === 'superadmin' && ['superadmin', 'admin', 'auditor'].includes(rol))
        ? (rol as DriveUser['rol'])
        : 'auditor';

    const newUser = await createUser(email, password, nombre, assignedRol);

    return NextResponse.json({
      success: true,
      user: { id: newUser.id, email: newUser.email, nombre: newUser.nombre, rol: newUser.rol },
    });
  } catch (e: any) {
    return NextResponse.json({ message: e.message || 'Error interno.' }, { status: 500 });
  }
}
