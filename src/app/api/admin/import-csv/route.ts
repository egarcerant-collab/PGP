import { NextResponse } from 'next/server';
import { getDrive, readJson, writeJson, getSubfolder, ROOT_FOLDER_ID } from '@/lib/gdrive';
import { getCurrentUser } from '@/lib/get-current-user';
import crypto from 'crypto';

interface CsvInfome {
  id: string | number;
  numero: string;
  prestador: string;
  nit: string;
  contrato: string;
  municipio: string;
  departamento: string;
  periodo: string;
  tipo_periodo: string;
  fecha: string;
  nt_periodo: number;
  total_ejecutado: number;
  descontar: number;
  reconocer: number;
  valor_final: number;
  total_anticipos: number;
  responsable: string;
  created_at: string;
  pdf_data: Record<string, any>;
}

interface CsvAuditoria {
  id: string | number;
  numero: string;
  prestador: string;
  nit: string;
  mes: string;
  datos: Record<string, any>;
  created_at: string;
  auditor_id?: string;
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (user?.rol !== 'superadmin' && user?.rol !== 'admin') {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const body = await request.json();
  const informes: CsvInfome[]     = body.informes   ?? [];
  const auditorias: CsvAuditoria[] = body.auditorias ?? [];

  const drive = getDrive();
  const auditFolder = await getSubfolder(drive, ROOT_FOLDER_ID, 'auditorias');

  const result = {
    informes:   { importados: 0, omitidos: 0, errores: [] as string[] },
    auditorias: { importados: 0, omitidos: 0, errores: [] as string[] },
  };

  // ── Informes ────────────────────────────────────────────────────────────────
  if (informes.length > 0) {
    try {
      const driveInformes: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'informes.json')) ?? [];
      const existing = new Set(driveInformes.map(r => String(r.numero)));

      for (const inf of informes) {
        const num = String(inf.numero);
        if (existing.has(num)) { result.informes.omitidos++; continue; }
        driveInformes.push({
          numero:          num,
          prestador:       inf.prestador,
          nit:             String(inf.nit),
          contrato:        inf.contrato,
          municipio:       inf.municipio,
          departamento:    inf.departamento,
          periodo:         inf.periodo,
          tipo_periodo:    inf.tipo_periodo,
          nt_periodo:      Number(inf.nt_periodo),
          total_ejecutado: Number(inf.total_ejecutado),
          descontar:       Number(inf.descontar),
          reconocer:       Number(inf.reconocer),
          valor_final:     Number(inf.valor_final),
          total_anticipos: Number(inf.total_anticipos),
          responsable:     inf.responsable,
          fecha:           inf.fecha?.slice(0, 10) || '',
          pdf_data:        typeof inf.pdf_data === 'string' ? JSON.parse(inf.pdf_data) : (inf.pdf_data || {}),
        });
        existing.add(num);
        result.informes.importados++;
      }
      await writeJson(drive, ROOT_FOLDER_ID, 'informes.json', driveInformes);
    } catch (e: any) {
      result.informes.errores.push(e.message);
    }
  }

  // ── Auditorías ───────────────────────────────────────────────────────────────
  if (auditorias.length > 0) {
    try {
      const driveIndex: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'auditorias_index.json')) ?? [];
      const existingNums = new Set(driveIndex.map(r => String(r.numero)));

      for (const aud of auditorias) {
        const num = String(aud.numero).padStart(3, '0');
        if (existingNums.has(num)) { result.auditorias.omitidos++; continue; }

        const datosObj = typeof aud.datos === 'string' ? JSON.parse(aud.datos) : (aud.datos || {});
        const nuevoId  = crypto.randomUUID();

        const entry = {
          id:             nuevoId,
          supabase_id:    String(aud.id),
          numero:         num,
          prestador:      aud.prestador,
          nit:            String(aud.nit || ''),
          mes:            aud.mes?.toLowerCase() || '',
          auditor_id:     datosObj.auditor_id || aud.auditor_id || null,
          auditor_nombre: datosObj.auditor_nombre || '',
          created_at:     aud.created_at,
        };

        driveIndex.push(entry);
        existingNums.add(num);

        await writeJson(drive, auditFolder, `${nuevoId}.json`, {
          ...entry,
          datos: datosObj,
        });

        result.auditorias.importados++;
      }
      await writeJson(drive, ROOT_FOLDER_ID, 'auditorias_index.json', driveIndex);
    } catch (e: any) {
      result.auditorias.errores.push(e.message);
    }
  }

  const ok = result.informes.errores.length === 0 && result.auditorias.errores.length === 0;
  return NextResponse.json({ ok, result });
}
