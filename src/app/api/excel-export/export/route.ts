import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fvrgfqxohacipmnmqyef.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ezUmThavYstyax693c7ZmA_jda4yXNA';

const TEMPLATE_PATH = path.join(process.cwd(), 'src', 'app', 'api', 'excel-export', '_template', 'plantilla.xlsx');

type ProviderRow = {
  nit: string;
  prestador: string;
  id_zona: string;
  web: string;
  poblacion: string;
  contrato: string;
  ciudad: string;
  departamento: string;
  fecha_inicio: string;
  fecha_fin: string;
  meses: number;
  valor_mensual: number;
  valor_total: number;
  franja_riesgo_inferior: number;
  franja_riesgo_superior: number;
  valor_mensual_texto?: string;
  meses_texto?: string;
  valor_contrato?: string | number;
};

function sanitizeFilePart(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function normalizeKey(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function parseNumberLoose(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  const cleaned = text.replace(/\$/g, '').replace(/\s/g, '');
  let normalized = cleaned;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const tail = cleaned.length - 1 - lastComma;
    normalized = tail <= 2 && cleaned.split(',').length === 2
      ? cleaned.replace(',', '.')
      : cleaned.replace(/,/g, '');
  }
  normalized = normalized.replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const MESES_ES: Record<string, number> = {
  ENERO: 0, FEBRERO: 1, MARZO: 2, ABRIL: 3, MAYO: 4, JUNIO: 5,
  JULIO: 6, AGOSTO: 7, SEPTIEMBRE: 8, SETIEMBRE: 8, OCTUBRE: 9, NOVIEMBRE: 10, DICIEMBRE: 11,
};

const MES_A_FILA: Record<string, number> = {
  ENERO: 5, FEBRERO: 6, MARZO: 7, ABRIL: 8, MAYO: 9, JUNIO: 10,
  JULIO: 11, AGOSTO: 12, SEPTIEMBRE: 13, OCTUBRE: 14, NOVIEMBRE: 15, DICIEMBRE: 16,
};

function parseDateLoose(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim();
  if (!text) return null;

  const textMonth = text.match(/^(\d{1,2})[\/\-\s]+([A-Za-zÁÉÍÓÚáéíóú]+)[\/\-\s]+(\d{2,4})$/);
  if (textMonth) {
    const d = parseInt(textMonth[1], 10);
    const monthName = normalizeKey(textMonth[2]);
    const m = MESES_ES[monthName];
    let y = parseInt(textMonth[3], 10);
    if (y < 100) y += 2000;
    if (m !== undefined) {
      const date = new Date(y, m, d);
      return isNaN(date.getTime()) ? null : date;
    }
  }

  const dmy = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10) - 1;
    let y = parseInt(dmy[3], 10);
    if (y < 100) y += 2000;
    const date = new Date(y, m, d);
    return isNaN(date.getTime()) ? null : date;
  }

  const ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const d = parseInt(ymd[3], 10);
    const date = new Date(y, m, d);
    return isNaN(date.getTime()) ? null : date;
  }

  const fallback = new Date(text);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function detectMonthRow(periodo: string): number | null {
  const up = normalizeKey(periodo);
  for (const mes of Object.keys(MES_A_FILA)) {
    if (up.includes(mes)) return MES_A_FILA[mes];
  }
  return null;
}

function getContractActiveMonths(row: ProviderRow) {
  const start = parseDateLoose(row.fecha_inicio);
  const end = parseDateLoose(row.fecha_fin);
  const active = new Set<number>();

  if (start && end) {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= last) {
      active.add(cursor.getMonth());
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return active;
  }

  const monthsCount = typeof row.meses === 'number'
    ? row.meses
    : parseNumberLoose((row as any).meses ?? (row as any).meses_texto) ?? 12;
  for (let month = 0; month < Math.max(0, Math.min(12, monthsCount)); month += 1) {
    active.add(month);
  }
  return active;
}

type InformeRecord = {
  numero: string | null;
  periodo: string | null;
  tipo_periodo: string | null;
  fecha: string | null;
  total_ejecutado: number | null;
  valor_final: number | null;
  descontar: number | null;
  reconocer: number | null;
  responsable: string | null;
};

async function fetchInformesByPrestador(prestador: string, contrato: string): Promise<InformeRecord[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase
      .from('informes')
      .select('numero, prestador, contrato, periodo, tipo_periodo, fecha, total_ejecutado, valor_final, descontar, reconocer, responsable');

    if (error || !data?.length) return [];

    const pKey = normalizeKey(prestador);
    const cKey = normalizeKey(contrato);

    return data
      .filter((r: any) => {
        const matchP = normalizeKey(r.prestador || '') === pKey;
        const matchC = !cKey || normalizeKey(r.contrato || '') === cKey;
        return matchP && matchC;
      })
      .map((r: any) => ({
        numero: r.numero ?? null,
        periodo: r.periodo ?? null,
        tipo_periodo: r.tipo_periodo ?? null,
        fecha: r.fecha ?? null,
        total_ejecutado: typeof r.total_ejecutado === 'number' ? r.total_ejecutado : parseNumberLoose(r.total_ejecutado),
        valor_final: typeof r.valor_final === 'number' ? r.valor_final : parseNumberLoose(r.valor_final),
        descontar: typeof r.descontar === 'number' ? r.descontar : parseNumberLoose(r.descontar),
        reconocer: typeof r.reconocer === 'number' ? r.reconocer : parseNumberLoose(r.reconocer),
        responsable: r.responsable ?? null,
      }));
  } catch {
    return [];
  }
}

function setIfExists(ws: ExcelJS.Worksheet, addr: string, value: any) {
  const cell = ws.getCell(addr);
  cell.value = value;
}

function fillDatosContrato(ws: ExcelJS.Worksheet, row: ProviderRow) {
  setIfExists(ws, 'C4', row.contrato || '');
  const fInicio = parseDateLoose(row.fecha_inicio);
  const fFin = parseDateLoose(row.fecha_fin);
  if (fInicio) {
    ws.getCell('C6').value = fInicio;
    ws.getCell('C6').numFmt = 'dd/mm/yyyy';
  }
  if (fFin) {
    ws.getCell('C7').value = fFin;
    ws.getCell('C7').numFmt = 'dd/mm/yyyy';
  }
  setIfExists(ws, 'C8', row.prestador || '');
  setIfExists(ws, 'C9', row.nit || '');
  setIfExists(ws, 'C13', row.departamento || '');
  setIfExists(ws, 'C14', row.ciudad || '');

  const poblacion = parseNumberLoose(row.poblacion);
  if (poblacion !== null) {
    ws.getCell('C15').value = poblacion;
    ws.getCell('C15').numFmt = '#,##0';
  } else if (row.poblacion) {
    setIfExists(ws, 'C15', row.poblacion);
  }

  const mensual = typeof row.valor_mensual === 'number'
    ? row.valor_mensual
    : parseNumberLoose((row as any).valor_mensual ?? (row as any).valor_mensual_texto) ?? 0;
  const mesesNum = typeof row.meses === 'number'
    ? row.meses
    : parseNumberLoose((row as any).meses ?? (row as any).meses_texto) ?? 0;
  const totalFromRow = typeof row.valor_total === 'number' ? row.valor_total : 0;
  const totalAnual = totalFromRow > 0 ? totalFromRow : (mensual > 0 && mesesNum > 0 ? mensual * mesesNum : 0);

  if (totalAnual > 0) {
    ws.getCell('C20').value = totalAnual;
    ws.getCell('C20').numFmt = '"$"#,##0.00';
  }

  if (mensual > 0) {
    const c21 = ws.getCell('C21');
    c21.value = mensual;
    c21.numFmt = '"$"#,##0.00';
  }
}

function fillSeguimientoMensual(ws: ExcelJS.Worksheet, informes: InformeRecord[], row: ProviderRow) {
  const activeMonths = getContractActiveMonths(row);
  const mensual = typeof row.valor_mensual === 'number'
    ? row.valor_mensual
    : parseNumberLoose((row as any).valor_mensual ?? (row as any).valor_mensual_texto) ?? 0;

  Object.entries(MES_A_FILA).forEach(([monthName, fila]) => {
    const monthIndex = MESES_ES[monthName];
    const cell = ws.getCell(`D${fila}`);
    cell.value = activeMonths.has(monthIndex) ? mensual : 0;
    cell.numFmt = '"$"#,##0.00';
  });

  const mensuales = informes.filter((r) => normalizeKey(r.tipo_periodo || '') === 'MENSUAL');

  for (const info of mensuales) {
    const fila = detectMonthRow(info.periodo || '');
    if (!fila) continue;

    if (info.total_ejecutado !== null && info.total_ejecutado !== undefined) {
      const cell = ws.getCell(`E${fila}`);
      cell.value = info.total_ejecutado;
      cell.numFmt = '"$"#,##0.00';
    }

    const partes: string[] = [];
    if (info.responsable) partes.push(`Auditor: ${info.responsable}`);
    if (info.fecha) partes.push(`Fecha auditoría: ${info.fecha}`);
    if (info.valor_final !== null && info.valor_final !== undefined) {
      partes.push(`Valor final: $${Number(info.valor_final).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }
    if (info.descontar && info.descontar > 0) {
      partes.push(`Descuento: $${Number(info.descontar).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }
    if (info.reconocer && info.reconocer > 0) {
      partes.push(`Reconocimiento: $${Number(info.reconocer).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }
    if (info.numero) partes.push(`Informe ${info.numero}`);
    if (partes.length) {
      const cell = ws.getCell(`J${fila}`);
      cell.value = partes.join(' | ');
      cell.alignment = { vertical: 'middle', wrapText: true };
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prestador = String(body?.prestador || '').trim();
    const rows: ProviderRow[] = Array.isArray(body?.rows) ? body.rows : [];

    if (!prestador || !rows.length) {
      return NextResponse.json(
        { message: 'No hay datos del prestador seleccionado para exportar.' },
        { status: 400 }
      );
    }

    try {
      await fs.access(TEMPLATE_PATH);
    } catch {
      return NextResponse.json(
        { message: 'No se encontró la plantilla base (plantilla.xlsx).' },
        { status: 500 }
      );
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(TEMPLATE_PATH);

    workbook.creator = 'PGP Export';
    workbook.lastModifiedBy = 'PGP Export';
    workbook.modified = new Date();

    const mainRow = rows[0];

    const wsDatos = workbook.getWorksheet('02_Datos_Contrato');
    if (wsDatos) fillDatosContrato(wsDatos, mainRow);

    const informes = await fetchInformesByPrestador(mainRow.prestador, mainRow.contrato);
    const wsMensual = workbook.getWorksheet('04_Seguimiento_Mensual');
    if (wsMensual) fillSeguimientoMensual(wsMensual, informes, mainRow);

    for (const ws of workbook.worksheets) {
      const cfs: any[] = (ws as any).conditionalFormattings || [];
      (ws as any).conditionalFormattings = cfs
        .map((group) => ({
          ...group,
          rules: (group.rules || []).filter((rule: any) => {
            if (rule.type === 'expression' || rule.type === 'cellIs' || rule.type === 'containsText' || rule.type === 'notContainsText' || rule.type === 'beginsWith' || rule.type === 'endsWith') {
              return Array.isArray(rule.formulae) && rule.formulae.length > 0 && rule.formulae[0] !== undefined;
            }
            if (rule.type === 'iconSet') return Array.isArray(rule.cfvo) && rule.cfvo.length > 0;
            if (rule.type === 'colorScale') return Array.isArray(rule.cfvo) && rule.cfvo.length > 0;
            if (rule.type === 'dataBar') return Array.isArray(rule.cfvo) && rule.cfvo.length > 0;
            return true;
          }),
        }))
        .filter((group) => (group.rules || []).length > 0);
    }

    // @ts-ignore propiedad interna de ExcelJS
    workbook.calcProperties = { ...workbook.calcProperties, fullCalcOnLoad: true };

    const contractForName = sanitizeFilePart(mainRow.contrato || 'SIN_CONTRATO');
    const providerForName = sanitizeFilePart(prestador || 'SIN_PRESTADOR');
    const fileName = `PGP_${contractForName}_${providerForName}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        message: 'No fue posible generar la exportación.',
        error: error?.message || 'Error desconocido',
      },
      { status: 500 }
    );
  }
}
