/**
 * POST /api/admin/fix-tipos
 * Migración única: recorre todos los informes en Drive y corrige tipo_periodo
 * basándose en el número de meses del campo periodo.
 * Solo accesible por superadmin/admin.
 */
import { NextResponse } from 'next/server';
import { getDrive, readJson, writeJson, ROOT_FOLDER_ID } from '@/lib/gdrive';
import { getCurrentUser } from '@/lib/get-current-user';

function inferTipoPeriodo(periodo: string): string {
  const dashes = (periodo.match(/-/g) || []).length;
  if (dashes >= 2) return 'TRIMESTRAL';
  if (dashes === 1) return 'BIMENSUAL';
  return 'MENSUAL';
}

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);
    const isAdmin = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';
    if (!isAdmin) {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }

    const drive = getDrive();
    const informes: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'informes.json')) ?? [];

    let fixed = 0;
    const changes: { numero: string; periodo: string; old: string; new: string }[] = [];

    const updated = informes.map(inf => {
      const correct = inferTipoPeriodo(inf.periodo || '');
      if ((inf.tipo_periodo || '').toUpperCase() !== correct) {
        changes.push({ numero: inf.numero, periodo: inf.periodo, old: inf.tipo_periodo, new: correct });
        fixed++;
        return { ...inf, tipo_periodo: correct };
      }
      return inf;
    });

    if (fixed > 0) {
      await writeJson(drive, ROOT_FOLDER_ID, 'informes.json', updated);
    }

    return NextResponse.json({ success: true, fixed, changes });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
