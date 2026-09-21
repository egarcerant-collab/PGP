import { NextResponse } from 'next/server';
import { getDrive, getSubfolder, uploadFile, readJson, writeJson, ROOT_FOLDER_ID } from '@/lib/gdrive';
import { getCurrentUser } from '@/lib/get-current-user';

// POST /api/upload-acta  —  body: multipart/form-data { file: PDF, numero: string, prestador: string }
export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });

    const form = await request.formData();
    const file      = form.get('file') as File | null;
    const numero    = (form.get('numero') as string | null)?.trim();
    const prestador = (form.get('prestador') as string | null)?.trim() || 'IPS';
    const tipo      = (form.get('tipo') as string | null)?.trim() || 'inesperadas'; // 'inesperadas' | 'firmada'

    if (!file || !numero) {
      return NextResponse.json({ message: 'Faltan campos: file y numero.' }, { status: 400 });
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ message: 'Solo se permiten archivos PDF.' }, { status: 400 });
    }

    const buffer   = Buffer.from(await file.arrayBuffer());
    const drive    = getDrive();
    const actaFolder = await getSubfolder(drive, ROOT_FOLDER_ID, 'actas');
    const isFirmada = tipo === 'firmada';
    const prefix  = isFirmada ? 'Acta_Firmada' : 'Acta_Inesp';
    const fileName = `${prefix}_${numero}_${prestador.replace(/\s+/g, '_').substring(0, 40)}.pdf`;

    const { id: fileId, webViewLink } = await uploadFile(drive, actaFolder, fileName, 'application/pdf', buffer);

    // Actualizar el registro en informes.json con la referencia al acta correspondiente
    const informes: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'informes.json')) ?? [];
    const idx = informes.findIndex(r => String(r.numero) === String(numero));
    if (idx !== -1) {
      if (isFirmada) {
        informes[idx] = { ...informes[idx], acta_firmada_drive_id: fileId, acta_firmada_url: webViewLink };
      } else {
        informes[idx] = { ...informes[idx], acta_drive_id: fileId, acta_url: webViewLink };
      }
      await writeJson(drive, ROOT_FOLDER_ID, 'informes.json', informes);
    }

    return NextResponse.json({ success: true, fileId, webViewLink, tipo });
  } catch (e: any) {
    return NextResponse.json({ message: e.message || 'Error al subir acta.' }, { status: 500 });
  }
}

// DELETE /api/upload-acta?numero=X  —  elimina la referencia (no borra el archivo de Drive)
export async function DELETE(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const numero = searchParams.get('numero')?.trim();
    if (!numero) return NextResponse.json({ message: 'Falta numero.' }, { status: 400 });

    const drive = getDrive();
    const informes: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'informes.json')) ?? [];
    const idx = informes.findIndex(r => String(r.numero) === String(numero));
    if (idx !== -1) {
      delete informes[idx].acta_drive_id;
      delete informes[idx].acta_url;
      await writeJson(drive, ROOT_FOLDER_ID, 'informes.json', informes);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
