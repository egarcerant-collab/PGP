import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';

const EXCEL_EXPORT_COOKIE = 'excel_export_auth';
const EXCEL_FILE_PATH = '/home/ubuntu/Uploads/VITAL SALUD SM.xlsx';

type JsonValue = string | number | boolean | null;
type GenericRow = Record<string, JsonValue>;

type ContractData = {
  numero_contrato: string;
  fecha_suscripcion: string;
  vigencia_inicio: string;
  vigencia_fin: string;
  ips_union_temporal: string;
  nit: string;
  representante_legal: string;
  cc_representante: string;
  servicio_objeto_contractual: string;
  departamento: string;
  municipios: string[];
  poblacion_objeto: number | null;
  regimen: string;
  enfoque_diferencial_indigena: string;
  valor_contratado_inicial_anual: number | null;
  valor_mensual_proyectado_inicial: number | null;
  ajuste_nota_tecnica: string;
  mes_ajuste: number | null;
  nuevo_valor_mensual_ajuste: number | null;
  valor_contratado_final_anual: number | null;
  franja_minima: number | null;
  franja_maxima: number | null;
  riesgo_compartido: number | null;
  limite_inferior_anual: number | null;
  limite_superior_anual: number | null;
  vigencia_anio: number | null;
};

function isExcelExportAuthenticated(request: NextRequest) {
  return request.cookies.get(EXCEL_EXPORT_COOKIE)?.value === '1';
}

function readCell(worksheet: XLSX.WorkSheet, address: string): unknown {
  return worksheet[address]?.v ?? null;
}

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).trim();
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const normalized = value
    .trim()
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  if (!normalized) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function splitMunicipalities(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildContractData(ws: XLSX.WorkSheet): ContractData {
  const vigenciaInicio = readCell(ws, 'C6');

  const data: ContractData = {
    numero_contrato: toStringValue(readCell(ws, 'C4')),
    fecha_suscripcion: toStringValue(readCell(ws, 'C5')),
    vigencia_inicio: toStringValue(vigenciaInicio),
    vigencia_fin: toStringValue(readCell(ws, 'C7')),
    ips_union_temporal: toStringValue(readCell(ws, 'C8')),
    nit: toStringValue(readCell(ws, 'C9')),
    representante_legal: toStringValue(readCell(ws, 'C10')),
    cc_representante: toStringValue(readCell(ws, 'C11')),
    servicio_objeto_contractual: toStringValue(readCell(ws, 'C12')),
    departamento: toStringValue(readCell(ws, 'C13')),
    municipios: splitMunicipalities(toStringValue(readCell(ws, 'C14'))),
    poblacion_objeto: toNumberValue(readCell(ws, 'C15')),
    regimen: toStringValue(readCell(ws, 'C16')),
    enfoque_diferencial_indigena: toStringValue(readCell(ws, 'C17')),
    valor_contratado_inicial_anual: toNumberValue(readCell(ws, 'C20')),
    valor_mensual_proyectado_inicial: toNumberValue(readCell(ws, 'C21')),
    ajuste_nota_tecnica: toStringValue(readCell(ws, 'C22')),
    mes_ajuste: toNumberValue(readCell(ws, 'C23')),
    nuevo_valor_mensual_ajuste: toNumberValue(readCell(ws, 'C24')),
    valor_contratado_final_anual: toNumberValue(readCell(ws, 'C25')),
    franja_minima: toNumberValue(readCell(ws, 'C26')),
    franja_maxima: toNumberValue(readCell(ws, 'C27')),
    riesgo_compartido: toNumberValue(readCell(ws, 'C28')),
    limite_inferior_anual: toNumberValue(readCell(ws, 'C29')),
    limite_superior_anual: toNumberValue(readCell(ws, 'C30')),
    vigencia_anio: (() => {
      const date = vigenciaInicio instanceof Date ? vigenciaInicio : null;
      return date ? date.getFullYear() : null;
    })(),
  };

  return data;
}

function buildServices(ws: XLSX.WorkSheet, contract: ContractData): GenericRow[] {
  const rows: GenericRow[] = [];

  for (let row = 5; row <= 24; row += 1) {
    const item = toNumberValue(readCell(ws, `B${row}`));
    if (item === null) continue;

    const cups = toStringValue(readCell(ws, `C${row}`));
    const descripcion = toStringValue(readCell(ws, `D${row}`));
    const frecuencia = toNumberValue(readCell(ws, `E${row}`));
    const tarifa = toNumberValue(readCell(ws, `F${row}`));
    const valorAnual = toNumberValue(readCell(ws, `G${row}`));
    const valorMensual = toNumberValue(readCell(ws, `H${row}`));
    const porcentaje = toNumberValue(readCell(ws, `I${row}`));

    rows.push({
      item,
      codigo_cups: cups,
      descripcion_servicio: descripcion,
      frecuencia_anual: frecuencia,
      tarifa_unitaria: tarifa,
      valor_anual: valorAnual,
      valor_mensual: valorMensual,
      porcentaje_contrato: porcentaje,
      numero_contrato: contract.numero_contrato,
      nit_entidad: contract.nit,
      regimen: contract.regimen,
      departamento: contract.departamento,
      municipio: contract.municipios.join(', '),
      vigencia_anio: contract.vigencia_anio,
    });
  }

  return rows;
}

function buildMonthlyTracking(ws: XLSX.WorkSheet, contract: ContractData): GenericRow[] {
  const rows: GenericRow[] = [];

  for (let row = 5; row <= 16; row += 1) {
    rows.push({
      item: toNumberValue(readCell(ws, `B${row}`)),
      mes: toStringValue(readCell(ws, `C${row}`)),
      valor_proyectado: toNumberValue(readCell(ws, `D${row}`)),
      valor_ejecutado: toNumberValue(readCell(ws, `E${row}`)),
      desviacion: toNumberValue(readCell(ws, `F${row}`)),
      porcentaje_cumplimiento: toNumberValue(readCell(ws, `G${row}`)),
      estado_cumplimiento: toStringValue(readCell(ws, `H${row}`)),
      ejecutado_acumulado: toNumberValue(readCell(ws, `I${row}`)),
      observaciones: toStringValue(readCell(ws, `J${row}`)),
      numero_contrato: contract.numero_contrato,
      nit_entidad: contract.nit,
      regimen: contract.regimen,
      departamento: contract.departamento,
      municipio: contract.municipios.join(', '),
      vigencia_anio: contract.vigencia_anio,
    });
  }

  return rows;
}

function buildQuarterlyTracking(ws: XLSX.WorkSheet, contract: ContractData): GenericRow[] {
  const rows: GenericRow[] = [];

  for (let row = 4; row <= 8; row += 1) {
    rows.push({
      trimestre: toStringValue(readCell(ws, `B${row}`)),
      meses: toStringValue(readCell(ws, `C${row}`)),
      proyectado: toNumberValue(readCell(ws, `D${row}`)),
      ejecutado: toNumberValue(readCell(ws, `E${row}`)),
      porcentaje_cumplimiento: toNumberValue(readCell(ws, `F${row}`)),
      limite_inferior: toNumberValue(readCell(ws, `G${row}`)),
      limite_superior: toNumberValue(readCell(ws, `H${row}`)),
      estado_cumplimiento: toStringValue(readCell(ws, `I${row}`)),
      faltante_exceso: toNumberValue(readCell(ws, `J${row}`)),
      descuento: toNumberValue(readCell(ws, `K${row}`)),
      reconocimiento: toNumberValue(readCell(ws, `L${row}`)),
      numero_contrato: contract.numero_contrato,
      nit_entidad: contract.nit,
      regimen: contract.regimen,
      departamento: contract.departamento,
      municipio: contract.municipios.join(', '),
      vigencia_anio: contract.vigencia_anio,
    });
  }

  return rows;
}

function buildAnnualClosing(ws: XLSX.WorkSheet, contract: ContractData): GenericRow[] {
  const map: Array<{ label: string; cell: string }> = [
    { label: 'valor_contrato_inicial', cell: 'C11' },
    { label: 'valor_contratado_final', cell: 'C12' },
    { label: 'valor_ejecutado_anual', cell: 'C13' },
    { label: 'porcentaje_cumplimiento_anual', cell: 'C14' },
    { label: 'valor_sobre_sub_ejecutado', cell: 'C15' },
    { label: 'limite_inferior_anual', cell: 'C16' },
    { label: 'limite_superior_anual', cell: 'C17' },
    { label: 'estado_anual_franja', cell: 'C18' },
    { label: 'descuentos_acumulados', cell: 'C21' },
    { label: 'reconocimientos_acumulados', cell: 'C22' },
    { label: 'saldo_neto', cell: 'C23' },
    { label: 'naturaleza_saldo', cell: 'C24' },
    { label: 'valor_reconocer_liquidacion', cell: 'C27' },
    { label: 'valor_descontar_liquidacion', cell: 'C28' },
    { label: 'observacion_acta', cell: 'C29' },
  ];

  return map.map((entry) => ({
    campo: entry.label,
    valor: (() => {
      const raw = readCell(ws, entry.cell);
      const asNumber = toNumberValue(raw);
      if (asNumber !== null) return asNumber;
      return toStringValue(raw);
    })(),
    numero_contrato: contract.numero_contrato,
    nit_entidad: contract.nit,
    regimen: contract.regimen,
    departamento: contract.departamento,
    municipio: contract.municipios.join(', '),
    vigencia_anio: contract.vigencia_anio,
  }));
}

function buildAlerts(ws: XLSX.WorkSheet, contract: ContractData) {
  const monthlyAlerts: GenericRow[] = [];
  for (let row = 5; row <= 16; row += 1) {
    monthlyAlerts.push({
      mes: toStringValue(readCell(ws, `B${row}`)),
      porcentaje_cumplimiento: toNumberValue(readCell(ws, `C${row}`)),
      estado_cumplimiento: toStringValue(readCell(ws, `D${row}`)),
      desviacion: toNumberValue(readCell(ws, `E${row}`)),
      accion_recomendada: toStringValue(readCell(ws, `F${row}`)),
      numero_contrato: contract.numero_contrato,
      nit_entidad: contract.nit,
      regimen: contract.regimen,
      departamento: contract.departamento,
      municipio: contract.municipios.join(', '),
      vigencia_anio: contract.vigencia_anio,
    });
  }

  const quarterlyAlerts: GenericRow[] = [];
  for (let row = 27; row <= 30; row += 1) {
    quarterlyAlerts.push({
      trimestre: toStringValue(readCell(ws, `B${row}`)),
      porcentaje_cumplimiento: toNumberValue(readCell(ws, `C${row}`)),
      estado_cumplimiento: toStringValue(readCell(ws, `D${row}`)),
      descuento: toNumberValue(readCell(ws, `E${row}`)),
      reconocimiento: toNumberValue(readCell(ws, `F${row}`)),
      numero_contrato: contract.numero_contrato,
      nit_entidad: contract.nit,
      regimen: contract.regimen,
      departamento: contract.departamento,
      municipio: contract.municipios.join(', '),
      vigencia_anio: contract.vigencia_anio,
    });
  }

  return { monthlyAlerts, quarterlyAlerts };
}

function buildInstructions(ws: XLSX.WorkSheet): GenericRow[] {
  const rows: GenericRow[] = [];

  for (let row = 1; row <= 38; row += 1) {
    const colA = toStringValue(readCell(ws, `A${row}`));
    const colB = toStringValue(readCell(ws, `B${row}`));
    const colC = toStringValue(readCell(ws, `C${row}`));
    const colD = toStringValue(readCell(ws, `D${row}`));

    if (!colA && !colB && !colC && !colD) continue;

    rows.push({
      fila: row,
      columna_a: colA,
      columna_b: colB,
      columna_c: colC,
      columna_d: colD,
    });
  }

  return rows;
}

function toConsolidatedRows(params: {
  contract: ContractData;
  services: GenericRow[];
  monthlyTracking: GenericRow[];
  quarterlyTracking: GenericRow[];
  annualClosing: GenericRow[];
  monthlyAlerts: GenericRow[];
  quarterlyAlerts: GenericRow[];
}): GenericRow[] {
  const {
    contract,
    services,
    monthlyTracking,
    quarterlyTracking,
    annualClosing,
    monthlyAlerts,
    quarterlyAlerts,
  } = params;

  const base = {
    numero_contrato: contract.numero_contrato,
    nit_entidad: contract.nit,
    regimen: contract.regimen,
    departamento: contract.departamento,
    municipio: contract.municipios.join(', '),
    vigencia_anio: contract.vigencia_anio,
  };

  const contractRow: GenericRow = {
    id: 'contrato-1',
    record_type: 'contrato',
    sheet_name: '02_Datos_Contrato',
    ...base,
    codigo_cups: null,
    descripcion_servicio: contract.servicio_objeto_contractual,
    observaciones: null,
    mes: null,
    trimestre: null,
    estado_cumplimiento: null,
  };

  const serviceRows = services.map((item, index) => ({
    id: `servicio-${index + 1}`,
    record_type: 'servicio',
    sheet_name: '03_Nota_Tecnica',
    ...base,
    codigo_cups: item.codigo_cups ?? null,
    descripcion_servicio: item.descripcion_servicio ?? null,
    observaciones: null,
    mes: null,
    trimestre: null,
    estado_cumplimiento: null,
    ...item,
  }));

  const monthlyRows = monthlyTracking.map((item, index) => ({
    id: `mensual-${index + 1}`,
    record_type: 'mensual',
    sheet_name: '04_Seguimiento_Mensual',
    ...base,
    codigo_cups: null,
    descripcion_servicio: null,
    observaciones: item.observaciones ?? null,
    mes: item.mes ?? null,
    trimestre: null,
    estado_cumplimiento: item.estado_cumplimiento ?? null,
    ...item,
  }));

  const quarterlyRows = quarterlyTracking.map((item, index) => ({
    id: `trimestral-${index + 1}`,
    record_type: 'trimestral',
    sheet_name: '05_Seguimiento_Trimestral',
    ...base,
    codigo_cups: null,
    descripcion_servicio: null,
    observaciones: null,
    mes: null,
    trimestre: item.trimestre ?? null,
    estado_cumplimiento: item.estado_cumplimiento ?? null,
    ...item,
  }));

  const annualRows = annualClosing.map((item, index) => ({
    id: `cierre-${index + 1}`,
    record_type: 'cierre_anual',
    sheet_name: '06_Cierre_Anual',
    ...base,
    codigo_cups: null,
    descripcion_servicio: null,
    observaciones: item.campo === 'observacion_acta' ? item.valor : null,
    mes: null,
    trimestre: null,
    estado_cumplimiento: item.campo === 'estado_anual_franja' ? item.valor : null,
    ...item,
  }));

  const monthlyAlertRows = monthlyAlerts.map((item, index) => ({
    id: `alerta-mes-${index + 1}`,
    record_type: 'alerta_mensual',
    sheet_name: '07_Alertas_Semaforo',
    ...base,
    codigo_cups: null,
    descripcion_servicio: null,
    observaciones: item.accion_recomendada ?? null,
    mes: item.mes ?? null,
    trimestre: null,
    estado_cumplimiento: item.estado_cumplimiento ?? null,
    ...item,
  }));

  const quarterlyAlertRows = quarterlyAlerts.map((item, index) => ({
    id: `alerta-trimestre-${index + 1}`,
    record_type: 'alerta_trimestral',
    sheet_name: '07_Alertas_Semaforo',
    ...base,
    codigo_cups: null,
    descripcion_servicio: null,
    observaciones: null,
    mes: null,
    trimestre: item.trimestre ?? null,
    estado_cumplimiento: item.estado_cumplimiento ?? null,
    ...item,
  }));

  return [contractRow, ...serviceRows, ...monthlyRows, ...quarterlyRows, ...annualRows, ...monthlyAlertRows, ...quarterlyAlertRows];
}

export async function GET(request: NextRequest) {
  if (!isExcelExportAuthenticated(request)) {
    return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
  }

  try {
    if (!fs.existsSync(EXCEL_FILE_PATH)) {
      return NextResponse.json(
        { message: `No se encontró el archivo en ${EXCEL_FILE_PATH}` },
        { status: 404 }
      );
    }

    const fileBuffer = fs.readFileSync(EXCEL_FILE_PATH);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true, raw: true });
    const requiredSheets = [
      '01_Instrucciones',
      '02_Datos_Contrato',
      '03_Nota_Tecnica',
      '04_Seguimiento_Mensual',
      '05_Seguimiento_Trimestral',
      '06_Cierre_Anual',
      '07_Alertas_Semaforo',
    ];

    const missingSheets = requiredSheets.filter((name) => !workbook.Sheets[name]);
    if (missingSheets.length > 0) {
      return NextResponse.json(
        { message: `Faltan hojas requeridas en el Excel: ${missingSheets.join(', ')}` },
        { status: 400 }
      );
    }

    const wsInstructions = workbook.Sheets['01_Instrucciones'];
    const wsContract = workbook.Sheets['02_Datos_Contrato'];
    const wsServices = workbook.Sheets['03_Nota_Tecnica'];
    const wsMonthly = workbook.Sheets['04_Seguimiento_Mensual'];
    const wsQuarterly = workbook.Sheets['05_Seguimiento_Trimestral'];
    const wsAnnual = workbook.Sheets['06_Cierre_Anual'];
    const wsAlerts = workbook.Sheets['07_Alertas_Semaforo'];

    const contract = buildContractData(wsContract);

    if (contract.ips_union_temporal.toUpperCase() !== 'VITAL SALUD') {
      return NextResponse.json(
        { message: 'El archivo no corresponde a VITAL SALUD SM.' },
        { status: 400 }
      );
    }

    const services = buildServices(wsServices, contract);
    const monthlyTracking = buildMonthlyTracking(wsMonthly, contract);
    const quarterlyTracking = buildQuarterlyTracking(wsQuarterly, contract);
    const annualClosing = buildAnnualClosing(wsAnnual, contract);
    const { monthlyAlerts, quarterlyAlerts } = buildAlerts(wsAlerts, contract);
    const instructions = buildInstructions(wsInstructions);

    const rows = toConsolidatedRows({
      contract,
      services,
      monthlyTracking,
      quarterlyTracking,
      annualClosing,
      monthlyAlerts,
      quarterlyAlerts,
    });

    return NextResponse.json({
      source: 'VITAL SALUD SM.xlsx',
      contract_name: 'VITAL SALUD SM',
      rows,
      dataset: {
        contract,
        services,
        monthlyTracking,
        quarterlyTracking,
        annualClosing,
        monthlyAlerts,
        quarterlyAlerts,
        instructions,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: 'Error cargando datos de VITAL SALUD SM.xlsx.', error: error?.message || 'Error desconocido' },
      { status: 500 }
    );
  }
}
