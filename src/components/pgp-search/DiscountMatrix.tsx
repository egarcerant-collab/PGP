
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Papa from 'papaparse';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileDown, DollarSign, Filter, Stethoscope, Microscope, Pill, Syringe, WalletCards, TrendingDown, CheckCircle, MessageSquarePlus, Download, Eraser, Wallet, Save, Loader2, Play } from "lucide-react";
import { Button } from '@/components/ui/button';
import { formatCurrency } from './PgPsearchForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ExecutionDataByMonth } from '@/app/page';
import { CupDetailsModal } from '../report/InformeDesviaciones';
import type { DeviatedCupInfo, Prestador } from './PgPsearchForm';
import { Textarea } from '../ui/textarea';
import { getNumericValue, type SavedAuditData, serializeExecutionData } from '../app/JsonAnalyzerPage';
import { useToast } from '@/hooks/use-toast';

export type ServiceType = "Consulta" | "Procedimiento" | "Medicamento" | "Otro Servicio" | "Desconocido";

export interface DiscountMatrixRow {
    CUPS: string;
    Descripcion?: string;
    Cantidad_Ejecutada: number;
    Valor_Unitario: number;
    Valor_Ejecutado: number;
    Valor_a_Reconocer: number;
    Valor_a_Descontar: number;
    Clasificacion: string;
    Tipo_Servicio: ServiceType;
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
    activityDescription?: string;
    unitValueFromNote?: number;
}

export interface AdjustedData {
  adjustedQuantities: Record<string, number>;
  adjustedValues: Record<string, number>;
  comments: Record<string, string>;
  selectedRows: Record<string, boolean>;
}

interface DiscountMatrixProps {
  data: DiscountMatrixRow[];
  executionDataByMonth: ExecutionDataByMonth;
  pgpData: any[]; 
  onAdjustmentsChange: (adjustments: AdjustedData) => void;
  storageKey: string; 
  onGenerateReport: () => void;
  isGeneratingReport: boolean;
  selectedPrestador: Prestador | null;
  initialAuditData: SavedAuditData | null;
  uniqueUserCount: number;
  jsonPrestadorCode: string | null;
}

const GLOBAL_STORAGE_KEY = 'dusakawi_audits_v1';

const DiscountMatrix: React.FC<DiscountMatrixProps> = ({ 
    data, 
    executionDataByMonth, 
    onAdjustmentsChange, 
    storageKey, 
    onGenerateReport, 
    isGeneratingReport,
    selectedPrestador,
    initialAuditData,
    uniqueUserCount,
    jsonPrestadorCode
}) => {
    const [selectedCupForDetail, setSelectedCupForDetail] = useState<DeviatedCupInfo | null>(null);
    const [isCupModalOpen, setIsCupModalOpen] = useState(false);
    const [executionDetails, setExecutionDetails] = useState<any[]>([]);
    const [adjustedQuantities, setAdjustedQuantities] = useState<Record<string, number>>({});
    const [comments, setComments] = useState<Record<string, string>>({});
    const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
    const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
    const [currentCupForComment, setCurrentCupForComment] = useState<string | null>(null);
    const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceType | 'all'>('all');
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const initialQuantities: Record<string, number> = {};
        data.forEach(row => { initialQuantities[row.CUPS] = row.Cantidad_Ejecutada; });

        if (initialAuditData) {
            setAdjustedQuantities(initialAuditData.adjustedQuantities || initialQuantities);
            setComments(initialAuditData.comments || {});
            setSelectedRows(initialAuditData.selectedRows || {});
        } else if (storageKey) {
            const savedState = localStorage.getItem(storageKey);
            if (savedState) {
                try {
                    const parsed = JSON.parse(savedState);
                    if(parsed.adjustedQuantities) setAdjustedQuantities(parsed.adjustedQuantities);
                    if(parsed.comments) setComments(parsed.comments);
                    if(parsed.selectedRows) setSelectedRows(parsed.selectedRows);
                } catch (e) {}
            } else {
                setAdjustedQuantities(initialQuantities);
                setComments({});
                setSelectedRows({});
            }
        }
    }, [data, storageKey, initialAuditData]);
    
    useEffect(() => {
        const adjustedValues: Record<string, number> = {};
        data.forEach(row => {
            const validatedQuantity = adjustedQuantities[row.CUPS] ?? row.Cantidad_Ejecutada;
            const recalculatedValorReconocer = validatedQuantity * row.Valor_Unitario;
            const discountValue = row.Valor_Ejecutado - recalculatedValorReconocer;
            adjustedValues[row.CUPS] = discountValue > 0 ? discountValue : 0;
        });
      onAdjustmentsChange({ adjustedQuantities, adjustedValues, comments, selectedRows });
    }, [adjustedQuantities, comments, selectedRows, data, onAdjustmentsChange]);
    
    const handleSaveState = async () => {
        if (!selectedPrestador || executionDataByMonth.size === 0) {
            toast({ title: "No se puede guardar", description: "Se necesita un prestador y datos cargados.", variant: "destructive" });
            return;
        }
        setIsSaving(true);
        
        const monthKey = executionDataByMonth.keys().next().value;
        const date = new Date(2024, parseInt(monthKey) - 1, 1);
        const monthName = date.toLocaleString('es-CO', { month: 'long' }).charAt(0).toUpperCase() + date.toLocaleString('es-CO', { month: 'long' }).slice(1);

        // Guardamos TODO el paquete de la auditoría para persistencia total
        const auditPackage: SavedAuditData = {
            adjustedQuantities,
            comments,
            selectedRows,
            executionData: serializeExecutionData(executionDataByMonth),
            jsonPrestadorCode,
            uniqueUserCount
        };
        
        try {
            const existingAuditsJson = localStorage.getItem(GLOBAL_STORAGE_KEY);
            const audits = existingAuditsJson ? JSON.parse(existingAuditsJson) : {};
            const auditId = `${selectedPrestador.PRESTADOR}_${monthName}`.replace(/\s+/g, '_').toLowerCase();
            
            audits[auditId] = {
                id: auditId,
                auditData: auditPackage,
                prestadorName: selectedPrestador.PRESTADOR,
                month: monthName,
                timestamp: new Date().toISOString()
            };
            
            localStorage.setItem(GLOBAL_STORAGE_KEY, JSON.stringify(audits));
            if (storageKey) localStorage.setItem(storageKey, JSON.stringify(auditPackage));

            toast({ title: "Auditoría Guardada", description: `Los datos de ${selectedPrestador.PRESTADOR} están seguros.` });
        } catch (error) {
            toast({ title: "Error al Guardar", description: "No se pudo guardar localmente.", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleClearAdjustments = () => {
        if (storageKey) localStorage.removeItem(storageKey);
        const initialQuantities: Record<string, number> = {};
        data.forEach(row => { initialQuantities[row.CUPS] = row.Cantidad_Ejecutada; });
        setAdjustedQuantities(initialQuantities);
        setComments({});
        setSelectedRows({});
    };

    const filteredData = useMemo(() => {
        if (serviceTypeFilter === 'all') return data;
        return data.filter(row => row.Tipo_Servicio === serviceTypeFilter);
    }, [data, serviceTypeFilter]);
    
    const handleCupClick = (cupInfo: DiscountMatrixRow) => {
        const details: any[] = [];
        executionDataByMonth.forEach((monthData) => {
            monthData.rawJsonData.usuarios?.forEach((user: any) => {
                const userId = `${user.tipoDocumentoIdentificacion}-${user.numDocumentoIdentificacion}`;
                const processServices = (services: any[], codeField: string, type: string, valueField: string = 'vrServicio', unitValueField?: string, qtyField?: string) => {
                    if (!services) return;
                    services.forEach((service: any) => {
                        if (service[codeField] === cupInfo.CUPS) {
                            let serviceValue = (unitValueField && qtyField) ? getNumericValue(service[unitValueField]) * getNumericValue(service[qtyField]) : getNumericValue(service[valueField]);
                            details.push({ tipoServicio: type, idUsuario: userId, fechaAtencion: service.fechaInicioAtencion ? new Date(service.fechaInicioAtencion).toLocaleDateString() : 'N/A', diagnosticoPrincipal: service.codDiagnosticoPrincipal, valorServicio: serviceValue });
                        }
                    });
                };
                processServices(user.servicios?.consultas, 'codConsulta', 'Consulta');
                processServices(user.servicios?.procedimientos, 'codProcedimiento', 'Procedimiento');
                processServices(user.servicios?.medicamentos, 'codTecnologiaSalud', 'Medicamento', undefined, 'vrUnitarioMedicamento', 'cantidadMedicamento');
                processServices(user.servicios?.otrosServicios, 'codTecnologiaSalud', 'Otro Servicio', 'vrServicio', 'vrUnitarioOS', 'cantidadOS');
            });
        });
        setExecutionDetails(details);
        setSelectedCupForDetail(cupInfo as DeviatedCupInfo);
        setIsCupModalOpen(true);
    };

    const handleSelectAll = (checked: boolean) => {
        const newSelections: Record<string, boolean> = {};
        filteredData.forEach(row => { newSelections[row.CUPS] = checked; });
        setSelectedRows(prev => ({...prev, ...newSelections}));
    };

    const handleSelectRow = (cup: string, checked: boolean) => setSelectedRows(prev => ({ ...prev, [cup]: checked }));
    
    const handleQuantityChange = (cup: string, value: string) => {
        const numericValue = parseInt(value.replace(/[^0-9]+/g,""), 10) || 0;
        const rowData = data.find(r => r.CUPS === cup);
        setAdjustedQuantities(prev => ({ ...prev, [cup]: rowData && numericValue > rowData.Cantidad_Ejecutada ? rowData.Cantidad_Ejecutada : numericValue }));
    };
    
    const handleSaveComment = (comment: string) => { if (currentCupForComment) setComments(prev => ({ ...prev, [currentCupForComment]: comment })); };
    
    const totalEjecutadoBruto = useMemo(() => filteredData.reduce((sum, row) => sum + row.Valor_Ejecutado, 0), [filteredData]);
    const descuentoAplicado = useMemo(() => data.reduce((sum, row) => {
        if (selectedRows[row.CUPS]) {
             const validatedQuantity = adjustedQuantities[row.CUPS] ?? row.Cantidad_Ejecutada;
             const discountValue = row.Valor_Ejecutado - (validatedQuantity * row.Valor_Unitario);
             return sum + (discountValue > 0 ? discountValue : 0);
        }
        return sum;
    }, 0), [data, selectedRows, adjustedQuantities]);
    
    const valorNetoFinal = useMemo(() => data.reduce((sum, row) => sum + row.Valor_Ejecutado, 0) - descuentoAplicado, [data, descuentoAplicado]);
    const allSelected = useMemo(() => filteredData.length > 0 && filteredData.every(row => selectedRows[row.CUPS]), [filteredData, selectedRows]);
    
    if (!data || data.length === 0) return null;

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center"><DollarSign className="h-6 w-6 mr-3 text-red-500" />Matriz de Descuentos</CardTitle>
                            <CardDescription>Ajusta las cantidades validadas para calcular los descuentos por auditoría.</CardDescription>
                        </div>
                         <div className="flex items-center gap-2">
                            <Button onClick={handleSaveState} variant="default" size="sm" className="h-8" disabled={isSaving}>
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Guardar Auditoría
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild><Button variant="destructive" size="sm" className="h-8"><Eraser className="mr-2 h-4 w-4" />Limpiar</Button></AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader><AlertDialogTitle>¿Estás seguro?</AlertDialogTitle><AlertDialogDescription>Se borrarán todos los ajustes realizados.</AlertDialogDescription></AlertDialogHeader>
                                    <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleClearAdjustments}>Sí, Limpiar</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-right w-full mt-4">
                        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200"><p className="text-xs text-muted-foreground flex items-center justify-end gap-1"><WalletCards className="h-4 w-4"/> Valor Ejecutado Total</p><p className="text-lg font-bold text-blue-600">{formatCurrency(totalEjecutadoBruto)}</p></div>
                        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200"><p className="text-xs text-muted-foreground flex items-center justify-end gap-1"><TrendingDown className="h-4 w-4"/> Descuento Aplicado</p><p className="text-lg font-bold text-red-500">{formatCurrency(descuentoAplicado)}</p></div>
                        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200"><p className="text-xs text-muted-foreground flex items-center justify-end gap-1"><CheckCircle className="h-4 w-4"/> Valor Neto Final</p><p className="text-lg font-bold text-green-600">{formatCurrency(valorNetoFinal)}</p></div>
                    </div>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-72">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-12 px-2"><Checkbox checked={allSelected} onCheckedChange={(checked) => handleSelectAll(Boolean(checked))} /></TableHead>
                                    <TableHead className="w-28">CUPS</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Descripción</TableHead>
                                    <TableHead className="text-center">Cant. Esperada</TableHead>
                                    <TableHead className="text-center">Cant. Ejecutada</TableHead>
                                    <TableHead className="text-center w-32">Cant. Validada</TableHead>
                                    <TableHead className="text-right">Valor Ejecutado</TableHead>
                                    <TableHead className="text-right">A Reconocer</TableHead>
                                    <TableHead className="text-right text-red-500 font-bold">Descuento</TableHead>
                                    <TableHead className="w-24 text-center">Glosa</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredData.map((row, index) => {
                                    const validatedQty = adjustedQuantities[row.CUPS] ?? row.Cantidad_Ejecutada;
                                    const recalculatedValue = validatedQty * row.Valor_Unitario;
                                    const discount = Math.max(0, row.Valor_Ejecutado - recalculatedValue);
                                    const comment = comments[row.CUPS] || '';
                                    return (
                                        <TableRow key={index}>
                                            <TableCell className="px-2"><Checkbox checked={selectedRows[row.CUPS] || false} onCheckedChange={(checked) => handleSelectRow(row.CUPS, Boolean(checked))} /></TableCell>
                                            <TableCell><Button variant="link" className="p-0 h-auto font-mono text-sm" onClick={() => handleCupClick(row)}>{row.CUPS}</Button></TableCell>
                                            <TableCell className="text-xs">{row.Tipo_Servicio}</TableCell>
                                            <TableCell className="text-xs max-w-[150px] truncate" title={row.Descripcion}>{row.Descripcion}</TableCell>
                                            <TableCell className="text-center">{row.expectedFrequency.toFixed(0)}</TableCell>
                                            <TableCell className="text-center">{row.Cantidad_Ejecutada}</TableCell>
                                             <TableCell className="text-center"><Input type="text" value={new Intl.NumberFormat('es-CO').format(validatedQty)} onChange={(e) => handleQuantityChange(row.CUPS, e.target.value)} className="h-8 text-center" /></TableCell>
                                            <TableCell className="text-right">{formatCurrency(row.Valor_Ejecutado)}</TableCell>
                                            <TableCell className="text-right text-green-600">{formatCurrency(recalculatedValue)}</TableCell>
                                            <TableCell className="text-right font-bold text-red-600">{formatCurrency(discount)}</TableCell>
                                            <TableCell className="text-center"><Button variant="ghost" size="icon" onClick={() => { setCurrentCupForComment(row.CUPS); setIsCommentModalOpen(true); }}><MessageSquarePlus className={cn("h-5 w-5", comment ? "text-blue-500" : "text-muted-foreground")} /></Button></TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
            <CupDetailsModal cup={selectedCupForDetail} open={isCupModalOpen} onOpenChange={setIsCupModalOpen} executionDetails={executionDetails} />
            <CommentModal open={isCommentModalOpen} onOpenChange={setIsCommentModalOpen} initialComment={currentCupForComment ? comments[currentCupForComment] || '' : ''} onSave={handleSaveComment} />
        </>
    );
};

const CommentModal = ({ open, onOpenChange, onSave, initialComment }: { open: boolean; onOpenChange: (open: boolean) => void; onSave: (comment: string) => void; initialComment: string; }) => {
  const [comment, setComment] = useState(initialComment);
  useEffect(() => { if (open) setComment(initialComment); }, [open, initialComment]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent><DialogHeader><DialogTitle>Comentario de Glosa</DialogTitle></DialogHeader><Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Justificación..." className="min-h-[120px]" /><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={() => { onSave(comment); onOpenChange(false); }}>Guardar</Button></DialogFooter></DialogContent>
    </Dialog>
  );
};

export default DiscountMatrix;
