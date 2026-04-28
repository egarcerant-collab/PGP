import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { password } = await request.json();
  const correct = process.env.USER_MANAGEMENT_PASSWORD;
  if (!correct) return NextResponse.json({ error: 'No configurado' }, { status: 500 });
  if (password !== correct) return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 });
  return NextResponse.json({ ok: true });
}
