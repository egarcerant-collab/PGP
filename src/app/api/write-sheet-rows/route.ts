import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { scriptUrl, sheetUrl, rows } = body as {
      scriptUrl: string;
      sheetUrl?: string;
      rows: { cups: string; descripcion: string; frecuencia: number; valorUnitario: number; costoMes: number }[];
    };

    if (!scriptUrl || !rows?.length) {
      return NextResponse.json({ message: 'Faltan scriptUrl o rows.' }, { status: 400 });
    }

    // Llamada server-side al Google Apps Script Web App (sin restricciones CORS)
    // Se envía sheetUrl para que el script abra el Sheet correcto por URL
    const gasResponse = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetUrl, rows }),
      redirect: 'follow',
    });

    if (!gasResponse.ok) {
      const text = await gasResponse.text();
      return NextResponse.json(
        { message: `Error desde Apps Script: ${gasResponse.status}`, detail: text },
        { status: 502 }
      );
    }

    const result = await gasResponse.json();
    return NextResponse.json(result, { status: 200 });

  } catch (error: any) {
    console.error('write-sheet-rows error:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
