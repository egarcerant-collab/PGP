import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/get-current-user';
import { getDrive, readJson, writeJson, getSubfolder, listFiles, ROOT_FOLDER_ID } from '@/lib/gdrive';

// GET /api/admin/backup — descarga backup completo de Drive
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (user?.rol !== 'superadmin' && user?.rol !== 'admin') {
    return NextResponse.json({ message: 'No autorizado.' }, { status: 403 });
  }

  try {
    const drive           = getDrive();
    const auditoriaFolder = await getSubfolder(drive, ROOT_FOLDER_ID, 'auditorias');

    const [informes, auditIndex, auditFiles] = await Promise.all([
      readJson(drive, ROOT_FOLDER_ID, 'informes.json'),
      readJson(drive, ROOT_FOLDER_ID, 'auditorias_index.json'),
      listFiles(drive, auditoriaFolder),
    ]);

    // Leer archivos individuales y limpiar pgpData
    const auditorias = (await Promise.all(
      auditFiles
        .filter(f => f.name.endsWith('.json'))
        .map(async f => {
          const data = await readJson(drive, auditoriaFolder, f.name);
          if (!data) return null;
          if (data.datos?.pgpData) {
            const { pgpData: _, ...datosSinPgp } = data.datos;
            return { ...data, datos: datosSinPgp };
          }
          return data;
        })
    )).filter(Boolean);

    const backup = {
      version:         '2.0',
      storage:         'gdrive',
      fecha:           new Date().toISOString(),
      organizacion:    'Dusakawi EPS',
      auditoriasIndex: auditIndex || [],
      auditorias,
      informes:        informes || [],
    };

    const fecha = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="backup_dsk_${fecha}.json"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

// POST /api/admin/backup — restaura desde backup JSON
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (user?.rol !== 'superadmin' && user?.rol !== 'admin') {
    return NextResponse.json({ message: 'No autorizado.' }, { status: 403 });
  }

  try {
    const backup = await request.json();
    if (!backup.version || (!backup.auditorias && !backup.informes)) {
      return NextResponse.json({ message: 'Archivo de backup inválido.' }, { status: 400 });
    }

    const drive           = getDrive();
    const auditoriaFolder = await getSubfolder(drive, ROOT_FOLDER_ID, 'auditorias');
    const resultados      = { auditorias: 0, informes: 0, errores: [] as string[] };

    if (Array.isArray(backup.informes) && backup.informes.length > 0) {
      await writeJson(drive, ROOT_FOLDER_ID, 'informes.json', backup.informes);
      resultados.informes = backup.informes.length;
    }

    if (Array.isArray(backup.auditorias) && backup.auditorias.length > 0) {
      const cleaned = backup.auditorias.map((r: any) => {
        if (r.datos?.pgpData) {
          const { pgpData: _, ...datosSinPgp } = r.datos;
          return { ...r, datos: datosSinPgp };
        }
        return r;
      });

      const newIndex = cleaned.map((r: any) => ({
        id:             r.id,
        numero:         r.numero,
        prestador:      r.prestador,
        nit:            r.nit,
        mes:            r.mes,
        auditor_id:     r.datos?.auditor_id     || null,
        auditor_nombre: r.datos?.auditor_nombre || '',
        created_at:     r.created_at,
      }));

      await Promise.all([
        writeJson(drive, ROOT_FOLDER_ID, 'auditorias_index.json', newIndex),
        ...cleaned.map((r: any) => writeJson(drive, auditoriaFolder, `${r.id}.json`, r)),
      ]);
      resultados.auditorias = cleaned.length;
    }

    return NextResponse.json({ success: resultados.errores.length === 0, ...resultados });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
