import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const supabase = createClient(
  'https://fvrgfqxohacipmnmqyef.supabase.co',
  'sb_publishable_ezUmThavYstyax693c7ZmA_jda4yXNA'
);

const PASSWORD = '123456';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { auditData, prestadorName, month } = body;

    if (!auditData || !prestadorName || !month) {
      return NextResponse.json({ message: 'Faltan datos requeridos.' }, { status: 400 });
    }

    const nit = auditData.selectedPrestador?.NIT || '';

    // Verificar si ya existe una auditoría con el mismo prestador y mes
    const { data: duplicate } = await supabase
      .from('auditorias')
      .select('id, numero')
      .eq('prestador', prestadorName)
      .eq('mes', month)
      .maybeSingle();

    if (duplicate) {
      // Sobreescribir el registro existente
      const { error: updateError } = await supabase
        .from('auditorias')
        .update({ datos: auditData, nit })
        .eq('id', duplicate.id);

      if (updateError) throw updateError;

      return NextResponse.json({
        message: `Auditoría N° ${duplicate.numero} actualizada.`,
        numero: duplicate.numero,
        id: duplicate.id,
        updated: true,
      }, { status: 200 });
    }

    // Insertar nuevo registro con número secuencial
    const { data: last } = await supabase
      .from('auditorias')
      .select('numero')
      .order('numero', { ascending: false })
      .limit(1);

    const lastNumber = last && last.length > 0 ? parseInt(last[0].numero, 10) || 0 : 0;
    const numero = String(lastNumber + 1).padStart(3, '0');

    const { data, error } = await supabase
      .from('auditorias')
      .insert([{ numero, prestador: prestadorName, nit, mes: month, datos: auditData }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      message: `Auditoría N° ${numero} guardada exitosamente.`,
      numero,
      id: data.id,
      updated: false,
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error al guardar auditoría:', error);
    return NextResponse.json({ message: 'Error interno.', error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const password = searchParams.get('password');

    if (password !== PASSWORD) {
      return NextResponse.json({ message: 'Contraseña incorrecta.' }, { status: 401 });
    }
    if (!id) return NextResponse.json({ message: 'Falta ID.' }, { status: 400 });

    if (id === 'ALL') {
      // Borrar de Supabase
      await supabase.from('auditorias').delete().neq('id', 0);
      // Borrar del filesystem
      try {
        const reportsDir = path.join(process.cwd(), 'public', 'informes');
        const monthDirs = await fs.readdir(reportsDir, { withFileTypes: true });
        for (const monthDir of monthDirs) {
          if (monthDir.isDirectory()) {
            const monthPath = path.join(reportsDir, monthDir.name);
            const files = await fs.readdir(monthPath);
            for (const file of files) {
              if (file.endsWith('.json')) {
                await fs.unlink(path.join(monthPath, file)).catch(() => {});
              }
            }
          }
        }
      } catch {}
    } else {
      const fsPath = searchParams.get('fsPath');
      if (fsPath) {
        // Es un registro del filesystem
        const filePath = path.join(process.cwd(), 'public', fsPath);
        await fs.unlink(filePath);
      } else {
        // Es un registro de Supabase
        const { error } = await supabase.from('auditorias').delete().eq('id', id);
        if (error) throw error;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
