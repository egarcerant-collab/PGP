import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const EXCEL_EXPORT_COOKIE = 'excel_export_auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fvrgfqxohacipmnmqyef.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ezUmThavYstyax693c7ZmA_jda4yXNA';

// Ruta de la plantilla base (copia exacta de VITAL SALUD SM.xlsx)
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
  // Compatibilidad / depuración
  valor_mensual_texto?: string;
  meses_texto?: string;
  // Se mantienen alias antiguos por si se reciben del request
  valor_contrato?: string | number;
};

function isExcelExportAuthenticated(request: NextRequest) {
  return request.cookies.get(EXCEL_EXPORT_COOKIE)?.value === '1';
}

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
  // Remueve $, espacios; si usa coma decimal al estilo colombiano la convertimos
  const cleaned = text.replace(/\$/g, '').replace(/\s/g, '');
  // Heurística: el último separador entre "," y "." es el decimal
  let normalized = cleaned;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // coma es decimal (estilo ES/CO) -> quitar puntos, coma a punto
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // punto es decimal (estilo US) -> quitar comas
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    // sólo comas: asumir decimal si hay 1-2 dígitos tras la última coma, miles en otro caso
    const tail = cleaned.length - 1 - lastComma;
    if (tail <= 2 && cleaned.split(',').length === 2) {
      normalized = cleaned.replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  }
  normalized = normalized.replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const MESES_ES: Record<string, number> = {
  ENERO: 0, FEBRERO: 1, MARZO: 2, ABRIL: 3, MAYO: 4, JUNIO: 5,
  JULIO: 6, AGOSTO: 7, SEPTIEMBRE: 8, SETIEMBRE: 8, OCTUBRE: 9, NOVIEMBRE: 10, DICIEMBRE: 11,
};

function parseDateLoose(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim();
  if (!text) return null;

  // DD/MES_TEXTO/YYYY (ej. 01/febrero/2026)
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

  // DD/MM/YYYY o DD-MM-YYYY
  const dmy = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10) - 1;
    let y = parseInt(dmy[3], 10);
    if (y < 100) y += 2000;
    const date = new Date(y, m, d);
    return isNaN(date.getTime()) ? null : date;
  }
  // YYYY-MM-DD
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

// Mapa de meses a la fila correspondiente en la hoja 04_Seguimiento_Mensual (fila 5 = Enero)
const MES_A_FILA: Record<string, number> = {
  ENERO: 5, FEBRERO: 6, MARZO: 7, ABRIL: 8, MAYO: 9, JUNIO: 10,
  JULIO: 11, AGOSTO: 12, SEPTIEMBRE: 13, OCTUBRE: 14, NOVIEMBRE: 15, DICIEMBRE: 16,
};

function detectMonthRow(periodo: string): number | null {
  const up = normalizeKey(periodo);
  // Puede venir como "ENERO", "FEBRERO-ENERO", etc. Tomamos el primer mes mencionado.
  for (const mes of Object.keys(MES_A_FILA)) {
    if (up.includes(mes)) return MES_A_FILA[mes];
  }
  return null;
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
  // IDENTIFICACIÓN
  setIfExists(ws, 'C4', row.contrato || '');
  // C5 (fecha de suscripción) no la tenemos en el Google Sheet
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
  // C10, C11 (representante, c.c.) no disponibles
  // C12 servicio — si existe información de zona o meses usar, si no dejamos el texto base
  // Dejamos lo que viene por defecto en C12 ya que no tenemos el dato en el sheet.
  setIfExists(ws, 'C13', row.departamento || '');
  setIfExists(ws, 'C14', row.ciudad || '');
  const poblacion = parseNumberLoose(row.poblacion);
  if (poblacion !== null) {
    ws.getCell('C15').value = poblacion;
    ws.getCell('C15').numFmt = '#,##0';
  } else if (row.poblacion) {
    setIfExists(ws, 'C15', row.poblacion);
  }
  // C16 régimen, C17 enfoque diferencial — no disponibles, dejamos los defaults de la plantilla

  // PARÁMETROS FINANCIEROS
  // Del Google Sheet: M = VALOR CONTRATO MENSUAL, K = MESES
  // VALOR TOTAL DEL CONTRATO = mensual × meses
  const mensual = typeof row.valor_mensual === 'number'
    ? row.valor_mensual
    : parseNumberLoose((row as any).valor_mensual ?? (row as any).valor_mensual_texto) ?? 0;
  const mesesNum = typeof row.meses === 'number'
    ? row.meses
    : parseNumberLoose((row as any).meses ?? (row as any).meses_texto) ?? 0;
  // Si viene pre-calculado lo usamos; si no, lo calculamos aquí (mensual × meses)
  const totalFromRow = typeof row.valor_total === 'number' ? row.valor_total : 0;
  const totalAnual = totalFromRow > 0 ? totalFromRow : (mensual > 0 && mesesNum > 0 ? mensual * mesesNum : 0);

  if (totalAnual > 0) {
    ws.getCell('C20').value = totalAnual;
    ws.getCell('C20').numFmt = '"$"#,##0.00';
  }

  // C21 es el "Valor mensual proyectado" (formula original = C20/12).
  // Si el contrato tiene meses != 12 o queremos precisión exacta, escribimos el valor mensual real.
  if (mensual > 0) {
    const c21 = ws.getCell('C21');
    c21.value = mensual;
    c21.numFmt = '"$"#,##0.00';
  }

  // Franjas porcentuales (C26 = 0.9 / C27 = 1.1). El template ya las tiene,
  // pero si el Google Sheet indica otras, las respetamos cuando estén expresadas como porcentaje.
  const franjaInf = typeof row.franja_riesgo_inferior === 'number' ? row.franja_riesgo_inferior : null;
  const franjaSup = typeof row.franja_riesgo_superior === 'number' ? row.franja_riesgo_superior : null;
  // Sólo sobrescribimos el porcentaje si lo recibimos como fracción (< 2) — nuestros cálculos
  // ahora entregan el valor absoluto de la franja, no un porcentaje, así que NO tocamos C26/C27.
  if (franjaInf !== null && franjaInf > 0 && franjaInf < 2) {
    ws.getCell('C26').value = franjaInf;
    ws.getCell('C26').numFmt = '0.00%';
  }
  if (franjaSup !== null && franjaSup > 0 && franjaSup < 2) {
    ws.getCell('C27').value = franjaSup;
    ws.getCell('C27').numFmt = '0.00%';
  }
}

function fillSeguimientoMensual(ws: ExcelJS.Worksheet, informes: InformeRecord[]) {
  const mensuales = informes.filter(
    (r) => normalizeKey(r.tipo_periodo || '') === 'MENSUAL'
  );

  for (const info of mensuales) {
    const fila = detectMonthRow(info.periodo || '');
    if (!fila) continue;

    // E: Valor ejecutado (INPUT)
    if (info.total_ejecutado !== null && info.total_ejecutado !== undefined) {
      const cell = ws.getCell(`E${fila}`);
      cell.value = info.total_ejecutado;
      cell.numFmt = '"$"#,##0.00';
    }

    // J: Observaciones — incluir auditor, fecha, valor final y ajustes
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
  if (!isExcelExportAuthenticated(request)) {
    return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
  }

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

    // Verifica existencia de plantilla
    try {
      await fs.access(TEMPLATE_PATH);
    } catch {
      return NextResponse.json(
        { message: 'No se encontró la plantilla base (plantilla.xlsx).' },
        { status: 500 }
      );
    }

    // Carga la plantilla desde disco preservando estilos, fórmulas, merges y formatos
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(TEMPLATE_PATH);

    // Metadatos
    workbook.creator = 'PGP Export';
    workbook.lastModifiedBy = 'PGP Export';
    workbook.modified = new Date();

    // Usamos la primera fila (un contrato por prestador es lo habitual) como base de datos
    const mainRow = rows[0];

    // 02_Datos_Contrato → Información básica + parámetros financieros
    const wsDatos = workbook.getWorksheet('02_Datos_Contrato');
    if (wsDatos) {
      fillDatosContrato(wsDatos, mainRow);
    }

    // 04_Seguimiento_Mensual → informes mensuales desde Supabase
    const informes = await fetchInformesByPrestador(mainRow.prestador, mainRow.contrato);
    const wsMensual = workbook.getWorksheet('04_Seguimiento_Mensual');
    if (wsMensual) {
      fillSeguimientoMensual(wsMensual, informes);
    }

    // Las hojas 03 / 05 / 06 / 07 mantienen sus fórmulas intactas y se recalcularán
    // al abrirse en Excel porque todas referencian 02_Datos_Contrato y 04_Seguimiento_Mensual.

    // Limpia reglas de formato condicional que ExcelJS no pudo parsear (iconSet/dataBar con extension)
    // para evitar "Cannot read properties of undefined (reading '0')" al escribir.
    for (const ws of workbook.worksheets) {
      const cfs: any[] = (ws as any).conditionalFormattings || [];
      (ws as any).conditionalFormattings = cfs
        .map((group) => ({
          ...group,
          rules: (group.rules || []).filter((rule: any) => {
            if (rule.type === 'expression' || rule.type === 'cellIs' || rule.type === 'containsText' || rule.type === 'notContainsText' || rule.type === 'beginsWith' || rule.type === 'endsWith') {
              return Array.isArray(rule.formulae) && rule.formulae.length > 0 && rule.formulae[0] !== undefined;
            }
            // Tipos iconSet / colorScale / dataBar: sólo conservar si ExcelJS tiene lo necesario
            if (rule.type === 'iconSet') return Array.isArray(rule.cfvo) && rule.cfvo.length > 0;
            if (rule.type === 'colorScale') return Array.isArray(rule.cfvo) && rule.cfvo.length > 0;
            if (rule.type === 'dataBar') return Array.isArray(rule.cfvo) && rule.cfvo.length > 0;
            return true;
          }),
        }))
        .filter((group) => (group.rules || []).length > 0);
    }

    // Forzar recálculo al abrir
    // @ts-expect-error propiedad interna de ExcelJS
    workbook.calcProperties = { ...workbook.calcProperties, fullCalcOnLoad: true };

    const contractForName = sanitizeFilePart(mainRow.contrato || 'SIN_CONTRATO');
    const providerForName = sanitizeFilePart(prestador || 'SIN_PRESTADOR');
    const fileName = `PGP_${contractForName}_${providerForName}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer as BodyInit, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
