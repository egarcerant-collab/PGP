import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://fvrgfqxohacipmnmqyef.supabase.co',
  'sb_publishable_ezUmThavYstyax693c7ZmA_jda4yXNA'
);

export async function GET() {
  const results: any = {};

  // Test lectura informes
  const { data: inf, error: infErr } = await supabase.from('informes').select('count').limit(1);
  results.informes_read = infErr ? { error: infErr.message, code: infErr.code } : 'OK';

  // Test lectura auditorias
  const { data: aud, error: audErr } = await supabase.from('auditorias').select('count').limit(1);
  results.auditorias_read = audErr ? { error: audErr.message, code: audErr.code } : 'OK';

  // Test escritura auditorias
  const { data: ins, error: insErr } = await supabase
    .from('auditorias')
    .insert([{ numero: 'TEST-' + Date.now(), prestador: 'TEST', nit: '0', mes: 'test', datos: {} }])
    .select().single();
  results.auditorias_write = insErr ? { error: insErr.message, code: insErr.code } : 'OK: ' + ins?.id;

  // Limpiar el registro de prueba si se insertó
  if (!insErr && ins?.id) {
    await supabase.from('auditorias').delete().eq('id', ins.id);
    results.auditorias_cleanup = 'OK';
  }

  return NextResponse.json(results);
}
