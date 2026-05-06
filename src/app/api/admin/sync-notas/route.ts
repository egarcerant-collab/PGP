import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

/**
 * POST /api/admin/sync-notas
 *
 * Migración: para cada auditoría en Supabase, busca el informe vinculado
 * por prestador + mes y copia las notas (notaEjecucionFinanciera, notaAdicional)
 * desde pdf_data del informe hacia datos.notasGuardadas de la auditoría.
 *
 * Esto resuelve el caso en que los informes fueron creados antes que las
 * auditorías tuvieran persistencia de notas.
 */
export async function POST() {
  try {
    const db = createSupabaseAdminClient();

    // 1. Obtener todas las auditorías
    const { data: auditorias, error: errAud } = await db
      .from('auditorias')
      .select('id, prestador, mes, datos');
    if (errAud) throw errAud;

    // 2. Obtener todos los informes con sus notas
    const { data: informes, error: errInf } = await db
      .from('informes')
      .select('numero, prestador, periodo, tipo_periodo, contrato, nt_periodo, responsable, pdf_data');
    if (errInf) throw errInf;

    if (!auditorias || !informes) {
      return NextResponse.json({ message: 'Sin datos.' }, { status: 200 });
    }

    let actualizadas = 0;
    let sinInforme = 0;
    let sinNotas = 0;
    const detalles: string[] = [];

    for (const aud of auditorias) {
      const mesNorm = (aud.mes || '').trim().toUpperCase();
      const prestNorm = (aud.prestador || '').trim().toUpperCase();

      // Buscar informe que coincida por prestador (parcial) y mes en periodo
      const match = informes.find(inf => {
        const prestMatch = (inf.prestador || '').trim().toUpperCase().includes(prestNorm)
          || prestNorm.includes((inf.prestador || '').trim().toUpperCase());
        if (!prestMatch) return false;
        const partes = (inf.periodo || '').toUpperCase().split('-').map((p: string) => p.trim());
        return partes.includes(mesNorm);
      });

      if (!match) {
        sinInforme++;
        continue;
      }

      const notaEF = match.pdf_data?.notaEjecucionFinanciera || '';
      const notaAd = match.pdf_data?.notaAdicional || '';

      // Solo actualizar si hay al menos una nota con contenido
      if (!notaEF && !notaAd) {
        sinNotas++;
        continue;
      }

      const datosActuales = (aud.datos as any) || {};

      // No sobreescribir si ya tiene notas guardadas con contenido
      const yaTieneNotas = datosActuales.notasGuardadas?.notaEjecucionFinanciera
        || datosActuales.notasGuardadas?.notaAdicional;
      if (yaTieneNotas) {
        // Mantener las ya guardadas (pueden ser más recientes)
        sinNotas++;
        continue;
      }

      const datosMerged = {
        ...datosActuales,
        notasGuardadas: {
          notaEjecucionFinanciera: notaEF,
          notaAdicional: notaAd,
          informeNum: match.numero || '',
        },
        // También enriquecer informeRestored si aún no lo tiene
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

      const { error: errUpd } = await db
        .from('auditorias')
        .update({ datos: datosMerged })
        .eq('id', aud.id);

      if (errUpd) {
        detalles.push(`❌ Auditoría ${aud.id} (${aud.prestador} / ${aud.mes}): ${errUpd.message}`);
      } else {
        actualizadas++;
        detalles.push(`✅ ${aud.prestador} / ${aud.mes} → Informe N° ${match.numero}`);
      }
    }

    return NextResponse.json({
      ok: true,
      resumen: {
        total: auditorias.length,
        actualizadas,
        sinInforme,
        sinNotas,
      },
      detalles,
    });
  } catch (error: any) {
    console.error('[sync-notas]', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
