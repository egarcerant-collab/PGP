import { NextResponse } from 'next/server';
import { getDrive, readJson, writeJson, deleteJson, getSubfolder, listFiles, ROOT_FOLDER_ID } from '@/lib/gdrive';
import { getCurrentUser } from '@/lib/get-current-user';
import { actualizarGlosa } from '@/lib/glosa';

async function sincronizarGlosa(drive: any, auditData: any, prestador: string, periodo: string): Promise<string | null> {
  if (auditData.glosaAuditoria === undefined) return null;
  try {
    const informes: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'informes.json')) ?? [];
    const norm = (value: any) => String(value ?? '').trim().toUpperCase();
    const contrato = auditData.selectedPrestador?.CONTRATO;
    const matches = informes.filter(inf => norm(inf.prestador) === norm(prestador) && norm(inf.periodo) === norm(periodo) && (!contrato || norm(inf.contrato) === norm(contrato)));
    if (matches.length !== 1) return 'Auditoría guardada. No se actualizó el acta porque no hay un informe único para ese contrato y período. Use Guardar en Registro en Informes.';
    const informe = matches[0];
    Object.assign(informe, actualizarGlosa(informe, auditData.glosaAuditoria));
    informe.pdf_data.ajustesGlosa = {
      adjustedQuantities: auditData.adjustedQuantities || {},
      comments: auditData.comments || {},
      selectedRows: auditData.selectedRows || {},
    };
    informe.pdf_data.glosaActualizadaEn = auditData.glosaActualizadaEn;
    await writeJson(drive, ROOT_FOLDER_ID, 'informes.json', informes);
    return null;
  } catch {
    return 'Auditoría guardada, pero no se pudo actualizar la glosa y los comentarios del acta. Reintente guardar.';
  }
}

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
      r.prestador?.trim().toLowerCase() === prestador.trim().toLowerCase() &&
      r.mes?.trim().toLowerCase() === month.trim().toLowerCase()
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
    if (auditData.glosaAuditoria !== undefined && (typeof auditData.glosaAuditoria !== 'number' || !Number.isFinite(auditData.glosaAuditoria) || auditData.glosaAuditoria < 0)) {
      return NextResponse.json({ message: 'Glosa inválida.' }, { status: 400 });
    }

    const nit             = auditData.selectedPrestador?.NIT || '';
    const drive           = getDrive();
    const currentUser     = await getCurrentUser(request);
    const auditoriaFolder = await getSubfolder(drive, ROOT_FOLDER_ID, 'auditorias');

    const auditDataWithOwner = {
      ...auditData,
      ...(auditData.glosaAuditoria !== undefined ? { glosaActualizadaEn: new Date().toISOString() } : {}),
      auditor_id:     currentUser?.id     || null,
      auditor_nombre: currentUser?.nombre || '',
    };

    const index  = await loadIndex(drive);
    const dupIdx = index.findIndex(r =>
      r.prestador?.trim().toLowerCase() === prestadorName.trim().toLowerCase() &&
      r.mes?.trim().toLowerCase() === month.trim().toLowerCase()
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
        warning: await sincronizarGlosa(drive, preserved, prestadorName, month),
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
      prestador:      prestadorName.trim(),
      nit,
      mes:            month.trim(),
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
      warning: await sincronizarGlosa(drive, auditDataWithOwner, prestadorName, month),
      numero, id, updated: false,
    });
  } catch (error: any) {
    return NextResponse.json({ message: 'Error interno.', error: error.message }, { status: 500 });
  }
}

// PATCH /api/save-audit — corrige el campo `mes` de una entrada del índice
export async function PATCH(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);
    const isAdmin = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';
    if (!isAdmin) return NextResponse.json({ message: 'No autorizado.' }, { status: 403 });

    const { id, mes } = await request.json();
    if (!id || !mes) return NextResponse.json({ message: 'Faltan id y mes.' }, { status: 400 });

    const drive = getDrive();
    const index = await loadIndex(drive);
    const idx = index.findIndex((r: any) => r.id === id || r.numero === id);
    if (idx === -1) return NextResponse.json({ message: 'Auditoría no encontrada.' }, { status: 404 });

    const anterior = index[idx].mes;
    index[idx] = { ...index[idx], mes };
    await writeJson(drive, ROOT_FOLDER_ID, 'auditorias_index.json', index);

    return NextResponse.json({ success: true, anterior, nuevo: mes, numero: index[idx].numero });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
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
