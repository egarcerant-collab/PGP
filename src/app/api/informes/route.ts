import { NextResponse } from 'next/server';
import { getDrive, readJson, writeJson, ROOT_FOLDER_ID } from '@/lib/gdrive';
import { getCurrentUser } from '@/lib/get-current-user';

type Informe = Record<string, any>;

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
      if (currentUser?.nombre) {
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
      tipo_periodo:   body.tipoPeriodo  || '',
      nt_periodo:     body.ntPeriodo    || 0,
      total_ejecutado: body.totalEjecutado || 0,
      descontar:      body.descontar    || 0,
      reconocer:      body.reconocer    || 0,
      valor_final:    body.valorFinal   || 0,
      total_anticipos: body.totalAnticipos || 0,
      responsable:    body.responsable  || '',
      pdf_data:       body.pdfData      || {},
    };

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
    if (!numero) return NextResponse.json({ message: 'Falta número' }, { status: 400 });

    const drive = getDrive();
    const informes = await loadInformes(drive);
    const idx = informes.findIndex(r => r.numero === numero);
    if (idx === -1) return NextResponse.json({ message: 'No encontrado' }, { status: 404 });

    if (updateFields) {
      const f: Record<string, any> = {};
      if (body.prestador      !== undefined) f.prestador       = body.prestador;
      if (body.periodo        !== undefined) f.periodo         = body.periodo;
      if (body.tipoPeriodo    !== undefined) f.tipo_periodo    = body.tipoPeriodo;
      if (body.totalEjecutado !== undefined) f.total_ejecutado = body.totalEjecutado;
      if (body.valorFinal     !== undefined) f.valor_final     = body.valorFinal;
      if (body.descontar      !== undefined) f.descontar       = body.descontar;
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
