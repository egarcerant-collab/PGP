/**
 * GET /api/cron/sie-monitoreo?token=xxx
 * Disparado por tarea programada cada 12 horas.
 * Consulta el SIE para todos los contratos PGP y actualiza estado + meses.
 */
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  const start = Date.now();
  try {
    // Llamar al propio endpoint de monitoreo internamente
    const baseUrl = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/sie/monitoreo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Usar token de sistema para bypasear la verificación de sesión
        'x-cron-token': process.env.CRON_SECRET ?? '',
      },
      body: JSON.stringify({}),
    });

    const data = await res.json();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    return NextResponse.json({
      ok: res.ok,
      elapsed: `${elapsed}s`,
      consultados: data.consultados ?? 0,
      nuevasRadicaciones: data.nuevasRadicaciones ?? [],
      hora: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
    });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
