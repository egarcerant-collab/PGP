import { NextRequest, NextResponse } from 'next/server';

const EXCEL_EXPORT_PASSWORD = process.env.EXCEL_EXPORT_PASSWORD || '123456';
const EXCEL_EXPORT_COOKIE = 'excel_export_auth';

export async function GET(request: NextRequest) {
  const isAuthenticated = request.cookies.get(EXCEL_EXPORT_COOKIE)?.value === '1';

  if (!isAuthenticated) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const password = String(body?.password || '');

    if (password !== EXCEL_EXPORT_PASSWORD) {
      return NextResponse.json({ message: 'Contraseña incorrecta.' }, { status: 401 });
    }

    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(EXCEL_EXPORT_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 4, // 4 horas
    });

    return response;
  } catch {
    return NextResponse.json({ message: 'Solicitud inválida.' }, { status: 400 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(EXCEL_EXPORT_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
