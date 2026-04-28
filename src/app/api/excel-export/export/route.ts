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
  const titleFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1F4E78' } };
  const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD9EAF3' } };
  const totalFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE2F0D9' } };

  const wsInstrucciones = workbook.addWorksheet('01_Instrucciones');
  wsInstrucciones.mergeCells('A1:F1');
  wsInstrucciones.getCell('A1').value = 'SEGUIMIENTO PGP - INSTRUCCIONES';
  wsInstrucciones.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  wsInstrucciones.getCell('A1').alignment = { horizontal: 'center' };
  wsInstrucciones.getCell('A1').fill = titleFill;
  [['A3', '1. Verifica los datos del contrato en la hoja 02_Datos_Contrato.'], ['A4', '2. Revisa la nota técnica en la hoja 03_Nota_Tecnica.'], ['A5', '3. Registra y valida la ejecución en la hoja 04_Seguimiento_Mensual.'], ['A6', '4. Usa las hojas 05, 06 y 07 para seguimiento trimestral, cierre anual y alertas.']]
    .forEach(([addr, text]) => { wsInstrucciones.getCell(addr).value = text; wsInstrucciones.getCell(addr).alignment = { wrapText: true }; });
  wsInstrucciones.columns = [{ width: 5 }, { width: 18 }, { width: 25 }, { width: 25 }, { width: 20 }, { width: 20 }];

  const wsDatos = workbook.addWorksheet('02_Datos_Contrato');
  wsDatos.mergeCells('A1:C1');
  wsDatos.getCell('A1').value = 'DATOS DEL CONTRATO';
  wsDatos.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
  wsDatos.getCell('A1').alignment = { horizontal: 'center' };
  wsDatos.getCell('A1').fill = titleFill;
  [[4, 'Contrato'], [6, 'Fecha inicio'], [7, 'Fecha fin'], [8, 'Prestador'], [9, 'NIT'], [13, 'Departamento'], [14, 'Ciudad'], [15, 'Población'], [20, 'Valor total'], [21, 'Valor mensual']]
    .forEach(([row, label]) => { wsDatos.getCell(Number(row), 1).value = label; wsDatos.getCell(Number(row), 1).font = { bold: true }; });
  wsDatos.columns = [{ width: 24 }, { width: 4 }, { width: 42 }];

  const wsNota = workbook.addWorksheet('03_Nota_Tecnica');
  wsNota.mergeCells('A1:I1');
  wsNota.getCell('A1').value = 'NOTA TÉCNICA PGP';
  wsNota.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  wsNota.getCell('A1').alignment = { horizontal: 'center' };
  wsNota.getCell('A1').fill = titleFill;
  ['CUPS', 'Descripción', 'Frecuencia', 'Valor unitario', 'Valor mensual', 'Tipo servicio', 'Observación'].forEach((header, idx) => {
    const cell = wsNota.getCell(3, idx + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.fill = headerFill;
    cell.alignment = { horizontal: 'center', wrapText: true };
  });
  wsNota.columns = [{ width: 16 }, { width: 42 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 20 }, { width: 40 }, { width: 12 }, { width: 12 }];

  const wsMensual = workbook.addWorksheet('04_Seguimiento_Mensual');
  wsMensual.mergeCells('A1:J1');
  wsMensual.getCell('A1').value = 'SEGUIMIENTO MENSUAL DE EJECUCIÓN FINANCIERA';
  wsMensual.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  wsMensual.getCell('A1').alignment = { horizontal: 'center' };
  wsMensual.getCell('A1').fill = titleFill;
  wsMensual.getCell('A2').value = 'Registre mensualmente el valor EJECUTADO. El valor proyectado se calcula según la vigencia real del contrato.';
  wsMensual.mergeCells('A2:J2');
  wsMensual.getCell('A2').font = { italic: true, color: { argb: 'FF4B5563' } };

  [[1, '#'], [3, 'Mes'], [4, 'Valor proyectado ($)'], [5, 'Valor ejecutado ($)'], [6, 'Desviación ($)'], [7, '% cumplimiento'], [8, 'Estado franja'], [9, 'Ejecutado acumulado ($)'], [10, 'Observaciones / acciones']].forEach(([column, header]) => {
    const cell = wsMensual.getCell(4, Number(column));
    cell.value = header;
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = headerFill;
  });

  ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].forEach((month, index) => {
    const rowNumber = index + 5;
    const row = wsMensual.getRow(rowNumber);
    row.getCell(1).value = index + 1;
    row.getCell(3).value = month;
    row.getCell(5).value = 0;
    row.getCell(6).value = { formula: `E${rowNumber}-D${rowNumber}` };
    row.getCell(7).value = { formula: `IF(D${rowNumber}=0,"-",E${rowNumber}/D${rowNumber})` };
    row.getCell(8).value = { formula: `IF(E${rowNumber}=0,"Sin registro",IF(G${rowNumber}<0.9,"Fuera - subejecución",IF(G${rowNumber}>1.1,"Fuera - sobreejecución","Dentro de franja")))` };
    row.getCell(9).value = { formula: `SUM(E$5:E${rowNumber})` };
    [4, 5, 6, 9].forEach((col) => { row.getCell(col).numFmt = '"$"#,##0.00'; row.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' }; });
    row.getCell(7).numFmt = '0.0%';
  });

  const total = wsMensual.getRow(17);
  total.getCell(3).value = 'TOTAL AÑO';
  total.getCell(4).value = { formula: 'SUM(D5:D16)' };
  total.getCell(5).value = { formula: 'SUM(E5:E16)' };
  total.getCell(6).value = { formula: 'E17-D17' };
  total.getCell(7).value = { formula: 'IF(D17=0,"-",E17/D17)' };
  total.getCell(9).value = { formula: 'E17' };
  total.eachCell((cell) => { cell.font = { bold: true }; cell.fill = totalFill; });
  wsMensual.columns = [{ width: 6 }, { width: 4 }, { width: 16 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 16 }, { width: 22 }, { width: 24 }, { width: 42 }];

  const wsTrimestral = workbook.addWorksheet('05_Seguimiento_Trimestral');
  wsTrimestral.mergeCells('A1:L1');
  wsTrimestral.getCell('A1').value = 'SEGUIMIENTO TRIMESTRAL DE EJECUCIÓN FINANCIERA';
  wsTrimestral.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  wsTrimestral.getCell('A1').alignment = { horizontal: 'center' };
  wsTrimestral.getCell('A1').fill = titleFill;
  ['Trimestre', 'Meses', 'Valor proyectado', 'Valor ejecutado', 'Desviación', '% cumplimiento', 'Estado', 'Observaciones'].forEach((header, idx) => {
    const cell = wsTrimestral.getCell(3, idx + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.fill = headerFill;
    cell.alignment = { horizontal: 'center', wrapText: true };
  });
  [['Trimestre 1', 'Enero - Marzo', 'SUM(04_Seguimiento_Mensual!D5:D7)', 'SUM(04_Seguimiento_Mensual!E5:E7)'], ['Trimestre 2', 'Abril - Junio', 'SUM(04_Seguimiento_Mensual!D8:D10)', 'SUM(04_Seguimiento_Mensual!E8:E10)'], ['Trimestre 3', 'Julio - Septiembre', 'SUM(04_Seguimiento_Mensual!D11:D13)', 'SUM(04_Seguimiento_Mensual!E11:E13)'], ['Trimestre 4', 'Octubre - Diciembre', 'SUM(04_Seguimiento_Mensual!D14:D16)', 'SUM(04_Seguimiento_Mensual!E14:E16)']].forEach(([tri, meses, projectedFormula, executedFormula], idx) => {
    const rowNumber = idx + 4;
    wsTrimestral.getCell(rowNumber, 1).value = tri;
    wsTrimestral.getCell(rowNumber, 2).value = meses;
    wsTrimestral.getCell(rowNumber, 3).value = { formula: projectedFormula };
    wsTrimestral.getCell(rowNumber, 4).value = { formula: executedFormula };
    wsTrimestral.getCell(rowNumber, 5).value = { formula: `D${rowNumber}-C${rowNumber}` };
    wsTrimestral.getCell(rowNumber, 6).value = { formula: `IF(C${rowNumber}=0,"-",D${rowNumber}/C${rowNumber})` };
    wsTrimestral.getCell(rowNumber, 7).value = { formula: `IF(D${rowNumber}=0,"Sin registro",IF(F${rowNumber}<0.9,"Fuera - subejecución",IF(F${rowNumber}>1.1,"Fuera - sobreejecución","Dentro de franja")))` };
    [3, 4, 5].forEach((col) => wsTrimestral.getCell(rowNumber, col).numFmt = '"$"#,##0.00');
    wsTrimestral.getCell(rowNumber, 6).numFmt = '0.0%';
  });
  wsTrimestral.columns = [{ width: 16 }, { width: 24 }, { width: 20 }, { width: 20 }, { width: 18 }, { width: 16 }, { width: 22 }, { width: 42 }];

  const wsCierre = workbook.addWorksheet('06_Cierre_Anual');
  wsCierre.mergeCells('A1:E1');
  wsCierre.getCell('A1').value = 'CIERRE ANUAL';
  wsCierre.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  wsCierre.getCell('A1').alignment = { horizontal: 'center' };
  wsCierre.getCell('A1').fill = titleFill;
  [['A3', 'Valor proyectado anual', 'B3', { formula: '04_Seguimiento_Mensual!D17' }], ['A4', 'Valor ejecutado anual', 'B4', { formula: '04_Seguimiento_Mensual!E17' }], ['A5', 'Desviación anual', 'B5', { formula: 'B4-B3' }], ['A6', '% cumplimiento anual', 'B6', { formula: 'IF(B3=0,"-",B4/B3)' }]].forEach(([labelCell, label, valueCell, value]) => {
    wsCierre.getCell(String(labelCell)).value = label;
    wsCierre.getCell(String(labelCell)).font = { bold: true };
    wsCierre.getCell(String(valueCell)).value = value as any;
  });
  ['B3', 'B4', 'B5'].forEach((addr) => wsCierre.getCell(addr).numFmt = '"$"#,##0.00');
  wsCierre.getCell('B6').numFmt = '0.0%';
  wsCierre.columns = [{ width: 28 }, { width: 22 }, { width: 18 }, { width: 18 }, { width: 18 }];

  const wsAlertas = workbook.addWorksheet('07_Alertas_Semaforo');
  wsAlertas.mergeCells('A1:F1');
  wsAlertas.getCell('A1').value = 'ALERTAS Y SEMÁFORO';
  wsAlertas.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  wsAlertas.getCell('A1').alignment = { horizontal: 'center' };
  wsAlertas.getCell('A1').fill = titleFill;
  ['Periodo', 'Cumplimiento', 'Estado', 'Acción sugerida'].forEach((header, idx) => {
    const cell = wsAlertas.getCell(3, idx + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.fill = headerFill;
  });
  for (let i = 0; i < 12; i += 1) {
    const rowNumber = i + 4;
    wsAlertas.getCell(rowNumber, 1).value = { formula: `04_Seguimiento_Mensual!C${i + 5}` };
    wsAlertas.getCell(rowNumber, 2).value = { formula: `04_Seguimiento_Mensual!G${i + 5}` };
    wsAlertas.getCell(rowNumber, 3).value = { formula: `04_Seguimiento_Mensual!H${i + 5}` };
    wsAlertas.getCell(rowNumber, 4).value = { formula: `IF(B${rowNumber}="-","Sin acción",IF(B${rowNumber}<0.9,"Revisar subejecución",IF(B${rowNumber}>1.1,"Revisar sobreejecución","Continuar seguimiento")))` };
    wsAlertas.getCell(rowNumber, 2).numFmt = '0.0%';
  }
  wsAlertas.columns = [{ width: 18 }, { width: 16 }, { width: 24 }, { width: 34 }, { width: 12 }, { width: 12 }];
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
  if (poblacion !== null) { ws.getCell('C15').value = poblacion; ws.getCell('C15').numFmt = '#,##0'; }
  const mensual = typeof row.valor_mensual === 'number' ? row.valor_mensual : parseNumberLoose(row.valor_mensual_texto) ?? 0;
  const mesesNum = typeof row.meses === 'number' ? row.meses : parseNumberLoose(row.meses_texto) ?? 0;
  const total = row.valor_total > 0 ? row.valor_total : mensual * mesesNum;
  if (total > 0) { ws.getCell('C20').value = total; ws.getCell('C20').numFmt = '"$"#,##0.00'; }
  if (mensual > 0) { ws.getCell('C21').value = mensual; ws.getCell('C21').numFmt = '"$"#,##0.00'; }
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
