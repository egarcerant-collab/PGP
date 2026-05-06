import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const fsPath = searchParams.get('fsPath');

    // Si viene fsPath → leer del filesystem
    if (fsPath) {
      const filePath = path.join(process.cwd(), 'public', fsPath);
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);
      return NextResponse.json(data);
    }

    if (!id) {
      return NextResponse.json({ message: 'Falta id o fsPath.' }, { status: 400 });
    }

    const numericId = parseInt(id, 10);

    // IDs >= 90000 son registros del filesystem (compatibilidad)
    if (numericId >= 90000) {
      return NextResponse.json(
        { message: 'Registro del filesystem: proporciona fsPath.' },
        { status: 400 }
      );
    }

    const db = createSupabaseAdminClient();

    // Leer auditoría de Supabase
    const { data, error } = await db
      .from('auditorias')
      .select('id, numero, prestador, nit, mes, datos, created_at')
      .eq('id', numericId)
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ message: 'No encontrado.' }, { status: 404 });

    const datosActuales = (data.datos as any) || {};

    // Buscar informe vinculado por prestador + mes
    let informeRelacionado: any = null;
    try {
      const mesNorm = (data.mes || '').trim().toUpperCase();
      const { data: informes } = await db
        .from('informes')
        .select('*')
        .ilike('prestador', `%${data.prestador.trim()}%`)
        .order('numero', { ascending: false });

      if (informes && informes.length > 0) {
        // Buscar el informe cuyo periodo incluya el mes de la auditoría
        const match = informes.find(inf => {
          const partes = (inf.periodo || '').toUpperCase().split('-').map((p: string) => p.trim());
          return partes.includes(mesNorm);
        });

        if (match) {
          const notaEF = match.pdf_data?.notaEjecucionFinanciera || '';
          const notaAd = match.pdf_data?.notaAdicional || '';

          informeRelacionado = {
            numero: match.numero,
            contrato: match.contrato,
            tipoPeriodo: match.tipo_periodo,
            periodo: match.periodo,
            ntPeriodo: match.nt_periodo,
            responsable: match.responsable,
            notaEjecucionFinanciera: notaEF,
            notaAdicional: notaAd,
          };

          // ── Auto-sincronización permanente ──────────────────────────────────
          // Si la auditoría aún no tiene las notas guardadas en datos, las
          // copiamos ahora desde el informe. Esto ocurre UNA sola vez por
          // auditoría (en la primera apertura). Las siguientes aperturas ya
          // las encuentran directamente en datos sin necesitar al informe.
          const yaConNotas = datosActuales.notasGuardadas?.notaEjecucionFinanciera
            || datosActuales.notasGuardadas?.notaAdicional;

          if (!yaConNotas && (notaEF || notaAd)) {
            const datosMerged = {
              ...datosActuales,
              notasGuardadas: {
                notaEjecucionFinanciera: notaEF,
                notaAdicional: notaAd,
                informeNum: match.numero || '',
              },
              // Guardar informeRestored también si aún no existe
              ...(!datosActuales.informeRestored ? {
                informeRestored: {
                  numero: match.numero,
                  contrato: match.contrato,
                  tipoPeriodo: match.tipo_periodo,
                  periodo: match.periodo,
                  ntPeriodo: match.nt_periodo,
                  responsable: match.responsable,
                  notaEjecucionFinanciera: notaEF,
                  notaAdicional: notaAd,
                },
              } : {}),
            };
            // Fire-and-forget: actualizar en BD sin bloquear la respuesta
            db.from('auditorias')
              .update({ datos: datosMerged })
              .eq('id', data.id)
              .then(() => {})
              .catch(() => {});
          }
          // ────────────────────────────────────────────────────────────────────
        }
      }
    } catch { /* si falla la búsqueda del informe, no bloqueamos la carga */ }

    return NextResponse.json({
      auditData: datosActuales,
      prestador: data.prestador,
      mes: data.mes,
      numero: data.numero,
      informeRelacionado,
    });
  } catch (error: any) {
    console.error('Error al cargar auditoría:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
