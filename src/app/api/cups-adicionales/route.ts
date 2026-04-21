import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://fvrgfqxohacipmnmqyef.supabase.co',
  'sb_publishable_ezUmThavYstyax693c7ZmA_jda4yXNA'
);

// GET /api/cups-adicionales?prestadorId=xxx
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const prestadorId = searchParams.get('prestadorId');
  if (!prestadorId) return NextResponse.json({ rows: [] });

  try {
    const { data, error } = await supabase
      .from('cups_adicionales')
      .select('rows')
      .eq('prestador_id', prestadorId)
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ rows: data?.rows || [] });
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

    // Leer existentes y fusionar (sin duplicar por CUPS)
    const { data: existing } = await supabase
      .from('cups_adicionales')
      .select('rows')
      .eq('prestador_id', prestadorId)
      .maybeSingle();

    const existingRows: any[] = existing?.rows || [];
    const existingCups = new Set(existingRows.map((r: any) =>
      String(r.cups || r.CUPS || '').trim().toUpperCase()
    ));
    const onlyNew = rows.filter((r: any) =>
      !existingCups.has(String(r.cups || r.CUPS || '').trim().toUpperCase())
    );
    const merged = [...existingRows, ...onlyNew];

    // Upsert: inserta o actualiza según prestador_id
    const { error } = await supabase
      .from('cups_adicionales')
      .upsert({ prestador_id: prestadorId, rows: merged, updated_at: new Date().toISOString() }, { onConflict: 'prestador_id' });

    if (error) throw error;

    return NextResponse.json({ success: true, added: onlyNew.length, total: merged.length });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

// DELETE /api/cups-adicionales?prestadorId=xxx&cups=xxxxxx  — elimina un CUPS específico
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const prestadorId = searchParams.get('prestadorId');
    const cupsToRemove = searchParams.get('cups');
    if (!prestadorId) return NextResponse.json({ message: 'Falta prestadorId' }, { status: 400 });

    if (cupsToRemove) {
      // Eliminar un CUPS específico
      const { data: existing } = await supabase
        .from('cups_adicionales')
        .select('rows')
        .eq('prestador_id', prestadorId)
        .maybeSingle();

      const filtered = (existing?.rows || []).filter((r: any) =>
        String(r.cups || r.CUPS || '').trim().toUpperCase() !== cupsToRemove.trim().toUpperCase()
      );

      const { error } = await supabase
        .from('cups_adicionales')
        .upsert({ prestador_id: prestadorId, rows: filtered, updated_at: new Date().toISOString() }, { onConflict: 'prestador_id' });

      if (error) throw error;
      return NextResponse.json({ success: true, total: filtered.length });
    } else {
      // Eliminar todos los CUPS adicionales del prestador
      const { error } = await supabase
        .from('cups_adicionales')
        .delete()
        .eq('prestador_id', prestadorId);

      if (error) throw error;
      return NextResponse.json({ success: true });
    }
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
