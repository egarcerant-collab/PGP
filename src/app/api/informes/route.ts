import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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

// GET /api/informes  — lista informes (filtrado por usuario si no es admin)
export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';

    let query = supabase.from('informes').select('*').order('numero', { ascending: false });

    // Superadmin/admin ven todos — auditor solo ve los suyos
    if (!isAdmin) {
      if (currentUser?.nombre) {
        // Coincidencia parcial para tolerar variaciones de capitalización
        query = query.ilike('responsable', `%${currentUser.nombre.trim()}%`);
      } else {
        // Sin usuario identificado: no mostrar nada
        query = query.eq('numero', '__none__');
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    const lastNumber = data.length > 0
      ? Math.max(...data.map(r => parseInt(r.numero, 10) || 0))
      : 0;

    const informes = data.map(r => ({
      numero: r.numero,
      prestador: r.prestador,
      nit: r.nit,
      contrato: r.contrato,
      municipio: r.municipio,
      departamento: r.departamento,
      periodo: r.periodo,
      tipoPeriodo: r.tipo_periodo,
      fecha: r.fecha,
      ntPeriodo: r.nt_periodo,
      totalEjecutado: r.total_ejecutado,
      descontar: r.descontar,
      reconocer: r.reconocer,
      valorFinal: r.valor_final,
      totalAnticipos: r.total_anticipos,
      responsable: r.responsable,
      pdfData: r.pdf_data || null,
    }));

    return NextResponse.json({ lastNumber, informes });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

// POST /api/informes  — guarda un nuevo informe y devuelve el número asignado
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { data: existing, error: fetchError } = await supabase
      .from('informes')
      .select('numero')
      .order('numero', { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    const lastNumber = existing && existing.length > 0
      ? parseInt(existing[0].numero, 10) || 0
      : 0;
    const nuevoNumero = lastNumber + 1;
    const numeroFormateado = String(nuevoNumero).padStart(3, '0');

    const base = {
      numero: numeroFormateado,
      prestador: body.prestador || '',
      nit: body.nit || '',
      contrato: body.contrato || '',
      municipio: body.municipio || '',
      departamento: body.departamento || '',
      periodo: body.periodo || '',
      tipo_periodo: body.tipoPeriodo || '',
      fecha: new Date().toISOString().slice(0, 10),
      nt_periodo: body.ntPeriodo || 0,
      total_ejecutado: body.totalEjecutado || 0,
      descontar: body.descontar || 0,
      reconocer: body.reconocer || 0,
      valor_final: body.valorFinal || 0,
      total_anticipos: body.totalAnticipos || 0,
      responsable: body.responsable || '',
    };

    // Intenta con pdf_data; si la columna no existe aún, guarda sin ella
    let result = await supabase.from('informes').insert([{ ...base, pdf_data: body.pdfData || {} }]).select().single();
    if (result.error && result.error.message?.includes('pdf_data')) {
      result = await supabase.from('informes').insert([base]).select().single();
    }
    const { data, error } = result;
    if (error) throw error;

    return NextResponse.json({ success: true, numero: numeroFormateado, informe: data });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

// DELETE /api/informes?numero=001  — elimina un informe por número
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const numero = searchParams.get('numero');
    if (!numero) return NextResponse.json({ message: 'Falta número' }, { status: 400 });

    // Verificar propiedad (solo admin o el dueño puede eliminar)
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';

    if (!isAdmin && currentUser?.nombre) {
      const { data: informe } = await supabase
        .from('informes')
        .select('responsable')
        .eq('numero', numero)
        .maybeSingle();
      const owner = informe?.responsable?.toLowerCase() || '';
      const me = currentUser.nombre.toLowerCase();
      if (owner && owner !== me) {
        return NextResponse.json({ message: 'No tienes permiso para eliminar este informe.' }, { status: 403 });
      }
    }

    const { error } = await supabase
      .from('informes')
      .delete()
      .eq('numero', numero);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
