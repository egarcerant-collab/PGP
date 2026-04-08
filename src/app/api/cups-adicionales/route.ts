import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const getFilePath = (prestadorId: string) => {
  const safe = prestadorId.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  return path.join(process.cwd(), 'public', 'cups-adicionales', `${safe}.json`);
};

const ensureDir = async () => {
  const dir = path.join(process.cwd(), 'public', 'cups-adicionales');
  await fs.mkdir(dir, { recursive: true });
};

// GET /api/cups-adicionales?prestadorId=xxx
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const prestadorId = searchParams.get('prestadorId');
  if (!prestadorId) return NextResponse.json({ rows: [] });

  try {
    const data = await fs.readFile(getFilePath(prestadorId), 'utf-8');
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json({ rows: [] });
  }
}

// POST /api/cups-adicionales  { prestadorId, rows }
export async function POST(request: Request) {
  try {
    const { prestadorId, rows } = await request.json();
    if (!prestadorId || !Array.isArray(rows)) {
      return NextResponse.json({ message: 'Faltan datos.' }, { status: 400 });
    }
    await ensureDir();
    // Leer existentes y fusionar (sin duplicar por CUPS)
    let existing: any[] = [];
    try {
      const data = await fs.readFile(getFilePath(prestadorId), 'utf-8');
      existing = JSON.parse(data).rows || [];
    } catch { /* archivo nuevo */ }

    const existingCups = new Set(existing.map((r: any) =>
      String(r.cups || r.CUPS || '').trim().toUpperCase()
    ));
    const onlyNew = rows.filter((r: any) =>
      !existingCups.has(String(r.cups || r.CUPS || '').trim().toUpperCase())
    );
    const merged = [...existing, ...onlyNew];

    await fs.writeFile(getFilePath(prestadorId), JSON.stringify({ prestadorId, rows: merged }, null, 2), 'utf-8');
    return NextResponse.json({ success: true, added: onlyNew.length, total: merged.length });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
