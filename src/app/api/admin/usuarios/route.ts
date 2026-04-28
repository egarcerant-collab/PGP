import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Helper to check if requester is superadmin
async function checkSuperAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single();
  if (profile?.rol !== 'superadmin') return null;
  return user;
}

export async function GET() {
  const user = await checkSuperAdmin();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ usuarios: data });
}

export async function POST(request: Request) {
  const user = await checkSuperAdmin();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { email, password, nombre, rol } = await request.json();
  if (!email || !password || !nombre || !rol) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // Create auth user
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });

  // Create profile
  const { error: profileError } = await admin.from('profiles').insert({
    id: newUser.user.id,
    email,
    nombre,
    rol,
    activo: true,
  });

  if (profileError) {
    // Rollback: delete the auth user if profile creation failed
    await admin.auth.admin.deleteUser(newUser.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PUT(request: Request) {
  const user = await checkSuperAdmin();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { id, nombre, rol, activo } = await request.json();
  if (!id) return NextResponse.json({ error: 'Falta ID' }, { status: 400 });

  const admin = createSupabaseAdminClient();

  const updateData: Record<string, unknown> = {};
  if (nombre !== undefined) updateData.nombre = nombre;
  if (rol !== undefined) updateData.rol = rol;
  if (activo !== undefined) updateData.activo = activo;

  const { error } = await admin.from('profiles').update(updateData).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const user = await checkSuperAdmin();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta ID' }, { status: 400 });

  // Prevent self-deletion
  if (id === user.id) {
    return NextResponse.json({ error: 'No puedes eliminarte a ti mismo' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // Delete from auth (cascades to profiles via FK)
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
