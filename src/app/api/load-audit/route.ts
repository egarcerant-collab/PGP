import { NextResponse } from 'next/server';
import { getDrive, readJson, writeJson, getSubfolder, ROOT_FOLDER_ID } from '@/lib/gdrive';

const MESES: Record<string, string> = {
  ENERO:'1', FEBRERO:'2', MARZO:'3', ABRIL:'4', MAYO:'5', JUNIO:'6',
  JULIO:'7', AGOSTO:'8', SEPTIEMBRE:'9', OCTUBRE:'10', NOVIEMBRE:'11', DICIEMBRE:'12',
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ message: 'Falta id.' }, { status: 400 });

    const drive           = getDrive();
    const auditoriaFolder = await getSubfolder(drive, ROOT_FOLDER_ID, 'auditorias');
    const data            = await readJson(drive, auditoriaFolder, `${id}.json`);
    if (!data) return NextResponse.json({ message: 'No encontrado.' }, { status: 404 });

    const datosActuales = data.datos || {};

    // Buscar informe relacionado en informes.json
    let informeRelacionado: any = null;
    try {
      const informes: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'informes.json')) ?? [];
      const prestador  = (data.prestador || '').trim().toLowerCase();
      const mesNorm    = (data.mes || '').trim().toUpperCase();
      const mesesAudit = mesNorm.split('-').map((m: string) => m.trim());

      const candidatos = informes.filter((inf: any) => {
        const nameMatch = inf.prestador?.toLowerCase().includes(prestador);
        const partes    = (inf.periodo || '').toUpperCase().split('-').map((p: string) => p.trim());
        return nameMatch && (partes.join('-') === mesNorm || mesesAudit.some((m: string) => partes.includes(m)));
      });

      if (candidatos.length > 0) {
        const exacto   = candidatos.find(inf => inf.periodo.trim().toUpperCase() === mesNorm);
        const conNotas = candidatos.find(inf => inf.pdf_data?.notaEjecucionFinanciera || inf.pdf_data?.notaAdicional);
        const match    = exacto ?? conNotas ?? candidatos[0];

        if (match) {
          const notaEF                = match.pdf_data?.notaEjecucionFinanciera || '';
          const notaAd                = match.pdf_data?.notaAdicional || '';
          const valorCupsInesperadas  = match.pdf_data?.valorCupsInesperadas || 0;
          const cantidadCupsInesperadas = match.pdf_data?.cantidadCupsInesperadas || '';

          informeRelacionado = {
            numero:                 match.numero,
            contrato:               match.contrato,
            tipoPeriodo:            match.tipo_periodo,
            periodo:                match.periodo,
            ntPeriodo:              match.nt_periodo,
            responsable:            match.responsable,
            notaEjecucionFinanciera: notaEF,
            notaAdicional:          notaAd,
            valorCupsInesperadas,
            cantidadCupsInesperadas,
            totalEjecutadoGuardado: typeof match.total_ejecutado === 'number' ? match.total_ejecutado : 0,
          };

          // Auto-sync: copiar notas al datos si aún no las tiene (fire-and-forget)
          const yaConNotas = datosActuales.notasGuardadas?.notaEjecucionFinanciera
            || datosActuales.notasGuardadas?.notaAdicional;

          if (!yaConNotas && (notaEF || notaAd || valorCupsInesperadas)) {
            const datosMerged = {
              ...datosActuales,
              notasGuardadas: {
                notaEjecucionFinanciera: notaEF,
                notaAdicional:          notaAd,
                informeNum:             match.numero || '',
                valorCupsInesperadas,
                cantidadCupsInesperadas,
              },
              ...(!datosActuales.informeRestored ? {
                informeRestored: {
                  numero:                 match.numero,
                  contrato:               match.contrato,
                  tipoPeriodo:            match.tipo_periodo,
                  periodo:                match.periodo,
                  ntPeriodo:              match.nt_periodo,
                  responsable:            match.responsable,
                  notaEjecucionFinanciera: notaEF,
                  notaAdicional:          notaAd,
                  valorCupsInesperadas,
                  cantidadCupsInesperadas,
                },
              } : {}),
            };
            writeJson(drive, auditoriaFolder, `${id}.json`, { ...data, datos: datosMerged }).catch(() => {});
          }
        }
      }
    } catch { /* no bloquear carga */ }

    // Enriquecer executionData con totalRealValue desde el informe
    let auditDataFinal = datosActuales;
    try {
      if (informeRelacionado && datosActuales.executionData) {
        const mesKey   = MESES[(data.mes || '').toUpperCase().trim()] || '';
        const execEntry = datosActuales.executionData[mesKey];
        if (execEntry && (!execEntry.totalRealValue || execEntry.totalRealValue === 0)) {
          const informes: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'informes.json')) ?? [];
          const inf      = informes.find(r => r.numero === informeRelacionado.numero);
          const totalReal = inf?.pdf_data?.totalEjecutadoFinal || 0;
          if (totalReal > 0) {
            auditDataFinal = {
              ...datosActuales,
              executionData: {
                ...datosActuales.executionData,
                [mesKey]: { ...execEntry, totalRealValue: totalReal },
              },
            };
          }
        }
      }
    } catch { /* no bloquear */ }

    return NextResponse.json({
      auditData:         auditDataFinal,
      prestador:         data.prestador,
      mes:               data.mes,
      numero:            data.numero,
      informeRelacionado,
    });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
