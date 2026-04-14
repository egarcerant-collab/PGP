import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import fs from 'fs/promises';
import path from 'path';

const supabase = createClient(
  'https://fvrgfqxohacipmnmqyef.supabase.co',
  'sb_publishable_ezUmThavYstyax693c7ZmA_jda4yXNA'
);

async function getCurrentUser() {
  try {
    const serverClient = await createSupabaseServerClient();
    const { data: { user } } = await serverClient.auth.getUser();
    if (!user) return null;
    const { data: profile } = await serverClient
      .from('profiles')
      .select('nombre, rol')
      .eq('id', user.id)
      .single();
    return { id: user.id, nombre: profile?.nombre || '', rol: profile?.rol || 'auditor' };
  } catch {
    return null;
  }
}

export async function GET() {
  const results: any[] = [];

  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';

  // 1. Leer de Supabase
  try {
    const { data } = await supabase
      .from('auditorias')
      .select('id, numero, prestador, nit, mes, created_at, datos')
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      data.forEach(r => {
        const auditorId = (r.datos as any)?.auditor_id;
        const auditorNombre = (r.datos as any)?.auditor_nombre || '';

        // Filtrar: admin ve todo, auditor solo sus propias
        // Auditorías sin auditor_id (antiguas) las ven todos los admins
        if (!isAdmin) {
          // Si tiene dueño asignado, solo el dueño puede verla
          if (auditorId && currentUser?.id && auditorId !== currentUser.id) return;
          // Si no tiene dueño (auditoría antigua), solo admins la ven
          if (!auditorId && currentUser) return;
        }

        results.push({
          id: r.id,
          numero: r.numero || '',
          prestador: r.prestador,
          nit: r.nit || '',
          month: r.mes,
          fecha: r.created_at ? r.created_at.slice(0, 10) : '',
          source: 'supabase',
          auditorNombre,
        });
      });
    }
  } catch (e) {
    console.warn('Supabase list error:', e);
  }

  // 2. Leer del filesystem (solo admins ven archivos del sistema)
  if (isAdmin) {
    try {
      const rootDir = process.cwd();
      const reportsDir = path.join(rootDir, 'public', 'informes');
      await fs.access(reportsDir);
      const monthDirs = await fs.readdir(reportsDir, { withFileTypes: true });
      let fsIndex = 90000;
      for (const monthDir of monthDirs) {
        if (monthDir.isDirectory()) {
          const monthPath = path.join(reportsDir, monthDir.name);
          try {
            const files = await fs.readdir(monthPath);
            for (const file of files) {
              if (file.endsWith('.json')) {
                const prestadorName = file.replace('.json', '');
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
  }

  return NextResponse.json(results);
}
