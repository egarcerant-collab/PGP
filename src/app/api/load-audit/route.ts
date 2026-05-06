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
        // Filtrar todos los informes que incluyan el mes de la auditoría en su periodo
        const candidatos = informes.filter(inf => {
          const partes = (inf.periodo || '').toUpperCase().split('-').map((p: string) => p.trim());
          return partes.includes(mesNorm);
        });

        let match: any = null;

        if (candidatos.length > 0) {
          // Prioridad 1: informe mensual exacto (periodo == mesNorm exactamente)
          // → tiene las notas propias del mes, no diluidas en un trimestral
          const exacto = candidatos.find(inf =>
            inf.periodo.trim().toUpperCase() === mesNorm
          );

          // Prioridad 2: entre los que incluyen el mes, el que tenga notas no vacías
          const conNotas = candidatos.find(inf =>
            inf.pdf_data?.notaEjecucionFinanciera || inf.pdf_data?.notaAdicional
          );

          // Prioridad 3: el de número más alto (más reciente)
          match = exacto ?? conNotas ?? candidatos[0];
        }

        if (match) {
          const notaEF = match.pdf_data?.notaEjecucionFinanciera || '';
          const notaAd = match.pdf_data?.notaAdicional || '';
          const valorCupsInesperadas = match.pdf_data?.valorCupsInesperadas || 0;
          const cantidadCupsInesperadas = match.pdf_data?.cantidadCupsInesperadas || '';

          informeRelacionado = {
            numero: match.numero,
            contrato: match.contrato,
            tipoPeriodo: match.tipo_periodo,
            periodo: match.periodo,
            ntPeriodo: match.nt_periodo,
            responsable: match.responsable,
            notaEjecucionFinanciera: notaEF,
            notaAdicional: notaAd,
            valorCupsInesperadas,
            cantidadCupsInesperadas,
          };

          // ── Auto-sincronización permanente ──────────────────────────────────
          // Si la auditoría aún no tiene notas en datos, las copiamos ahora
          // desde el informe. Ocurre UNA sola vez; siguientes aperturas las
          // encuentran directamente en datos sin buscar el informe.
          const yaConNotas = datosActuales.notasGuardadas?.notaEjecucionFinanciera
            || datosActuales.notasGuardadas?.notaAdicional;

          if (!yaConNotas && (notaEF || notaAd || valorCupsInesperadas)) {
            const datosMerged = {
              ...datosActuales,
              notasGuardadas: {
                notaEjecucionFinanciera: notaEF,
                notaAdicional: notaAd,
                informeNum: match.numero || '',
                valorCupsInesperadas,
                cantidadCupsInesperadas,
              },
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
                  valorCupsInesperadas,
                  cantidadCupsInesperadas,
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

    // ── Enriquecer executionData con totalRealValue desde el informe ──────────
    // Si la auditoría tiene totalRealValue=0 (guardada sin datos financieros),
    // usamos pdf_data.totalEjecutadoFinal del informe como valor real.
    let auditDataFinal = datosActuales;
    try {
      if (informeRelacionado && datosActuales.executionData) {
        const MESES: Record<string, string> = {
          ENERO:'1',FEBRERO:'2',MARZO:'3',ABRIL:'4',MAYO:'5',JUNIO:'6',
          JULIO:'7',AGOSTO:'8',SEPTIEMBRE:'9',OCTUBRE:'10',NOVIEMBRE:'11',DICIEMBRE:'12'
        };
        const mesKey = MESES[(data.mes || '').toUpperCase().trim()] || '';
        const execEntry = datosActuales.executionData[mesKey];
        if (execEntry && (!execEntry.totalRealValue || execEntry.totalRealValue === 0)) {
          // Buscar el totalEjecutadoFinal en el informe encontrado
          const { data: inf } = await db
            .from('informes')
            .select('pdf_data')
            .eq('numero', informeRelacionado.numero)
            .single();
          const totalReal = inf?.pdf_data?.totalEjecutadoFinal || 0;
          if (totalReal > 0) {
            auditDataFinal = {
              ...datosActuales,
              executionData: {
                ...datosActuales.executionData,
                [mesKey]: { ...execEntry, totalRealValue: totalReal },
              },
            };
          }
        }
      }
    } catch { /* no bloquear */ }
    // ──────────────────────────────────────────────────────────────────────────

    return NextResponse.json({
      auditData: auditDataFinal,
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
