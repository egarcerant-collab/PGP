import { NextRequest, NextResponse } from 'next/server';
import { getSieClient } from '@/lib/sie-client';
import { getDrive, writeJson, getSubfolder, ROOT_FOLDER_ID } from '@/lib/gdrive';

/**
 * GET /api/sie/descargar?contrato=PGP-XXXX&rows=0,2,3&guardar=1
 *
 * 1. Login en SIE, consulta radicaciones del contrato
 * 2. Descarga JSON de las filas indicadas (o todas si no se especifica)
 * 3. Si guardar=1: guarda como pending_* en Drive sie_rips/
 * 4. Devuelve array con metadata + contenido
 */
export async function GET(req: NextRequest) {
  const contrato = req.nextUrl.searchParams.get('contrato');
  if (!contrato) {
    return NextResponse.json({ error: 'Parámetro contrato requerido' }, { status: 400 });
  }

  const guardarEnDrive = req.nextUrl.searchParams.get('guardar') === '1';

  try {
    const client = getSieClient();

    // 1. Consultar radicaciones del contrato
    const { resultados, hayDatos } = await client.consultarContrato(contrato);

    if (!hayDatos || resultados.length === 0) {
      return NextResponse.json({ contrato, archivos: [], mensaje: 'Sin radicaciones encontradas' });
    }

    // 2. Descargar JSON — índices específicos o todos hasta 20
    const rowsParam = req.nextUrl.searchParams.get('rows');
    let archivosDescargados;
    if (rowsParam) {
      const indices = rowsParam.split(',').map(Number).filter(n => !isNaN(n) && n >= 0 && n < resultados.length);
      archivosDescargados = await client.descargarRipsDeUltimaConsulta(indices.length, indices);
    } else {
      archivosDescargados = await client.descargarRipsDeUltimaConsulta(Math.min(resultados.length, 20));
    }

    if (archivosDescargados.length === 0) {
      return NextResponse.json({
        contrato,
        archivos: [],
        radicaciones: resultados.length,
        mensaje: 'Se encontraron radicaciones pero no fue posible descargar los archivos.',
      }, { status: 502 });
    }

    // 3. Enriquecer con metadata
    const archivos = archivosDescargados.map((a, i) => {
      const rec = resultados[i];
      let parsedJson: unknown = null;
      try { parsedJson = JSON.parse(a.content.toString('utf-8')); } catch { /* no JSON */ }
      return {
        rowIndex: i,
        filename: a.filename,
        sizeBytes: a.content.length,
        recepcionId: rec?.recepcionId ?? a.recepcionId,
        estado: rec?.estado ?? '',
        fechaRecepcion: rec?.fechaRecepcion ?? '',
        numeroRadicacion: rec?.numeroRadicacion ?? '',
        contenido: parsedJson,
      };
    });

    // 4. Guardar en Drive como pending para que el analizador los cargue
    if (guardarEnDrive) {
      try {
        const drive = getDrive();
        const sieFolder = await getSubfolder(drive, ROOT_FOLDER_ID, 'sie_rips');
        for (const archivo of archivos) {
          if (archivo.contenido) {
            const nombre = `pending_${contrato}_${archivo.filename}`;
            await writeJson(drive, sieFolder, nombre, archivo.contenido);
          }
        }
      } catch { /* no crítico — el analizador igual recibe los datos */ }
    }

    return NextResponse.json({
      contrato,
      radicaciones: resultados.length,
      descargados: archivos.length,
      archivos,
    });
  } catch (e: any) {
    console.error('[sie/descargar]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
