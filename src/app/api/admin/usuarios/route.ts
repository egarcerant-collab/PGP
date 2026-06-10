import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/get-current-user';
import {
  loadUsuarios,
  saveUsuarios,
  createUser,
  hashPassword,
  DriveUser,
} from '@/lib/auth-drive';

async function checkSuperAdmin(request: Request): Promise<boolean> {
  const user = await getCurrentUser(request);
  return user?.rol === 'superadmin';
}

// GET /api/admin/usuarios — lista todos los usuarios
export async function GET(request: Request) {
  if (!await checkSuperAdmin(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  try {
    const usuarios = await loadUsuarios();
    const safe = usuarios.map(({ passwordHash: _, ...u }) => u);
    return NextResponse.json({ usuarios: safe });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/admin/usuarios — crea un usuario nuevo
export async function POST(request: Request) {
  if (!await checkSuperAdmin(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { email, password, nombre, rol } = await request.json();
  if (!email || !password || !nombre || !rol) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  }

  try {
    await createUser(email, password, nombre, rol);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// PUT /api/admin/usuarios — actualiza nombre, rol, activo (y password si se envía)
export async function PUT(request: Request) {
  if (!await checkSuperAdmin(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id, nombre, rol, activo, password } = await request.json();
  if (!id) return NextResponse.json({ error: 'Falta ID' }, { status: 400 });

  try {
    const usuarios = await loadUsuarios();
    const idx = usuarios.findIndex(u => u.id === id);
    if (idx === -1) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

    if (nombre  !== undefined) usuarios[idx].nombre  = nombre;
    if (rol     !== undefined) usuarios[idx].rol     = rol as DriveUser['rol'];
    if (activo  !== undefined) usuarios[idx].activo  = activo;
    if (password)              usuarios[idx].passwordHash = hashPassword(password);

    await saveUsuarios(usuarios);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/admin/usuarios?id=X — elimina usuario
export async function DELETE(request: Request) {
  const currentUser = await getCurrentUser(request);
  if (currentUser?.rol !== 'superadmin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta ID' }, { status: 400 });

  if (id === currentUser.id) {
    return NextResponse.json({ error: 'No puedes eliminarte a ti mismo' }, { status: 400 });
  }

  try {
    const usuarios = await loadUsuarios();
    const filtered = usuarios.filter(u => u.id !== id);
    if (filtered.length === usuarios.length) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }
    await saveUsuarios(filtered);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
