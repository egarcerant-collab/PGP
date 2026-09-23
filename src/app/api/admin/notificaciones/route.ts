/**
 * GET  /api/admin/notificaciones          → lista notificaciones (admin/auditor)
 * PATCH /api/admin/notificaciones         → marcar como leída(s) { ids: string[] }
 */
import { NextResponse } from 'next/server';
import { getDrive, readJson, writeJson, ROOT_FOLDER_ID } from '@/lib/gdrive';
import { getCurrentUser } from '@/lib/get-current-user';

export async function GET(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);
    const isStaff =
      currentUser?.rol === 'superadmin' ||
      currentUser?.rol === 'admin' ||
      currentUser?.rol === 'auditor';
    if (!isStaff) return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });

    const drive = getDrive();
    const notifs: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'notificaciones.json')) ?? [];

    // Si es auditor, filtrar solo sus notificaciones
    const nombre = currentUser?.nombre?.toLowerCase() ?? '';
    const filtered =
      currentUser?.rol === 'auditor'
        ? notifs.filter(n => n.auditor?.toLowerCase().includes(nombre))
        : notifs;

    // Más recientes primero
    filtered.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    const sinLeer = filtered.filter(n => !n.leida).length;
    return NextResponse.json({ notificaciones: filtered, sinLeer });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);
    const isStaff =
      currentUser?.rol === 'superadmin' ||
      currentUser?.rol === 'admin' ||
      currentUser?.rol === 'auditor';
    if (!isStaff) return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });

    const { ids } = (await request.json()) as { ids: string[] };
    const drive = getDrive();
    const notifs: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'notificaciones.json')) ?? [];

    const updated = notifs.map(n =>
      ids.includes(n.id) ? { ...n, leida: true } : n
    );
    await writeJson(drive, ROOT_FOLDER_ID, 'notificaciones.json', updated);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
