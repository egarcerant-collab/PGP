import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';

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
    const db = createSupabaseAdminClient();
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';

    let query = db.from('informes').select('*').order('numero', { ascending: false });

    // Superadmin/admin ven todos — auditor solo ve los suyos
    if (!isAdmin) {
      if (currentUser?.nombre) {
        query = query.ilike('responsable', `%${currentUser.nombre.trim()}%`);
      } else {
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

// POST /api/informes  — guarda o actualiza un informe (upsert por prestador+periodo+contrato)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = createSupabaseAdminClient();

    const prestador = body.prestador || '';
    const periodo   = body.periodo   || '';
    const contrato  = body.contrato  || '';

    // Verificar duplicado por prestador + periodo + contrato
    const { data: dup } = await db
      .from('informes')
      .select('numero, id')
      .eq('prestador', prestador)
      .eq('periodo', periodo)
      .eq('contrato', contrato)
      .maybeSingle();

    const base = {
      prestador,
      nit:           body.nit          || '',
      contrato,
      municipio:     body.municipio    || '',
      departamento:  body.departamento || '',
      periodo,
      tipo_periodo:  body.tipoPeriodo  || '',
      nt_periodo:    body.ntPeriodo    || 0,
      total_ejecutado: body.totalEjecutado || 0,
      descontar:     body.descontar    || 0,
      reconocer:     body.reconocer    || 0,
      valor_final:   body.valorFinal   || 0,
      total_anticipos: body.totalAnticipos || 0,
      responsable:   body.responsable  || '',
      pdf_data:      body.pdfData      || {},
    };

    if (dup) {
      // Actualizar registro existente
      const { error } = await db
        .from('informes')
        .update({ ...base, fecha: new Date().toISOString().slice(0, 10) })
        .eq('numero', dup.numero);
      if (error) throw error;
      return NextResponse.json({ success: true, numero: dup.numero, updated: true });
    }

    // Insertar nuevo con número secuencial
    const { data: existing } = await db
      .from('informes')
      .select('numero')
      .order('numero', { ascending: true });

    const used = new Set((existing || []).map(r => parseInt(r.numero, 10) || 0));
    let nuevoNumero = 1;
    while (used.has(nuevoNumero)) nuevoNumero++;
    const numeroFormateado = String(nuevoNumero).padStart(3, '0');

    const { data, error } = await db
      .from('informes')
      .insert([{ ...base, numero: numeroFormateado, fecha: new Date().toISOString().slice(0, 10) }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, numero: numeroFormateado, informe: data });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

// PATCH /api/informes  — actualiza notas y/o campos básicos de un informe existente
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { numero, notaEjecucionFinanciera, notaAdicional, updateFields } = body;
    if (!numero) return NextResponse.json({ message: 'Falta número' }, { status: 400 });

    const db = createSupabaseAdminClient();

    if (updateFields) {
      const fields: Record<string, any> = {};
      if (body.prestador  !== undefined) fields.prestador    = body.prestador;
      if (body.periodo    !== undefined) fields.periodo      = body.periodo;
      if (body.tipoPeriodo!== undefined) fields.tipo_periodo = body.tipoPeriodo;
      if (body.valorFinal !== undefined) fields.valor_final  = body.valorFinal;
      if (body.nit        !== undefined) fields.nit          = body.nit;
      if (body.contrato   !== undefined) fields.contrato     = body.contrato;
      if (body.responsable!== undefined) fields.responsable  = body.responsable;
      if (body.fecha      !== undefined) fields.fecha        = body.fecha;

      // supervisorName y showSupervisor viven dentro de pdf_data — merge sin sobreescribir otros campos
      if (body.supervisorName !== undefined || body.showSupervisor !== undefined) {
        const { data: existing } = await db.from('informes').select('pdf_data').eq('numero', numero).maybeSingle();
        fields.pdf_data = {
          ...(existing?.pdf_data || {}),
          ...(body.supervisorName !== undefined ? { supervisorName: body.supervisorName } : {}),
          ...(body.showSupervisor !== undefined ? { showSupervisor: body.showSupervisor } : {}),
        };
      }

      const { error } = await db.from('informes').update(fields).eq('numero', numero);
      if (error) throw error;
    } else {
      const { data: existing } = await db.from('informes').select('pdf_data').eq('numero', numero).maybeSingle();
      const pdfData = { ...(existing?.pdf_data || {}), notaEjecucionFinanciera: notaEjecucionFinanciera || '', notaAdicional: notaAdicional || '' };
      const { error } = await db.from('informes').update({ pdf_data: pdfData }).eq('numero', numero);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
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

    const db = createSupabaseAdminClient();
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';

    if (!isAdmin && currentUser?.nombre) {
      const { data: informe } = await db
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

    const { error } = await db.from('informes').delete().eq('numero', numero);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
