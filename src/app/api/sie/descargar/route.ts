import { NextRequest, NextResponse } from 'next/server';
import { getSieClient } from '@/lib/sie-client';

/**
 * GET /api/sie/descargar?contrato=PGP-44001-2026-05-SM
 *
 * 1. Login en SIE
 * 2. Busca radicaciones del contrato
 * 3. Descarga el JSON de cada radicación
 * 4. Devuelve array con metadata + contenido base64
 */
export async function GET(req: NextRequest) {
  const contrato = req.nextUrl.searchParams.get('contrato');
  if (!contrato) {
    return NextResponse.json({ error: 'Parámetro contrato requerido' }, { status: 400 });
  }

  try {
    const client = getSieClient();

    // 1. Consultar radicaciones del contrato
    const { resultados, hayDatos } = await client.consultarContrato(contrato);

    if (!hayDatos || resultados.length === 0) {
      return NextResponse.json({ contrato, archivos: [], mensaje: 'Sin radicaciones encontradas' });
    }

    // 2. Descargar JSON de cada fila (máximo 20)
    const maxDescarga = Math.min(resultados.length, 20);
    const archivosDescargados = await client.descargarRipsDeUltimaConsulta(maxDescarga);

    if (archivosDescargados.length === 0) {
      return NextResponse.json({
        contrato,
        archivos: [],
        radicaciones: resultados.length,
        mensaje: 'Se encontraron radicaciones pero no fue posible descargar los archivos. Verifique la sesión SIE.',
      }, { status: 502 });
    }

    // 3. Enriquecer con metadata de la radicación correspondiente
    const archivos = archivosDescargados.map((a, i) => {
      const rec = resultados[i];
      let parsedJson: unknown = null;
      try {
        parsedJson = JSON.parse(a.content.toString('utf-8'));
      } catch { /* no es JSON válido */ }

      return {
        rowIndex: i,
        filename: a.filename,
        contentType: a.contentType,
        sizeBytes: a.content.length,
        recepcionId: rec?.recepcionId ?? a.recepcionId,
        estado: rec?.estado ?? '',
        fechaRecepcion: rec?.fechaRecepcion ?? '',
        numeroRadicacion: rec?.numeroRadicacion ?? '',
        // Contenido JSON directamente (no base64) si es un JSON válido
        contenido: parsedJson,
        // Si no es JSON, contenido como base64
        contenidoBase64: parsedJson ? undefined : a.content.toString('base64'),
      };
    });

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
