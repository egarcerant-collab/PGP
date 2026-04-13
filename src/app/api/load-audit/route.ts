import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const supabase = createClient(
  'https://fvrgfqxohacipmnmqyef.supabase.co',
  'sb_publishable_ezUmThavYstyax693c7ZmA_jda4yXNA'
);

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

    // Leer de Supabase
    const { data, error } = await supabase
      .from('auditorias')
      .select('id, numero, prestador, nit, mes, datos, created_at')
      .eq('id', numericId)
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ message: 'No encontrado.' }, { status: 404 });

    return NextResponse.json({
      auditData: data.datos,
      prestador: data.prestador,
      mes: data.mes,
      numero: data.numero,
    });
  } catch (error: any) {
    console.error('Error al cargar auditoría:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
