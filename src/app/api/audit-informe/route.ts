import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

// GET /api/audit-informe?prestador=X&mes=Y
// Busca el informe relacionado a una auditoría por prestador y mes
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const prestador = searchParams.get('prestador') || '';
    const mes = searchParams.get('mes') || '';

    if (!prestador || !mes) {
      return NextResponse.json({ informes: [] });
    }

    const db = createSupabaseAdminClient();

    // Buscar informes que coincidan con el prestador
    const { data, error } = await db
      .from('informes')
      .select('*')
      .ilike('prestador', `%${prestador.trim()}%`)
      .order('numero', { ascending: false });

    if (error) throw error;

    // Filtrar los que incluyen el mes en su período
    const mesNorm = mes.trim().toUpperCase();
    const informes = (data || []).filter(inf => {
      const periodos = (inf.periodo || '')
        .toUpperCase()
        .split('-')
        .map((p: string) => p.trim());
      return periodos.includes(mesNorm);
    });

    return NextResponse.json({ informes });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

// PATCH /api/audit-informe — actualiza notas de un informe vinculado
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { numero, notaEjecucionFinanciera, notaAdicional } = body;

    if (!numero) {
      return NextResponse.json({ message: 'Falta número de informe.' }, { status: 400 });
    }

    const db = createSupabaseAdminClient();

    // Leer pdf_data actual para no perder otros campos
    const { data: existing } = await db
      .from('informes')
      .select('pdf_data')
      .eq('numero', numero)
      .maybeSingle();

    const pdfData = {
      ...(existing?.pdf_data || {}),
      notaEjecucionFinanciera: notaEjecucionFinanciera ?? existing?.pdf_data?.notaEjecucionFinanciera ?? '',
      notaAdicional: notaAdicional ?? existing?.pdf_data?.notaAdicional ?? '',
    };

    const { error } = await db
      .from('informes')
      .update({ pdf_data: pdfData })
      .eq('numero', numero);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
