import { NextResponse } from 'next/server';
import { getDrive, readJson, ROOT_FOLDER_ID } from '@/lib/gdrive';
import { getCurrentUser } from '@/lib/get-current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin/inspect-informe?numero=029
// Retorna el objeto completo del informe incluyendo pdf_data — solo admin.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (user?.rol !== 'superadmin' && user?.rol !== 'admin') {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const numero = searchParams.get('numero');
  if (!numero) return NextResponse.json({ error: 'Falta ?numero=XXX' }, { status: 400 });

  const drive = getDrive();
  const informes: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'informes.json')) ?? [];
  const informe = informes.find(r => r.numero === numero || r.numero === numero.padStart(3, '0'));

  if (!informe) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  return NextResponse.json({ informe });
}
