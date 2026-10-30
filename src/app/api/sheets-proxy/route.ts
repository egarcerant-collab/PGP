import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sheetUrl = searchParams.get('url');

  if (!sheetUrl) {
    return NextResponse.json({ error: 'Falta parámetro url' }, { status: 400 });
  }

  const idMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) {
    return NextResponse.json({ error: 'URL de Google Sheets inválida' }, { status: 400 });
  }

  const sheetId = idMatch[1];
  const gidMatch = sheetUrl.match(/[#&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';

  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;

  try {
    const response = await fetch(csvUrl, { next: { revalidate: 60 } });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Google Sheets respondió ${response.status}: ${response.statusText}` },
        { status: 502 }
      );
    }
    const csv = await response.text();
    return new Response(csv, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
