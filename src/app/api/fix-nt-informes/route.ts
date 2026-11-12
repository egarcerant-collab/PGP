import { NextResponse } from 'next/server';
import { getDrive, readJson, writeJson, ROOT_FOLDER_ID } from '@/lib/gdrive';

// POST /api/fix-nt-informes
// Body: { numeros: string[], ntMensual: number, prestadorMatch?: string }
// Actualiza nt_periodo y valor_final de los informes indicados
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const numeros: string[] = (body.numeros || []).map(String);
    const ntMensual: number = Number(body.ntMensual);
    const prestadorMatch: string = (body.prestadorMatch || '').toUpperCase();

    if (numeros.length === 0 || !ntMensual || ntMensual <= 0) {
      return NextResponse.json({ message: 'Faltan campos: numeros[], ntMensual' }, { status: 400 });
    }

    const drive = getDrive();
    const informes: any[] = (await readJson<any[]>(drive, ROOT_FOLDER_ID, 'informes.json')) ?? [];

    const updated: string[] = [];
    const skipped: string[] = [];

    for (const inf of informes) {
      if (!numeros.includes(String(inf.numero))) continue;
      if (prestadorMatch) {
        const prestador = (inf.prestador || '').toUpperCase();
        if (!prestador.includes(prestadorMatch.slice(0, 10))) { skipped.push(inf.numero); continue; }
      }

      // Número de meses según tipo de período
      const dashes = ((inf.periodo || '').match(/-/g) || []).length;
      const nMeses = dashes >= 2 ? 3 : dashes === 1 ? 2 : 1;
      const newNtPeriodo = ntMensual * nMeses;

      // Preservar descontar y reconocer existentes para recalcular valorFinal
      const descontar = Number(inf.descontar) || 0;
      const reconocer = Number(inf.reconocer) || 0;
      const newValorFinal = newNtPeriodo - descontar + reconocer;

      inf.nt_periodo = newNtPeriodo;
      inf.valor_final = newValorFinal;
      updated.push(`${inf.numero} (${inf.periodo}) → nt=${newNtPeriodo}, valorFinal=${newValorFinal}`);
    }

    if (updated.length === 0) {
      return NextResponse.json({ message: 'Ningún informe coincidió', skipped });
    }

    await writeJson(drive, ROOT_FOLDER_ID, 'informes.json', informes);
    return NextResponse.json({ success: true, updated, skipped });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
