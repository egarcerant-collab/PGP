import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ user: null, profile: null });

  // Intentar con cliente normal primero, si falla por RLS usar admin
  let profile = null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (!error) profile = data;
  } catch {}

  // Si no se pudo leer el perfil, intentar con admin (bypasea RLS)
  if (!profile) {
    try {
      const admin = createSupabaseAdminClient();
      const { data } = await admin
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      profile = data;
    } catch {}
  }

  return NextResponse.json({ user, profile });
}
