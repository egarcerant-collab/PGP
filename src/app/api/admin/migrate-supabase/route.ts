import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDrive, readJson, writeJson, getSubfolder, ROOT_FOLDER_ID } from '@/lib/gdrive';
import { getCurrentUser } from '@/lib/get-current-user';
import crypto from 'crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/admin/migrate-supabase
 * Migra informes y auditorías desde Supabase hacia Drive.
 * Solo puede ejecutarlo un superadmin. Es idempotente (no duplica).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (user?.rol !== 'superadmin') {
    return NextResponse.json({ error: 'Solo superadmin puede ejecutar esta migración.' }, { status: 403 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const drive = getDrive();
  const auditFolder = await getSubfolder(drive, ROOT_FOLDER_ID, 'auditorias');

  const resultados = {
    informes:    { importados: 0, omitidos: 0, errores: [] as string[] },
    auditorias:  { importados: 0, omitidos: 0, errores: [] as string[] },
  };

  // ── 1. INFORMES ──────────────────────────────────────────────────────────
  try {
    const { data: sbInformes, error } = await supabase
      .from('informes')
      .select('*')
      .order('numero', { ascending: true });

    if (error) throw new Error(`Supabase informes: ${error.message}`);

    const driveInformes: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'informes.json')) ?? [];
    const existingNums = new Set(driveInformes.map((r: any) => r.numero));

    for (const inf of (sbInformes || [])) {
      if (existingNums.has(inf.numero)) {
        resultados.informes.omitidos++;
        continue;
      }
      driveInformes.push({
        numero:          inf.numero,
        prestador:       inf.prestador,
        nit:             inf.nit,
        contrato:        inf.contrato,
        municipio:       inf.municipio,
        departamento:    inf.departamento,
        periodo:         inf.periodo,
        tipo_periodo:    inf.tipo_periodo,
        nt_periodo:      inf.nt_periodo,
        total_ejecutado: inf.total_ejecutado,
        descontar:       inf.descontar,
        reconocer:       inf.reconocer,
        valor_final:     inf.valor_final,
        total_anticipos: inf.total_anticipos,
        responsable:     inf.responsable,
        fecha:           inf.fecha,
        pdf_data:        inf.pdf_data || {},
      });
      existingNums.add(inf.numero);
      resultados.informes.importados++;
    }

    await writeJson(drive, ROOT_FOLDER_ID, 'informes.json', driveInformes);
  } catch (e: any) {
    resultados.informes.errores.push(e.message);
  }

  // ── 2. AUDITORÍAS ────────────────────────────────────────────────────────
  try {
    const { data: sbAuditorias, error } = await supabase
      .from('auditorias')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Supabase auditorias: ${error.message}`);

    const driveIndex: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'auditorias_index.json')) ?? [];
    const existingIds = new Set(driveIndex.map((r: any) => r.supabase_id || r.id));

    for (const aud of (sbAuditorias || [])) {
      if (existingIds.has(aud.id)) {
        resultados.auditorias.omitidos++;
        continue;
      }

      const nuevoId = crypto.randomUUID();
      const entry = {
        id:             nuevoId,
        supabase_id:    aud.id,
        numero:         aud.numero || String(driveIndex.length + 1).padStart(3, '0'),
        prestador:      aud.prestador,
        nit:            aud.nit || '',
        mes:            aud.mes,
        auditor_id:     aud.auditor_id || null,
        auditor_nombre: aud.datos?.auditor_nombre || '',
        created_at:     aud.created_at,
      };

      driveIndex.push(entry);
      existingIds.add(aud.id);

      await writeJson(drive, auditFolder, `${nuevoId}.json`, {
        ...entry,
        datos: aud.datos || {},
      });

      resultados.auditorias.importados++;
    }

    await writeJson(drive, ROOT_FOLDER_ID, 'auditorias_index.json', driveIndex);
  } catch (e: any) {
    resultados.auditorias.errores.push(e.message);
  }

  const ok = resultados.informes.errores.length === 0 && resultados.auditorias.errores.length === 0;

  return NextResponse.json({ ok, resultados });
}

/**
 * GET /api/admin/migrate-supabase
 * Previsualiza cuántos registros hay en Supabase vs Drive (sin modificar nada).
 */
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (user?.rol !== 'superadmin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const drive = getDrive();

  const [
    sbInformesCount,
    sbAuditoriasCount,
    driveInformes,
    driveIndex,
  ] = await Promise.allSettled([
    supabase.from('informes').select('numero', { count: 'exact', head: true }),
    supabase.from('auditorias').select('id', { count: 'exact', head: true }),
    readJson(drive, ROOT_FOLDER_ID, 'informes.json'),
    readJson(drive, ROOT_FOLDER_ID, 'auditorias_index.json'),
  ]);

  return NextResponse.json({
    supabase: {
      informes:   sbInformesCount.status === 'fulfilled' ? sbInformesCount.value.count : 'error',
      auditorias: sbAuditoriasCount.status === 'fulfilled' ? sbAuditoriasCount.value.count : 'error',
    },
    drive: {
      informes:   Array.isArray(driveInformes.status === 'fulfilled' ? driveInformes.value : null)
                    ? (driveInformes.value as any[]).length : 0,
      auditorias: Array.isArray(driveIndex.status === 'fulfilled' ? driveIndex.value : null)
                    ? (driveIndex.value as any[]).length : 0,
    },
  });
}
