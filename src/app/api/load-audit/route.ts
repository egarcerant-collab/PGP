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
          informeRelacionado = {
            numero: match.numero,
            contrato: match.contrato,
            tipoPeriodo: match.tipo_periodo,
            periodo: match.periodo,
            ntPeriodo: match.nt_periodo,
            responsable: match.responsable,
            notaEjecucionFinanciera: match.pdf_data?.notaEjecucionFinanciera || '',
            notaAdicional: match.pdf_data?.notaAdicional || '',
          };
        }
      }
    } catch { /* si falla la búsqueda del informe, no bloqueamos la carga */ }

    return NextResponse.json({
      auditData: data.datos,
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
