import { NextResponse } from 'next/server';
import { getDrive, readJson, ROOT_FOLDER_ID } from '@/lib/gdrive';
import { getCurrentUser } from '@/lib/get-current-user';

export async function GET(request: Request) {
  const currentUser = await getCurrentUser(request);
  const isAdmin = !currentUser || currentUser.rol === 'superadmin' || currentUser.rol === 'admin';

  try {
    const drive = getDrive();
    const index: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'auditorias_index.json')) ?? [];

    // Si no se pudo identificar al usuario O es admin, mostrar todas
    let filtered = index;
    if (!isAdmin && currentUser?.id) {
      filtered = index.filter(r =>
        r.auditor_id === currentUser.id ||
        r.auditor_nombre?.toLowerCase() === currentUser.nombre?.toLowerCase()
      );
    }

    const results = filtered
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(r => ({
        id:            r.id,
        numero:        r.numero || '',
        prestador:     r.prestador,
        nit:           r.nit || '',
        month:         r.mes,
        fecha:         r.created_at ? r.created_at.slice(0, 10) : '',
        source:        'drive',
        auditorNombre: r.auditor_nombre || '',
      }));

    return NextResponse.json(results);
  } catch (e) {
    console.warn('Drive list-audits error:', e);
    return NextResponse.json([]);
  }
}
