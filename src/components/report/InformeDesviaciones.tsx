
"use client";

import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, TrendingDown, AlertTriangle, Search, Target, Download, Loader2, X, Users, Repeat, AlertCircle, DollarSign } from "lucide-react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { formatCurrency, type ComparisonSummary } from '../pgp-search/PgPsearchForm';
import type { DeviatedCupInfo, UnexpectedCupInfo } from '../pgp-search/PgPsearchForm';
import type { CupDescription } from '@/ai/flows/describe-cup-flow';
import { describeCup } from '@/ai/flows/describe-cup-flow';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ExecutionDataByMonth } from '@/app/page';
import { findColumnValue } from '@/lib/matriz-helpers';
import StatCard from '../shared/StatCard';
import { getNumericValue } from '../app/JsonAnalyzerPage';
import { cn } from '@/lib/utils';

/** Descarga CUPS Inesperadas con encabezados de revisión + columnas para NT */
const handleDownloadInesperadasXls = (data: any[], numMeses: number, prestadorWeb: string) => {
    // ── Hoja 1: Revisión (con los encabezados solicitados) ──
    const revision = data.map((row: any) => {
        const costoMedio = row.realFrequency > 0 ? row.totalValue / row.realFrequency : 0;
        return {
            'cup': row.cup,
            'description': row.description || '',
            'realFrequency': row.realFrequency,
            'totalValue': row.totalValue,
            'serviceType': row.serviceType || '',
            'INCLUIR (NT) SI O NO': '',
            'CUPS CORRECTO': row.cup,
            'DESCRIPCION': row.description || '',
            'COSTO MEDIO EVENTO': costoMedio.toFixed(2).replace('.', ','),
        };
    });

    // ── Hoja 2: Listo para pegar en NT Sheet (1 fila vacía + 4 cols) ──
    const meses = numMeses || 1;
    const paraNT = [
        // fila vacía de separación
        { 'CUPS': '', 'DESCRIPCION CUPS': '', 'VALOR UNITARIO': '', 'COSTO EVENTO MES': '' },
        ...data.map((row: any) => {
            const valorUnitario = row.realFrequency > 0 ? row.totalValue / row.realFrequency : 0;
            const costoEventoMes = row.totalValue / meses;
            return {
                'CUPS': row.cup,
                'DESCRIPCION CUPS': row.description || '',
                'VALOR UNITARIO': valorUnitario.toFixed(2).replace('.', ','),
                'COSTO EVENTO MES': costoEventoMes.toFixed(2).replace('.', ','),
            };
        }),
    ];

    // Generar CSV con ambas secciones separadas
    const toCSV = (rows: object[]) => {
        if (!rows.length) return '';
        const headers = Object.keys(rows[0]);
        const lines = [headers.join('\t'), ...rows.map(r => Object.values(r).join('\t'))];
        return lines.join('\n');
    };

    const combined =
        '=== REVISION CUPS INESPERADAS ===\n' + toCSV(revision) +
        '\n\n=== PEGAR EN NT SHEET (URL: ' + prestadorWeb + ') ===\n' + toCSV(paraNT);

    const blob = new Blob(['\uFEFF' + combined], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'CUPS_Inesperadas_Para_NT.xls');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const handleDownloadXls = (data: any[], filename: string) => {
    const dataToExport = JSON.parse(JSON.stringify(data));

    const formattedData = dataToExport.map((row: any) => {
        for (const key in row) {
            if (typeof row[key] === 'number') {
                row[key] = row[key].toString().replace('.', ',');
            }
        }
        return row;
    });

    const csv = Papa.unparse(formattedData, { delimiter: ";" });
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};


const DeviatedCupsCard = ({ title, icon, data, badgeVariant, onDownload, onDoubleClick, totalValue, valueLabel, color }: {
    title: string;
    icon: React.ElementType;
    data: DeviatedCupInfo[];
    badgeVariant: "destructive" | "default" | "success" | "secondary";
    onDownload: (data: any[], filename: string) => void;
    onDoubleClick: () => void;
    totalValue: number;
    valueLabel: string;
    color: 'red' | 'green' | 'blue' | 'black' | 'purple';
}) => {
    const Icon = icon;
    const hasData = data && data.length > 0;
    
    const colorMap = {
        red: 'text-red-500',
        green: 'text-green-600',
        blue: 'text-blue-500',
        black: 'text-foreground',
        purple: 'text-purple-600'
    };

    const badgeColorMap = {
        red: 'bg-red-500 hover:bg-red-600',
        green: 'bg-green-600 hover:bg-green-700',
        blue: 'bg-blue-500 hover:bg-blue-600',
        black: 'bg-slate-500 hover:bg-slate-600',
        purple: 'bg-purple-600 hover:bg-purple-700'
    };
    
    return (
        <Card className="w-full cursor-pointer hover:bg-muted/50 transition-colors" onDoubleClick={onDoubleClick}>
            <CardHeader className="flex flex-row items-center justify-between p-4">
                <div className="flex items-center gap-3">
                    <Icon className={cn("h-6 w-6", colorMap[color])} />
                    <CardTitle className="text-base font-medium">{title}</CardTitle>
                </div>
                <div className='flex items-center gap-4 pl-4'>
                    {hasData && (
                        <div className="text-right">
                             <p className={cn("text-sm font-bold", colorMap[color])}>{formatCurrency(totalValue)}</p>
                             <p className="text-xs text-muted-foreground">{valueLabel}</p>
                        </div>
                    )}
                    {hasData && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDownload(data, `${title.toLowerCase().replace(/ /g, '_')}.xls`);
                            }}
                            className="h-7 w-7"
                        >
                            <Download className="h-4 w-4" />
                        </Button>
                    )}
                    <Badge className={cn("text-white border-transparent", hasData ? badgeColorMap[color] : 'bg-muted text-muted-foreground')}>
                        {data.length}
                    </Badge>
                </div>
            </CardHeader>
        </Card>
    )
};


const DiscrepancyCard = ({ title, icon, data, onDownload, onDoubleClick, totalValue, valueLabel, color }: {
    title: string;
    icon: React.ElementType;
    data: any[];
    onDownload: (data: any[], filename: string) => void;
    onDoubleClick: () => void;
    totalValue?: number;
    valueLabel?: string;
    color: 'red' | 'green' | 'blue' | 'black' | 'purple';
}) => {
    const Icon = icon;
    const hasData = data && data.length > 0;
    const hasValue = typeof totalValue === 'number';

    const colorMap = {
        red: 'text-red-500',
        green: 'text-green-600',
        blue: 'text-blue-500',
        black: 'text-foreground',
        purple: 'text-purple-600'
    };

    const badgeColorMap = {
        red: 'bg-red-500 hover:bg-red-600',
        green: 'bg-green-600 hover:bg-green-700',
        blue: 'bg-blue-500 hover:bg-blue-600',
        black: 'bg-slate-500 hover:bg-slate-600',
        purple: 'bg-purple-600 hover:bg-purple-700'
    };

    return (
        <Card className="w-full cursor-pointer hover:bg-muted/50 transition-colors" onDoubleClick={onDoubleClick}>
            <CardHeader className="flex flex-row items-center justify-between p-4">
                <div className="flex items-center gap-3">
                    <Icon className={cn("h-6 w-6", colorMap[color])} />
                    <CardTitle className="text-base font-medium">{title}</CardTitle>
                </div>
                 <div className='flex items-center gap-4 pl-4'>
                    {hasValue && (
                         <div className="text-right">
                             <p className={cn("text-sm font-bold", colorMap[color])}>{formatCurrency(totalValue)}</p>
                             <p className="text-xs text-muted-foreground">{valueLabel}</p>
                        </div>
                    )}
                    {hasData && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDownload(data, `${title.toLowerCase().replace(/ /g, '_')}.xls`);
                            }}
                            className="h-7 w-7"
                        >
                            <Download className="h-4 w-4" />
                        </Button>
                    )}
                    <Badge className={cn("text-white border-transparent", hasData ? badgeColorMap[color] : 'bg-muted text-muted-foreground')}>
                        {data.length}
                    </Badge>
                </div>
            </CardHeader>
        </Card>
    );
};


export const CupDetailsModal = ({ open, onOpenChange, cup, executionDetails }: { open: boolean, onOpenChange: (open: boolean) => void, cup: DeviatedCupInfo | null, executionDetails: any[] }) => {
    if (!cup) return null;

    const handleDownloadDetails = () => {
        handleDownloadXls(executionDetails, `matriz_detalle_${cup.cup}.xls`);
    };

    const SummaryStat = ({ label, value, className }: { label: string; value: string | number; className?: string }) => (
        <div className="flex justify-between items-center text-sm py-1 border-b border-dashed">
            <span className="text-muted-foreground">{label}:</span>
            <span className={`font-semibold ${className}`}>{value}</span>
        </div>
    );

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="sm:max-w-4xl h-[90vh] flex flex-col">
                <AlertDialogHeader>
                    <AlertDialogTitle>Ejecuciones Detalladas del CUPS: <span className="font-mono">{cup.cup}</span></AlertDialogTitle>
                    <AlertDialogDescription>
                        {cup.activityDescription || cup.description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                
                <div className="flex-grow overflow-y-auto pr-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 p-4 bg-muted/50 rounded-lg">
                        <SummaryStat label="Valor Unitario (NT)" value={formatCurrency(cup.unitValueFromNote ?? 0)} className="text-purple-600" />
                        <SummaryStat label="Frecuencia Real" value={cup.realFrequency} className="text-blue-600" />
                        <SummaryStat label="Frecuencia Esperada" value={cup.expectedFrequency.toFixed(0)} />
                        <SummaryStat label="Usuarios Únicos" value={cup.uniqueUsers} />
                        <SummaryStat label="Atenciones Repetidas" value={cup.repeatedAttentions} className="text-orange-600" />
                        <SummaryStat label="Desviación (Cantidad)" value={cup.deviation.toFixed(0)} className={cup.deviation > 0 ? "text-red-600" : "text-green-600"} />
                        <SummaryStat label="Desviación (Valor)" value={formatCurrency(cup.deviationValue)} className={cup.deviationValue > 0 ? "text-red-600" : "text-green-600"} />
                        <SummaryStat label=">1 Atención Mismo Día (Usuarios)" value={cup.sameDayDetections} className="text-red-600" />
                        <SummaryStat label="Costo Repetición Mismo Día" value={formatCurrency(cup.sameDayDetectionsCost)} className="text-red-600 font-bold" />
                    </div>

                    <div className="mt-4 relative">
                      <ScrollArea className="h-[45vh]">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10">
                                <TableRow>
                                    <TableHead>Tipo Servicio</TableHead>
                                    <TableHead>ID Usuario</TableHead>
                                    <TableHead>Fecha Atención</TableHead>
                                    <TableHead>Diagnóstico</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {executionDetails.map((detail, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{detail.tipoServicio}</TableCell>
                                        <TableCell>{detail.idUsuario}</TableCell>
                                        <TableCell>{detail.fechaAtencion}</TableCell>
                                        <TableCell>{detail.diagnosticoPrincipal}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(detail.valorServicio)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                      </ScrollArea>
                    </div>
                </div>
                <AlertDialogFooter className="pt-4 flex-shrink-0">
                    <Button variant="secondary" onClick={handleDownloadDetails}>
                        <Download className="mr-2 h-4 w-4" />
                        Descargar Detalle
                    </Button>
                    <AlertDialogAction onClick={() => onOpenChange(false)}>Cerrar</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};


export const LookedUpCupModal = ({ cupInfo, open, onOpenChange, isLoading }: { cupInfo: CupDescription | null, open: boolean, onOpenChange: (open: boolean) => void, isLoading: boolean }) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isLoading ? "Buscando información..." : `Resultado para: ${cupInfo?.cup}`}
          </AlertDialogTitle>
        </AlertDialogHeader>
        {isLoading ? (
          <div className="flex justify-center items-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <AlertDialogDescription>
            {cupInfo?.description || "No se encontró una descripción para este código."}
          </AlertDialogDescription>
        )}
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => onOpenChange(false)}>Cerrar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};


const TableModal = ({ open, onOpenChange, title, content, data, downloadFilename, totals }: { 
    open: boolean; 
    onOpenChange: (open: boolean) => void; 
    title: React.ReactNode; 
    content: React.ReactNode;
    data: any[];
    downloadFilename: string;
    totals?: {
        ejecutado: number;
        desviacion: number;
    }
}) => {
  if (!totals) return null;
  const valorSugerido = totals.ejecutado - totals.desviacion;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
         <DialogHeader>
          <div className="flex justify-between items-start flex-wrap gap-4">
            <DialogTitle>{title}</DialogTitle>
             <div className="text-right space-y-1 text-sm">
                <p><span className="font-semibold text-green-600">Valor Ejecutado: </span>{formatCurrency(totals.ejecutado)}</p>
                <p><span className="font-semibold text-red-600">Valor Desviación: </span>{formatCurrency(totals.desviacion)}</p>
                <p><span className="font-semibold text-blue-600">Valor Sugerido a Revisión: </span>{formatCurrency(valorSugerido)}</p>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-grow overflow-hidden">
          {content}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => handleDownloadXls(data, downloadFilename)}>
            <Download className="mr-2 h-4 w-4" />
            Descargar
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface InformeDesviacionesProps {
    comparisonSummary: ComparisonSummary | null;
    pgpData: any[];
    executionDataByMonth: ExecutionDataByMonth;
    selectedPrestador?: { WEB?: string; PRESTADOR?: string } | null;
}


export default function InformeDesviaciones({ comparisonSummary, pgpData, executionDataByMonth, selectedPrestador }: InformeDesviacionesProps) {
    const [selectedCup, setSelectedCup] = useState<DeviatedCupInfo | null>(null);
    const [isCupModalOpen, setIsCupModalOpen] = useState(false);
    const [lookedUpCupInfo, setLookedUpCupInfo] = useState<CupDescription | null>(null);
    const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);
    const [isLookupLoading, setIsLookupLoading] = useState(false);
    const [modalContent, setModalContent] = useState<{ title: React.ReactNode, data: any[], type: string, totals: {ejecutado: number, desviacion: number} } | null>(null);
    const [executionDetails, setExecutionDetails] = useState<any[]>([]);
    const [valorConsolidadoManual, setValorConsolidadoManual] = useState<string>('');

    const calculateTotals = (items: DeviatedCupInfo[]) => {
        if (!items) return { ejecutado: 0, desviacion: 0 };
        const totalEjecutado = items.reduce((sum, cup) => sum + (cup.totalValue || 0), 0);
        const totalDesviacion = items.reduce((sum, cup) => sum + (cup.deviationValue || 0), 0);
        return {
            ejecutado: totalEjecutado,
            desviacion: totalDesviacion
        };
    }
    
    const overExecutionTotals = useMemo(() => calculateTotals(comparisonSummary?.overExecutedCups || []), [comparisonSummary]);
    const underExecutionTotals = useMemo(() => calculateTotals(comparisonSummary?.underExecutedCups || []), [comparisonSummary]);
    const normalExecutionTotals = useMemo(() => calculateTotals(comparisonSummary?.normalExecutionCups || []), [comparisonSummary]);

    const totalUnexpectedValue = useMemo(() =>
        (comparisonSummary?.unexpectedCups || []).reduce((sum, cup) => sum + cup.totalValue, 0),
    [comparisonSummary]);

    const totalNTEjecutado = useMemo(() =>
        (comparisonSummary?.monthlyFinancials || []).reduce((sum, m) => sum + m.totalValorEjecutado, 0),
    [comparisonSummary]);

    const totalEsperado = useMemo(() =>
        (comparisonSummary?.monthlyFinancials || []).reduce((sum, m) => sum + m.totalValorEsperado, 0),
    [comparisonSummary]);

    const valorManual = isNaN(Number(valorConsolidadoManual)) ? 0 : Number(valorConsolidadoManual);
    const valorFinalEjecucion = totalNTEjecutado + valorManual;

    const min90 = totalEsperado * 0.9;
    const max110 = totalEsperado * 1.1;
    const pctFinal = totalEsperado > 0 ? (valorFinalEjecucion / totalEsperado) * 100 : 0;
    const estadoBanda = valorFinalEjecucion < min90 ? 'bajo' : valorFinalEjecucion > max110 ? 'sobre' : 'dentro';

    if (!comparisonSummary) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="uppercase">Análisis de Frecuencias y Desviaciones</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">No hay datos de ejecución cargados para comparar.</p>
                </CardContent>
            </Card>
        )
    }

    const handleCupClick = (cupInfo: DeviatedCupInfo) => {
        const details: any[] = [];
        executionDataByMonth.forEach((monthData) => {
            monthData.rawJsonData.usuarios?.forEach((user: any) => {
                const userId = `${user.tipoDocumentoIdentificacion}-${user.numDocumentoIdentificacion}`;
                const processServices = (services: any[], codeField: string, type: string, valueField: string = 'vrServicio', unitValueField?: string, qtyField?: string) => {
                    if (!services) return;
                    services.forEach((service: any) => {
                        if (service[codeField] === cupInfo.cup) {
                            let serviceValue = 0;
                            if (unitValueField && qtyField) {
                                serviceValue = getNumericValue(service[unitValueField]) * getNumericValue(service[qtyField]);
                            } else {
                                serviceValue = getNumericValue(service[valueField]);
                            }

                            details.push({
                                tipoServicio: type,
                                idUsuario: userId,
                                fechaAtencion: service.fechaInicioAtencion ? new Date(service.fechaInicioAtencion).toLocaleDateString() : 'N/A',
                                diagnosticoPrincipal: service.codDiagnosticoPrincipal,
                                valorServicio: serviceValue,
                            });
                        }
                    });
                };
                processServices(user.servicios?.consultas, 'codConsulta', 'Consulta');
                processServices(user.servicios?.procedimientos, 'codProcedimiento', 'Procedimiento');
                processServices(user.servicios?.medicamentos, 'codTecnologiaSalud', 'Medicamento', undefined, 'vrUnitarioMedicamento', 'cantidadMedicamento');
                processServices(user.servicios?.otrosServicios, 'codTecnologiaSalud', 'Otro Servicio', 'vrServicio', undefined, 'cantidadOS');
            });
        });
        setExecutionDetails(details);
        setSelectedCup(cupInfo);
        setIsCupModalOpen(true);
    };
    
    const handleLookupClick = async (cup: string) => {
        setIsLookupLoading(true);
        setIsLookupModalOpen(true);
        try {
            const result = await describeCup(cup);
            setLookedUpCupInfo(result);
        } catch (error) {
            setLookedUpCupInfo({ cup, description: "Error al buscar la descripción." });
            console.error("Error looking up CUP:", error);
        } finally {
            setIsLookupLoading(false);
        }
    };
    
    const handleDoubleClick = (type: string, title: React.ReactNode, data: any[], totals: {ejecutado: number, desviacion: number}) => {
        setModalContent({ type, title, data, totals });
    }
    
    const renderModalContent = () => {
        if (!modalContent) return null;

        const { type, data } = modalContent;

        const renderTableForDeviated = (items: DeviatedCupInfo[]) => (
             <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>CUPS</TableHead>
                        <TableHead>Actividad</TableHead>
                        <TableHead className="text-center">Frec. Esperada</TableHead>
                        <TableHead className="text-center">Frec. Real</TableHead>
                        <TableHead className="text-center">Usuarios Únicos</TableHead>
                        <TableHead className="text-center">Atenciones Repetidas</TableHead>
                        <TableHead className="text-center text-red-600 flex items-center gap-1 justify-center"><AlertCircle className="h-4 w-4" /> &gt;1 Atención Mismo Día</TableHead>
                        <TableHead className="text-right text-red-600">Costo Repetición Mismo Día</TableHead>
                        <TableHead className="text-center">Desviación</TableHead>
                        <TableHead className="text-right">Valor Desviación</TableHead>
                        <TableHead className="text-right">Valor Ejecutado (NT)</TableHead>
                        <TableHead className="text-right">Valor Sugerido a Revisión</TableHead>
                        <TableHead className="text-right">Valor a Reconocer</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.map((item: DeviatedCupInfo) => {
                        const valorSugerido = item.totalValue - item.deviationValue;
                        return (
                            <TableRow key={item.cup}>
                                <TableCell>
                                    <Button variant="link" className="p-0 h-auto font-mono text-sm" onClick={() => handleCupClick(item)}>
                                        {item.cup}
                                    </Button>
                                </TableCell>
                                <TableCell className="text-sm max-w-xs truncate">{item.activityDescription}</TableCell>
                                <TableCell className="text-center text-sm">{item.expectedFrequency.toFixed(0)}</TableCell>
                                <TableCell className="text-center text-sm">{item.realFrequency}</TableCell>
                                <TableCell className="text-center text-sm font-bold">{item.uniqueUsers}</TableCell>
                                <TableCell className="text-center text-sm">{item.repeatedAttentions}</TableCell>
                                <TableCell className="text-center text-sm font-bold text-red-600">{item.sameDayDetections}</TableCell>
                                <TableCell className="text-right text-sm font-bold text-red-600">{formatCurrency(item.sameDayDetectionsCost)}</TableCell>
                                <TableCell className={`text-center font-bold text-sm ${item.deviation > 0 ? 'text-red-600' : 'text-blue-600'}`}>{item.deviation.toFixed(0)}</TableCell>
                                <TableCell className={`text-right font-bold text-sm text-red-600`}>{formatCurrency(item.deviationValue)}</TableCell>
                                <TableCell className={`text-right font-bold text-sm text-green-700`}>{formatCurrency(item.totalValue)}</TableCell>
                                <TableCell className={`text-right font-bold text-sm text-blue-700`}>{formatCurrency(valorSugerido)}</TableCell>
                                <TableCell className="text-right font-bold text-sm text-purple-600">{formatCurrency(item.valorReconocer)}</TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        );

        switch (type) {
            case 'over-executed':
            case 'under-executed':
            case 'normal-execution':
                return (
                    <ScrollArea className="h-full">
                       {renderTableForDeviated(data as DeviatedCupInfo[])}
                    </ScrollArea>
                )
             case 'missing':
                return (
                    <ScrollArea className="h-full">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-sm">CUPS</TableHead>
                                    <TableHead className="text-sm">Descripción</TableHead>
                                    <TableHead className="text-center text-sm">Frec. Esperada</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((item: any) => (
                                    <TableRow key={item.cup}>
                                        <TableCell className="font-mono text-sm">{item.cup}</TableCell>
                                        <TableCell className="text-sm">{item.description || 'N/A'}</TableCell>
                                        <TableCell className="text-center text-sm">{item.expectedFrequency}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                 )
             case 'unexpected':
                 return (
                    <ScrollArea className="h-full">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-sm">CUPS</TableHead>
                                    <TableHead className="text-sm">Descripción</TableHead>
                                    <TableHead className="text-center text-sm">Frec. Real</TableHead>
                                    <TableHead className="text-right text-sm">Valor Ejecutado</TableHead>
                                    <TableHead className="text-center text-sm">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((item: UnexpectedCupInfo) => (
                                    <TableRow key={item.cup}>
                                        <TableCell className="font-mono text-sm">{item.cup}</TableCell>
                                        <TableCell className="text-sm">{item.description || 'N/A'}</TableCell>
                                        <TableCell className="text-center text-sm">{item.realFrequency}</TableCell>
                                        <TableCell className="text-right font-bold text-sm">{formatCurrency(item.totalValue)}</TableCell>
                                        <TableCell className="text-center">
                                            <Button variant="outline" size="sm" className="text-sm" onClick={() => handleLookupClick(item.cup)}>
                                                <Search className="mr-2 h-3 w-3" /> Buscar
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                 )
            default:
                return null;
        }
    }
    
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="uppercase">Análisis de Frecuencias y Desviaciones</CardTitle>
                    <CardDescription>
                        Comparación entre la frecuencia de servicios esperada (nota técnica) y la real (archivos JSON). Doble clic para expandir la tabla.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <DeviatedCupsCard
                        title="CUPS Sobreejecutados (>111%)"
                        icon={TrendingUp}
                        data={comparisonSummary.overExecutedCups}
                        badgeVariant="destructive"
                        onDownload={handleDownloadXls}
                        onDoubleClick={() => handleDoubleClick('over-executed', "CUPS Sobreejecutados (>111%)", comparisonSummary.overExecutedCups, overExecutionTotals)}
                        totalValue={overExecutionTotals.desviacion}
                        valueLabel="Valor Desviación"
                        color="red"
                    />
                    <DeviatedCupsCard
                        title="Ejecución dentro del rango (90-111%)"
                        icon={Target}
                        data={comparisonSummary.normalExecutionCups}
                        badgeVariant="success"
                        onDownload={handleDownloadXls}
                        onDoubleClick={() => handleDoubleClick('normal-execution', "Ejecución dentro del rango (90-111%)", comparisonSummary.normalExecutionCups, normalExecutionTotals)}
                        totalValue={normalExecutionTotals.ejecutado}
                        valueLabel="Valor Ejecutado"
                        color="green"
                    />
                    <DeviatedCupsCard
                        title="CUPS / Tecnologías no ejecutadas"
                        icon={TrendingDown}
                        data={comparisonSummary.underExecutedCups}
                        badgeVariant="default"
                        onDownload={handleDownloadXls}
                        onDoubleClick={() => handleDoubleClick('under-executed', "CUPS / Tecnologías no ejecutadas", comparisonSummary.underExecutedCups, underExecutionTotals)}
                        totalValue={underExecutionTotals.desviacion}
                        valueLabel="Valor Desviación"
                        color="blue"
                    />
                     <DiscrepancyCard
                        title="CUPS / Tecnologías no ejecutadas"
                        icon={AlertTriangle}
                        data={comparisonSummary.missingCups}
                        onDownload={handleDownloadXls}
                        onDoubleClick={() => handleDoubleClick('missing', 'CUPS / Tecnologías no ejecutadas', comparisonSummary.missingCups, {ejecutado: 0, desviacion: 0})}
                        color="black"
                    />
                     <DiscrepancyCard
                        title="CUPS / Tecnologías Inesperadas"
                        icon={Search}
                        data={comparisonSummary.unexpectedCups}
                        onDownload={handleDownloadXls}
                        onDoubleClick={() => handleDoubleClick('unexpected', 'CUPS / Tecnologías Inesperadas', comparisonSummary.unexpectedCups, {ejecutado: totalUnexpectedValue, desviacion: totalUnexpectedValue})}
                        totalValue={totalUnexpectedValue}
                        valueLabel="Valor Ejecutado"
                        color="purple"
                    />

                    {/* Botón exportar CUPS Inesperadas para NT */}
                    {comparisonSummary.unexpectedCups.length > 0 && (
                        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 flex items-center justify-between gap-3 flex-wrap">
                            <div className="space-y-0.5">
                                <p className="text-sm font-semibold text-purple-800">
                                    Exportar CUPS Inesperadas para actualizar la Nota Técnica
                                </p>
                                <p className="text-xs text-purple-600">
                                    Genera un archivo con los encabezados de revisión + sección lista para pegar en el Google Sheet de NT
                                    {selectedPrestador?.WEB && (
                                        <> — Sheet: <a href={selectedPrestador.WEB} target="_blank" rel="noreferrer" className="underline font-medium">ver hoja NT</a></>
                                    )}
                                </p>
                            </div>
                            <Button
                                size="sm"
                                className="bg-purple-700 hover:bg-purple-800 text-white shrink-0"
                                onClick={() => handleDownloadInesperadasXls(
                                    comparisonSummary.unexpectedCups,
                                    executionDataByMonth.size,
                                    selectedPrestador?.WEB || ''
                                )}
                            >
                                <Download className="mr-2 h-4 w-4" />
                                Descargar para NT (.xls)
                            </Button>
                        </div>
                    )}

                    {/* ── Tarjeta: Valor total ejecutado consolidado ── */}
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-4">
                        <div className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-primary" />
                            <span className="font-semibold text-sm text-primary">
                                Valor total ejecutado discriminado en: CUPS / Tecnologías Inesperadas
                            </span>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            {/* Col 1: NT ejecutado */}
                            <div className="rounded-md bg-background border p-3 space-y-1">
                                <p className="text-xs text-muted-foreground">Ejecución Nota Técnica</p>
                                <p className="text-lg font-bold text-foreground">{formatCurrency(totalNTEjecutado)}</p>
                                <p className="text-xs text-muted-foreground">Valor calculado desde los meses cargados</p>
                            </div>

                            {/* Col 2: Valor manual */}
                            <div className="rounded-md bg-background border p-3 space-y-2">
                                <Label className="text-xs text-muted-foreground">
                                    + Valor CUPS / Tecnologías Inesperadas (manual)
                                </Label>
                                <Input
                                    type="number"
                                    placeholder="Ej: 45000000"
                                    value={valorConsolidadoManual}
                                    onChange={e => setValorConsolidadoManual(e.target.value)}
                                    className="font-mono"
                                />
                                {valorManual > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        {comparisonSummary.unexpectedCups.length} tecnologías inesperadas detectadas
                                        (auto: {formatCurrency(totalUnexpectedValue)})
                                    </p>
                                )}
                            </div>

                            {/* Col 3: Valor final */}
                            <div className={`rounded-md border-2 p-3 space-y-1 ${valorManual > 0 ? 'border-primary bg-primary/10' : 'border-dashed border-muted-foreground/30 bg-background'}`}>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">= Valor Final de Ejecución</p>
                                <p className={`text-xl font-bold ${valorManual > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                                    {valorManual > 0 ? formatCurrency(valorFinalEjecucion) : '—'}
                                </p>
                                {valorManual > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        NT {formatCurrency(totalNTEjecutado)} + Inesperadas {formatCurrency(valorManual)}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* ── Indicador de banda 90%-110% ── */}
                        {valorFinalEjecucion > 0 && totalEsperado > 0 && (
                            <div className={`rounded-md border p-3 space-y-2 ${
                                estadoBanda === 'sobre' ? 'border-red-400 bg-red-50' :
                                estadoBanda === 'bajo'  ? 'border-yellow-400 bg-yellow-50' :
                                                          'border-green-400 bg-green-50'
                            }`}>
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-lg font-extrabold ${
                                            estadoBanda === 'sobre' ? 'text-red-600' :
                                            estadoBanda === 'bajo'  ? 'text-yellow-600' :
                                                                       'text-green-700'
                                        }`}>
                                            {estadoBanda === 'sobre' ? '⚠ SOBREEJECUCIÓN' :
                                             estadoBanda === 'bajo'  ? '⚠ SUBEJECUCIÓN' :
                                                                       '✓ DENTRO DE BANDA'}
                                        </span>
                                        <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${
                                            estadoBanda === 'sobre' ? 'bg-red-100 text-red-700' :
                                            estadoBanda === 'bajo'  ? 'bg-yellow-100 text-yellow-700' :
                                                                       'bg-green-100 text-green-700'
                                        }`}>
                                            {pctFinal.toFixed(1)}% del contrato
                                        </span>
                                    </div>
                                    <div className="text-xs text-muted-foreground text-right space-y-0.5">
                                        <p>Esperado: <span className="font-semibold">{formatCurrency(totalEsperado)}</span></p>
                                        <p>Mínimo 90%: <span className="font-semibold">{formatCurrency(min90)}</span></p>
                                        <p>Máximo 110%: <span className="font-semibold">{formatCurrency(max110)}</span></p>
                                    </div>
                                </div>
                                {/* Barra de progreso */}
                                <div className="relative h-4 rounded-full bg-gray-200 overflow-hidden">
                                    {/* Zona 90-110% */}
                                    <div
                                        className="absolute h-full bg-green-200/70"
                                        style={{ left: '81.8%', width: '18.2%' }}
                                    />
                                    {/* Marcadores 90% y 110% */}
                                    <div className="absolute h-full w-0.5 bg-green-600" style={{ left: '81.8%' }} />
                                    <div className="absolute h-full w-0.5 bg-green-600" style={{ left: '100%' }} />
                                    {/* Barra de ejecución */}
                                    <div
                                        className={`absolute h-full rounded-full transition-all ${
                                            estadoBanda === 'sobre' ? 'bg-red-500' :
                                            estadoBanda === 'bajo'  ? 'bg-yellow-500' : 'bg-green-500'
                                        }`}
                                        style={{ width: `${Math.min(pctFinal, 130)}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>0%</span>
                                    <span className="text-green-700 font-semibold">90%</span>
                                    <span className="text-green-700 font-semibold">110%</span>
                                </div>
                                {estadoBanda === 'sobre' && (
                                    <p className="text-xs text-red-700 font-medium">
                                        Exceso sobre el 110%: <span className="font-bold">{formatCurrency(valorFinalEjecucion - max110)}</span>
                                        {' '}({(pctFinal - 110).toFixed(1)}% por encima del máximo permitido)
                                    </p>
                                )}
                                {estadoBanda === 'bajo' && (
                                    <p className="text-xs text-yellow-700 font-medium">
                                        Déficit respecto al 90%: <span className="font-bold">{formatCurrency(min90 - valorFinalEjecucion)}</span>
                                        {' '}({(90 - pctFinal).toFixed(1)}% por debajo del mínimo requerido)
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <CupDetailsModal
                cup={selectedCup}
                open={isCupModalOpen}
                onOpenChange={setIsCupModalOpen}
                executionDetails={executionDetails}
            />
            
             <LookedUpCupModal
                cupInfo={lookedUpCupInfo}
                open={isLookupModalOpen}
                onOpenChange={setIsLookupModalOpen}
                isLoading={isLookupLoading}
            />

            {modalContent && (
                <TableModal
                    open={!!modalContent}
                    onOpenChange={() => setModalContent(null)}
                    title={modalContent.title}
                    content={renderModalContent()}
                    data={modalContent.data}
                    downloadFilename={`${String(modalContent.type).toLowerCase().replace(/ /g, '_')}.xls`}
                    totals={modalContent.totals}
                />
            )}
        </div>
    );
}

