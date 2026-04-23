import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';

const EXCEL_EXPORT_COOKIE = 'excel_export_auth';
const COLOR_NAVY = 'FF1F4E78';
const COLOR_LIGHT = 'FFF8FAFC';
const COLOR_BORDER = 'FFE2E8F0';

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
  meses: string;
  franja_riesgo_inferior: string;
  valor_contrato: string;
  franja_riesgo_superior: string;
};

type ExecutionSummary = {
  prestador: string;
  contrato: string;
  informes: number;
  total_ejecutado: number;
  total_valor_final: number;
  total_descontar: number;
  total_reconocer: number;
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

function addBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: COLOR_BORDER } },
    left: { style: 'thin', color: { argb: COLOR_BORDER } },
    bottom: { style: 'thin', color: { argb: COLOR_BORDER } },
    right: { style: 'thin', color: { argb: COLOR_BORDER } },
  };
}

function autoFitColumns(worksheet: ExcelJS.Worksheet, minWidth = 14) {
  worksheet.columns?.forEach((column) => {
    let maxLength = minWidth;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const value = cell.value ? String((cell.value as any).text || cell.value) : '';
      maxLength = Math.max(maxLength, Math.min(60, value.length + 2));
    });
    column.width = maxLength;
  });
}

export async function POST(request: NextRequest) {
  if (!isExcelExportAuthenticated(request)) {
    return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const prestador = String(body?.prestador || '').trim();
    const rows: ProviderRow[] = Array.isArray(body?.rows) ? body.rows : [];
    const executionSummary: ExecutionSummary[] = Array.isArray(body?.execution_summary)
      ? body.execution_summary
      : [];

    if (!prestador || !rows.length) {
      return NextResponse.json({ message: 'No hay datos del prestador seleccionado para exportar.' }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PGP Export';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('Datos_Prestador');
    const headers = [
      'NIT',
      'PRESTADOR',
      'ID DE ZONA',
      'WEB',
      'POBLACION',
      'CONTRATO',
      'CIUDAD',
      'DEPARTAMENTO',
      'FECHA INICIO',
      'FECHA FIN',
      'MESES',
      'FRANJA RIESGO INFERIOR',
      'VALOR CONTRATO',
      'FRANJA RIESGO SUPERIOR',
    ];

    ws.mergeCells(1, 1, 1, headers.length);
    ws.getCell(1, 1).value = `INFORMACIÓN PGP — ${prestador}`;
    ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
    ws.getCell(1, 1).font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 };
    ws.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };

    ws.addRow([]);
    const headerRow = ws.addRow(headers);

    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      addBorder(cell);
    });

    rows.forEach((row) => {
      const excelRow = ws.addRow([
        row.nit,
        row.prestador,
        row.id_zona,
        row.web,
        row.poblacion,
        row.contrato,
        row.ciudad,
        row.departamento,
        row.fecha_inicio,
        row.fecha_fin,
        row.meses,
        row.franja_riesgo_inferior,
        row.valor_contrato,
        row.franja_riesgo_superior,
      ]);

      excelRow.eachCell((cell, colNumber) => {
        if (colNumber === 4 && row.web) {
          cell.value = { text: row.web, hyperlink: row.web };
          cell.font = { color: { argb: 'FF1D4ED8' }, underline: true };
        }
        if (excelRow.number % 2 === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_LIGHT } };
        }
        cell.alignment = { vertical: 'middle', wrapText: true };
        addBorder(cell);
      });
    });

    autoFitColumns(ws, 16);

    const relatedExecutionRows = executionSummary.filter(
      (item) =>
        item.prestador.trim().toUpperCase() === prestador.trim().toUpperCase() &&
        rows.some((row) => row.contrato.trim().toUpperCase() === item.contrato.trim().toUpperCase())
    );

    if (relatedExecutionRows.length) {
      const summarySheet = workbook.addWorksheet('Resumen_Ejecucion');
      summarySheet.columns = [
        { header: 'PRESTADOR', key: 'prestador', width: 40 },
        { header: 'CONTRATO', key: 'contrato', width: 30 },
        { header: 'INFORMES', key: 'informes', width: 12 },
        { header: 'TOTAL EJECUTADO', key: 'total_ejecutado', width: 20 },
        { header: 'TOTAL VALOR FINAL', key: 'total_valor_final', width: 20 },
        { header: 'TOTAL DESCONTAR', key: 'total_descontar', width: 20 },
        { header: 'TOTAL RECONOCER', key: 'total_reconocer', width: 20 },
      ];

      const summaryHeader = summarySheet.getRow(1);
      summaryHeader.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        addBorder(cell);
      });

      relatedExecutionRows.forEach((item) => {
        const r = summarySheet.addRow(item);
        r.eachCell((cell, colNumber) => {
          if (colNumber >= 4 && colNumber <= 7) {
            cell.numFmt = '$#,##0.00';
          }
          addBorder(cell);
        });
      });
    }

    const contractForName = sanitizeFilePart(rows[0]?.contrato || 'SIN_CONTRATO');
    const providerForName = sanitizeFilePart(prestador || 'SIN_PRESTADOR');
    const fileName = `PGP_${contractForName}_${providerForName}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: 'No fue posible generar la exportación.', error: error?.message || 'Error desconocido' },
      { status: 500 }
    );
  }
}
