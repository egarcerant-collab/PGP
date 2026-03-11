
"use client";

import { useState, useCallback, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  FileText, 
  Calendar, 
  ChevronDown, 
  Building, 
  AlertTriangle, 
  Download, 
  Filter, 
  Search, 
  Users, 
  Wallet, 
  AlertCircle, 
  Save, 
  Info, 
  Landmark 
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fetchSheetData, type PrestadorInfo } from '@/lib/sheets';
import { type ExecutionDataByMonth } from '@/app/page';
import FinancialMatrix, { type MonthlyFinancialSummary } from './FinancialMatrix';
import { buildMatrizEjecucion, findColumnValue } from '@/lib/matriz-helpers';
import Papa from 'papaparse';
import { getNumericValue, type SavedAuditData } from '../app/JsonAnalyzerPage';
import DiscountMatrix, { type DiscountMatrixRow, type ServiceType, type AdjustedData } from './DiscountMatrix';
import StatCard from '../shared/StatCard';
import InformeDesviaciones from '../report/InformeDesviaciones';
import InformePGP from '../report/InformePGP';

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

export function calculateComparison(pgpData: any[], executionDataByMonth: ExecutionDataByMonth): ComparisonSummary {
  const matrizRows = buildMatrizEjecucion({ executionDataByMonth, pgpData });
  
  const overExecutedCups: DeviatedCupInfo[] = [];
  const underExecutedCups: DeviatedCupInfo[] = [];
  const missingCups: DeviatedCupInfo[] = [];
  const normalExecutionCups: DeviatedCupInfo[] = [];
  const unexpectedCups: UnexpectedCupInfo[] = [];
  const matrizDescuentos: DiscountMatrixRow[] = [];

  const monthlyFinancialsMap = new Map<string, { expected: number; executed: number }>();

  matrizRows.forEach(row => {
    const current = monthlyFinancialsMap.get(row.Mes) || { expected: 0, executed: 0 };
    current.expected += row.Valor_Esperado;
    current.executed += row.Valor_Ejecutado;
    monthlyFinancialsMap.set(row.Mes, current);

    const commonInfo: DeviatedCupInfo = {
      cup: row.CUPS,
      description: row.Descripcion,
      activityDescription: row.Descripcion,
      expectedFrequency: row.Cantidad_Esperada,
      realFrequency: row.Cantidad_Ejecutada,
      uniqueUsers: 0,
      repeatedAttentions: 0,
      sameDayDetections: 0,
      sameDayDetectionsCost: 0,
      deviation: row.Diferencia,
      deviationValue: row.Diferencia * row.Valor_Unitario,
      totalValue: row.Valor_Ejecutado,
      valorReconocer: Math.min(row.Valor_Ejecutado, row.Valor_Esperado * 1.11),
      unitValueFromNote: row.Valor_Unitario
    };

    executionDataByMonth.forEach((monthData) => {
        const cupData = monthData.cupCounts.get(row.CUPS);
        if (cupData) {
            commonInfo.uniqueUsers = cupData.uniqueUsers.size;
            commonInfo.repeatedAttentions = Math.max(0, cupData.total - cupData.uniqueUsers.size);
        }
    });

    if (row.Clasificacion === "Sobre-ejecutado") overExecutedCups.push(commonInfo);
    else if (row.Clasificacion === "Sub-ejecutado") underExecutedCups.push(commonInfo);
    else if (row.Clasificacion === "Faltante") missingCups.push(commonInfo);
    else if (row.Clasificacion === "Ejecución Normal") normalExecutionCups.push(commonInfo);
    else if (row.Clasificacion === "Inesperado") {
        unexpectedCups.push({
            cup: row.CUPS,
            realFrequency: row.Cantidad_Ejecutada,
            totalValue: row.Valor_Ejecutado,
            serviceType: row.Tipo_Servicio as ServiceType
        });
    }

    matrizDescuentos.push({
        ...commonInfo,
        CUPS: row.CUPS,
        Cantidad_Ejecutada: row.Cantidad_Ejecutada,
        Valor_Unitario: row.Valor_Unitario,
        Valor_Ejecutado: row.Valor_Ejecutado,
        Valor_a_Reconocer: commonInfo.valorReconocer,
        Valor_a_Descontar: Math.max(0, row.Valor_Ejecutado - commonInfo.valorReconocer),
        Clasificacion: row.Clasificacion,
        Tipo_Servicio: row.Tipo_Servicio as ServiceType
    });
  });

  const monthlyFinancials: MonthlyFinancialSummary[] = Array.from(monthlyFinancialsMap.entries()).map(([month, data]) => ({
    month,
    totalValorEsperado: data.expected,
    totalValorEjecutado: data.executed,
    percentage: data.expected > 0 ? (data.executed / data.expected) * 100 : 0
  }));

  return {
    monthlyFinancials,
    overExecutedCups,
    underExecutedCups,
    missingCups,
    unexpectedCups,
    normalExecutionCups,
    matrizDescuentos
  };
}

const calculateSummaryData = (data: PgpRow[]): SummaryData | null => {
  if (data.length === 0) return null;
  const totalCostoMes = data.reduce((acc, row) => {
    const costo = getNumericValue(findColumnValue(row, ['costo evento mes (valor mes)', 'costo evento mes']));
    return acc + costo;
  }, 0);
  return {
    totalCostoMes, totalPeriodo: totalCostoMes, totalAnual: totalCostoMes * 12,
    costoMinimoPeriodo: totalCostoMes * 0.9, costoMaximoPeriodo: totalCostoMes * 1.1,
  };
};

const PgPsearchForm = forwardRef<
  { handleSelectPrestador: (prestador: Prestador | { PRESTADOR: string; WEB: string }) => void },
  PgPsearchFormProps
>(({ executionDataByMonth, jsonPrestadorCode, uniqueUserCount, initialAuditData }, ref) => {
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

  useEffect(() => {
    if (initialAuditData?.pgpData) {
      setPgpData(initialAuditData.pgpData);
      setSelectedPrestador(initialAuditData.selectedPrestador || null);
      setIsDataLoaded(true);
    }
  }, [initialAuditData]);

  const showComparison = isDataLoaded && executionDataByMonth.size > 0;

  useEffect(() => {
    if (isDataLoaded) setGlobalSummary(calculateSummaryData(pgpData));
  }, [isDataLoaded, pgpData]);

  const comparisonSummary = useMemo(() => {
    if (!showComparison) return null;
    return calculateComparison(pgpData, executionDataByMonth);
  }, [pgpData, executionDataByMonth, showComparison]);

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
        month: getMonthName(m), cups: d.summary.numConsultas + d.summary.numProcedimientos, valueCOP: d.totalRealValue
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

  const handleDownloadExecutionDetail = useCallback(() => {
    if (!showComparison || !pgpData || executionDataByMonth.size === 0) return;

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
      monthData.rawJsonData.usuarios?.forEach((user: any) => {
        const userId = `${user.tipoDocumentoIdentificacion}-${user.numDocumentoIdentificacion}`;
        const processServices = (services: any[], serviceType: string, codeField: string, valueField: string, unitValField?: string, qtyF?: string) => {
          if (!services) return;
          services.forEach((s: any) => {
            const code = normalizeString(s[codeField]);
            const pgp = pgpCupsMap.get(code);
            const qty = qtyF ? getNumericValue(s[qtyF]) : 1;
            const valJson = (unitValField && qtyF) ? getNumericValue(s[unitValField]) * qty : getNumericValue(s[valueField]);
            exportRows.push({ Mes: monthName, ID_Usuario: userId, Tipo_Servicio: serviceType, CUPS: code, Descripcion_CUPS: pgp?.description || 'N/A', Fecha_Atencion: s.fechaInicioAtencion || 'N/A', Diagnostico_Principal: s.codDiagnosticoPrincipal || 'N/A', Valor_Servicio_JSON: valJson, Cantidad_Ejecutada: qty, Valor_Unitario_NT: pgp?.unitValue || 0, Valor_Ejecutado_NT: qty * (pgp?.unitValue || 0) });
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
      setPgpData(data);
      setSelectedPrestador(prestador);
      setIsDataLoaded(true);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useImperativeHandle(ref, () => ({
    handleSelectPrestador: (p: any) => handleSelectPrestador(p as Prestador)
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
    if (jsonPrestadorCode && prestadores.length > 0 && !loading && !isDataLoaded) {
      if (!selectedPrestador || selectedPrestador['ID DE ZONA'] !== jsonPrestadorCode) {
        const suggested = prestadores.find(p => p['ID DE ZONA'] === jsonPrestadorCode);
        if (suggested) {
          toast({ title: "Nota Sugerida", description: `Analizaré con (${suggested.PRESTADOR}) automáticamente.` });
          handleSelectPrestador(suggested);
        }
      }
    }
  }, [jsonPrestadorCode, prestadores, selectedPrestador, handleSelectPrestador, toast, loading, isDataLoaded]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Análisis de Notas Técnicas PGP</CardTitle>
        <CardDescription>Selecciona un prestador para comparar la Nota Técnica con la ejecución real.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
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

        {loading && <div className="flex justify-center py-12"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>}

        {showComparison && comparisonSummary && (
          <div className="space-y-12 animate-in fade-in duration-500">
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard title="Cobertura Poblacional" value={`${((uniqueUserCount / (selectedPrestador?.POBLACION || 1)) * 100).toFixed(1)}%`} icon={Users} footer={`Atendidos: ${uniqueUserCount} de ${selectedPrestador?.POBLACION?.toLocaleString() || 'N/A'}`} />
              <StatCard title="Ejecución Real (JSON)" value={formatCurrency(Array.from(executionDataByMonth.values()).reduce((acc, d) => acc + d.totalRealValue, 0))} icon={Wallet} footer="Costo real total de los archivos JSON" />
              <StatCard title="Ejecución Valorizada (NT)" value={formatCurrency(comparisonSummary.monthlyFinancials.reduce((acc, m) => acc + m.totalValorEjecutado, 0))} icon={FileText} footer="Doble clic para descargar detalle Excel" onDoubleClick={handleDownloadExecutionDetail} />
            </div>

            {globalSummary && (
                <div className="space-y-4">
                  <h3 className="text-xl font-bold flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" />Resumen Teórico: Nota Técnica</h3>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard title="Proyección Anual" value={formatCurrency(globalSummary.totalAnual)} icon={Calendar} footer="Estimación de 12 meses" />
                    <StatCard title="Límite Inferior (90%)" value={formatCurrency(globalSummary.costoMinimoPeriodo)} icon={TrendingDown} footer="Mínimo esperado" />
                    <StatCard title="Límite Superior (110%)" value={formatCurrency(globalSummary.costoMaximoPeriodo)} icon={TrendingUp} footer="Máximo esperado" />
                  </div>
                </div>
            )}

            <FinancialMatrix monthlyFinancials={comparisonSummary.monthlyFinancials} />
            <InformeDesviaciones comparisonSummary={comparisonSummary} pgpData={pgpData} executionDataByMonth={executionDataByMonth} />
            <DiscountMatrix
              data={comparisonSummary.matrizDescuentos}
              executionDataByMonth={executionDataByMonth}
              pgpData={pgpData}
              onAdjustmentsChange={setAdjustedData}
              storageKey={`audit-${selectedPrestador?.NIT}`}
              selectedPrestador={selectedPrestador}
              initialAuditData={initialAuditData}
              uniqueUserCount={uniqueUserCount}
              jsonPrestadorCode={jsonPrestadorCode}
            />
            <div className="pt-8"><InformePGP data={reportData} comparisonSummary={comparisonSummary} /></div>
          </div>
        )}

        {!showComparison && !loading && (
           <Alert className="bg-muted/50"><Info className="h-4 w-4" /><AlertTitle>Información</AlertTitle><AlertDescription>Carga los archivos JSON arriba y selecciona un prestador para iniciar la auditoría.</AlertDescription></Alert>
        )}
      </CardContent>
    </Card>
  );
});

PgPsearchForm.displayName = 'PgPsearchForm';
export default PgPsearchForm;
