import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fvrgfqxohacipmnmqyef.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ezUmThavYstyax693c7ZmA_jda4yXNA';
const TEMPLATE_PATH = path.join(process.cwd(), 'src', 'app', 'api', 'excel-export', '_template', 'plantilla.xlsx');

const MESES_ES: Record<string, number> = {
  ENERO: 0, FEBRERO: 1, MARZO: 2, ABRIL: 3, MAYO: 4, JUNIO: 5,
  JULIO: 6, AGOSTO: 7, SEPTIEMBRE: 8, SETIEMBRE: 8, OCTUBRE: 9, NOVIEMBRE: 10, DICIEMBRE: 11,
};
const MES_A_FILA: Record<string, number> = {
  ENERO: 5, FEBRERO: 6, MARZO: 7, ABRIL: 8, MAYO: 9, JUNIO: 10,
  JULIO: 11, AGOSTO: 12, SEPTIEMBRE: 13, OCTUBRE: 14, NOVIEMBRE: 15, DICIEMBRE: 16,
};

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
};

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

function sanitizeFilePart(value: string): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
}

function normalizeKey(value: string): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function parseNumberLoose(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  const cleaned = text.replace(/\$/g, '').replace(/\s/g, '');
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const tail = cleaned.length - 1 - lastComma;
    normalized = tail <= 2 && cleaned.split(',').length === 2 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  }
  const parsed = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateLoose(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim();
  if (!text) return null;
  const textMonth = text.match(/^(\d{1,2})[\/\-\s]+([A-Za-zÁÉÍÓÚáéíóú]+)[\/\-\s]+(\d{2,4})$/);
  if (textMonth) {
    const d = parseInt(textMonth[1], 10);
    const m = MESES_ES[normalizeKey(textMonth[2])];
    let y = parseInt(textMonth[3], 10);
    if (y < 100) y += 2000;
    if (m !== undefined) {
      const date = new Date(y, m, d);
      return isNaN(date.getTime()) ? null : date;
    }
  }
  const dmy = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
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
    const date = new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
    return isNaN(date.getTime()) ? null : date;
  }
  const fallback = new Date(text);
  return isNaN(fallback.getTime()) ? null : fallback;
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
  const monthsCount = typeof row.meses === 'number' ? row.meses : parseNumberLoose(row.meses_texto) ?? 12;
  for (let month = 0; month < Math.max(0, Math.min(12, monthsCount)); month += 1) active.add(month);
  return active;
}

function detectMonthRow(periodo: string): number | null {
  const up = normalizeKey(periodo);
  for (const mes of Object.keys(MES_A_FILA)) if (up.includes(mes)) return MES_A_FILA[mes];
  return null;
}

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
      .filter((r: any) => normalizeKey(r.prestador || '') === pKey && (!cKey || normalizeKey(r.contrato || '') === cKey))
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

function setupFallbackWorkbook(workbook: ExcelJS.Workbook) {
  const wsDatos = workbook.addWorksheet('02_Datos_Contrato');
  wsDatos.mergeCells('A1:C1');
  wsDatos.getCell('A1').value = 'DATOS DEL CONTRATO';
  wsDatos.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
  wsDatos.getCell('A1').alignment = { horizontal: 'center' };
  wsDatos.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  [[4, 'Contrato'], [6, 'Fecha inicio'], [7, 'Fecha fin'], [8, 'Prestador'], [9, 'NIT'], [13, 'Departamento'], [14, 'Ciudad'], [15, 'Población'], [20, 'Valor total'], [21, 'Valor mensual']]
    .forEach(([row, label]) => {
      wsDatos.getCell(Number(row), 1).value = label;
      wsDatos.getCell(Number(row), 1).font = { bold: true };
    });
  wsDatos.columns = [{ width: 24 }, { width: 4 }, { width: 42 }];

  const ws = workbook.addWorksheet('04_Seguimiento_Mensual');
  ws.mergeCells('A1:I1');
  ws.getCell('A1').value = 'SEGUIMIENTO MENSUAL DE EJECUCIÓN FINANCIERA';
  ws.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  ws.mergeCells('A2:I2');
  ws.getCell('A2').value = 'El valor proyectado se calcula según la vigencia real del contrato.';
  const headers = ['#', 'Mes', 'Valor proyectado ($)', 'Valor ejecutado ($)', 'Desviación ($)', '% cumplimiento', 'Estado franja', 'Ejecutado acumulado ($)', 'Observaciones / acciones'];
  headers.forEach((header, index) => {
    const cell = ws.getCell(4, index + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF3' } };
  });
  ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].forEach((month, index) => {
    const rowNumber = index + 5;
    const row = ws.getRow(rowNumber);
    row.getCell(1).value = index + 1;
    row.getCell(2).value = month;
    row.getCell(4).value = 0;
    row.getCell(5).value = { formula: `D${rowNumber}-C${rowNumber}` };
    row.getCell(6).value = { formula: `IF(C${rowNumber}=0,"-",D${rowNumber}/C${rowNumber})` };
    row.getCell(7).value = { formula: `IF(D${rowNumber}=0,"Sin registro",IF(F${rowNumber}<0.9,"Fuera - subejecución",IF(F${rowNumber}>1.1,"Fuera - sobreejecución","Dentro de franja")))` };
    row.getCell(8).value = { formula: `SUM(D$5:D${rowNumber})` };
    [3, 4, 5, 8].forEach((col) => { row.getCell(col).numFmt = '"$"#,##0.00'; });
    row.getCell(6).numFmt = '0.0%';
  });
  const total = ws.getRow(17);
  total.getCell(2).value = 'TOTAL AÑO';
  total.getCell(3).value = { formula: 'SUM(C5:C16)' };
  total.getCell(4).value = { formula: 'SUM(D5:D16)' };
  total.getCell(5).value = { formula: 'D17-C17' };
  total.getCell(6).value = { formula: 'IF(C17=0,"-",D17/C17)' };
  total.getCell(8).value = { formula: 'D17' };
  total.eachCell((cell) => { cell.font = { bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F0D9' } }; });
  ws.columns = [{ width: 6 }, { width: 16 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 16 }, { width: 22 }, { width: 24 }, { width: 42 }];
}

function fillDatosContrato(ws: ExcelJS.Worksheet, row: ProviderRow) {
  ws.getCell('C4').value = row.contrato || '';
  const fInicio = parseDateLoose(row.fecha_inicio);
  const fFin = parseDateLoose(row.fecha_fin);
  if (fInicio) { ws.getCell('C6').value = fInicio; ws.getCell('C6').numFmt = 'dd/mm/yyyy'; }
  if (fFin) { ws.getCell('C7').value = fFin; ws.getCell('C7').numFmt = 'dd/mm/yyyy'; }
  ws.getCell('C8').value = row.prestador || '';
  ws.getCell('C9').value = row.nit || '';
  ws.getCell('C13').value = row.departamento || '';
  ws.getCell('C14').value = row.ciudad || '';
  const poblacion = parseNumberLoose(row.poblacion);
  if (poblacion !== null) ws.getCell('C15').value = poblacion;
  const mensual = typeof row.valor_mensual === 'number' ? row.valor_mensual : parseNumberLoose(row.valor_mensual_texto) ?? 0;
  const mesesNum = typeof row.meses === 'number' ? row.meses : parseNumberLoose(row.meses_texto) ?? 0;
  const total = row.valor_total > 0 ? row.valor_total : mensual * mesesNum;
  ws.getCell('C20').value = total;
  ws.getCell('C21').value = mensual;
  ws.getCell('C20').numFmt = '"$"#,##0.00';
  ws.getCell('C21').numFmt = '"$"#,##0.00';
}

function fillSeguimientoMensual(ws: ExcelJS.Worksheet, informes: InformeRecord[], row: ProviderRow) {
  const activeMonths = getContractActiveMonths(row);
  const mensual = typeof row.valor_mensual === 'number' ? row.valor_mensual : parseNumberLoose(row.valor_mensual_texto) ?? 0;
  Object.entries(MES_A_FILA).forEach(([monthName, fila]) => {
    const monthIndex = MESES_ES[monthName];
    const cell = ws.getCell(`D${fila}`);
    cell.value = activeMonths.has(monthIndex) ? mensual : 0;
    cell.numFmt = '"$"#,##0.00';
  });
  for (const info of informes.filter((r) => normalizeKey(r.tipo_periodo || '') === 'MENSUAL')) {
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
    if (info.valor_final !== null && info.valor_final !== undefined) partes.push(`Valor final: $${Number(info.valor_final).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    if (info.descontar && info.descontar > 0) partes.push(`Descuento: $${Number(info.descontar).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    if (info.reconocer && info.reconocer > 0) partes.push(`Reconocimiento: $${Number(info.reconocer).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
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
    if (!prestador || !rows.length) return NextResponse.json({ message: 'No hay datos del prestador seleccionado para exportar.' }, { status: 400 });

    const workbook = new ExcelJS.Workbook();
    try {
      await fs.access(TEMPLATE_PATH);
      await workbook.xlsx.readFile(TEMPLATE_PATH);
    } catch {
      setupFallbackWorkbook(workbook);
    }

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
      (ws as any).conditionalFormattings = cfs.map((group) => ({
        ...group,
        rules: (group.rules || []).filter((rule: any) => {
          if (rule.type === 'expression' || rule.type === 'cellIs' || rule.type === 'containsText' || rule.type === 'notContainsText' || rule.type === 'beginsWith' || rule.type === 'endsWith') return Array.isArray(rule.formulae) && rule.formulae.length > 0 && rule.formulae[0] !== undefined;
          if (rule.type === 'iconSet' || rule.type === 'colorScale' || rule.type === 'dataBar') return Array.isArray(rule.cfvo) && rule.cfvo.length > 0;
          return true;
        }),
      })).filter((group) => (group.rules || []).length > 0);
    }

    // @ts-ignore propiedad interna de ExcelJS
    workbook.calcProperties = { ...workbook.calcProperties, fullCalcOnLoad: true };
    const fileName = `PGP_${sanitizeFilePart(mainRow.contrato || 'SIN_CONTRATO')}_${sanitizeFilePart(prestador || 'SIN_PRESTADOR')}.xlsx`;
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
    return NextResponse.json({ message: 'No fue posible generar la exportación.', error: error?.message || 'Error desconocido' }, { status: 500 });
  }
}
