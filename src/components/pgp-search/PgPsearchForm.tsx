"use client";

import { useState, useCallback, useEffect, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  FileText,
  Calendar,
  ChevronDown,
  Building,
  AlertTriangle,
  Search,
  Users,
  Wallet,
  AlertCircle,
  Info,
  Landmark,
  CheckCircle2
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fetchSheetData, type PrestadorInfo } from '@/lib/sheets';
import { type ExecutionDataByMonth, type ModuleId } from '@/app/page';
import FinancialMatrix, { type MonthlyFinancialSummary } from './FinancialMatrix';
import { buildMatrizEjecucion, findColumnValue } from '@/lib/matriz-helpers';
import Papa from 'papaparse';
import { getNumericValue, serializeExecutionData, type SavedAuditData, type RegimenTotals } from '../app/JsonAnalyzerPage';
import DiscountMatrix, { type DiscountMatrixRow, type ServiceType, type AdjustedData } from './DiscountMatrix';
import StatCard from '../shared/StatCard';
import InformeDesviaciones from '../report/InformeDesviaciones';
import CertificadoTrimestral from '../report/CertificadoTrimestral';
import NotaTecnicaValidator from './NotaTecnicaValidator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type Prestador = PrestadorInfo;

export interface SummaryData {
  totalCostoMes: number;
  totalPeriodo: number;
  totalAnual: number;
  costoMinimoPeriodo: number;
  costoMaximoPeriodo: number;
}

interface PgpRow {
  [key: string]: any;
}

export interface DeviatedCupInfo {
    cup: string;
    description?: string;
    activityDescription?: string;
    expectedFrequency: number;
    realFrequency: number;
    uniqueUsers: number;
    repeatedAttentions: number;
    sameDayDetections: number;
    sameDayDetectionsCost: number;
    deviation: number;
    deviationValue: number;
    totalValue: number;
    valorReconocer: number;
    unitValueFromNote?: number;
}

export interface UnexpectedCupInfo {
    cup: string;
    description?: string;
    realFrequency: number;
    totalValue: number;
    serviceType: ServiceType;
}

export interface ComparisonSummary {
    monthlyFinancials: MonthlyFinancialSummary[];
    overExecutedCups: DeviatedCupInfo[];
    underExecutedCups: DeviatedCupInfo[];
    missingCups: DeviatedCupInfo[];
    unexpectedCups: UnexpectedCupInfo[];
    normalExecutionCups: DeviatedCupInfo[];
    matrizDescuentos: DiscountMatrixRow[];
}

export interface ReportData {
  header: {
    empresa: string;
    nit: string;
    ipsNombre: string;
    ipsNit: string;
    municipio: string;
    contrato: string;
    vigencia: string;
    ciudad?: string;
    fecha?: string;
    responsable1?: { nombre: string; cargo: string };
  };
  months: { month: string; cups: number; valueCOP: number; }[];
  notaTecnica: {
    min90: number;
    valor3m: number;
    max110: number;
    anticipos: number;
    totalPagar: number;
    totalFinal: number;
    descuentoAplicado: number;
  };
  overExecutedCups: DeviatedCupInfo[];
  underExecutedCups: DeviatedCupInfo[];
  missingCups: DeviatedCupInfo[];
  unexpectedCups: UnexpectedCupInfo[];
  adjustedData?: AdjustedData;
}

interface PgPsearchFormProps {
  executionDataByMonth: ExecutionDataByMonth;
  jsonPrestadorCode: string | null;
  uniqueUserCount: number;
  initialAuditData: SavedAuditData | null;
  regimenTotals?: RegimenTotals;
  activeModule?: ModuleId;
  onPrestadorLoaded?: (name: string) => void;
  userName?: string;
  userRole?: string;
}

const PRESTADORES_SHEET_URL = "https://docs.google.com/spreadsheets/d/10Icu1DO4llbolO60VsdFcN5vxuYap1vBZs6foZ-XD04/edit?gid=0#gid=0";

const normalizeString = (v: unknown): string => String(v ?? "").trim();
const normalizeDigits = (v: unknown): string => {
    const digitsOnly = String(v ?? "").trim().replace(/\s+/g, "").replace(/\D/g, "");
    if (!digitsOnly) return "";
    return parseInt(digitsOnly, 10).toString();
};

export const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined || isNaN(value)) return '$0';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
};

const getMonthName = (monthNumber: string) => {
    const date = new Date(2024, parseInt(monthNumber) - 1, 1);
    return date.toLocaleString('es-CO', { month: 'long' }).charAt(0).toUpperCase() + date.toLocaleString('es-CO', { month: 'long' }).slice(1);
};

/** Consolida varias filas del mismo CUPS (una por mes) en una sola fila sumada */
function consolidateDeviatedCups(
  cups: DeviatedCupInfo[],
  executionDataByMonth: ExecutionDataByMonth
): DeviatedCupInfo[] {
  const map = new Map<string, DeviatedCupInfo>();

  cups.forEach(info => {
    const key = info.cup;
    if (!map.has(key)) {
      map.set(key, { ...info });
    } else {
      const acc = map.get(key)!;
      acc.expectedFrequency  += info.expectedFrequency;
      acc.realFrequency      += info.realFrequency;
      acc.deviation           = acc.realFrequency - acc.expectedFrequency;
      acc.deviationValue     += info.deviationValue;
      acc.totalValue         += info.totalValue;
      acc.sameDayDetections  += info.sameDayDetections;
      acc.sameDayDetectionsCost += info.sameDayDetectionsCost;
      acc.valorReconocer      = (acc.valorReconocer || 0) + (info.valorReconocer || 0);
    }
  });

  // Recalcular usuarios únicos (unión entre meses) y atenciones repetidas
  map.forEach((info, cupCode) => {
    const allUsers = new Set<string>();
    let totalRepeated = 0;
    executionDataByMonth.forEach(monthData => {
      const cd = monthData.cupCounts.get(cupCode);
      if (cd) {
        cd.uniqueUsers.forEach(u => allUsers.add(u));
        totalRepeated += Math.max(0, cd.total - cd.uniqueUsers.size);
      }
    });
    info.uniqueUsers       = allUsers.size;
    info.repeatedAttentions = totalRepeated;
  });

  return Array.from(map.values());
}

/** Consolida varias filas del mismo CUPS inesperado (una por mes) */
function consolidateUnexpectedCups(cups: UnexpectedCupInfo[]): UnexpectedCupInfo[] {
  const map = new Map<string, UnexpectedCupInfo>();
  cups.forEach(info => {
    if (!map.has(info.cup)) {
      map.set(info.cup, { ...info });
    } else {
      const acc = map.get(info.cup)!;
      acc.realFrequency += info.realFrequency;
      acc.totalValue    += info.totalValue;
    }
  });
  return Array.from(map.values());
}

export function calculateComparison(pgpData: any[], executionDataByMonth: ExecutionDataByMonth): ComparisonSummary {
  const matrizRows = buildMatrizEjecucion({ executionDataByMonth, pgpData });

  // ── 1. Financials por mes + matrix de descuentos (detalle mensual) ─────────
  const matrizDescuentos: DiscountMatrixRow[] = [];
  const monthlyFinancialsMap = new Map<string, { expected: number; executed: number; activities: number }>();

  matrizRows.forEach(row => {
    const current = monthlyFinancialsMap.get(row.Mes) || { expected: 0, executed: 0, activities: 0 };
    current.expected  += row.Valor_Esperado;
    current.executed  += row.Valor_Ejecutado;
    current.activities += row.Cantidad_Ejecutada;
    monthlyFinancialsMap.set(row.Mes, current);

    const valorReconocer = Math.min(row.Valor_Ejecutado, row.Valor_Esperado * 1.11);
    matrizDescuentos.push({
      cup: row.CUPS, description: row.Descripcion, activityDescription: row.Descripcion,
      expectedFrequency: row.Cantidad_Esperada, realFrequency: row.Cantidad_Ejecutada,
      uniqueUsers: 0, repeatedAttentions: 0, sameDayDetections: 0, sameDayDetectionsCost: 0,
      deviation: row.Diferencia, deviationValue: row.Diferencia * row.Valor_Unitario,
      totalValue: row.Valor_Ejecutado, valorReconocer, unitValueFromNote: row.Valor_Unitario,
      CUPS: row.CUPS, Descripcion: row.Descripcion,
      Cantidad_Ejecutada: row.Cantidad_Ejecutada, Valor_Unitario: row.Valor_Unitario,
      Valor_Ejecutado: row.Valor_Ejecutado, Valor_a_Reconocer: valorReconocer,
      Valor_a_Descontar: Math.max(0, row.Valor_Ejecutado - valorReconocer),
      Clasificacion: row.Clasificacion, Tipo_Servicio: row.Tipo_Servicio as ServiceType,
    });
  });

  // ── 2. Consolidar TODAS las filas por CUPS (suma de TODOS los meses) ──────
  // Clasificar DESPUÉS de consolidar evita que un mismo CUPS aparezca
  // como "Sub" en enero y "Normal" en febrero → ahora sólo aparece una vez
  // con la clasificación del período completo (ej: bimestre, trimestre).
  type PeriodEntry = {
    cup: string; description: string; serviceType: ServiceType;
    totalExpected: number; totalExecuted: number; totalValue: number;
    unitValue: number; isInNT: boolean;
  };
  const cupsPeriodMap = new Map<string, PeriodEntry>();

  matrizRows.forEach(row => {
    const key = row.CUPS;
    const e = cupsPeriodMap.get(key);
    if (!e) {
      cupsPeriodMap.set(key, {
        cup: row.CUPS, description: row.Descripcion || row.CUPS,
        serviceType: row.Tipo_Servicio,
        totalExpected: row.Cantidad_Esperada,
        totalExecuted: row.Cantidad_Ejecutada,
        totalValue: row.Valor_Ejecutado,
        unitValue: row.Valor_Unitario,
        isInNT: row.Clasificacion !== 'Inesperado',
      });
    } else {
      e.totalExpected  += row.Cantidad_Esperada;
      e.totalExecuted  += row.Cantidad_Ejecutada;
      e.totalValue     += row.Valor_Ejecutado;
      if (row.Clasificacion !== 'Inesperado') e.isInNT = true;
    }
  });

  // ── 3. Clasificar con base en los totales del período ─────────────────────
  const overExecutedCupsRaw: DeviatedCupInfo[]   = [];
  const underExecutedCupsRaw: DeviatedCupInfo[]  = [];
  const missingCupsRaw: DeviatedCupInfo[]        = [];
  const normalExecutionCupsRaw: DeviatedCupInfo[] = [];
  const unexpectedCupsRaw: UnexpectedCupInfo[]   = [];

  cupsPeriodMap.forEach(data => {
    if (data.totalExpected === 0 && data.totalExecuted === 0) return;

    const pct = data.totalExpected > 0
      ? (data.totalExecuted / data.totalExpected) * 100
      : (data.totalExecuted > 0 ? Infinity : 0);

    // CUPS inesperado: ejecutado pero no está en la NT
    if (!data.isInNT && data.totalExecuted > 0) {
      unexpectedCupsRaw.push({
        cup: data.cup, description: data.description,
        realFrequency: data.totalExecuted, totalValue: data.totalValue,
        serviceType: data.serviceType,
      });
      return;
    }

    const info: DeviatedCupInfo = {
      cup: data.cup, description: data.description, activityDescription: data.description,
      expectedFrequency: data.totalExpected, realFrequency: data.totalExecuted,
      uniqueUsers: 0, repeatedAttentions: 0, sameDayDetections: 0, sameDayDetectionsCost: 0,
      deviation: data.totalExecuted - data.totalExpected,
      deviationValue: (data.totalExecuted - data.totalExpected) * data.unitValue,
      totalValue: data.totalValue,
      valorReconocer: Math.min(data.totalValue, data.totalExpected * data.unitValue * 1.11),
      unitValueFromNote: data.unitValue,
    };

    if (data.totalExecuted === 0 && data.totalExpected > 0) missingCupsRaw.push(info);
    else if (pct > 111)                                    overExecutedCupsRaw.push(info);
    else if (pct < 90 && data.totalExpected > 0)           underExecutedCupsRaw.push(info);
    else                                                   normalExecutionCupsRaw.push(info);
  });

  // ── 4. Enriquecer con uniqueUsers/atenciones (de cupCounts) y ordenar ─────
  const byAbsDevDesc = (a: DeviatedCupInfo, b: DeviatedCupInfo) =>
    Math.abs(b.deviationValue) - Math.abs(a.deviationValue);
  const byValueDesc  = (a: UnexpectedCupInfo, b: UnexpectedCupInfo) =>
    b.totalValue - a.totalValue;

  const overExecutedCups    = consolidateDeviatedCups(overExecutedCupsRaw,    executionDataByMonth).sort(byAbsDevDesc);
  const underExecutedCups   = consolidateDeviatedCups(underExecutedCupsRaw,   executionDataByMonth).sort(byAbsDevDesc);
  const missingCups         = consolidateDeviatedCups(missingCupsRaw,         executionDataByMonth).sort(byAbsDevDesc);
  const normalExecutionCups = consolidateDeviatedCups(normalExecutionCupsRaw, executionDataByMonth).sort(byAbsDevDesc);
  const unexpectedCups      = consolidateUnexpectedCups(unexpectedCupsRaw).sort(byValueDesc);

  // ── 5. Fallback financiero: usar totalRealValue si cupCounts estaba vacío ──
  const MESES_NUM: Record<string, string> = {
    Enero:'1',Febrero:'2',Marzo:'3',Abril:'4',Mayo:'5',Junio:'6',
    Julio:'7',Agosto:'8',Septiembre:'9',Octubre:'10',Noviembre:'11',Diciembre:'12',
  };
  executionDataByMonth.forEach((monthData, monthKey) => {
    if (monthData.totalRealValue > 0) {
      monthlyFinancialsMap.forEach((data, monthName) => {
        if (MESES_NUM[monthName] === monthKey && data.executed === 0) {
          data.executed = monthData.totalRealValue;
        }
      });
    }
  });

  const monthlyFinancials: MonthlyFinancialSummary[] = Array.from(monthlyFinancialsMap.entries()).map(([month, data]) => ({
    month,
    totalValorEsperado: data.expected,
    totalValorEjecutado: data.executed,
    percentage: data.expected > 0 ? (data.executed / data.expected) * 100 : 0,
    totalActividades: data.activities,
  }));

  return { monthlyFinancials, overExecutedCups, underExecutedCups, missingCups, unexpectedCups, normalExecutionCups, matrizDescuentos };
}

const calculateSummaryData = (data: PgpRow[], numMeses = 12): SummaryData | null => {
  if (data.length === 0) return null;
  const totalCostoMes = data.reduce((acc, row) => {
    // Incluye 'costoMes' y 'costo_mes' para CUPS adicionales guardadas en Supabase
    // NO incluir 'valor total' — es el total del período, no mensual
    const costo = getNumericValue(findColumnValue(row, ['costo evento mes (valor mes)', 'costo evento mes', 'costoMes', 'costo_mes', 'costo mes']));
    return acc + costo;
  }, 0);
  return {
    totalCostoMes, totalPeriodo: totalCostoMes, totalAnual: totalCostoMes * numMeses,
    costoMinimoPeriodo: totalCostoMes * 0.9, costoMaximoPeriodo: totalCostoMes * 1.1,
  };
};

const PgPsearchForm = forwardRef<
  { handleSelectPrestador: (prestador: Prestador | { PRESTADOR: string; WEB: string }) => void; triggerSave: (password: string, months: string[]) => Promise<{ numero: string } | { error: string }> },
  PgPsearchFormProps
>(({ executionDataByMonth, jsonPrestadorCode, uniqueUserCount, initialAuditData, regimenTotals, activeModule, onPrestadorLoaded, userName, userRole }, ref) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [pgpData, setPgpData] = useState<PgpRow[]>([]);
  const [prestadores, setPrestadores] = useState<Prestador[]>([]);
  const [selectedPrestador, setSelectedPrestador] = useState<Prestador | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);
  const [globalSummary, setGlobalSummary] = useState<SummaryData | null>(null);
  const { toast } = useToast();
  const [adjustedData, setAdjustedData] = useState<AdjustedData>({
    adjustedQuantities: {}, adjustedValues: {}, comments: {}, selectedRows: {}
  });
  // Ref para evitar loop: registra el 'ID DE ZONA' del último auto-fetch disparado
  const autoFetchedCode = useRef<string | null>(null);

  useEffect(() => {
    if (initialAuditData?.selectedPrestador) {
      if (initialAuditData.pgpData) {
        setPgpData(initialAuditData.pgpData);
        setIsDataLoaded(true);
      }
      setSelectedPrestador(initialAuditData.selectedPrestador);
      onPrestadorLoaded?.(initialAuditData.selectedPrestador.PRESTADOR);
      // Resetear el ref para que el nuevo prestador pueda hacer auto-fetch
      autoFetchedCode.current = null;
    }
  }, [initialAuditData]);

  // Mostrar el dashboard en cuanto la NT esté cargada.
  // Si no hay datos de ejecución, buildMatrizEjecucion usa un dummy month
  // y todas las actividades aparecen como "Faltante" (comportamiento informativo).
  const showComparison = isDataLoaded;

  useEffect(() => {
    if (isDataLoaded) {
      const numMeses = selectedPrestador?.MESES ? parseInt(String(selectedPrestador.MESES), 10) || 12 : 12;
      setGlobalSummary(calculateSummaryData(pgpData, numMeses));
    }
  }, [isDataLoaded, pgpData, selectedPrestador]);

  const comparisonSummary = useMemo(() => {
    if (!showComparison) return null;
    return calculateComparison(pgpData, executionDataByMonth);
  }, [pgpData, executionDataByMonth, showComparison]);

  /** Lee el valor de CUPS Inesperadas guardado en localStorage (sección CUPS)
   *  para que el Dashboard y la Matriz Financiera muestren el % real. */
  const valorInesperadasStored = useMemo(() => {
    if (typeof window === 'undefined') return 0;
    const MMAP: Record<string, string> = {
      'Enero':'ENERO','Febrero':'FEBRERO','Marzo':'MARZO','Abril':'ABRIL',
      'Mayo':'MAYO','Junio':'JUNIO','Julio':'JULIO','Agosto':'AGOSTO',
      'Septiembre':'SEPTIEMBRE','Octubre':'OCTUBRE','Noviembre':'NOVIEMBRE','Diciembre':'DICIEMBRE',
      'January':'ENERO','February':'FEBRERO','March':'MARZO','April':'ABRIL',
      'May':'MAYO','June':'JUNIO','July':'JULIO','August':'AGOSTO',
      'September':'SEPTIEMBRE','October':'OCTUBRE','November':'NOVIEMBRE','December':'DICIEMBRE',
    };
    const prestKey   = (selectedPrestador?.PRESTADOR || 'default').replace(/\s+/g, '_');
    const months     = comparisonSummary?.monthlyFinancials || [];
    const periodoKey = months.map(m => MMAP[m.month] || m.month.toUpperCase()).join('-') || 'default';
    // 1. Intentar clave exacta del período completo
    const exact = localStorage.getItem(`pgp-cups-inesperadas-manual-${prestKey}-${periodoKey}`);
    if (exact && Number(exact) > 0) return Number(exact);
    // 2. Fallback: sumar mes a mes
    let sum = 0;
    for (const m of months) {
      const mk = MMAP[m.month] || m.month.toUpperCase();
      const v  = localStorage.getItem(`pgp-cups-inesperadas-manual-${prestKey}-${mk}`);
      if (v && Number(v) > 0) sum += Number(v);
    }
    return sum;
  }, [selectedPrestador?.PRESTADOR, comparisonSummary]);

  const reportData = useMemo((): ReportData | null => {
    if (!showComparison || !selectedPrestador || !globalSummary || !comparisonSummary) return null;

    const totalDescuentoCalculado = Object.entries(adjustedData.adjustedValues).reduce((acc, [cup, val]) => {
      if (adjustedData.selectedRows[cup]) return acc + val;
      return acc;
    }, 0);

    const sumaMensual = Array.from(executionDataByMonth.values()).reduce((acc, d) => acc + d.totalRealValue, 0);

    return {
      header: {
        empresa: "Dusakawi EPSI", nit: "8240001398",
        ipsNombre: selectedPrestador.PRESTADOR, ipsNit: selectedPrestador.NIT,
        municipio: "Riohacha", contrato: selectedPrestador.CONTRATO || "N/A", vigencia: "2024",
        ciudad: "Riohacha", fecha: new Date().toLocaleDateString('es-CO'),
      },
      months: Array.from(executionDataByMonth.entries()).map(([m, d]) => ({
        month: getMonthName(m),
        cups: (d.summary?.numConsultas ?? 0) + (d.summary?.numProcedimientos ?? 0),
        valueCOP: d.totalRealValue
      })),
      notaTecnica: {
        min90: globalSummary.costoMinimoPeriodo, valor3m: globalSummary.totalPeriodo, max110: globalSummary.costoMaximoPeriodo,
        anticipos: 0, totalPagar: sumaMensual,
        totalFinal: sumaMensual - totalDescuentoCalculado,
        descuentoAplicado: totalDescuentoCalculado
      },
      overExecutedCups: comparisonSummary.overExecutedCups,
      underExecutedCups: comparisonSummary.underExecutedCups,
      missingCups: comparisonSummary.missingCups,
      unexpectedCups: comparisonSummary.unexpectedCups,
      adjustedData,
    };
  }, [showComparison, selectedPrestador, executionDataByMonth, globalSummary, comparisonSummary, adjustedData]);

  // \u2500\u2500 Descarga consolidada (1 fila por CUPS, suma todos los meses) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const handleDownloadMatrizComparativa = useCallback(() => {
    if (!showComparison || !comparisonSummary) return;
    toast({ title: "Generando Excel...", description: "Matriz consolidada NT vs Ejecuci\u00F3n." });

    // Helper: diagn\u00F3stico m\u00E1s frecuente de un CUPS en todos los meses
    const getDiagnostico = (cup: string): string => {
      const diagMap = new Map<string, number>();
      executionDataByMonth.forEach(monthData => {
        const cd = monthData.cupCounts.get(cup) || monthData.cupCounts.get(cup.toLowerCase());
        if (cd) {
          cd.diagnoses.forEach((count, diag) => {
            diagMap.set(diag, (diagMap.get(diag) || 0) + count);
          });
        }
      });
      if (diagMap.size === 0) return '';
      return [...diagMap.entries()].reduce((a, b) => a[1] > b[1] ? a : b)[0];
    };

    type ConsolidatedRow = {
      CUPS: string; Descripcion: string; Diagnostico_Principal: string;
      Cantidad_Esperada: number; Cantidad_Ejecutada: number; Diferencia: number;
      percentage_ejecucion: number; '%_Ejecucion': string; Clasificacion: string;
      Valor_Unitario: number; Valor_Esperado: number; Valor_Ejecutado: number; Valor_a_Reconocer: number;
    };

    const buildRow = (c: DeviatedCupInfo, clasificacion: string): ConsolidatedRow => {
      const pct = c.expectedFrequency > 0 ? (c.realFrequency / c.expectedFrequency) * 100 : (c.realFrequency > 0 ? 9999 : 0);
      return {
        CUPS: c.cup, Descripcion: c.description || c.cup,
        Diagnostico_Principal: getDiagnostico(c.cup),
        Cantidad_Esperada: c.expectedFrequency, Cantidad_Ejecutada: c.realFrequency,
        Diferencia: c.deviation,
        percentage_ejecucion: Math.min(pct, 9999),
        '%_Ejecucion': c.expectedFrequency > 0 ? `${pct.toFixed(0)}%` : 'N/A',
        Clasificacion: clasificacion,
        Valor_Unitario: c.unitValueFromNote || 0,
        Valor_Esperado: c.expectedFrequency * (c.unitValueFromNote || 0),
        Valor_Ejecutado: c.totalValue, Valor_a_Reconocer: c.valorReconocer || 0,
      };
    };

    const rows: ConsolidatedRow[] = [
      ...comparisonSummary.overExecutedCups.map(c   => buildRow(c, 'Sobre-ejecutado')),
      ...comparisonSummary.underExecutedCups.map(c   => buildRow(c, 'Sub-ejecutado')),
      ...comparisonSummary.missingCups.map(c         => buildRow(c, 'Faltante')),
      ...comparisonSummary.normalExecutionCups.map(c  => buildRow(c, 'Ejecuci\u00F3n Normal')),
      ...comparisonSummary.unexpectedCups.map(c => ({
        CUPS: c.cup, Descripcion: c.description || c.cup,
        Diagnostico_Principal: getDiagnostico(c.cup),
        Cantidad_Esperada: 0, Cantidad_Ejecutada: c.realFrequency,
        Diferencia: c.realFrequency, percentage_ejecucion: 9999,
        '%_Ejecucion': 'N/A', Clasificacion: 'Inesperado',
        Valor_Unitario: 0, Valor_Esperado: 0,
        Valor_Ejecutado: c.totalValue, Valor_a_Reconocer: 0,
      } as ConsolidatedRow)),
    ];

    const csv = Papa.unparse(rows, { delimiter: ";" });
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `matriz_consolidada_${selectedPrestador?.PRESTADOR || 'IPS'}.xls`);
    link.click();
  }, [showComparison, comparisonSummary, executionDataByMonth, selectedPrestador, toast]);

  // \u2500\u2500 Descarga detalle por usuario/servicio (requiere rawJsonData) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const handleDownloadExecutionDetail = useCallback(() => {
    if (!showComparison || !pgpData || executionDataByMonth.size === 0) return;

    // rawJsonData no se guarda en historial para reducir tama\u00F1o del payload
    const hasRawData = Array.from(executionDataByMonth.values()).some(m => m.rawJsonData?.usuarios?.length > 0);
    if (!hasRawData) {
      toast({
        title: "Detalle no disponible",
        description: "El detalle por usuario s\u00F3lo est\u00E1 disponible cuando los JSON se cargan en la sesi\u00F3n actual, no desde historial.",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Generando Excel...", description: "Cruce de columnas solicitado." });

    const pgpCupsMap = new Map<string, { unitValue: number, description: string }>();
    pgpData.forEach(row => {
      const cup = normalizeString(findColumnValue(row, ['cup/cum', 'cups', 'id resolucion 3100']));
      const unitValue = getNumericValue(findColumnValue(row, ['valor unitario']));
      const description = normalizeString(findColumnValue(row, ['descripcion cups', 'descripcion', 'descripcion id resolucion']));
      if (cup) pgpCupsMap.set(cup, { unitValue, description });
    });

    const exportRows: any[] = [];
    executionDataByMonth.forEach((monthData, monthKey) => {
      const monthName = getMonthName(monthKey);
      monthData.rawJsonData?.usuarios?.forEach((user: any) => {
        const userId = `${user.tipoDocumentoIdentificacion}-${user.numDocumentoIdentificacion}`;
        const processServices = (services: any[], serviceType: string, codeField: string, valueField: string, unitValField?: string, qtyF?: string) => {
          if (!services) return;
          services.forEach((s: any) => {
            const code = normalizeString(s[codeField]);
            const pgp = pgpCupsMap.get(code);
            const qty = qtyF ? getNumericValue(s[qtyF]) : 1;
            const valJson = (unitValField && qtyF) ? getNumericValue(s[unitValField]) * qty : getNumericValue(s[valueField]);
            const descripcion = pgp?.description || s.nomTecnologiaSalud || 'N/A';
            exportRows.push({ Mes: monthName, ID_Usuario: userId, Tipo_Servicio: serviceType, CUPS: code, Descripcion_CUPS: descripcion, Fecha_Atencion: s.fechaInicioAtencion || 'N/A', Diagnostico_Principal: s.codDiagnosticoPrincipal || 'N/A', Valor_Servicio_JSON: valJson, Cantidad_Ejecutada: qty, Valor_Unitario_NT: pgp?.unitValue || 0, Valor_Ejecutado_NT: qty * (pgp?.unitValue || 0) });
          });
        };
        if (user.servicios) {
          processServices(user.servicios.consultas, 'Consulta', 'codConsulta', 'vrServicio');
          processServices(user.servicios.procedimientos, 'Procedimiento', 'codProcedimiento', 'vrServicio');
          processServices(user.servicios.medicamentos, 'Medicamento', 'codTecnologiaSalud', 'vrServicio', 'vrUnitarioMedicamento', 'cantidadMedicamento');
          processServices(user.servicios.otrosServicios, 'Otro Servicio', 'codTecnologiaSalud', 'vrServicio', 'vrUnitarioOS', 'cantidadOS');
        }
      });
    });

    const csv = Papa.unparse(exportRows, { delimiter: ";" });
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `detalle_ejecucion_${selectedPrestador?.PRESTADOR || 'IPS'}.xls`);
    link.click();
  }, [showComparison, pgpData, executionDataByMonth, selectedPrestador, toast]);

  const handleSelectPrestador = useCallback(async (prestador: Prestador) => {
    if (!prestador.WEB) return;

    setLoading(true);
    try {
      const data = await fetchSheetData<PgpRow>(prestador.WEB);

      // Auto-cargar CUPS adicionales guardados para este prestador
      const prestadorId = normalizeDigits(prestador.NIT || prestador.PRESTADOR);
      try {
        const res = await fetch(`/api/cups-adicionales?prestadorId=${encodeURIComponent(prestadorId)}`);
        const extra = await res.json();
        if (extra.rows?.length) {
          const existingCups = new Set(data.map((r: PgpRow) => {
            const cup = r['cups'] || r['CUPS'] || r['cup'] || '';
            return String(cup).trim().toUpperCase();
          }));
          const onlyNew = extra.rows.filter((r: PgpRow) => {
            const cup = String(r.cups || r.CUPS || '').trim().toUpperCase();
            return cup && !existingCups.has(cup);
          });
          if (onlyNew.length) {
            toast({ title: `${onlyNew.length} CUPS adicionales cargadas`, description: `Se fusionaron automáticamente con la NT de ${prestador.PRESTADOR}.` });
            setPgpData([...data, ...onlyNew]);
          } else {
            setPgpData(data);
          }
        } else {
          setPgpData(data);
        }
      } catch {
        setPgpData(data);
      }

      setSelectedPrestador(prestador);
      setIsDataLoaded(true);
      onPrestadorLoaded?.(prestador.PRESTADOR);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, onPrestadorLoaded]);

  useImperativeHandle(ref, () => ({
    handleSelectPrestador: (p: any) => handleSelectPrestador(p as Prestador),
    triggerSave: async (_password: string, months: string[]) => {
      if (!selectedPrestador || executionDataByMonth.size === 0) {
        return { error: 'Faltan datos de ejecución.' };
      }
      const monthKey = months[0] || Array.from(executionDataByMonth.keys())[0] || String(new Date().getMonth() + 1);
      const date = new Date(2024, parseInt(monthKey) - 1, 1);
      const monthName = date.toLocaleString('es-CO', { month: 'long' });

      // ── Verificar si ya existe una auditoría para este prestador/mes ──
      try {
        const checkRes = await fetch(
          `/api/save-audit?prestador=${encodeURIComponent(selectedPrestador.PRESTADOR)}&month=${encodeURIComponent(monthName)}`
        );
        const checkData = await checkRes.json();
        if (checkData.exists) {
          if (!checkData.canOverwrite) {
            return { error: `Ya existe la auditoría N° ${checkData.numero} creada por ${checkData.ownerNombre}. Sin permiso para modificarla.` };
          }
          const continuar = window.confirm(
            `⚠️ ADVERTENCIA\n\nYa existe la auditoría N° ${checkData.numero} para:\n${selectedPrestador.PRESTADOR} — ${monthName}\n\nSobreescribirla puede causar pérdida de datos.\n\n¿Deseas continuar?`
          );
          if (!continuar) return { error: 'Operación cancelada por el usuario.' };

          const pw = window.prompt('Ingresa la contraseña para confirmar la sobreescritura:');
          if (pw === null) return { error: 'Operación cancelada.' };
          if (pw !== '123456') return { error: 'Contraseña incorrecta. Operación cancelada.' };
        }
      } catch { /* si falla la verificación, continuar */ }
      // ─────────────────────────────────────────────────────────────────
      // Serializar con datos completos (cupCounts incluido) para análisis desde historial
      const fullExecutionData = serializeExecutionData(executionDataByMonth);
      const auditPackage = {
        adjustedQuantities: adjustedData.adjustedQuantities,
        comments: adjustedData.comments,
        selectedRows: adjustedData.selectedRows,
        executionData: fullExecutionData,
        uniqueUserCount,
        selectedPrestador,
      };
      try {
        const bodyStr = JSON.stringify({ auditData: auditPackage, prestadorName: selectedPrestador.PRESTADOR, month: monthName });
        // Medición en bytes reales (UTF-8), no en caracteres JS
        const byteSize = new Blob([bodyStr]).size;
        const kb = (v: any) => (new Blob([JSON.stringify(v || '')]).size / 1024).toFixed(1) + 'KB';
        const sizes = `adjustedQ:${kb(adjustedData.adjustedQuantities)} selectedRows:${kb(adjustedData.selectedRows)} execData:${kb(fullExecutionData)} prestador:${kb(auditPackage.selectedPrestador)} total:${(byteSize/1024/1024).toFixed(2)}MB`;
        console.log('[triggerSave bytes]', sizes);
        if (byteSize > 3_000_000) {
          return { error: `Payload demasiado grande (${(byteSize/1024/1024).toFixed(1)}MB).\n${sizes}` };
        }
        const response = await fetch('/api/save-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr,
        });
        // Manejar respuesta de forma segura (puede venir texto plano si Vercel rechaza)
        const rawText = await response.text();
        let data: any = {};
        try { data = JSON.parse(rawText); } catch { data = { message: rawText.slice(0, 200) }; }
        if (response.ok) return { numero: data.numero };
        return { error: data.message || `Error ${response.status}` };
      } catch (e: any) {
        return { error: `Error de red: ${e?.message || e}` };
      }
    }
  }));

  useEffect(() => {
    fetchSheetData<Prestador>(PRESTADORES_SHEET_URL).then(data => {
      setPrestadores(data.map(p => ({
        ...p, 'ID DE ZONA': normalizeDigits(p['ID DE ZONA']),
        'CONTRATO': normalizeString(p.CONTRATO),
      })));
    });
  }, []);

  useEffect(() => {
    // El código de zona puede venir del JSON cargado (jsonPrestadorCode)
    // O del prestador restaurado desde historial (selectedPrestador['ID DE ZONA'])
    const codeToUse = jsonPrestadorCode || selectedPrestador?.['ID DE ZONA'];
    if (codeToUse && prestadores.length > 0 && !loading && !isDataLoaded) {
      // Guard anti-loop: si ya lanzamos el fetch para este código, no repetir
      if (autoFetchedCode.current === codeToUse) return;

      // Preferir siempre el prestador fresco de la lista (WEB URL actualizado);
      // si no se encuentra, usar el guardado en historial como fallback
      const target = prestadores.find(p => p['ID DE ZONA'] === codeToUse)
        ?? (selectedPrestador?.['ID DE ZONA'] === codeToUse ? selectedPrestador : null);
      if (target) {
        // Solo mostrar toast si el prestador aún no está seleccionado
        if (!selectedPrestador || selectedPrestador['ID DE ZONA'] !== codeToUse) {
          toast({ title: "Nota Sugerida", description: `Analizaré con (${target.PRESTADOR}) automáticamente.` });
        }
        autoFetchedCode.current = codeToUse; // marcar como iniciado
        handleSelectPrestador(target);
      }
    }
  }, [jsonPrestadorCode, prestadores, selectedPrestador, handleSelectPrestador, toast, loading, isDataLoaded]);

  // ── The selector dropdown (reused in multiple places) ──
  const selectorEl = (
    <div className="flex items-center gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="min-w-[280px] justify-between">
            {selectedPrestador ? selectedPrestador.PRESTADOR : "Seleccionar un Prestador"}
            <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-72 overflow-y-auto">
          {prestadores.map((p, i) => (
            <DropdownMenuItem key={i} onSelect={() => handleSelectPrestador(p)}>
              {p.PRESTADOR}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {loading && <Loader2 className="animate-spin h-5 w-5 text-primary" />}
    </div>
  );

  // ── datos module: selector only ──
  if (!activeModule || activeModule === "datos") {
    return (
      <div className="max-w-2xl">
        <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-sm text-foreground mb-1">Paso 2 — Nota Técnica PGP</h2>
            <p className="text-xs text-muted-foreground">Selecciona el prestador para cargar la Nota Técnica y activar los módulos de análisis.</p>
          </div>
          {selectorEl}
          {selectedPrestador && !loading && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span><strong>{selectedPrestador.PRESTADOR}</strong> cargado. Usa el menú lateral para analizar.</span>
            </div>
          )}
          {!selectedPrestador && !loading && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>Selecciona un prestador para activar los módulos de análisis en el panel izquierdo.</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    );
  }

  // ── validador NT ── (accesible sin datos de ejecución)
  if (activeModule === "validador") {
    return (
      <NotaTecnicaValidator
        pgpData={pgpData}
        onUpdateNt={setPgpData}
        prestadorName={selectedPrestador?.PRESTADOR}
        prestadorId={normalizeDigits(selectedPrestador?.NIT || selectedPrestador?.PRESTADOR || '')}
      />
    );
  }

  // ── no data yet: show empty state for analysis modules (excepto informes que siempre se muestra) ──
  if (!showComparison && activeModule !== "informes") {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-sm text-foreground">Sin datos para analizar</p>
          <p className="text-xs text-muted-foreground mt-1">Carga un archivo JSON y selecciona un prestador desde <strong>Carga de Datos</strong>.</p>
        </div>
      </div>
    );
  }

  // ── compact header bar for analysis modules ──
  const analysisHeader = (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
      <div className="flex items-center gap-2">
        <Building className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold text-sm text-foreground">{selectedPrestador?.PRESTADOR}</span>
        <span className="text-xs text-muted-foreground">· NIT {selectedPrestador?.NIT}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{comparisonSummary?.monthlyFinancials.length ?? 0} mes{(comparisonSummary?.monthlyFinancials.length ?? 0) !== 1 ? "es" : ""} analizados</span>
      </div>
    </div>
  );

  // ── inicio (dashboard) ──
  if (activeModule === "inicio") {
    const totalJsonExec = Array.from(executionDataByMonth.values()).reduce((acc, d) => acc + d.totalRealValue, 0);
    const totalNTExec = comparisonSummary!.monthlyFinancials.reduce((acc, m) => acc + m.totalValorEjecutado, 0);
    const pctCoverage = ((uniqueUserCount / (selectedPrestador?.POBLACION || 1)) * 100).toFixed(1);
    return (
      <div className="space-y-6">
        {analysisHeader}
        {/* KPI row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard accent="blue" title="Cobertura Poblacional" value={`${pctCoverage}%`} icon={Users}
            footer={`${uniqueUserCount.toLocaleString('es-CO')} de ${selectedPrestador?.POBLACION?.toLocaleString() || 'N/A'}`} />
          <StatCard accent="green" title="Ejecución Real (JSON)" value={formatCurrency(totalJsonExec)} icon={Wallet}
            footer="Costo total en archivos JSON" />
          <StatCard accent="purple" title="Ejecución NT" value={formatCurrency(totalNTExec)} icon={FileText}
            footer="Doble clic → Detalle por usuario (.xls)" onDoubleClick={handleDownloadExecutionDetail} />
          {globalSummary && (
            <StatCard accent="amber" title="Valor NT (período)" value={formatCurrency(globalSummary.totalPeriodo)} icon={Landmark}
              footer={`Banda: ${formatCurrency(globalSummary.costoMinimoPeriodo)} – ${formatCurrency(globalSummary.costoMaximoPeriodo)}`} />
          )}
        </div>
        {/* CUPS status cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard accent="red" title="CUPS Sobre-ejecutados" value={comparisonSummary!.overExecutedCups.length} icon={TrendingUp} footer="Frecuencia >110% de lo esperado" />
          <StatCard accent="amber" title="CUPS Sub-ejecutados" value={comparisonSummary!.underExecutedCups.length} icon={TrendingDown} footer="Frecuencia <90% de lo esperado" />
          <StatCard accent="default" title="Tecnologías no ejecutadas" value={comparisonSummary!.missingCups.length} icon={AlertTriangle} footer="CUPS en NT sin ejecución" />
          <StatCard accent="default" title="CUPS / Tec. Inesperadas" value={comparisonSummary!.unexpectedCups.length} icon={Search} footer="No estaban en la NT" />
        </div>
        {/* Mini financial matrix */}
        <div className="rounded-xl border border-border bg-card shadow-sm p-5">
          <h3 className="font-semibold text-sm mb-4">Resumen Financiero por Mes</h3>
          <FinancialMatrix monthlyFinancials={comparisonSummary!.monthlyFinancials} regimenByMonth={regimenTotals?.byMonth} valorCupsInesperadas={valorInesperadasStored} />
        </div>
      </div>
    );
  }

  // ── financiero ──
  if (activeModule === "financiero") {
    const totalJsonExec = Array.from(executionDataByMonth.values()).reduce((acc, d) => acc + d.totalRealValue, 0);
    const totalNTExec = comparisonSummary!.monthlyFinancials.reduce((acc, m) => acc + m.totalValorEjecutado, 0);
    const subUsers = regimenTotals?.subsidiadoUsers || 0;
    const conUsers = regimenTotals?.contributivoUsers || 0;
    const totalUsers = subUsers + conUsers;
    const subProp = totalUsers > 0 ? subUsers / totalUsers : 0.5;
    const conProp = 1 - subProp;
    const useJsonValues = totalJsonExec > 0;
    const baseTotal = useJsonValues ? totalJsonExec : totalNTExec;
    const subVal = useJsonValues ? (regimenTotals?.subsidiado || baseTotal * subProp) : baseTotal * subProp;
    const conVal = useJsonValues ? (regimenTotals?.contributivo || baseTotal * conProp) : baseTotal * conProp;

    return (
      <div className="space-y-6">
        {analysisHeader}
        {/* NT band cards */}
        {globalSummary && (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard accent="blue" title="Proyección Anual" value={formatCurrency(globalSummary.totalAnual)} icon={Calendar} footer={`Estimación de ${selectedPrestador?.MESES ? parseInt(String(selectedPrestador.MESES), 10) || 12 : 12} meses`} />
            <StatCard accent="amber" title="Límite Inferior (90%)" value={formatCurrency(globalSummary.costoMinimoPeriodo)} icon={TrendingDown} footer="Mínimo esperado del período" />
            <StatCard accent="green" title="Límite Superior (110%)" value={formatCurrency(globalSummary.costoMaximoPeriodo)} icon={TrendingUp} footer="Máximo esperado del período" />
          </div>
        )}
        {/* Regime breakdown */}
        {(totalUsers > 0 || subVal > 0) && (
          <div className="rounded-xl border border-border bg-card shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-sm">Ejecución Real por Régimen</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Subsidiado</p>
                <p className="text-2xl font-bold text-blue-900 mt-1">{formatCurrency(subVal)}</p>
                {subUsers > 0 && <p className="text-xs text-blue-600 mt-1">{subUsers.toLocaleString('es-CO')} usuarios ({(subProp * 100).toFixed(1)}%)</p>}
              </div>
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Contributivo</p>
                <p className="text-2xl font-bold text-orange-900 mt-1">{formatCurrency(conVal)}</p>
                {conUsers > 0 && <p className="text-xs text-orange-600 mt-1">{conUsers.toLocaleString('es-CO')} usuarios ({(conProp * 100).toFixed(1)}%)</p>}
              </div>
            </div>
            {Object.keys(regimenTotals?.byMonth || {}).length > 0 && (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right text-blue-700">Subsidiado</TableHead>
                  <TableHead className="text-right text-orange-700">Contributivo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {Object.entries(regimenTotals?.byMonth || {}).map(([mes, vals]) => {
                    const mTotal = comparisonSummary?.monthlyFinancials.find(m => m.month === mes)?.totalValorEjecutado || 0;
                    const mSubVal = useJsonValues ? vals.subsidiado : mTotal * subProp;
                    const mConVal = useJsonValues ? vals.contributivo : mTotal * conProp;
                    return (
                      <TableRow key={mes}>
                        <TableCell className="font-medium">{mes}</TableCell>
                        <TableCell className="text-right text-blue-800 font-semibold">{formatCurrency(mSubVal)}</TableCell>
                        <TableCell className="text-right text-orange-800 font-semibold">{formatCurrency(mConVal)}</TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(mSubVal + mConVal)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right text-blue-900">{formatCurrency(subVal)}</TableCell>
                    <TableCell className="text-right text-orange-900">{formatCurrency(conVal)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(subVal + conVal)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </div>
        )}
        {/* Financial matrix */}
        <div className="rounded-xl border border-border bg-card shadow-sm p-5">
          <h3 className="font-semibold text-sm mb-4">Matriz Financiera Mensual</h3>
          <FinancialMatrix monthlyFinancials={comparisonSummary!.monthlyFinancials} regimenByMonth={regimenTotals?.byMonth} valorCupsInesperadas={valorInesperadasStored} />
        </div>
      </div>
    );
  }

  // ── cups ──
  if (activeModule === "cups") {
    return (
      <div className="space-y-4">
        {analysisHeader}
        <InformeDesviaciones comparisonSummary={comparisonSummary!} pgpData={pgpData} executionDataByMonth={executionDataByMonth} selectedPrestador={selectedPrestador} />
      </div>
    );
  }

  // ── ajustes ──
  if (activeModule === "ajustes") {
    return (
      <div className="space-y-4">
        {analysisHeader}
        {/* Descarga matriz consolidada NT vs Ejecución */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadMatrizComparativa}
            title="Descarga la matriz consolidada NT vs Ejecución (1 fila por CUPS, todas las clasificaciones)"
          >
            <FileText className="mr-2 h-4 w-4" />
            Descargar Matriz Consolidada (.xls)
          </Button>
        </div>
        <DiscountMatrix
          data={comparisonSummary!.matrizDescuentos}
          executionDataByMonth={executionDataByMonth}
          pgpData={pgpData}
          onAdjustmentsChange={setAdjustedData}
          storageKey={`audit-${selectedPrestador?.NIT}`}
          selectedPrestador={selectedPrestador}
          initialAuditData={initialAuditData}
          uniqueUserCount={uniqueUserCount}
          jsonPrestadorCode={jsonPrestadorCode}
          userRole={userRole}
        />
      </div>
    );
  }

  // ── informes: vista única — Certificado de Ejecución ──
  if (activeModule === "informes") {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-card shadow-sm p-5">
          <CertificadoTrimestral
              comparisonSummary={comparisonSummary}
              pgpData={reportData}
              selectedPrestador={selectedPrestador}
              executionDataByMonth={executionDataByMonth}
              userName={userName}
              initialResponsable={initialAuditData?.auditor_nombre || userName}
              initialInforme={initialAuditData?.informeRestored ?? null}
              onSaveAudit={async (notas) => {
                if (!selectedPrestador || executionDataByMonth.size === 0) {
                  alert('Primero carga los archivos JSON del prestador.');
                  return;
                }
                const monthKey = Array.from(executionDataByMonth.keys())[0] || '1';
                const date = new Date(2024, parseInt(monthKey) - 1, 1);
                const monthName = date.toLocaleString('es-CO', { month: 'long' });

                // ── Verificar si ya existe una auditoría para este prestador/mes ──
                try {
                  const checkRes = await fetch(
                    `/api/save-audit?prestador=${encodeURIComponent(selectedPrestador.PRESTADOR)}&month=${encodeURIComponent(monthName)}`
                  );
                  const checkData = await checkRes.json();

                  if (checkData.exists) {
                    if (!checkData.canOverwrite) {
                      alert(`❌ Ya existe la auditoría N° ${checkData.numero} para ${selectedPrestador.PRESTADOR} - ${monthName}, creada por ${checkData.ownerNombre}.\n\nNo tienes permiso para modificarla.`);
                      return;
                    }
                    // Advertencia + contraseña para sobreescribir
                    const continuar = window.confirm(
                      `⚠️ ADVERTENCIA\n\nYa existe la auditoría N° ${checkData.numero} para:\n${selectedPrestador.PRESTADOR} — ${monthName}\n\nSobreescribirla puede causar pérdida de datos.\n\n¿Deseas continuar?`
                    );
                    if (!continuar) return;

                    const pw = window.prompt('Ingresa la contraseña para confirmar la sobreescritura:');
                    if (pw === null) return; // canceló
                    if (pw !== '123456') {
                      alert('❌ Contraseña incorrecta. Operación cancelada.');
                      return;
                    }
                  }
                } catch { /* si falla la verificación, continuar normalmente */ }
                // ─────────────────────────────────────────────────────────────────
                // Serializar con datos completos (cupCounts incluido) para análisis desde historial
                const fullExecutionData = serializeExecutionData(executionDataByMonth);
                const auditPackage = {
                  adjustedQuantities: adjustedData.adjustedQuantities,
                  comments: adjustedData.comments,
                  selectedRows: adjustedData.selectedRows,
                  executionData: fullExecutionData,
                  uniqueUserCount,
                  selectedPrestador,
                  // Notas del certificado — respaldo para cuando no haya informe en BD
                  ...(notas ? { notasGuardadas: notas } : {}),
                };
                try {
                  let bodyStr: string;
                  try {
                    bodyStr = JSON.stringify({ auditData: auditPackage, prestadorName: selectedPrestador.PRESTADOR, month: monthName });
                  } catch (serErr: any) {
                    alert(`❌ Error al serializar datos: ${serErr?.message || serErr}`);
                    return;
                  }

                  // Medición en bytes reales (UTF-8), no en caracteres JS
                  const byteSize = new Blob([bodyStr]).size;
                  const kb = (v: any) => (new Blob([JSON.stringify(v || '')]).size / 1024).toFixed(1) + 'KB';
                  const sizes = `adjustedQ:${kb(adjustedData.adjustedQuantities)} selectedRows:${kb(adjustedData.selectedRows)} execData:${kb(fullExecutionData)} prestador:${kb(auditPackage.selectedPrestador)} total:${(byteSize/1024/1024).toFixed(2)}MB`;
                  console.log('[onSaveAudit bytes]', sizes);

                  if (byteSize > 3_000_000) {
                    alert(`❌ Payload demasiado grande (${(byteSize/1024/1024).toFixed(1)}MB).\nCampos:\n${sizes}`);
                    return;
                  }

                  const response = await fetch('/api/save-audit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: bodyStr,
                  });
                  // Manejar respuesta de forma segura (puede venir texto plano si Vercel rechaza)
                  const rawText = await response.text();
                  let data: any = {};
                  try { data = JSON.parse(rawText); } catch { data = { message: rawText.slice(0, 300) }; }
                  if (response.ok) {
                    alert(`✅ Auditoría N° ${data.numero} ${data.updated ? 'actualizada' : 'guardada'} exitosamente.`);
                  } else {
                    alert(`❌ Error al guardar (${response.status}): ${data.message || 'Error desconocido'}`);
                  }
                } catch (netErr: any) {
                  alert(`❌ Error de conexión: ${netErr?.message || netErr}`);
                }
              }}
            />
          </div>
        </div>
    );
  }

  // fallback
  return null;
});

PgPsearchForm.displayName = 'PgPsearchForm';
export default PgPsearchForm;
