import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const EXCEL_EXPORT_COOKIE = 'excel_export_auth';
const GOOGLE_SHEET_ID = '10Icu1DO4llbolO60VsdFcN5vxuYap1vBZs6foZ-XD04';
const GOOGLE_SHEET_GID = '0';
const GOOGLE_SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=${GOOGLE_SHEET_GID}`;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fvrgfqxohacipmnmqyef.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ezUmThavYstyax693c7ZmA_jda4yXNA';

export type ProviderRow = {
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
  // Campos financieros normalizados (numéricos)
  meses: number;                    // Columna K del Google Sheet
  valor_mensual: number;            // Columna M (VALOR CONTRATO MENSUAL)
  valor_total: number;              // Calculado: valor_mensual * meses
  franja_riesgo_inferior: number;   // Calculado: valor_total * 0.90
  franja_riesgo_superior: number;   // Calculado: valor_total * 1.10
  // Texto original para depuración / compatibilidad
  valor_mensual_texto: string;
  meses_texto: string;
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

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\r|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\(\s*90\s*%\s*\)/gi, '90')
    .replace(/\(\s*110\s*%\s*\)/gi, '110')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = toText(value);
  if (!text) return 0;

  // Heurística robusta para formatos US ("1,234.56") y ES/CO ("1.234,56")
  const cleaned = text.replace(/\$/g, '').replace(/\s/g, '');
  let normalized = cleaned;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // coma decimal (ES/CO) -> quita puntos, coma -> punto
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // punto decimal (US) -> quita comas
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    const tail = cleaned.length - 1 - lastComma;
    if (tail <= 2 && cleaned.split(',').length === 2) {
      normalized = cleaned.replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  }
  normalized = normalized.replace(/[^\d.-]/g, '');
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickValue(row: Record<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    if (alias in row) {
      return row[alias];
    }
  }
  return '';
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function parseProvidersFromCsv(csvText: string): ProviderRow[] {
  const workbook = XLSX.read(csvText, { type: 'string' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) return [];

  const worksheet = workbook.Sheets[firstSheetName];
  const originalRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
    raw: false,
  });

  const normalizedRows = originalRows.map((row) => {
    const normalized: Record<string, unknown> = {};
    Object.entries(row).forEach(([key, value]) => {
      normalized[normalizeHeader(key)] = value;
    });
    return normalized;
  });

  return normalizedRows
    .map((row): ProviderRow => {
      // Columna K (MESES) y M (VALOR CONTRATO MENSUAL) del Google Sheet
      const mesesTexto = toText(pickValue(row, ['MESES']));
      const valorMensualTexto = toText(
        pickValue(row, ['VALOR_CONTRATO_MENSUAL', 'VALOR_MENSUAL', 'VALOR_CONTRATO'])
      );
      const meses = toNumber(mesesTexto) || 0;
      const valor_mensual = toNumber(valorMensualTexto) || 0;
      const valor_total = valor_mensual * meses;
      const franja_riesgo_inferior = valor_total * 0.9;
      const franja_riesgo_superior = valor_total * 1.1;

      return {
        nit: toText(pickValue(row, ['NIT'])),
        prestador: toText(pickValue(row, ['PRESTADOR'])),
        id_zona: toText(pickValue(row, ['ID_DE_ZONA'])),
        web: toText(pickValue(row, ['WEB'])),
        poblacion: toText(pickValue(row, ['POBLACION'])),
        contrato: toText(pickValue(row, ['CONTRATO'])),
        ciudad: toText(pickValue(row, ['CIUDAD'])),
        departamento: toText(pickValue(row, ['DEPARTAMENTO'])),
        fecha_inicio: toText(pickValue(row, ['FECHA_INICIO_DE_CONTRATO', 'FECHA_INICIO'])),
        fecha_fin: toText(pickValue(row, ['FECHA_FIN_DE_CONTRATO', 'FECHA_FIN'])),
        meses,
        valor_mensual,
        valor_total,
        franja_riesgo_inferior,
        franja_riesgo_superior,
        valor_mensual_texto: valorMensualTexto,
        meses_texto: mesesTexto,
      };
    })
    .filter((row) => row.prestador && row.contrato)
    .sort((a, b) => a.prestador.localeCompare(b.prestador, 'es', { sensitivity: 'base' }));
}

async function getExecutionSummary(): Promise<ExecutionSummary[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase
      .from('informes')
      .select('prestador, contrato, total_ejecutado, valor_final, descontar, reconocer');

    if (error || !data?.length) return [];

    const grouped = new Map<string, ExecutionSummary>();

    for (const row of data) {
      const prestador = toText(row.prestador);
      const contrato = toText(row.contrato);
      if (!prestador || !contrato) continue;

      const key = `${normalizeKey(prestador)}__${normalizeKey(contrato)}`;
      const current = grouped.get(key) ?? {
        prestador,
        contrato,
        informes: 0,
        total_ejecutado: 0,
        total_valor_final: 0,
        total_descontar: 0,
        total_reconocer: 0,
      };

      current.informes += 1;
      current.total_ejecutado += toNumber(row.total_ejecutado);
      current.total_valor_final += toNumber(row.valor_final);
      current.total_descontar += toNumber(row.descontar);
      current.total_reconocer += toNumber(row.reconocer);

      grouped.set(key, current);
    }

    return Array.from(grouped.values());
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  if (!isExcelExportAuthenticated(request)) {
    return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
  }

  try {
    const response = await fetch(GOOGLE_SHEET_CSV_URL, {
      cache: 'no-store',
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          message: `No se pudo leer Google Sheets (status ${response.status}). Verifica permisos de acceso público.`,
        },
        { status: 400 }
      );
    }

    const csvText = await response.text();
    const rows = parseProvidersFromCsv(csvText);

    const providerNames = Array.from(new Set(rows.map((row) => row.prestador))).sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );

    const executionSummary = await getExecutionSummary();

    return NextResponse.json({
      source: 'Google Sheets',
      spreadsheet_url: `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/edit?gid=${GOOGLE_SHEET_GID}#gid=${GOOGLE_SHEET_GID}`,
      providers: providerNames,
      rows,
      execution_summary: executionSummary,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        message: 'Error cargando prestadores desde Google Sheets.',
        error: error?.message || 'Error desconocido',
      },
      { status: 500 }
    );
  }
}
