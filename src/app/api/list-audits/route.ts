import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getDrive, readJson, ROOT_FOLDER_ID } from '@/lib/gdrive';

async function getCurrentUser() {
  if (process.env.NEXT_PUBLIC_LOCAL_BYPASS === 'true') {
    return { id: 'local', nombre: 'Eduardo Garcerant', rol: 'superadmin' };
  }
  try {
    const sc = await createSupabaseServerClient();
    const { data: { user } } = await sc.auth.getUser();
    if (!user) return null;
    const { data: profile } = await sc.from('profiles').select('nombre, rol').eq('id', user.id).single();
    return { id: user.id, nombre: profile?.nombre || '', rol: profile?.rol || 'auditor' };
  } catch { return null; }
}

export async function GET() {
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';

  try {
    const drive = getDrive();
    const index: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'auditorias_index.json')) ?? [];

    let filtered = index;
    if (!isAdmin) {
      if (!currentUser?.id) return NextResponse.json([]);
      filtered = index.filter(r => r.auditor_id === currentUser.id);
    }

    const results = filtered
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(r => ({
        id:           r.id,
        numero:       r.numero || '',
        prestador:    r.prestador,
        nit:          r.nit || '',
        month:        r.mes,
        fecha:        r.created_at ? r.created_at.slice(0, 10) : '',
        source:       'drive',
        auditorNombre: r.auditor_nombre || '',
      }));

    return NextResponse.json(results);
  } catch (e) {
    console.warn('Drive list-audits error:', e);
    return NextResponse.json([]);
  }
}
