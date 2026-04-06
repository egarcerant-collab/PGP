
"use client";

import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, TrendingDown, AlertTriangle, Search, Target, Download, Loader2, X, Users, Repeat, AlertCircle, DollarSign } from "lucide-react";
import { Button } from '@/components/ui/button';
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
}


export default function InformeDesviaciones({ comparisonSummary, pgpData, executionDataByMonth }: InformeDesviacionesProps) {
    const [selectedCup, setSelectedCup] = useState<DeviatedCupInfo | null>(null);
    const [isCupModalOpen, setIsCupModalOpen] = useState(false);
    const [lookedUpCupInfo, setLookedUpCupInfo] = useState<CupDescription | null>(null);
    const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);
    const [isLookupLoading, setIsLookupLoading] = useState(false);
    const [modalContent, setModalContent] = useState<{ title: React.ReactNode, data: any[], type: string, totals: {ejecutado: number, desviacion: number} } | null>(null);
    const [executionDetails, setExecutionDetails] = useState<any[]>([]);

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
                        title="CUPS Subejecutados (<90%)"
                        icon={TrendingDown}
                        data={comparisonSummary.underExecutedCups}
                        badgeVariant="default"
                        onDownload={handleDownloadXls}
                        onDoubleClick={() => handleDoubleClick('under-executed', "CUPS Subejecutados (<90%)", comparisonSummary.underExecutedCups, underExecutionTotals)}
                        totalValue={underExecutionTotals.desviacion}
                        valueLabel="Valor Desviación"
                        color="blue"
                    />
                     <DiscrepancyCard
                        title="CUPS Faltantes"
                        icon={AlertTriangle}
                        data={comparisonSummary.missingCups}
                        onDownload={handleDownloadXls}
                        onDoubleClick={() => handleDoubleClick('missing', 'CUPS Faltantes', comparisonSummary.missingCups, {ejecutado: 0, desviacion: 0})}
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

