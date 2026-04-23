import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';

const EXCEL_EXPORT_COOKIE = 'excel_export_auth';
const COLOR_NAVY = 'FF1F4E78';
const COLOR_YELLOW = 'FFFFF2CC';
const COLOR_GREEN = 'FFE2EFDA';

type JsonValue = string | number | boolean | null;
type GenericRow = Record<string, JsonValue>;

function isExcelExportAuthenticated(request: NextRequest) {
  return request.cookies.get(EXCEL_EXPORT_COOKIE)?.value === '1';
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    };
  });
}

function styleDataBorders(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
    };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
}

function setYellowCells(worksheet: ExcelJS.Worksheet, rowIndex: number, columns: number[]) {
  columns.forEach((column) => {
    worksheet.getCell(rowIndex, column).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR_YELLOW },
    };
  });
}

function autoFitColumns(worksheet: ExcelJS.Worksheet, minWidth = 16) {
  worksheet.columns?.forEach((column) => {
    let maxLength = minWidth;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const value = cell.value ? String(cell.value) : '';
      maxLength = Math.max(maxLength, Math.min(60, value.length + 2));
    });
    column.width = maxLength;
  });
}

function addContractSheet(workbook: ExcelJS.Workbook, contract: GenericRow | null) {
  const ws = workbook.addWorksheet('02_Datos_Contrato');
  ws.mergeCells('A1:E1');
  ws.getCell('A1').value = 'DATOS GENERALES DEL CONTRATO PGP - VITAL SALUD SM';
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
  ws.getCell('A1').font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

  const rows: Array<[string, JsonValue]> = [
    ['Número de contrato', contract?.numero_contrato ?? null],
    ['NIT', contract?.nit_entidad ?? null],
    ['Régimen', contract?.regimen ?? null],
    ['Departamento', contract?.departamento ?? null],
    ['Municipio', contract?.municipio ?? null],
    ['Vigencia año', contract?.vigencia_anio ?? null],
    ['Descripción servicio', contract?.descripcion_servicio ?? null],
  ];

  ws.addRow([]);
  ws.addRow(['Campo', 'Valor']);
  styleHeader(ws.getRow(3));

  rows.forEach(([label, value]) => {
    const row = ws.addRow([label, value]);
    styleDataBorders(row);
    setYellowCells(ws, row.number, [2]);
  });

  autoFitColumns(ws, 20);
}

function addTableSheet(params: {
  workbook: ExcelJS.Workbook;
  name: string;
  title: string;
  columns: string[];
  rows: GenericRow[];
  yellowColumns?: number[];
  totalColumns?: number[];
}) {
  const { workbook, name, title, columns, rows, yellowColumns = [], totalColumns = [] } = params;

  const ws = workbook.addWorksheet(name);
  ws.mergeCells(1, 1, 1, columns.length);
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
  ws.getCell(1, 1).font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 };
  ws.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.addRow([]);
  const header = ws.addRow(columns);
  styleHeader(header);

  rows.forEach((entry) => {
    const rowValues = columns.map((key) => entry[key] ?? null);
    const row = ws.addRow(rowValues);
    styleDataBorders(row);

    if (yellowColumns.length) {
      setYellowCells(ws, row.number, yellowColumns);
    }

    if (String(entry.total ?? '').toLowerCase() === 'true') {
      totalColumns.forEach((colIndex) => {
        ws.getCell(row.number, colIndex).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLOR_GREEN },
        };
      });
    }
  });

  autoFitColumns(ws, 14);
}

export async function POST(request: NextRequest) {
  if (!isExcelExportAuthenticated(request)) {
    return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const rows: GenericRow[] = Array.isArray(body?.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json({ message: 'No hay datos filtrados para exportar.' }, { status: 400 });
    }

    const contractRow = rows.find((row) => row.record_type === 'contrato') || null;
    const serviceRows = rows.filter((row) => row.record_type === 'servicio');
    const monthlyRows = rows.filter((row) => row.record_type === 'mensual');
    const quarterlyRows = rows.filter((row) => row.record_type === 'trimestral');
    const annualRows = rows.filter((row) => row.record_type === 'cierre_anual');
    const monthlyAlertRows = rows.filter((row) => row.record_type === 'alerta_mensual');
    const quarterlyAlertRows = rows.filter((row) => row.record_type === 'alerta_trimestral');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PGP Export';
    workbook.created = new Date();

    addContractSheet(workbook, contractRow);

    addTableSheet({
      workbook,
      name: '03_Nota_Tecnica',
      title: 'NOTA TÉCNICA — ACTIVIDADES CONTRATADAS',
      columns: [
        'item',
        'codigo_cups',
        'descripcion_servicio',
        'frecuencia_anual',
        'tarifa_unitaria',
        'valor_anual',
        'valor_mensual',
        'porcentaje_contrato',
      ],
      rows: serviceRows,
      yellowColumns: [2, 3, 4, 5],
      totalColumns: [6, 7, 8],
    });

    addTableSheet({
      workbook,
      name: '04_Seguimiento_Mensual',
      title: 'SEGUIMIENTO MENSUAL DE EJECUCIÓN FINANCIERA',
      columns: [
        'item',
        'mes',
        'valor_proyectado',
        'valor_ejecutado',
        'desviacion',
        'porcentaje_cumplimiento',
        'estado_cumplimiento',
        'ejecutado_acumulado',
        'observaciones',
      ],
      rows: monthlyRows,
      yellowColumns: [4, 9],
      totalColumns: [3, 4, 5],
    });

    addTableSheet({
      workbook,
      name: '05_Seguimiento_Trimestral',
      title: 'SEGUIMIENTO TRIMESTRAL Y EVALUACIÓN FRENTE A FRANJA DE RIESGO',
      columns: [
        'trimestre',
        'meses',
        'proyectado',
        'ejecutado',
        'porcentaje_cumplimiento',
        'limite_inferior',
        'limite_superior',
        'estado_cumplimiento',
        'faltante_exceso',
        'descuento',
        'reconocimiento',
      ],
      rows: quarterlyRows,
      yellowColumns: [],
      totalColumns: [3, 4, 10, 11],
    });

    addTableSheet({
      workbook,
      name: '06_Cierre_Anual',
      title: 'CIERRE ANUAL DE EJECUCIÓN FINANCIERA',
      columns: ['campo', 'valor'],
      rows: annualRows,
      yellowColumns: [],
    });

    addTableSheet({
      workbook,
      name: '07_Alertas_Semaforo',
      title: 'ALERTAS MENSUALES',
      columns: ['mes', 'porcentaje_cumplimiento', 'estado_cumplimiento', 'desviacion', 'accion_recomendada'],
      rows: monthlyAlertRows,
      yellowColumns: [],
    });

    addTableSheet({
      workbook,
      name: '07_Alertas_Trimestre',
      title: 'ESTADO TRIMESTRAL',
      columns: ['trimestre', 'porcentaje_cumplimiento', 'estado_cumplimiento', 'descuento', 'reconocimiento'],
      rows: quarterlyAlertRows,
      yellowColumns: [],
    });

    addTableSheet({
      workbook,
      name: 'Consolidado_Filtrado',
      title: 'EXPORTACIÓN CONSOLIDADA FILTRADA',
      columns: [
        'record_type',
        'sheet_name',
        'numero_contrato',
        'nit_entidad',
        'codigo_cups',
        'descripcion_servicio',
        'observaciones',
        'mes',
        'trimestre',
        'regimen',
        'departamento',
        'municipio',
        'estado_cumplimiento',
        'vigencia_anio',
      ],
      rows,
      yellowColumns: [5, 6, 7],
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    return new NextResponse(buffer as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="vital-salud-sm-filtrado-${stamp}.xlsx"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: 'No fue posible generar la exportación.', error: error?.message || 'Error desconocido' },
      { status: 500 }
    );
  }
}
