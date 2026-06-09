import { NextResponse } from 'next/server';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth-drive';

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const token = cookieHeader
      .split(';')
      .find(c => c.trim().startsWith(`${COOKIE_NAME}=`))
      ?.split('=')[1];

    if (!token) return NextResponse.json({ user: null, profile: null });

    const user = verifyJWT(token);
    if (!user) return NextResponse.json({ user: null, profile: null });

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      profile: { nombre: user.nombre, rol: user.rol },
    });
  } catch {
    return NextResponse.json({ user: null, profile: null });
  }
}
