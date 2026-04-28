import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const supabase = createClient(
  'https://fvrgfqxohacipmnmqyef.supabase.co',
  'sb_publishable_ezUmThavYstyax693c7ZmA_jda4yXNA'
);

const MONTH_TO_TRIMESTER: Record<string, number> = {
  ENERO: 1,
  FEBRERO: 1,
  MARZO: 1,
  ABRIL: 2,
  MAYO: 2,
  JUNIO: 2,
  JULIO: 3,
  AGOSTO: 3,
  SEPTIEMBRE: 3,
  OCTUBRE: 4,
  NOVIEMBRE: 4,
  DICIEMBRE: 4,
};

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function getTrimestreFromPeriodo(periodo: unknown) {
  const normalized = normalizeText(periodo);
  const explicit = normalized.match(/TRIMESTRE\s*([1-4])/);
  if (explicit) return Number(explicit[1]);

  const trimestres = normalized
    .split(/[^A-Z]+/)
    .map((part) => MONTH_TO_TRIMESTER[part])
    .filter(Boolean);

  const unique = [...new Set(trimestres)];
  return unique.length === 1 ? unique[0] : null;
}

function normalizeInformePeriodo(periodo: unknown, tipoPeriodo: unknown) {
  const trimestre = getTrimestreFromPeriodo(periodo);
  const tipo = normalizeText(tipoPeriodo);
  const shouldUseTrimestre = tipo.includes('TRIMESTR') || normalizeText(periodo).includes('TRIMESTRE');
  return shouldUseTrimestre && trimestre ? `Trimestre ${trimestre}` : String(periodo || '');
}

function sameInformeOwner(
  a: { prestador?: unknown; nit?: unknown },
  b: { prestador?: unknown; nit?: unknown }
) {
  const aNit = normalizeText(a.nit);
  const bNit = normalizeText(b.nit);
  const aPrestador = normalizeText(a.prestador);
  const bPrestador = normalizeText(b.prestador);

  if (aNit && bNit && aNit === bNit) return true;
  return Boolean(aPrestador && bPrestador && aPrestador === bPrestador);
}

function duplicateKey(informe: { prestador?: unknown; nit?: unknown; periodo?: unknown; tipo_periodo?: unknown }) {
  const tipo = normalizeText(informe.tipo_periodo);
  const periodo = normalizeText(normalizeInformePeriodo(informe.periodo, informe.tipo_periodo));
  return `${tipo}|${periodo}`;
}

function noteSourceLabel(row: any) {
  const numero = row?.numero ? `Informe ${row.numero}` : 'Informe previo';
  const periodo = row?.periodo ? ` - ${normalizeInformePeriodo(row.periodo, row.tipo_periodo)}` : '';
  return `${numero}${periodo}`;
}

function mergeNotes(
  existing: any[],
  periodoNormalizado: string,
  field: 'notaEjecucionFinanciera' | 'notaAdicional',
  newText: unknown
) {
  const periodoTrimestre = getTrimestreFromPeriodo(periodoNormalizado);
  const blocks = (existing || [])
    .filter((row) => {
      const rowPeriod = normalizeInformePeriodo(row.periodo, row.tipo_periodo);
      if (!periodoTrimestre) return normalizeText(rowPeriod) === normalizeText(periodoNormalizado);
      return getTrimestreFromPeriodo(rowPeriod) === periodoTrimestre;
    })
    .sort((a, b) => {
      const pa = normalizeText(normalizeInformePeriodo(a.periodo, a.tipo_periodo));
      const pb = normalizeText(normalizeInformePeriodo(b.periodo, b.tipo_periodo));
      return pa.localeCompare(pb) || String(a.numero || '').localeCompare(String(b.numero || ''));
    })
    .map((row) => ({
      label: noteSourceLabel(row),
      text: String(row.pdf_data?.[field] || '').trim(),
    }))
    .filter((item) => item.text);

  const cleanNew = String(newText || '').trim();
  if (cleanNew) blocks.push({ label: 'Nota nueva', text: cleanNew });

  const seen = new Set<string>();
  return blocks
    .filter((item) => {
      const key = normalizeText(item.text);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => `${item.label}: ${item.text}`)
    .join('\n\n');
}

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
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';

    let query = supabase.from('informes').select('*').order('numero', { ascending: false });

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
    })).map((informe) => ({
      ...informe,
      periodo: normalizeInformePeriodo(informe.periodo, informe.tipoPeriodo),
    }));

    return NextResponse.json({ lastNumber, informes });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { data: existing, error: fetchError } = await supabase
      .from('informes')
      .select('numero, prestador, nit, periodo, tipo_periodo, pdf_data')
      .order('numero', { ascending: true });

    if (fetchError) throw fetchError;

    const periodoNormalizado = normalizeInformePeriodo(body.periodo, body.tipoPeriodo);
    const candidateKey = duplicateKey({
      prestador: body.prestador,
      nit: body.nit,
      periodo: periodoNormalizado,
      tipo_periodo: body.tipoPeriodo,
    });
    const duplicate = (existing || []).find((row) => sameInformeOwner(row, body) && duplicateKey(row) === candidateKey);
    if (duplicate) {
      return NextResponse.json(
        {
          message: `Ya existe un informe combinado para ${body.prestador || 'este prestador'} en ${periodoNormalizado}. No se puede guardar dos veces.`,
        },
        { status: 409 }
      );
    }

    const used = new Set((existing || []).map(r => parseInt(r.numero, 10) || 0));
    let nuevoNumero = 1;
    while (used.has(nuevoNumero)) nuevoNumero++;
    const numeroFormateado = String(nuevoNumero).padStart(3, '0');

    const relatedSameOwner = (existing || []).filter((row) => sameInformeOwner(row, body));
    const incomingPdfData = body.pdfData || {};
    const pdfData = {
      ...incomingPdfData,
      notaEjecucionFinanciera: mergeNotes(
        relatedSameOwner,
        periodoNormalizado,
        'notaEjecucionFinanciera',
        incomingPdfData.notaEjecucionFinanciera
      ),
      notaAdicional: mergeNotes(
        relatedSameOwner,
        periodoNormalizado,
        'notaAdicional',
        incomingPdfData.notaAdicional
      ),
    };

    const base = {
      numero: numeroFormateado,
      prestador: body.prestador || '',
      nit: body.nit || '',
      contrato: body.contrato || '',
      municipio: body.municipio || '',
      departamento: body.departamento || '',
      periodo: periodoNormalizado,
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

    let result = await supabase.from('informes').insert([{ ...base, pdf_data: pdfData }]).select().single();
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

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { numero, notaEjecucionFinanciera, notaAdicional, updateFields } = body;
    if (!numero) return NextResponse.json({ message: 'Falta número' }, { status: 400 });

    if (updateFields) {
      const fields: Record<string, any> = {};
      if (body.prestador  !== undefined) fields.prestador   = body.prestador;
      if (body.periodo    !== undefined) fields.periodo     = body.periodo;
      if (body.tipoPeriodo!== undefined) fields.tipo_periodo= body.tipoPeriodo;
      if (body.valorFinal !== undefined) fields.valor_final = body.valorFinal;
      if (body.nit        !== undefined) fields.nit         = body.nit;
      if (body.contrato   !== undefined) fields.contrato    = body.contrato;
      if (body.responsable!== undefined) fields.responsable = body.responsable;
      if (body.fecha      !== undefined) fields.fecha       = body.fecha;

      const { data: current, error: currentError } = await supabase
        .from('informes')
        .select('numero, prestador, nit, periodo, tipo_periodo')
        .eq('numero', numero)
        .maybeSingle();
      if (currentError) throw currentError;

      const candidate = {
        ...(current || {}),
        prestador: fields.prestador ?? current?.prestador,
        nit: fields.nit ?? current?.nit,
        periodo: fields.periodo ?? current?.periodo,
        tipo_periodo: fields.tipo_periodo ?? current?.tipo_periodo,
      };
      candidate.periodo = normalizeInformePeriodo(candidate.periodo, candidate.tipo_periodo);
      if (fields.periodo !== undefined || fields.tipo_periodo !== undefined) {
        fields.periodo = candidate.periodo;
      }

      const { data: allInformes, error: allError } = await supabase
        .from('informes')
        .select('numero, prestador, nit, periodo, tipo_periodo');
      if (allError) throw allError;

      const candidateKey = duplicateKey(candidate);
      const duplicate = (allInformes || []).find((row) => row.numero !== numero && sameInformeOwner(row, candidate) && duplicateKey(row) === candidateKey);
      if (duplicate) {
        return NextResponse.json(
          { message: `Ya existe un informe combinado para este prestador en ${candidate.periodo}.` },
          { status: 409 }
        );
      }

      const { error } = await supabase.from('informes').update(fields).eq('numero', numero);
      if (error) throw error;
    } else {
      const { data: existing } = await supabase.from('informes').select('pdf_data').eq('numero', numero).maybeSingle();
      const pdfData = { ...(existing?.pdf_data || {}), notaEjecucionFinanciera: notaEjecucionFinanciera || '', notaAdicional: notaAdicional || '' };
      const { error } = await supabase.from('informes').update({ pdf_data: pdfData }).eq('numero', numero);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const numero = searchParams.get('numero');
    if (!numero) return NextResponse.json({ message: 'Falta número' }, { status: 400 });

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
