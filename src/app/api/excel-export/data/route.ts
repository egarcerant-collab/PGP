import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const GOOGLE_SHEET_ID = '10Icu1DO4llbolO60VsdFcN5vxuYap1vBZs6foZ-XD04';
const GOOGLE_SHEET_GID = '0';
const GOOGLE_SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=${GOOGLE_SHEET_GID}`;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fvrgfqxohacipmnmqyef.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ezUmThavYstyax693c7ZmA_jda4yXNA';

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\r|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function toText(value: unknown): string {
  return String(value ?? '').trim();
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = toText(value);
  if (!text) return 0;
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
  return Number.isFinite(parsed) ? parsed : 0;
}

function pick(row: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) if (alias in row) return row[alias];
  return '';
}

function normalizeKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function parseProvidersFromCsv(csvText: string) {
  const workbook = XLSX.read(csvText, { type: 'string' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const originalRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  return originalRows
    .map((row) => {
      const normalized: Record<string, unknown> = {};
      Object.entries(row).forEach(([key, value]) => { normalized[normalizeHeader(key)] = value; });
      return normalized;
    })
    .map((row) => {
      const mesesTexto = toText(pick(row, ['MESES']));
      const valorMensualTexto = toText(pick(row, ['VALOR_CONTRATO_MENSUAL', 'VALOR_MENSUAL', 'VALOR_CONTRATO']));
      const meses = toNumber(mesesTexto);
      const valor_mensual = toNumber(valorMensualTexto);
      const valor_total = valor_mensual * meses;
      return {
        nit: toText(pick(row, ['NIT'])),
        prestador: toText(pick(row, ['PRESTADOR'])),
        id_zona: toText(pick(row, ['ID_DE_ZONA'])),
        web: toText(pick(row, ['WEB'])),
        poblacion: toText(pick(row, ['POBLACION'])),
        contrato: toText(pick(row, ['CONTRATO'])),
        ciudad: toText(pick(row, ['CIUDAD'])),
        departamento: toText(pick(row, ['DEPARTAMENTO'])),
        fecha_inicio: toText(pick(row, ['FECHA_INICIO_DE_CONTRATO', 'FECHA_INICIO'])),
        fecha_fin: toText(pick(row, ['FECHA_FIN_DE_CONTRATO', 'FECHA_FIN'])),
        meses,
        valor_mensual,
        valor_total,
        franja_riesgo_inferior: valor_total * 0.9,
        franja_riesgo_superior: valor_total * 1.1,
        valor_mensual_texto: valorMensualTexto,
        meses_texto: mesesTexto,
      };
    })
    .filter((row) => row.prestador && row.contrato)
    .sort((a, b) => a.prestador.localeCompare(b.prestador, 'es', { sensitivity: 'base' }));
}

async function getExecutionSummary() {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase
      .from('informes')
      .select('prestador, contrato, total_ejecutado, valor_final, descontar, reconocer');
    if (error || !data?.length) return [];
    const grouped = new Map<string, any>();
    for (const row of data) {
      const prestador = toText(row.prestador);
      const contrato = toText(row.contrato);
      if (!prestador || !contrato) continue;
      const key = `${normalizeKey(prestador)}__${normalizeKey(contrato)}`;
      const current = grouped.get(key) ?? { prestador, contrato, informes: 0, total_ejecutado: 0, total_valor_final: 0, total_descontar: 0, total_reconocer: 0 };
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

export async function GET() {
  try {
    const response = await fetch(GOOGLE_SHEET_CSV_URL, { cache: 'no-store', next: { revalidate: 0 } });
    if (!response.ok) {
      return NextResponse.json({ message: `No se pudo leer Google Sheets (status ${response.status}).` }, { status: 400 });
    }
    const rows = parseProvidersFromCsv(await response.text());
    const providers = Array.from(new Set(rows.map((row) => row.prestador))).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    return NextResponse.json({
      source: 'Google Sheets',
      spreadsheet_url: `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/edit?gid=${GOOGLE_SHEET_GID}#gid=${GOOGLE_SHEET_GID}`,
      providers,
      rows,
      execution_summary: await getExecutionSummary(),
    });
  } catch (error: any) {
    return NextResponse.json({ message: 'Error cargando prestadores desde Google Sheets.', error: error?.message || 'Error desconocido' }, { status: 500 });
  }
}
