/**
 * GET /api/prestador/notificaciones
 * Retorna las notificaciones SIE dirigidas al prestador autenticado (por NIT).
 */
import { NextResponse } from 'next/server';
import { getDrive, readJson, writeJson, ROOT_FOLDER_ID } from '@/lib/gdrive';
import { getCurrentUser } from '@/lib/get-current-user';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user || user.rol !== 'prestador') {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }

    const nit: string | undefined = (user as any).nit;
    if (!nit) return NextResponse.json({ notificaciones: [], sinLeer: 0 });

    const drive = getDrive();
    const todas: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'notificaciones.json')) ?? [];

    // Solo notificaciones de RIPS que correspondan al NIT del prestador
    const propias = todas
      .filter(n => n.tipo === 'sie_radicacion' && n.nitPrestador === nit)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    const userId = user.id ?? user.nombre ?? '';
    const normalizada = propias.map(n => ({
      ...n,
      leida: Array.isArray(n.leidaPor) ? n.leidaPor.includes(userId) : !!n.leida,
    }));
    const sinLeer = normalizada.filter(n => !n.leida).length;

    return NextResponse.json({ notificaciones: normalizada, sinLeer });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user || user.rol !== 'prestador') {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }

    const { ids } = (await request.json()) as { ids: string[] };
    const drive = getDrive();
    const todas: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'notificaciones.json')) ?? [];
    const userId = user.id ?? user.nombre ?? '';

    const updated = todas.map(n => {
      if (!ids.includes(n.id)) return n;
      if (Array.isArray(n.leidaPor)) {
        return { ...n, leidaPor: n.leidaPor.includes(userId) ? n.leidaPor : [...n.leidaPor, userId] };
      }
      return { ...n, leida: true };
    });
    await writeJson(drive, ROOT_FOLDER_ID, 'notificaciones.json', updated);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
