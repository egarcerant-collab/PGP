import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import fs from 'fs/promises';
import path from 'path';

const FILE_PATH = path.join(process.cwd(), 'public', 'cups-excepciones-duplicados.json');

async function readExcepciones(): Promise<any[]> {
  try {
    const data = await fs.readFile(FILE_PATH, 'utf-8');
    return JSON.parse(data).excepciones || [];
  } catch {
    return [];
  }
}

async function writeExcepciones(excepciones: any[]) {
  await fs.writeFile(FILE_PATH, JSON.stringify({ excepciones }, null, 2), 'utf-8');
}

async function getCurrentUser() {
  try {
    const serverClient = await createSupabaseServerClient();
    const { data: { user } } = await serverClient.auth.getUser();
    if (!user) return null;
    const { data: profile } = await serverClient
      .from('profiles')
      .select('nombre, rol')
      .eq('id', user.id)
      .single();
    return { id: user.id, nombre: profile?.nombre || '', rol: profile?.rol || 'auditor' };
  } catch {
    return null;
  }
}

// GET /api/cups-excepciones — lista todos los CUPS autorizados
export async function GET() {
  const excepciones = await readExcepciones();
  return NextResponse.json({ excepciones });
}

// POST /api/cups-excepciones — autoriza un CUPS (solo admin)
export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';
  if (!isAdmin) {
    return NextResponse.json({ message: 'Solo los administradores pueden autorizar CUPS.' }, { status: 403 });
  }

  const body = await request.json();
  const { cup, descripcion, motivo } = body;
  if (!cup) return NextResponse.json({ message: 'Falta código CUPS.' }, { status: 400 });

  const excepciones = await readExcepciones();
  const cupNorm = String(cup).trim().toUpperCase();

  if (excepciones.some((e: any) => e.cup === cupNorm)) {
    return NextResponse.json({ message: 'Este CUPS ya está autorizado.', excepciones });
  }

  excepciones.push({
    cup: cupNorm,
    descripcion: descripcion || '',
    motivo: motivo || '',
    autorizadoPor: currentUser.nombre,
    fecha: new Date().toISOString().slice(0, 10),
  });

  await writeExcepciones(excepciones);
  return NextResponse.json({ success: true, excepciones });
}

// DELETE /api/cups-excepciones?cup=XXX — revoca autorización (solo admin)
export async function DELETE(request: Request) {
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';
  if (!isAdmin) {
    return NextResponse.json({ message: 'Solo los administradores pueden revocar CUPS.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const cup = searchParams.get('cup');
  if (!cup) return NextResponse.json({ message: 'Falta código CUPS.' }, { status: 400 });

  const cupNorm = cup.trim().toUpperCase();
  const excepciones = await readExcepciones();
  const filtered = excepciones.filter((e: any) => e.cup !== cupNorm);

  await writeExcepciones(filtered);
  return NextResponse.json({ success: true, excepciones: filtered });
}
