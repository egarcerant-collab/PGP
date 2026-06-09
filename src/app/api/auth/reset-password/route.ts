import { NextResponse } from 'next/server';
import { loadUsuarios, saveUsuarios, hashPassword } from '@/lib/auth-drive';

export async function POST(request: Request) {
  try {
    const { email, newPassword } = await request.json();

    if (!email || !newPassword) {
      return NextResponse.json({ message: 'Faltan datos.' }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ message: 'La contraseña debe tener al menos 6 caracteres.' }, { status: 400 });
    }

    const usuarios = await loadUsuarios();
    const idx = usuarios.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (idx === -1) {
      return NextResponse.json({ message: 'No existe ninguna cuenta con ese correo.' }, { status: 404 });
    }

    usuarios[idx].passwordHash = hashPassword(newPassword);
    await saveUsuarios(usuarios);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
