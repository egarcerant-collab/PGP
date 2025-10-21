

"use client";

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, TrendingDown, Target, FileText, Calendar, ChevronDown, Building, BrainCircuit, AlertTriangle, TableIcon, Download, Filter, Search, Users, Wallet, AlertCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { analyzePgpData } from '@/ai/flows/analyze-pgp-flow';
import { Separator } from "@/components/ui/separator";
import { fetchSheetData, type PrestadorInfo } from '@/lib/sheets';
import { type ExecutionDataByMonth } from '@/app/page';
import FinancialMatrix, { type MonthlyFinancialSummary } from './FinancialMatrix';
import { buildMatrizEjecucion, type MatrizRow as MatrizEjecucionRow } from '@/lib/matriz-helpers';
import Papa from 'papaparse';
import { ScrollArea } from '../ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { describeCup, type CupDescription } from '@/ai/flows/describe-cup-flow';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import StatCard from '../shared/StatCard';
import { describeCie10, Cie10Description } from '@/ai/flows/describe-cie10-flow';
import InformeDesviaciones, { LookedUpCupModal } from '../report/InformeDesviaciones';
import InformePGP from '../report/InformePGP';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getNumericValue } from '../app/JsonAnalyzerPage';
import { findColumnValue } from '@/lib/matriz-helpers';
import DiscountMatrix, { type DiscountMatrixRow, type ServiceType, type AdjustedData } from './DiscountMatrix';


interface AnalyzePgpDataOutput {
  keyObservations: string[];
  potentialRisks: string[];
  strategicRecommendations: string[];
}

type Prestador = PrestadorInfo;

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


export interface MatrixRow {
    Mes: string;
    CUPS: string;
    Descripcion?: string;
    Diagnostico_Principal?: string;
    Cantidad_Esperada: number;
    Cantidad_Ejecutada: number;
    Diferencia: number;
    percentage_ejecucion: number; 
    '%_Ejecucion': string;
    Clasificacion: string;
    Valor_Unitario: number;
    Valor_Esperado: number;
    Valor_Ejecutado: number;
}

export interface ComparisonSummary {
    overExecutedCups: DeviatedCupInfo[];
    underExecutedCups: DeviatedCupInfo[];
    normalExecutionCups: DeviatedCupInfo[];
    missingCups: DeviatedCupInfo[];
    unexpectedCups: UnexpectedCupInfo[];
    Matriz_Ejecucion_vs_Esperado: MatrizEjecucionRow[];
    monthlyFinancials: MonthlyFinancialSummary[];
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
}

const PRESTADORES_SHEET_URL = "https://docs.google.com/spreadsheets/d/10Icu1DO4llbolO60VsdFcN5vxuYap1vBZs6foZ-XD04/edit?gid=0#gid=0";

const normalizeString = (v: unknown): string => String(v ?? "").trim();
const normalizeDigits = (v: unknown): string => {
    const digitsOnly = String(v ?? "").trim().replace(/\s+/g, "").replace(/\D/g, "");
    if (!digitsOnly) return "";
    // Convert to number to remove leading zeros, then back to string.
    return parseInt(digitsOnly, 10).toString();
};




const calculateSummary = (data: PgpRow[]): SummaryData | null => {
  if (data.length === 0) return null;

  const totalCostoMes = data.reduce((acc, row) => {
    const costo = getNumericValue(findColumnValue(row, ['costo evento mes (valor mes)', 'costo evento mes']));
    return acc + costo;
  }, 0);
  
  const totalPeriodo = totalCostoMes;


  return {
    totalCostoMes,
    totalPeriodo,
    totalAnual: totalCostoMes * 12,
    costoMinimoPeriodo: totalPeriodo * 0.9,
    costoMaximoPeriodo: totalPeriodo * 1.1,
  };
};

const SummaryCard = ({ summary, title, description, numMonths }: { summary: SummaryData | null, title: string, description: string, numMonths: number }) => {
  if (!summary) return null;
  return (
    <Card className="mb-6 shadow-lg border-primary/20">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-lg font-medium mb-2 flex items-center"><Calendar className="mr-2 h-5 w-5 text-muted-foreground" />Proyección Anual del Contrato</h3>
          <div className="grid grid-cols-1 gap-4 text-center">
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700">
              <p className="text-sm text-muted-foreground">Valor Total Anual (Estimado)</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-500">{formatCurrency(summary.totalAnual)}</p>
            </div>
          </div>
        </div>
        <Separator />
        <div>
          <h3 className="text-lg font-medium mb-2 flex items-center"><FileText className="mr-2 h-5 w-5 text-muted-foreground" />Detalle del Periodo Analizado ({numMonths} {numMonths > 1 ? 'Meses' : 'Mes'})</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20">
              <TrendingDown className="h-6 w-6 mx-auto text-red-500 mb-1" />
              <p className="text-sm text-muted-foreground">Límite Inferior (-10%)</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-500">{formatCurrency(summary.costoMinimoPeriodo)}</p>
            </div>
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <Target className="h-6 w-6 mx-auto text-blue-500 mb-1" />
              <p className="text-sm text-muted-foreground">Presupuesto del Periodo (NT)</p>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-500">{formatCurrency(summary.totalPeriodo)}</p>
            </div>
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
              <TrendingUp className="h-6 w-6 mx-auto text-green-500 mb-1" />
              <p className="text-sm text-muted-foreground">Límite Superior (+10%)</p>
              <p className="text-xl font-bold text-green-600 dark:text-green-500">{formatCurrency(summary.costoMaximoPeriodo)}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
};

const AnalysisModal = ({ analysis, isLoading, open, onOpenChange }: { analysis: AnalyzePgpDataOutput | null, isLoading: boolean, open: boolean, onOpenChange: (open: boolean) => void }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-blue-600" />
            Análisis Profesional de la Nota Técnica
          </DialogTitle>
          <DialogDescription>
            La IA ha generado las siguientes observaciones y recomendaciones basadas en los datos.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-8 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Analizando Nota Técnica...</p>
          </div>
        ) : analysis ? (
          <div className="space-y-6 py-4 max-h-[60vh] overflow-y-auto pr-2">
            <div>
              <h3 className="font-semibold text-lg mb-2">Observaciones Clave</h3>
              <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                {analysis.keyObservations.map((obs, i) => <li key={i}>{obs}</li>)}
              </ul>
            </div>
            <Separator />
            <div>
              <h3 className="font-semibold text-lg mb-2">Potenciales Riesgos</h3>
              <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                {analysis.potentialRisks.map((risk, i) => <li key={i}>{risk}</li>)}
              </ul>
            </div>
            <Separator />
            <div>
              <h3 className="font-semibold text-lg mb-2">Recomendaciones Estratégicas</h3>
              <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                {analysis.strategicRecommendations.map((rec, i) => <li key={i}>{rec}</li>)}
              </ul>
            </div>
          </div>
        ) : (
          <div className="text-center p-8">
            <p>No se pudo generar el análisis.</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
};

const handleDownloadXls = (data: any[], filename: string) => {
    // Deep copy to avoid modifying the original data
    const dataToExport = JSON.parse(JSON.stringify(data));

    // Iterate over the data and format numbers for Latin American Excel
    const formattedData = dataToExport.map((row: any) => {
        for (const key in row) {
            if (typeof row[key] === 'number') {
                // Convert number to string with comma as decimal separator
                row[key] = row[key].toString().replace('.', ',');
            }
        }
        return row;
    });

    const csv = Papa.unparse(formattedData, { delimiter: ";" });
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }); // Add BOM for Excel
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};


const ValorizadoDetailModal = ({ open, onOpenChange, data, executionDataByMonth }: { open: boolean, onOpenChange: (open: boolean) => void, data: MatrizEjecucionRow[], executionDataByMonth: ExecutionDataByMonth }) => {
    const tableData = useMemo(() => data.filter(row => row.Cantidad_Ejecutada > 0), [data]);
    
    const generateDownloadData = () => {
        const dataToDownload = tableData.map(row => {
            const users = new Set<string>();
            executionDataByMonth.forEach(monthData => {
                monthData.cupCounts.get(row.CUPS)?.uniqueUsers.forEach(user => {
                    users.add(user);
                });
            });

            return {
                ...row,
                Usuarios_Atendidos: Array.from(users).join(', ')
            };
        });
        return dataToDownload;
    };


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Desglose de Ejecución Valorizada (NT)</DialogTitle>
                    <DialogDescription>
                        Detalle del cálculo del valor ejecutado utilizando las frecuencias del JSON y los precios unitarios de la Nota Técnica.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-grow overflow-hidden">
                    <ScrollArea className="h-full">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>CUPS</TableHead>
                                    <TableHead>Descripción</TableHead>
                                    <TableHead className="text-center">Cant. Ejecutada</TableHead>
                                    <TableHead className="text-right">Valor Unitario (NT)</TableHead>
                                    <TableHead className="text-right">Valor Ejecutado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tableData.map((row, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="font-mono text-xs">{row.CUPS}</TableCell>
                                        <TableCell className="text-xs max-w-sm truncate">{row.Descripcion}</TableCell>
                                        <TableCell className="text-center">{row.Cantidad_Ejecutada}</TableCell>
                                        <TableCell className="text-right font-mono text-xs">{formatCurrency(row.Valor_Unitario)}</TableCell>
                                        <TableCell className="text-right font-semibold">{formatCurrency(row.Valor_Ejecutado)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </div>
                <DialogFooter>
                    <Button 
                        variant="secondary"
                        onClick={() => handleDownloadXls(generateDownloadData(), 'desglose_ejecucion_valorizada_con_usuarios.xls')}
                    >
                        <Download className="mr-2 h-4 w-4" />
                        Descargar
                    </Button>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined || isNaN(value)) return '$0';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
};

const getMonthName = (monthNumber: string) => {
    const date = new Date();
    date.setMonth(parseInt(monthNumber) - 1);
    const name = date.toLocaleString('es-CO', { month: 'long' });
    return name.charAt(0).toUpperCase() + name.slice(1);
};


const calculateSameDayDetections = (cup: string, executionDataByMonth: ExecutionDataByMonth, unitValue: number) => {
    const attentionMap = new Map<string, number>(); // key: "userId-date", value: count
    
    executionDataByMonth.forEach(monthData => {
        const allUsers = monthData.rawJsonData?.usuarios ?? [];
        allUsers.forEach((user: any) => {
            const userId = `${user.tipoDocumentoIdentificacion}-${user.numDocumentoIdentificacion}`;

            const processServices = (services: any[], codeField: string) => {
                if (!services) return;
                services.forEach((service: any) => {
                    if (service[codeField] === cup) {
                        try {
                            const date = new Date(service.fechaInicioAtencion).toISOString().split('T')[0];
                            const key = `${userId}-${date}`;
                            attentionMap.set(key, (attentionMap.get(key) || 0) + 1);
                        } catch (e) {
                            // Invalid date, skip
                        }
                    }
                });
            };
            
            // Only check procedures for same-day detections
            processServices(user.servicios?.procedimientos, 'codProcedimiento');
        });
    });

    let usersWithMultipleSameDayAttentions = 0;
    let totalRepetitionCost = 0;
    const countedUsers = new Set<string>();

    attentionMap.forEach((count, key) => {
        if (count > 1) {
            const userId = key.split('-')[0] + '-' + key.split('-')[1]; // Use userId part of the key
            if (!countedUsers.has(userId)) {
                 usersWithMultipleSameDayAttentions++;
                 countedUsers.add(userId);
            }
            // Cost is for every attention beyond the first one
            totalRepetitionCost += (count - 1) * unitValue;
        }
    });
    
    return { count: usersWithMultipleSameDayAttentions, cost: totalRepetitionCost };
};


const calculateComparison = (pgpData: PgpRow[], executionDataByMonth: ExecutionDataByMonth): ComparisonSummary => {
  const overExecutedCups: DeviatedCupInfo[] = [];
  const underExecutedCups: DeviatedCupInfo[] = [];
  const normalExecutionCups: DeviatedCupInfo[] = [];
  const missingCups: DeviatedCupInfo[] = [];
  const unexpectedCups: UnexpectedCupInfo[] = [];
  
  const pgpCupsMap = new Map<string, PgpRow>();
  pgpData.forEach(row => {
      const cup = findColumnValue(row, ['cup/cum', 'cups']);
      if(cup) pgpCupsMap.set(cup, row);
  });
  
  const cupServiceTypeMap = new Map<string, ServiceType>();

  const executedCupsSet = new Set<string>();
  const allExecutionData = new Map<string, { total: number, totalValue: number, uniqueUsers: Set<string> }>();

  executionDataByMonth.forEach(monthData => {
    const { cupCounts, rawJsonData } = monthData;
    
    const assignServiceType = (services: any[], codeField: string, type: ServiceType) => {
        if (!services) return;
        services.forEach(service => {
            const code = service[codeField];
            if (code && !cupServiceTypeMap.has(code)) {
                cupServiceTypeMap.set(code, type);
            }
        });
    };

    if (rawJsonData && rawJsonData.usuarios) {
        rawJsonData.usuarios.forEach((user: any) => {
            if (user.servicios) {
                assignServiceType(user.servicios.consultas, 'codConsulta', 'Consulta');
                assignServiceType(user.servicios.procedimientos, 'codProcedimiento', 'Procedimiento');
                assignServiceType(user.servicios.medicamentos, 'codTecnologiaSalud', 'Medicamento');
                assignServiceType(user.servicios.otrosServicios, 'codTecnologiaSalud', 'Otro Servicio');
            }
        });
    }

    cupCounts.forEach((cupData, cup) => {
        executedCupsSet.add(cup);
        if (!allExecutionData.has(cup)) {
            allExecutionData.set(cup, { total: 0, totalValue: 0, uniqueUsers: new Set<string>() });
        }
        const aed = allExecutionData.get(cup)!;
        aed.total += cupData.total;
        aed.totalValue += cupData.totalValue;
        cupData.uniqueUsers.forEach(u => aed.uniqueUsers.add(u));
    });
  });

  const allRelevantCups = new Set([...pgpCupsMap.keys(), ...executedCupsSet]);
  
  const matrizData = buildMatrizEjecucion({ executionDataByMonth, pgpData });
  const matrizDescuentos: DiscountMatrixRow[] = [];

  const monthlyFinancialsMap = new Map<string, { totalValorEsperado: number, totalValorEjecutado: number }>();

  matrizData.forEach(row => {
      const monthName = row.Mes;
      if (!monthlyFinancialsMap.has(monthName)) {
          monthlyFinancialsMap.set(monthName, { totalValorEsperado: 0, totalValorEjecutado: 0 });
      }
      const monthFinance = monthlyFinancialsMap.get(monthName)!;
      monthFinance.totalValorEsperado += row.Valor_Esperado;
      monthFinance.totalValorEjecutado += row.Valor_Ejecutado;
  });

  const monthlyFinancials: MonthlyFinancialSummary[] = [];
  monthlyFinancialsMap.forEach((data, month) => {
    monthlyFinancials.push({
        month,
        totalValorEsperado: data.totalValorEsperado,
        totalValorEjecutado: data.totalValorEjecutado,
        percentage: data.totalValorEsperado > 0 ? (data.totalValorEjecutado / data.totalValorEsperado) * 100 : 0
    });
  });


  allRelevantCups.forEach(cup => {
    const pgpRow = pgpCupsMap.get(cup);
    const execData = allExecutionData.get(cup);
    const totalRealFrequency = execData?.total || 0;
    const totalRealValueFromJSON = execData?.totalValue || 0;
    const totalUniqueUsers = execData?.uniqueUsers.size || 0;
    const serviceType = cupServiceTypeMap.get(cup) || 'Desconocido';


    if (pgpRow) {
      const expectedFrequencyPerMonth = getNumericValue(findColumnValue(pgpRow, ['frecuencia eventos mes']));
      const totalExpectedFrequency = expectedFrequencyPerMonth * executionDataByMonth.size;
      const unitValue = getNumericValue(findColumnValue(pgpRow, ['valor unitario']));
      const sameDayInfo = calculateSameDayDetections(cup, executionDataByMonth, unitValue);

      if (totalRealFrequency > 0 || totalExpectedFrequency > 0) {
        const deviation = totalRealFrequency - totalExpectedFrequency;
        const percentage = totalExpectedFrequency > 0 ? (totalRealFrequency / totalExpectedFrequency) : Infinity;
        const totalValue = totalRealFrequency * unitValue;
        
        let valorReconocer = totalValue;
        let clasificacion = "Ejecución Normal";

        if (percentage > 1.11) {
            valorReconocer = totalExpectedFrequency * unitValue * 1.11;
            clasificacion = "Sobre-ejecutado";
        } else if (percentage < 0.90) {
            clasificacion = totalRealFrequency > 0 ? "Sub-ejecutado" : "Faltante";
        }

        const cupInfo: DeviatedCupInfo = {
          cup,
          description: findColumnValue(pgpRow, ['descripcion cups', 'descripcion']),
          activityDescription: findColumnValue(pgpRow, ['descripcion id resolucion']),
          expectedFrequency: totalExpectedFrequency,
          realFrequency: totalRealFrequency,
          uniqueUsers: totalUniqueUsers,
          repeatedAttentions: totalRealFrequency - totalUniqueUsers,
          sameDayDetections: sameDayInfo.count,
          sameDayDetectionsCost: sameDayInfo.cost,
          deviation: deviation,
          deviationValue: deviation * unitValue,
          totalValue: totalValue, 
          valorReconocer: valorReconocer,
          unitValueFromNote: unitValue
        };

        if (totalRealFrequency > 0) {
           matrizDescuentos.push({
                CUPS: cup,
                Descripcion: cupInfo.description,
                Cantidad_Ejecutada: totalRealFrequency,
                Valor_Unitario: unitValue,
                Valor_Ejecutado: totalValue,
                Valor_a_Reconocer: valorReconocer,
                Valor_a_Descontar: totalValue - valorReconocer,
                Clasificacion: clasificacion,
                Tipo_Servicio: serviceType,
                // Add deviated cup info for the modal
                ...cupInfo
            });
        }
        
        if (clasificacion === "Sobre-ejecutado") {
            overExecutedCups.push(cupInfo);
        } else if (clasificacion === "Sub-ejecutado") {
            underExecutedCups.push(cupInfo);
        } else if (clasificacion === "Faltante") {
            missingCups.push(cupInfo);
        } else if (clasificacion === "Ejecución Normal") {
            if (totalExpectedFrequency > 0) {
              normalExecutionCups.push(cupInfo);
            }
        }
      }
    } else if (totalRealFrequency > 0) {
        const unexpectedInfo = {
            cup,
            realFrequency: totalRealFrequency,
            totalValue: totalRealValueFromJSON,
            serviceType: serviceType
        };
      unexpectedCups.push(unexpectedInfo);

       matrizDescuentos.push({
            CUPS: cup,
            Descripcion: "CUPS Inesperado",
            expectedFrequency: 0,
            Cantidad_Ejecutada: totalRealFrequency,
            Valor_Unitario: 0,
            Valor_Ejecutado: totalRealValueFromJSON,
            Valor_a_Reconocer: 0,
            Valor_a_Descontar: totalRealValueFromJSON,
            Clasificacion: "Inesperado",
            Tipo_Servicio: serviceType,
             // Dummy data for DeviatedCupInfo part of the type
            realFrequency: totalRealFrequency,
            uniqueUsers: totalUniqueUsers,
            repeatedAttentions: totalRealFrequency - totalUniqueUsers,
            sameDayDetections: 0,
            sameDayDetectionsCost: 0,
            deviation: totalRealFrequency,
            deviationValue: totalRealValueFromJSON,
            totalValue: totalRealValueFromJSON,
            valorReconocer: 0,
        });

    }
  });
  
  overExecutedCups.sort((a, b) => b.deviationValue - a.deviationValue);
  underExecutedCups.sort((a, b) => a.deviationValue - b.deviationValue);
  matrizDescuentos.sort((a,b) => b.Valor_a_Descontar - a.Valor_a_Descontar);


  return {
    overExecutedCups,
    underExecutedCups,
    normalExecutionCups,
    missingCups,
    unexpectedCups,
    Matriz_Ejecucion_vs_Esperado: matrizData,
    monthlyFinancials,
    matrizDescuentos
  };
};

const MatrizEjecucionCard = ({ matrizData, onCupClick, onCie10Click, executionDataByMonth }: { matrizData: MatrizEjecucionRow[], onCupClick: (cup: string) => void, onCie10Click: (cie10: string) => void, executionDataByMonth: ExecutionDataByMonth }) => {
    const [classificationFilter, setClassificationFilter] = useState('all');

    const classifications = useMemo(() => {
        const unique = new Set(matrizData.map(d => d.Clasificacion));
        return ['all', ...Array.from(unique)];
    }, [matrizData]);

    const filteredData = useMemo(() => {
        if (classificationFilter === 'all') {
            return matrizData;
        }
        return matrizData.filter(d => d.Clasificacion === classificationFilter);
    }, [matrizData, classificationFilter]);

    const sameDayDetectionsMap = useMemo(() => {
      const map = new Map<string, number>();
      if (!executionDataByMonth) return map;

      const userAttentionMap = new Map<string, Map<string, Map<string, number>>>();

      executionDataByMonth.forEach(monthData => {
        const allUsers = monthData.rawJsonData?.usuarios ?? [];
        allUsers.forEach((user: any) => {
            const userId = `${user.tipoDocumentoIdentificacion}-${user.numDocumentoIdentificacion}`;
            const services = user.servicios?.procedimientos;
            if (!services) return;
            
            services.forEach((service: any) => {
                const cup = service['codProcedimiento'];
                if (!cup) return;

                try {
                    const date = new Date(service.fechaInicioAtencion).toISOString().split('T')[0];
                    
                    if (!userAttentionMap.has(cup)) {
                        userAttentionMap.set(cup, new Map());
                    }
                    const cupMap = userAttentionMap.get(cup)!;

                    if (!cupMap.has(userId)) {
                        cupMap.set(userId, new Map());
                    }
                    const userMap = cupMap.get(userId)!;

                    userMap.set(date, (userMap.get(date) || 0) + 1);

                } catch (e) {}
            });
        });
      });

      userAttentionMap.forEach((cupMap, cup) => {
          let usersWithRepetitions = 0;
          cupMap.forEach((userMap) => {
              let hasRepetition = false;
              userMap.forEach((count) => {
                  if (count > 1) {
                      hasRepetition = true;
                  }
              });
              if (hasRepetition) {
                  usersWithRepetitions++;
              }
          });
          if (usersWithRepetitions > 0) {
              map.set(cup, usersWithRepetitions);
          }
      });
      return map;
    }, [executionDataByMonth]);

    const getRowClass = (classification: string) => {
        switch (classification) {
            case "Sobre-ejecutado": return "text-red-600";
            case "Sub-ejecutado": return "text-blue-600";
            case "Faltante": return "text-yellow-600";
            case "Inesperado": return "text-purple-600";
            default: return "";
        }
    };
    
    const getValorClass = (row: MatrizEjecucionRow) => {
        if (row.Valor_Ejecutado > row.Valor_Esperado) return "text-red-600";
        if (row.Valor_Ejecutado < row.Valor_Esperado) return "text-blue-600";
        return "text-green-600";
    };

    const getAnalisisValor = (row: MatrizEjecucionRow): string => {
        if (row.Valor_Ejecutado > row.Valor_Esperado) return "Ejecución Alta";
        if (row.Valor_Ejecutado < row.Valor_Esperado) return "Ejecución Baja";
        return "Normal";
    };


    return (
      <Card>
        <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <CardTitle className="flex items-center">
                        <TableIcon className="h-6 w-6 mr-3 text-purple-600" />
                        Matriz Ejecución vs Esperado (mensual)
                    </CardTitle>
                    <CardDescription>Análisis mensual detallado por CUPS.</CardDescription>
                     <p className="text-xs text-yellow-600 flex items-center gap-1 mt-1">
                        <AlertCircle className="h-3 w-3"/>
                        Aquí se visualiza lo que se descontará.
                    </p>
                </div>
                <div className='flex items-center gap-2'>
                    <Select value={classificationFilter} onValueChange={setClassificationFilter}>
                        <SelectTrigger className="w-[200px] h-8 text-xs">
                            <Filter className="h-3 w-3 mr-2" />
                            <SelectValue placeholder="Filtrar por clasificación..." />
                        </SelectTrigger>
                        <SelectContent>
                            {classifications.map(c => (
                                <SelectItem key={c} value={c} className="text-xs">
                                    {c === 'all' ? 'Ver Todos' : c}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadXls(filteredData, `matriz_ejecucion_mensual_${classificationFilter}.xls`);
                        }}
                        className="h-8 w-8"
                        aria-label="Descargar Matriz Mensual"
                    >
                        <Download className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </CardHeader>
        <CardContent>
            <ScrollArea className="h-96">
                <Table>
                      <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10">
                        <TableRow>
                            <TableHead className="text-sm">Mes</TableHead>
                            <TableHead className="text-sm">CUPS</TableHead>
                            <TableHead className="text-sm">Descripción</TableHead>
                            <TableHead className="text-sm">Diagnóstico Principal (CIE-10)</TableHead>
                            <TableHead className="text-center text-sm">Cant. Esperada</TableHead>
                            <TableHead className="text-center text-sm">Cant. Ejecutada</TableHead>
                            <TableHead className="text-center text-sm">Diferencia</TableHead>
                            <TableHead className="text-center text-sm">% Ejecución</TableHead>
                            <TableHead className="text-sm">Clasificación</TableHead>
                            <TableHead>Análisis de Valor</TableHead>
                            <TableHead>Procedimientos Repetidos Mismo Día</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredData.map((row, index) => (
                            <TableRow key={index} className={getRowClass(row.Clasificacion)}>
                                <TableCell className="text-sm">{row.Mes}</TableCell>
                                <TableCell>
                                    <Button variant="link" className="p-0 h-auto font-mono text-sm" onClick={() => onCupClick(row.CUPS)}>
                                        {row.CUPS}
                                    </Button>
                                </TableCell>
                                <TableCell className="text-sm">{row.Descripcion}</TableCell>
                                <TableCell>
                                    {row.Diagnostico_Principal && (
                                        <Button variant="link" className="p-0 h-auto font-mono text-sm" onClick={() => onCie10Click(row.Diagnostico_Principal!)}>
                                           <Search className="h-3 w-3 mr-1" /> {row.Diagnostico_Principal}
                                        </Button>
                                    )}
                                </TableCell>
                                <TableCell className="text-center text-sm">{row.Cantidad_Esperada.toFixed(0)}</TableCell>
                                <TableCell className="text-center text-sm">{row.Cantidad_Ejecutada}</TableCell>
                                <TableCell className="text-center font-semibold text-sm">{row.Diferencia.toFixed(0)}</TableCell>
                                <TableCell className="text-center font-mono text-sm">{row['%_Ejecucion']}</TableCell>
                                <TableCell className="font-medium text-sm">{row.Clasificacion}</TableCell>
                                <TableCell className={`font-medium text-sm ${getValorClass(row)}`}>{getAnalisisValor(row)}</TableCell>
                                <TableCell className="text-center">
                                    {sameDayDetectionsMap.has(row.CUPS) && (
                                      <div className="w-6 h-6 bg-red-500 text-white font-bold text-xs flex items-center justify-center rounded-md mx-auto">
                                        {sameDayDetectionsMap.get(row.CUPS)}
                                      </div>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </ScrollArea>
        </CardContent>
      </Card>
    );
};


const PgPsearchForm: React.FC<PgPsearchFormProps> = ({ executionDataByMonth, jsonPrestadorCode, uniqueUserCount }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState<boolean>(false);
  const [loadingPrestadores, setLoadingPrestadores] = useState<boolean>(true);
  const [pgpData, setPgpData] = useState<PgpRow[]>([]);
  const [prestadores, setPrestadores] = useState<Prestador[]>([]);
  const [selectedPrestador, setSelectedPrestador] = useState<Prestador | null>(null);
  const [prestadorToLoad, setPrestadorToLoad] = useState<Prestador | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);
  const [globalSummary, setGlobalSummary] = useState<SummaryData | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzePgpDataOutput | null>(null);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const [mismatchWarning, setMismatchWarning] = useState<string | null>(null);
  const [lookedUpCupInfo, setLookedUpCupInfo] = useState<CupDescription | null>(null);
  const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [cie10Info, setCie10Info] = useState<Cie10Description | null>(null);
  const [isCie10ModalOpen, setIsCie10ModalOpen] = useState(false);
  const [isCie10Loading, setIsCie10Loading] = useState(false);
  const [isValorizadoModalOpen, setIsValorizadoModalOpen] = useState(false);
  const [adjustedData, setAdjustedData] = useState<AdjustedData>({
    adjustedQuantities: {},
    adjustedValues: {},
    comments: {},
  });


  useEffect(() => {
    setIsClient(true);
    fetch('/api/check-env').then(res => res.json()).then(data => setIsAiEnabled(data.isAiEnabled));
  }, []);

  const showComparison = isDataLoaded && executionDataByMonth.size > 0;
  const numMonthsForSummary = useMemo(() => executionDataByMonth.size > 0 ? executionDataByMonth.size : 1, [executionDataByMonth.size]);
  
  // Create a stable, unique key for the current analysis session
  const localStorageKey = useMemo(() => {
    if (!selectedPrestador || executionDataByMonth.size === 0) return '';
    const prestadorId = selectedPrestador['ID DE ZONA'] || selectedPrestador.NIT;
    const monthKeys = Array.from(executionDataByMonth.keys()).sort().join('-');
    return `pgp-adjustments-${prestadorId}-${monthKeys}`;
  }, [selectedPrestador, executionDataByMonth]);


  useEffect(() => {
    if (isDataLoaded) {
      setGlobalSummary(calculateSummary(pgpData));
    } else {
      setGlobalSummary(null);
    }
  }, [isDataLoaded, pgpData]);

  const comparisonSummary = useMemo(() => {
    if (!showComparison) return null;
    return calculateComparison(pgpData, executionDataByMonth);
  }, [pgpData, executionDataByMonth, showComparison]);
  
  const totalEjecutadoValorizado = useMemo(() => {
    if (!comparisonSummary) return 0;
    return comparisonSummary.monthlyFinancials.reduce((sum, month) => sum + month.totalValorEjecutado, 0);
  }, [comparisonSummary]);
  
  const totalRealEjecutadoJson = useMemo(() => {
    if (executionDataByMonth.size === 0) return 0;
    let total = 0;
    executionDataByMonth.forEach(monthData => {
        total += monthData.totalRealValue;
    });
    return total;
  }, [executionDataByMonth]);

  const descuentoAplicadoTotal = useMemo(() => {
    if (!adjustedData?.adjustedValues) return 0;
    return Object.values(adjustedData.adjustedValues).reduce((sum, val) => sum + val, 0);
  }, [adjustedData]);

  const valorNetoFinal = useMemo(() => {
      return totalRealEjecutadoJson - descuentoAplicadoTotal;
  }, [totalRealEjecutadoJson, descuentoAplicadoTotal]);


  const reportData = useMemo((): ReportData | null => {
    if (!showComparison || !selectedPrestador || !globalSummary || !comparisonSummary) return null;

    const monthsData = Array.from(executionDataByMonth.entries()).map(([month, data]) => ({
        month: getMonthName(month),
        cups: data.summary.numConsultas + data.summary.numProcedimientos,
        valueCOP: data.totalRealValue,
    }));
    
    return {
      header: {
        empresa: "Dusakawi EPSI", nit: "8240001398",
        ipsNombre: selectedPrestador.PRESTADOR, ipsNit: selectedPrestador.NIT,
        municipio: "Uribia", contrato: "CW-052-2024-P", vigencia: "2024",
        ciudad: "Uribia", fecha: new Date().toLocaleDateString('es-CO'),
      },
      months: monthsData,
      notaTecnica: {
        min90: globalSummary.costoMinimoPeriodo,
        valor3m: globalSummary.totalPeriodo,
        max110: globalSummary.costoMaximoPeriodo,
        anticipos: valorNetoFinal * 0.8,
        totalPagar: valorNetoFinal,
        totalFinal: valorNetoFinal,
        descuentoAplicado: descuentoAplicadoTotal,
      },
      overExecutedCups: comparisonSummary.overExecutedCups,
      underExecutedCups: comparisonSummary.underExecutedCups,
      missingCups: comparisonSummary.missingCups,
      unexpectedCups: comparisonSummary.unexpectedCups,
      adjustedData,
    };
  }, [showComparison, selectedPrestador, executionDataByMonth, globalSummary, comparisonSummary, adjustedData, valorNetoFinal, descuentoAplicadoTotal]);

  const handleLookupClick = async (cup: string) => {
    setIsLookupLoading(true);
    setIsLookupModalOpen(true);
    try {
      const result = await describeCup(cup);
      setLookedUpCupInfo(result);
    } catch (error) {
      setLookedUpCupInfo({ cup, description: "Error al buscar la descripción." });
    } finally {
      setIsLookupLoading(false);
    }
  };

  const handleCie10Lookup = async (code: string) => {
    if (!code) return;
    setIsCie10Loading(true);
    setIsCie10ModalOpen(true);
    try {
        const result = await describeCie10(code);
        setCie10Info(result);
    } catch (error) {
        setCie10Info({ code, description: "Error al buscar la descripción." });
    } finally {
        setIsCie10Loading(false);
    }
  }

  const performLoadPrestador = useCallback(async (prestador: Prestador) => {
    setLoading(true); setIsDataLoaded(false); setGlobalSummary(null); setAnalysis(null); setMismatchWarning(null);
    toast({ title: `Cargando Nota Técnica: ${prestador.PRESTADOR}...` });

    try {
      if (!prestador.WEB || String(prestador.WEB).trim() === '') throw new Error("URL de nota técnica no definida.");
      const data = await fetchSheetData<PgpRow>(prestador.WEB);
      const pgpRows = data.map(row => {
        const newRow: Partial<PgpRow> = {};
        for (const key in row) {
          const trimmedKey = key.trim();
          if (Object.prototype.hasOwnProperty.call(row, key) && trimmedKey) newRow[trimmedKey] = row[key];
        }
        return newRow as PgpRow;
      }).filter(item => !!findColumnValue(item, ['cup/cum', 'cups']));

      if (pgpRows.length === 0) toast({ title: "Atención: No se cargaron registros", description: "La nota técnica parece vacía o en un formato no reconocido.", variant: "destructive"});
      
      setPgpData(pgpRows);
      
      setIsDataLoaded(true);
      setSelectedPrestador(prestador);
      toast({ title: "Datos PGP Cargados", description: `Se cargaron ${pgpRows.length} registros para ${prestador.PRESTADOR}.` });

    } catch (error: any) {
      toast({ title: "Error al Cargar Datos de la Nota Técnica", description: error.message, variant: "destructive" });
      setIsDataLoaded(false);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleSelectPrestador = useCallback((prestador: Prestador) => {
    setMismatchWarning(null);
    setIsDataLoaded(false);
    setPrestadorToLoad(prestador);
    const pgpZoneId = prestador['ID DE ZONA'] ? normalizeDigits(prestador['ID DE ZONA']) : null;
    const jsonId = jsonPrestadorCode ? normalizeDigits(jsonPrestadorCode) : null;
    if (jsonId && pgpZoneId && jsonId !== pgpZoneId) {
      setMismatchWarning(`¡Advertencia! El código del JSON (${jsonId}) no coincide con el ID de la nota técnica (${pgpZoneId}). Los datos podrían no ser comparables.`);
    } else {
      performLoadPrestador(prestador);
    }
  }, [jsonPrestadorCode, performLoadPrestador]);

  const handleForceLoad = () => {
    if (prestadorToLoad) performLoadPrestador(prestadorToLoad);
  };

  useEffect(() => {
    if (!isClient) return;
    const fetchPrestadores = async () => {
      setLoadingPrestadores(true);
      toast({ title: "Cargando lista de prestadores..." });
      try {
        const data = await fetchSheetData<Prestador>(PRESTADORES_SHEET_URL);
        const typedData = data.map(p => ({
          'NIT': normalizeString(p.NIT), 'PRESTADOR': normalizeString(p.PRESTADOR),
          'ID DE ZONA': normalizeString(p['ID DE ZONA']), 'WEB': normalizeString(p.WEB),
          'POBLACION': getNumericValue(p.POBLACION)
        })).filter(p => p.PRESTADOR && p['ID DE ZONA']);
        setPrestadores(typedData);
        toast({ title: "Lista de prestadores cargada.", description: `Se encontraron ${typedData.length} prestadores.` });
      } catch (error: any) {
        toast({ title: "Error al Cargar la Lista de Prestadores", description: error.message, variant: "destructive" });
      } finally {
        setLoadingPrestadores(false);
      }
    };
    fetchPrestadores();
  }, [isClient, toast]);

  useEffect(() => {
    if (!jsonPrestadorCode || prestadores.length === 0 || loading || selectedPrestador) return;
    const normalizedJsonCode = normalizeDigits(jsonPrestadorCode);
    const matchById = prestadores.find(p => normalizeDigits(p['ID DE ZONA']) === normalizedJsonCode);
    if (matchById) {
      toast({ title: "Prestador Sugerido Encontrado", description: `Cargando automáticamente la nota técnica para ${matchById.PRESTADOR}.` });
      handleSelectPrestador(matchById);
    }
  }, [jsonPrestadorCode, prestadores, loading, selectedPrestador, handleSelectPrestador, toast]);

  const population = selectedPrestador?.POBLACION ?? 0;
  const coveragePercentage = population > 0 ? (uniqueUserCount / population) * 100 : 0;
  
  if (!isClient) {
    return <div className="flex items-center justify-center py-6"><Loader2 className="mr-2 h-6 w-6 animate-spin" /> <p>Cargando analizador...</p></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Análisis de Notas Técnicas PGP</CardTitle>
        <CardDescription>Selecciona un prestador para cargar su nota técnica y visualizar los datos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full md:w-auto" disabled={loadingPrestadores}>
              {loadingPrestadores ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building className="mr-2 h-4 w-4" />}
              {selectedPrestador ? selectedPrestador.PRESTADOR : "Seleccionar un Prestador"}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-full md:w-[300px] max-h-72 overflow-y-auto">
            {prestadores.map((p, index) => (
              <DropdownMenuItem key={`${p['ID DE ZONA']}-${index}`} onSelect={() => handleSelectPrestador(p)} className="flex flex-col items-start p-2">
                 <span className="font-medium block">{p.PRESTADOR}</span>
                 <span className="text-xs text-muted-foreground block">({p['ID DE ZONA']})</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {mismatchWarning && (
          <Alert variant="destructive">
            <div className="flex flex-col sm:flex-row items-center justify-between">
              <div className="flex items-center"><AlertTriangle className="h-4 w-4 mr-2" />
                <div>
                  <AlertTitle>Advertencia de Coincidencia</AlertTitle>
                  <AlertDescription>{mismatchWarning}</AlertDescription>
                </div>
              </div>
              <Button onClick={handleForceLoad} variant="secondary" className="mt-2 sm:mt-0 sm:ml-4 flex-shrink-0">Cargar de todos modos</Button>
            </div>
          </Alert>
        )}

        {loading && <div className="flex items-center justify-center py-6"><Loader2 className="mr-2 h-6 w-6 animate-spin" /><p>Cargando datos de la nota técnica...</p></div>}

        {isDataLoaded && !loading && (
          <div className="space-y-6">
             {showComparison && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <StatCard title="Cobertura Poblacional" value={`${coveragePercentage.toFixed(1)}%`} icon={Users} footer={`Atendidos: ${uniqueUserCount.toLocaleString()} de ${population.toLocaleString()}`} />
                    <StatCard title="Ejecución Real (JSON)" value={formatCurrency(totalRealEjecutadoJson)} icon={Wallet} footer={`Costo real total de los archivos JSON`} />
                     <div onDoubleClick={() => setIsValorizadoModalOpen(true)} className="cursor-pointer">
                        <StatCard 
                            title="Ejecución Valorizada (NT)" 
                            value={formatCurrency(totalEjecutadoValorizado)} 
                            icon={Wallet} 
                            footer={`Ejecución valorizada con precios de la Nota Técnica`} 
                        />
                    </div>
                </div>
            )}
            <SummaryCard summary={globalSummary} title={`Resumen Teórico: Nota Técnica de ${selectedPrestador?.PRESTADOR ?? '—'}`} description="Cálculos basados en la totalidad de los datos cargados desde la nota técnica." numMonths={numMonthsForSummary} />
            
            {showComparison && comparisonSummary && (
              <>
                <FinancialMatrix monthlyFinancials={comparisonSummary.monthlyFinancials} />
                <InformeDesviaciones 
                    comparisonSummary={comparisonSummary} 
                    pgpData={pgpData} 
                    executionDataByMonth={executionDataByMonth}
                />
                <MatrizEjecucionCard matrizData={comparisonSummary.Matriz_Ejecucion_vs_Esperado} onCupClick={handleLookupClick} onCie10Click={handleCie10Lookup} executionDataByMonth={executionDataByMonth} />
                <DiscountMatrix
                  data={comparisonSummary.matrizDescuentos}
                  executionDataByMonth={executionDataByMonth}
                  pgpData={pgpData}
                  onAdjustmentsChange={setAdjustedData}
                  storageKey={localStorageKey}
                />

                {reportData && <InformePGP data={reportData} />}
              </>
            )}
          </div>
        )}

        <LookedUpCupModal cupInfo={lookedUpCupInfo} open={isLookupModalOpen} onOpenChange={setIsLookupModalOpen} isLoading={isLookupLoading} />
        <AlertDialog open={isCie10ModalOpen} onOpenChange={setIsCie10ModalOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{isCie10Loading ? "Buscando diagnóstico..." : `Resultado para: ${cie10Info?.code}`}</AlertDialogTitle>
                </AlertDialogHeader>
                {isCie10Loading ? (
                    <div className="flex justify-center items-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : (
                    <AlertDialogDescription>{cie10Info?.description || "No se encontró una descripción."}</AlertDialogDescription>
                )}
                <AlertDialogFooter>
                    <AlertDialogAction onClick={() => setIsCie10ModalOpen(false)}>Cerrar</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        <AnalysisModal analysis={analysis} isLoading={loadingAnalysis} open={isAnalysisModalOpen} onOpenChange={setIsAnalysisModalOpen} />
         {comparisonSummary && (
            <ValorizadoDetailModal 
                open={isValorizadoModalOpen}
                onOpenChange={setIsValorizadoModalOpen}
                data={comparisonSummary.Matriz_Ejecucion_vs_Esperado}
                executionDataByMonth={executionDataByMonth}
            />
        )}
      </CardContent>
    </Card>
  );
};

export default PgPsearchForm;


    

    



