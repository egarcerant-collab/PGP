/**
 * GET  /api/admin/restore-informes        → lista versiones de informes.json en Drive
 * POST /api/admin/restore-informes        → restaura una versión específica (body: { versionId })
 * Solo accesible por superadmin.
 */
import { NextResponse } from 'next/server';
import { getDrive, ROOT_FOLDER_ID } from '@/lib/gdrive';
import { getCurrentUser } from '@/lib/get-current-user';

async function findInformesFileId(drive: any): Promise<string | null> {
  const res = await drive.files.list({
    q: `'${ROOT_FOLDER_ID}' in parents and name='informes.json' and trashed=false`,
    fields: 'files(id,name)',
  });
  return res.data.files?.[0]?.id ?? null;
}

// GET — lista las últimas 20 versiones de informes.json
export async function GET(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);
    if (currentUser?.rol !== 'superadmin' && currentUser?.rol !== 'admin') {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }

    const drive = getDrive();
    const fileId = await findInformesFileId(drive);
    if (!fileId) return NextResponse.json({ message: 'informes.json no encontrado.' }, { status: 404 });

    const res = await drive.revisions.list({
      fileId,
      fields: 'revisions(id,modifiedTime,lastModifyingUser)',
      pageSize: 20,
    });

    const versions = (res.data.revisions ?? []).reverse().map((v: any) => ({
      id: v.id,
      fecha: v.modifiedTime,
      usuario: v.lastModifyingUser?.displayName ?? '—',
    }));

    return NextResponse.json({ fileId, versions });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

// POST — restaura una versión anterior (preview o commit)
export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);
    if (currentUser?.rol !== 'superadmin' && currentUser?.rol !== 'admin') {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }

    const { versionId, preview } = await request.json();
    if (!versionId) return NextResponse.json({ message: 'Falta versionId.' }, { status: 400 });

    const drive = getDrive();
    const fileId = await findInformesFileId(drive);
    if (!fileId) return NextResponse.json({ message: 'informes.json no encontrado.' }, { status: 404 });

    // Descargar el contenido de esa versión
    const revRes = await drive.revisions.get({
      fileId,
      revisionId: versionId,
      alt: 'media',
    } as any);

    let content: any;
    if (typeof revRes.data === 'string') {
      content = JSON.parse(revRes.data);
    } else {
      content = revRes.data;
    }

    const count = Array.isArray(content) ? content.length : '?';

    if (preview) {
      // Solo mostrar preview sin restaurar
      return NextResponse.json({ preview: true, count, sample: Array.isArray(content) ? content.slice(0, 3) : content });
    }

    // Restaurar: subir ese contenido como nueva revisión
    const { Readable } = await import('stream');
    const body = JSON.stringify(content, null, 2);
    await drive.files.update({
      fileId,
      media: {
        mimeType: 'application/json',
        body: Readable.from([body]),
      },
    });

    return NextResponse.json({ success: true, restored: count, versionId });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
