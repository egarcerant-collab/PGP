import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://fvrgfqxohacipmnmqyef.supabase.co',
  'sb_publishable_ezUmThavYstyax693c7ZmA_jda4yXNA'
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ message: 'Falta ID.' }, { status: 400 });

    const { data, error } = await supabase
      .from('auditorias')
      .select('datos, prestador, mes, numero')
      .eq('id', id)
      .single();

    if (error) throw error;

    return NextResponse.json({ auditData: data.datos, prestador: data.prestador, mes: data.mes, numero: data.numero });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
