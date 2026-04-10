import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const supabase = createClient(
  'https://fvrgfqxohacipmnmqyef.supabase.co',
  'sb_publishable_ezUmThavYstyax693c7ZmA_jda4yXNA'
);

export async function GET() {
  const results: any[] = [];

  // 1. Leer de Supabase
  try {
    const { data } = await supabase
      .from('auditorias')
      .select('id, numero, prestador, nit, mes, created_at')
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      data.forEach(r => {
        results.push({
          id: r.id,
          numero: r.numero || '',
          prestador: r.prestador,
          nit: r.nit || '',
          month: r.mes,
          fecha: r.created_at ? r.created_at.slice(0, 10) : '',
          source: 'supabase',
        });
      });
    }
  } catch (e) {
    console.warn('Supabase list error:', e);
  }

  // 2. Leer del filesystem (compatibilidad hacia atrás)
  try {
    const rootDir = process.cwd();
    const reportsDir = path.join(rootDir, 'public', 'informes');
    await fs.access(reportsDir);
    const monthDirs = await fs.readdir(reportsDir, { withFileTypes: true });
    let fsIndex = 90000; // IDs altos para no colisionar con Supabase
    for (const monthDir of monthDirs) {
      if (monthDir.isDirectory()) {
        const monthPath = path.join(reportsDir, monthDir.name);
        try {
          const files = await fs.readdir(monthPath);
          for (const file of files) {
            if (file.endsWith('.json')) {
              const prestadorName = file.replace('.json', '');
              // Evitar duplicados con Supabase
              const alreadyInSupabase = results.some(
                r => r.source === 'supabase' &&
                  r.prestador?.toLowerCase() === prestadorName.toLowerCase() &&
                  r.month === monthDir.name
              );
              if (!alreadyInSupabase) {
                results.push({
                  id: fsIndex++,
                  numero: '',
                  prestador: prestadorName,
                  nit: '',
                  month: monthDir.name,
                  fecha: '',
                  source: 'filesystem',
                  fsPath: `/informes/${monthDir.name}/${file}`,
                });
              }
            }
          }
        } catch {}
      }
    }
  } catch {}

  return NextResponse.json(results);
}
