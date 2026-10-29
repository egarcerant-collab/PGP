/**
 * GET /api/sie/pendientes
 * Lista los archivos RIPS pendientes de cargar (descargados del SIE, guardados en Drive).
 * Devuelve el contenido JSON de cada archivo para que el cliente los procese.
 *
 * DELETE /api/sie/pendientes
 * Marca todos los pendientes como procesados (los elimina de Drive).
 */
import { NextResponse } from 'next/server';
import { getDrive, readJson, deleteJson, listFiles, getSubfolder, ROOT_FOLDER_ID } from '@/lib/gdrive';

const SIE_RIPS_FOLDER = 'sie_rips';

export async function GET() {
  try {
    const drive = getDrive();
    const folder = await getSubfolder(drive, ROOT_FOLDER_ID, SIE_RIPS_FOLDER);
    const todos = await listFiles(drive, folder);
    const pendientes = todos.filter(f => f.name.startsWith('pending_'));

    const archivos = await Promise.all(
      pendientes.map(async (f) => {
        const contenido = await readJson(drive, folder, f.name);
        return {
          id: f.id,
          filename: f.name.replace(/^pending_/, ''),
          contenido,
        };
      })
    );

    return NextResponse.json({ archivos, total: archivos.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const drive = getDrive();
    const folder = await getSubfolder(drive, ROOT_FOLDER_ID, SIE_RIPS_FOLDER);
    const todos = await listFiles(drive, folder);
    const pendientes = todos.filter(f => f.name.startsWith('pending_'));

    await Promise.all(pendientes.map(f => deleteJson(drive, folder, f.name)));

    return NextResponse.json({ eliminados: pendientes.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
