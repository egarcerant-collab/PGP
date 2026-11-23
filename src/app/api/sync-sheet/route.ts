import { NextResponse } from 'next/server';
import { getDrive, readJson, syncInformesToSheet, ROOT_FOLDER_ID } from '@/lib/gdrive';
import { getCurrentUser } from '@/lib/get-current-user';

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);
    const isAdmin = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';
    if (!isAdmin) return NextResponse.json({ message: 'No autorizado' }, { status: 403 });

    const drive = getDrive();
    const informes = (await readJson<any[]>(drive, ROOT_FOLDER_ID, 'informes.json')) ?? [];
    await syncInformesToSheet(informes);
    return NextResponse.json({ success: true, total: informes.length });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
