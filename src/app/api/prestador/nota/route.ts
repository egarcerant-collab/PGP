/**
 * POST /api/prestador/nota
 * El prestador deja una nota de conformidad en uno de sus informes.
 * Genera una notificación para el auditor responsable.
 */
import { NextResponse } from 'next/server';
import { getDrive, readJson, writeJson, ROOT_FOLDER_ID } from '@/lib/gdrive';
import { getCurrentUser } from '@/lib/get-current-user';

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);
    if (currentUser?.rol !== 'prestador') {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }

    const body = await request.json();
    const { numero, nota, estado } = body as {
      numero: string;
      nota: string;
      estado: 'conforme' | 'no_conforme';
    };

    if (!numero || !estado) {
      return NextResponse.json({ message: 'Faltan campos requeridos.' }, { status: 400 });
    }

    const drive = getDrive();
    const informes: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'informes.json')) ?? [];

    // Verificar que el informe pertenece al prestador autenticado
    const idx = informes.findIndex(
      r =>
        r.numero === numero &&
        r.nit?.replace(/\D/g, '') === currentUser.id.replace(/\D/g, '')
    );
    if (idx === -1) {
      return NextResponse.json({ message: 'Informe no encontrado.' }, { status: 404 });
    }

    const informe = informes[idx];
    const ahora = new Date().toISOString();

    informes[idx] = {
      ...informe,
      nota_prestador: nota || '',
      estado_prestador: estado,
      nota_prestador_fecha: ahora,
    };
    await writeJson(drive, ROOT_FOLDER_ID, 'informes.json', informes);

    // Guardar notificación para el auditor
    const notifs: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'notificaciones.json')) ?? [];
    notifs.push({
      id: crypto.randomUUID(),
      tipo: 'nota_prestador',
      numero,
      prestador: informe.prestador,
      periodo: informe.periodo,
      auditor: informe.responsable || '',
      estado,
      nota: nota || '',
      fecha: ahora,
      leida: false,
    });
    await writeJson(drive, ROOT_FOLDER_ID, 'notificaciones.json', notifs);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
