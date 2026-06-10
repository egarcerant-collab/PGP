import { NextResponse } from 'next/server';
import { getDrive, readJson, writeJson, deleteJson, getSubfolder, listFiles, ROOT_FOLDER_ID } from '@/lib/gdrive';
import { getCurrentUser } from '@/lib/get-current-user';

const PASSWORD = '123456';

async function loadIndex(drive: any): Promise<any[]> {
  return (await readJson(drive, ROOT_FOLDER_ID, 'auditorias_index.json')) ?? [];
}

// GET /api/save-audit?prestador=X&month=Y
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const prestador = searchParams.get('prestador') || '';
    const month     = searchParams.get('month')     || '';
    if (!prestador || !month) return NextResponse.json({ exists: false });

    const drive       = getDrive();
    const currentUser = await getCurrentUser(request);
    const index       = await loadIndex(drive);

    const entry = index.find(r =>
      r.prestador?.toLowerCase() === prestador.toLowerCase() &&
      r.mes?.toLowerCase() === month.toLowerCase()
    );
    if (!entry) return NextResponse.json({ exists: false });

    const isAdmin      = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';
    const isOwner      = currentUser?.id === entry.auditor_id;
    const canOverwrite = isAdmin || isOwner;

    return NextResponse.json({
      exists: true,
      numero: entry.numero,
      ownerNombre: entry.auditor_nombre,
      canOverwrite,
    });
  } catch {
    return NextResponse.json({ exists: false });
  }
}

// POST /api/save-audit
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { auditData, prestadorName, month } = body;
    if (!auditData || !prestadorName || !month) {
      return NextResponse.json({ message: 'Faltan datos requeridos.' }, { status: 400 });
    }

    const nit             = auditData.selectedPrestador?.NIT || '';
    const drive           = getDrive();
    const currentUser     = await getCurrentUser(request);
    const auditoriaFolder = await getSubfolder(drive, ROOT_FOLDER_ID, 'auditorias');

    const auditDataWithOwner = {
      ...auditData,
      auditor_id:     currentUser?.id     || null,
      auditor_nombre: currentUser?.nombre || '',
    };

    const index  = await loadIndex(drive);
    const dupIdx = index.findIndex(r =>
      r.prestador?.toLowerCase() === prestadorName.toLowerCase() &&
      r.mes?.toLowerCase() === month.toLowerCase()
    );

    if (dupIdx !== -1) {
      const existing = index[dupIdx];
      const isAdmin  = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';
      if (!isAdmin && existing.auditor_id && currentUser?.id && existing.auditor_id !== currentUser.id) {
        return NextResponse.json({ message: 'No tienes permiso para modificar esta auditoría.' }, { status: 403 });
      }

      const preserved = {
        ...auditDataWithOwner,
        auditor_id:     existing.auditor_id     || currentUser?.id     || null,
        auditor_nombre: existing.auditor_nombre || currentUser?.nombre || '',
      };

      // Actualizar índice con datos frescos del usuario que sobreescribe
      index[dupIdx] = {
        ...existing,
        nit,
        auditor_id:     preserved.auditor_id     || existing.auditor_id,
        auditor_nombre: preserved.auditor_nombre || existing.auditor_nombre,
      };

      // Leer el archivo completo para no perder datos
      const fullData = await readJson(drive, auditoriaFolder, `${existing.id}.json`) || existing;
      await Promise.all([
        writeJson(drive, ROOT_FOLDER_ID, 'auditorias_index.json', index),
        writeJson(drive, auditoriaFolder, `${existing.id}.json`, {
          ...fullData,
          datos: preserved,
          nit,
        }),
      ]);

      return NextResponse.json({
        message: `Auditoría N° ${existing.numero} actualizada.`,
        numero:  existing.numero,
        id:      existing.id,
        updated: true,
      });
    }

    // Nuevo registro
    const lastNum = index.reduce((max: number, r: any) => Math.max(max, parseInt(r.numero, 10) || 0), 0);
    const numero  = String(lastNum + 1).padStart(3, '0');
    const id      = crypto.randomUUID();
    const created_at = new Date().toISOString();

    const newEntry = {
      id, numero,
      prestador:      prestadorName,
      nit,
      mes:            month,
      auditor_id:     currentUser?.id     || null,
      auditor_nombre: currentUser?.nombre || '',
      created_at,
    };

    index.push(newEntry);
    await Promise.all([
      writeJson(drive, ROOT_FOLDER_ID, 'auditorias_index.json', index),
      writeJson(drive, auditoriaFolder, `${id}.json`, { ...newEntry, datos: auditDataWithOwner }),
    ]);

    return NextResponse.json({
      message: `Auditoría N° ${numero} guardada exitosamente.`,
      numero, id, updated: false,
    });
  } catch (error: any) {
    return NextResponse.json({ message: 'Error interno.', error: error.message }, { status: 500 });
  }
}

// DELETE /api/save-audit?id=X&password=Y
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id       = searchParams.get('id');
    const password = searchParams.get('password');

    if (password !== PASSWORD) return NextResponse.json({ message: 'Contraseña incorrecta.' }, { status: 401 });
    if (!id) return NextResponse.json({ message: 'Falta ID.' }, { status: 400 });

    const drive           = getDrive();
    const auditoriaFolder = await getSubfolder(drive, ROOT_FOLDER_ID, 'auditorias');

    if (id === 'ALL') {
      const currentUser = await getCurrentUser(request);
      if (currentUser?.rol !== 'superadmin' && currentUser?.rol !== 'admin') {
        return NextResponse.json({ message: 'Solo los administradores pueden eliminar todas las auditorías.' }, { status: 403 });
      }
      const files = await listFiles(drive, auditoriaFolder);
      await Promise.all(files.map(f => (drive.files.delete as any)({ fileId: f.id })));
      await writeJson(drive, ROOT_FOLDER_ID, 'auditorias_index.json', []);
    } else {
      const currentUser = await getCurrentUser(request);
      const isAdmin     = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';
      const index       = await loadIndex(drive);
      const entry       = index.find((r: any) => r.id === id);

      if (!isAdmin && entry?.auditor_id && currentUser?.id && entry.auditor_id !== currentUser.id) {
        return NextResponse.json({ message: 'No tienes permiso para eliminar esta auditoría.' }, { status: 403 });
      }

      await deleteJson(drive, auditoriaFolder, `${id}.json`);
      await writeJson(drive, ROOT_FOLDER_ID, 'auditorias_index.json', index.filter((r: any) => r.id !== id));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
