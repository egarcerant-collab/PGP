import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://fvrgfqxohacipmnmqyef.supabase.co',
  'sb_publishable_ezUmThavYstyax693c7ZmA_jda4yXNA'
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('auditorias')
      .select('id, numero, prestador, nit, mes, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const audits = (data || []).map(r => ({
      id: r.id,
      numero: r.numero,
      prestador: r.prestador,
      nit: r.nit,
      month: r.mes,
      fecha: r.created_at ? r.created_at.slice(0, 10) : '',
    }));

    return NextResponse.json(audits);
  } catch (error: any) {
    console.error('Error al listar auditorías:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
