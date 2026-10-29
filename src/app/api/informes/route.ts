import { NextResponse } from 'next/server';
import { getDrive, readJson, writeJson, ROOT_FOLDER_ID } from '@/lib/gdrive';
import { getCurrentUser } from '@/lib/get-current-user';
import { actualizarGlosa } from '@/lib/glosa';

type Informe = Record<string, any>;

/** Deriva el tipo de período a partir del campo período (contando meses separados por guion) */
function inferTipoPeriodo(periodo: string): string {
  const dashes = (periodo.match(/-/g) || []).length;
  if (dashes >= 2) return 'TRIMESTRAL';
  if (dashes === 1) return 'BIMENSUAL';
  return 'MENSUAL';
}

async function loadInformes(drive: any): Promise<Informe[]> {
  return (await readJson<Informe[]>(drive, ROOT_FOLDER_ID, 'informes.json')) ?? [];
}

// GET /api/informes
export async function GET(request: Request) {
  try {
    const drive = getDrive();
    const currentUser = await getCurrentUser(request);
    const isAdmin = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';
    let data = await loadInformes(drive);

    if (!isAdmin) {
      if (currentUser?.rol === 'prestador') {
        // Filtrar por NIT y por nombre exacto del prestador para separar sedes con mismo NIT
        const nitUser = currentUser.id.replace(/\D/g, '');
        const nombreUser = currentUser.nombre?.trim().toLowerCase() ?? '';
        data = data.filter(r => {
          if (!r.nit || r.nit.replace(/\D/g, '') !== nitUser) return false;
          if (!nombreUser) return true;
          const nombreInforme = (r.prestador ?? '').trim().toLowerCase();
          return nombreInforme === nombreUser || nombreInforme.includes(nombreUser) || nombreUser.includes(nombreInforme);
        });
      } else if (currentUser?.nombre) {
        const me = currentUser.nombre.trim().toLowerCase();
        data = data.filter(r => r.responsable?.toLowerCase().includes(me));
      } else {
        data = [];
      }
    }

    data = [...data].sort((a, b) => (parseInt(b.numero, 10) || 0) - (parseInt(a.numero, 10) || 0));
    const lastNumber = data.length > 0 ? Math.max(...data.map(r => parseInt(r.numero, 10) || 0)) : 0;

    const informes = data.map(r => ({
      numero: r.numero,
      prestador: r.prestador,
      nit: r.nit,
      contrato: r.contrato,
      municipio: r.municipio,
      departamento: r.departamento,
      periodo: r.periodo,
      tipoPeriodo: inferTipoPeriodo(r.periodo || ''),
      fecha: r.fecha,
      ntPeriodo: r.nt_periodo,
      totalEjecutado: r.total_ejecutado,
      descontar: r.descontar,
      reconocer: r.reconocer,
      valorFinal: r.valor_final,
      totalAnticipos: r.total_anticipos,
      responsable: r.responsable,
      pdfData: r.pdf_data || null,
      actaUrl: r.acta_url || null,
      actaDriveId: r.acta_drive_id || null,
      actaFirmadaUrl: r.acta_firmada_url || null,
      actaFirmadaDriveId: r.acta_firmada_drive_id || null,
      notaPrestador: r.nota_prestador || null,
      estadoPrestador: r.estado_prestador || null,
      notaPrestadorFecha: r.nota_prestador_fecha || null,
      comentariosGlosa: r.comentariosGlosa || null,
    }));

    return NextResponse.json({ lastNumber, informes });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

// POST /api/informes
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const drive = getDrive();
    const informes = await loadInformes(drive);

    const prestador = body.prestador || '';
    const periodo   = body.periodo   || '';
    const contrato  = body.contrato  || '';

    const dupIdx = informes.findIndex(r =>
      r.prestador === prestador && r.periodo === periodo && r.contrato === contrato
    );

    const base: Informe = {
      prestador,
      nit:            body.nit          || '',
      contrato,
      municipio:      body.municipio    || '',
      departamento:   body.departamento || '',
      periodo,
      tipo_periodo:   inferTipoPeriodo(periodo),
      nt_periodo:     body.ntPeriodo    || 0,
      total_ejecutado: body.totalEjecutado || 0,
      descontar:      body.descontar    || 0,
      reconocer:      body.reconocer    || 0,
      valor_final:    body.valorFinal   || 0,
      total_anticipos: body.totalAnticipos || 0,
      responsable:    body.responsable  || '',
      pdf_data:       body.pdfData ? { ...body.pdfData, ...(body.pdfData.ajustesGlosa ? { glosaActualizadaEn: new Date().toISOString() } : {}) } : {},
    };

    // Si se especifica un número explícito (restauración), úsalo aunque no coincida por prestador+periodo
    if (body.numero) {
      const numIdx = informes.findIndex(r => r.numero === body.numero);
      const entry = { ...base, numero: body.numero, fecha: body.fecha || new Date().toISOString().slice(0, 10) };
      if (numIdx !== -1) {
        informes[numIdx] = entry;
      } else {
        informes.push(entry);
      }
      await writeJson(drive, ROOT_FOLDER_ID, 'informes.json', informes);
      return NextResponse.json({ success: true, numero: body.numero, updated: numIdx !== -1 });
    }

    if (dupIdx !== -1) {
      informes[dupIdx] = { ...informes[dupIdx], ...base, fecha: new Date().toISOString().slice(0, 10) };
      await writeJson(drive, ROOT_FOLDER_ID, 'informes.json', informes);
      return NextResponse.json({ success: true, numero: informes[dupIdx].numero, updated: true });
    }

    // Nuevo número secuencial (rellena huecos)
    const used = new Set(informes.map(r => parseInt(r.numero, 10) || 0));
    let n = 1;
    while (used.has(n)) n++;
    const numero = String(n).padStart(3, '0');

    informes.push({ ...base, numero, fecha: new Date().toISOString().slice(0, 10) });
    await writeJson(drive, ROOT_FOLDER_ID, 'informes.json', informes);

    return NextResponse.json({ success: true, numero, informe: base });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

// PATCH /api/informes
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { numero, notaEjecucionFinanciera, notaAdicional, updateFields } = body;
    if (body.glosaAuditoria !== undefined &&
        (typeof body.glosaAuditoria !== 'number' || !Number.isFinite(body.glosaAuditoria) || body.glosaAuditoria < 0)) {
      return NextResponse.json({ message: 'Glosa inválida' }, { status: 400 });
    }
    if (!numero) return NextResponse.json({ message: 'Falta número' }, { status: 400 });

    const drive = getDrive();
    const informes = await loadInformes(drive);
    const idx = informes.findIndex(r => r.numero === numero);
    if (idx === -1) return NextResponse.json({ message: 'No encontrado' }, { status: 404 });

    if (updateFields) {
      const f: Record<string, any> = {};
      if (body.prestador      !== undefined) f.prestador       = body.prestador;
      if (body.periodo        !== undefined) {
        f.periodo     = body.periodo;
        f.tipo_periodo = inferTipoPeriodo(body.periodo);
      } else if (body.tipoPeriodo !== undefined) {
        // solo si no vino periodo (para no sobrescribir la inferencia)
        f.tipo_periodo = body.tipoPeriodo;
      }
      if (body.totalEjecutado !== undefined) f.total_ejecutado = body.totalEjecutado;
      if (body.reconocer      !== undefined) f.reconocer       = body.reconocer;
      if (body.valorFinal     !== undefined) f.valor_final     = body.valorFinal;
      if (body.descontar      !== undefined) {
        f.descontar = body.descontar;
        const ntP = informes[idx].nt_periodo ?? 0;
        const rec = (body.reconocer !== undefined ? body.reconocer : informes[idx].reconocer) ?? 0;
        f.valor_final = ntP - body.descontar + rec;
      }
      if (body.comentariosGlosa !== undefined) f.comentariosGlosa = body.comentariosGlosa;
      if (body.nit            !== undefined) f.nit             = body.nit;
      if (body.contrato       !== undefined) f.contrato        = body.contrato;
      if (body.responsable    !== undefined) f.responsable     = body.responsable;
      if (body.fecha          !== undefined) f.fecha           = body.fecha;

      // pdfDataOverride: reemplaza campos específicos dentro de pdf_data
      const pdfPatch: Record<string, any> = {};
      if (body.supervisorName             !== undefined) pdfPatch.supervisorName             = body.supervisorName;
      if (body.showSupervisor             !== undefined) pdfPatch.showSupervisor             = body.showSupervisor;
      if (body.valorCupsInesperadas       !== undefined) pdfPatch.valorCupsInesperadas       = body.valorCupsInesperadas;
      if (body.cantidadCupsInesperadas    !== undefined) pdfPatch.cantidadCupsInesperadas    = body.cantidadCupsInesperadas;
      if (body.totalEjecutadoFinal        !== undefined) pdfPatch.totalEjecutadoFinal        = body.totalEjecutadoFinal;
      if (body.notaEjecucionFinanciera    !== undefined) pdfPatch.notaEjecucionFinanciera    = body.notaEjecucionFinanciera;
      if (body.notaAdicional              !== undefined) pdfPatch.notaAdicional              = body.notaAdicional;
      if (body.pdfDataOverride            !== undefined) Object.assign(pdfPatch, body.pdfDataOverride);
      if (Object.keys(pdfPatch).length > 0) {
        f.pdf_data = { ...(informes[idx].pdf_data || {}), ...pdfPatch };
      }

      informes[idx] = { ...informes[idx], ...f };
      if (body.glosaAuditoria !== undefined) {
        informes[idx] = { ...informes[idx], ...actualizarGlosa(informes[idx], body.glosaAuditoria) };
      }
    } else {
      informes[idx] = {
        ...informes[idx],
        pdf_data: {
          ...(informes[idx].pdf_data || {}),
          notaEjecucionFinanciera: notaEjecucionFinanciera || '',
          notaAdicional: notaAdicional || '',
        },
      };
    }

    await writeJson(drive, ROOT_FOLDER_ID, 'informes.json', informes);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

// DELETE /api/informes?numero=001
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const numero = searchParams.get('numero');
    if (!numero) return NextResponse.json({ message: 'Falta número' }, { status: 400 });

    const drive = getDrive();
    const currentUser = await getCurrentUser(request);
    const isAdmin = currentUser?.rol === 'superadmin' || currentUser?.rol === 'admin';
    let informes = await loadInformes(drive);

    if (!isAdmin && currentUser?.nombre) {
      const informe = informes.find(r => r.numero === numero);
      if (informe) {
        const owner = informe.responsable?.toLowerCase() || '';
        const me    = currentUser.nombre.toLowerCase();
        if (owner && owner !== me) {
          return NextResponse.json({ message: 'No tienes permiso para eliminar este informe.' }, { status: 403 });
        }
      }
    }

    informes = informes.filter(r => r.numero !== numero);
    await writeJson(drive, ROOT_FOLDER_ID, 'informes.json', informes);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
