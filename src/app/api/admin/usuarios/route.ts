import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const USER_MANAGEMENT_PASSWORD = process.env.USER_MANAGEMENT_PASSWORD || '';

function hasPasswordAccess(request: Request) {
  const password = request.headers.get('x-user-management-password');
  return Boolean(USER_MANAGEMENT_PASSWORD) && password === USER_MANAGEMENT_PASSWORD;
}

async function checkSuperAdmin(request: Request) {
  if (hasPasswordAccess(request)) return { id: '__password_access__' };

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

function hasServiceRole() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';
  return Boolean(key) && key !== 'REEMPLAZAR_CON_SERVICE_ROLE_KEY';
}

const missingAdminKeyError = 'Falta configurar la clave privada de Supabase en Vercel para administrar usuarios de Supabase Auth.';

export async function GET(request: Request) {
  const user = await checkSuperAdmin(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  if (!hasServiceRole()) return NextResponse.json({ error: missingAdminKeyError }, { status: 500 });

  const admin = createSupabaseAdminClient();
  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const { data: authData, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });

  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const usuarios = (authData.users || []).map((authUser) => {
    const profile = profilesById.get(authUser.id);
    return {
      id: authUser.id,
      email: profile?.email || authUser.email || '',
      nombre: profile?.nombre || authUser.user_metadata?.nombre || authUser.email || 'Sin nombre',
      rol: profile?.rol || 'auditor',
      activo: profile?.activo ?? true,
      created_at: profile?.created_at || authUser.created_at,
      last_sign_in_at: authUser.last_sign_in_at || null,
      hasAuthUser: true,
    };
  });

  return NextResponse.json({ usuarios });
}

export async function POST(request: Request) {
  const user = await checkSuperAdmin(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  if (!hasServiceRole()) return NextResponse.json({ error: missingAdminKeyError }, { status: 500 });

  const { email, password, nombre, rol } = await request.json();
  if (!email || !password || !nombre || !rol) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  }
  if (String(password).length < 8) {
    return NextResponse.json({ error: 'La contrasena debe tener al menos 8 caracteres' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre },
  });

  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });

  const { error: profileError } = await admin.from('profiles').upsert({
    id: newUser.user.id,
    email,
    nombre,
    rol,
    activo: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(newUser.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PUT(request: Request) {
  const user = await checkSuperAdmin(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  if (!hasServiceRole()) return NextResponse.json({ error: missingAdminKeyError }, { status: 500 });

  const { id, nombre, rol, activo, password } = await request.json();
  if (!id) return NextResponse.json({ error: 'Falta ID' }, { status: 400 });

  const admin = createSupabaseAdminClient();

  if (password !== undefined && password !== '') {
    if (String(password).length < 8) {
      return NextResponse.json({ error: 'La contrasena debe tener al menos 8 caracteres' }, { status: 400 });
    }
    const { error: passwordError } = await admin.auth.admin.updateUserById(id, { password });
    if (passwordError) return NextResponse.json({ error: passwordError.message }, { status: 500 });
  }

  const updateData: Record<string, unknown> = {};
  if (nombre !== undefined) updateData.nombre = nombre;
  if (rol !== undefined) updateData.rol = rol;
  if (activo !== undefined) updateData.activo = activo;

  if (Object.keys(updateData).length > 0) {
    const { error } = await admin.from('profiles').update(updateData).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const user = await checkSuperAdmin(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  if (!hasServiceRole()) return NextResponse.json({ error: missingAdminKeyError }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta ID' }, { status: 400 });
  if (id === user.id) return NextResponse.json({ error: 'No puedes eliminarte a ti mismo' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
