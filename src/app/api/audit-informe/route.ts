import { NextResponse } from 'next/server';
import { getDrive, readJson, writeJson, ROOT_FOLDER_ID } from '@/lib/gdrive';

// GET /api/audit-informe?prestador=X&mes=Y
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const prestador = searchParams.get('prestador') || '';
    const mes       = searchParams.get('mes')       || '';
    if (!prestador || !mes) return NextResponse.json({ informes: [] });

    const drive    = getDrive();
    const all: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'informes.json')) ?? [];

    const mesNorm    = mes.trim().toUpperCase();
    // Soporta mes simple ("MARZO") y período compuesto ("ENERO-FEBRERO-MARZO")
    const mesesAudit = mesNorm.split('-').map(m => m.trim());

    const informes = all.filter(inf => {
      const nameMatch  = inf.prestador?.toLowerCase().includes(prestador.trim().toLowerCase());
      const periodos   = (inf.periodo || '').toUpperCase().split('-').map((p: string) => p.trim());
      // Coincidencia exacta de período O cualquier mes del período de auditoría dentro del informe
      return nameMatch && (periodos.join('-') === mesNorm || mesesAudit.some(m => periodos.includes(m)));
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
    if (!numero) return NextResponse.json({ message: 'Falta número de informe.' }, { status: 400 });

    const drive    = getDrive();
    const informes: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'informes.json')) ?? [];
    const idx      = informes.findIndex(r => r.numero === numero);
    if (idx === -1) return NextResponse.json({ message: 'Informe no encontrado.' }, { status: 404 });

    informes[idx] = {
      ...informes[idx],
      pdf_data: {
        ...(informes[idx].pdf_data || {}),
        notaEjecucionFinanciera: notaEjecucionFinanciera ?? informes[idx].pdf_data?.notaEjecucionFinanciera ?? '',
        notaAdicional:           notaAdicional           ?? informes[idx].pdf_data?.notaAdicional           ?? '',
      },
    };

    await writeJson(drive, ROOT_FOLDER_ID, 'informes.json', informes);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
