/**
 * GET /api/sie/consultar?contrato=PGP-XXXX-YYYY-XX-XX
 * Consulta el SIE para un contrato específico y retorna sus radicaciones
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/get-current-user';
import { getSieClient } from '@/lib/sie-client';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const isStaff =
      user?.rol === 'superadmin' || user?.rol === 'admin' || user?.rol === 'auditor';
    if (!isStaff) return NextResponse.json({ message: 'Acceso denegado' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const contrato = searchParams.get('contrato');
    if (!contrato) return NextResponse.json({ message: 'Parámetro contrato requerido' }, { status: 400 });

    const client = getSieClient();
    const { resultados, hayDatos } = await client.consultarContrato(contrato);

    return NextResponse.json({
      contrato,
      hayDatos,
      total: resultados.length,
      resultados,
      consultadoEn: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
