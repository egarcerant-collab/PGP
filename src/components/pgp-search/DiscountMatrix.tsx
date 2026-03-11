
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DollarSign, WalletCards, TrendingDown, CheckCircle, MessageSquarePlus, Eraser, Save, Loader2 } from "lucide-react";
import { Button } from '@/components/ui/button';
import { formatCurrency } from './PgPsearchForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ExecutionDataByMonth } from '@/app/page';
import { CupDetailsModal } from '../report/InformeDesviaciones';
import type { DeviatedCupInfo, Prestador } from './PgPsearchForm';
import { Textarea } from '../ui/textarea';
import { serializeExecutionData, type SavedAuditData } from '../app/JsonAnalyzerPage';
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
  selectedPrestador: Prestador | null;
  initialAuditData: SavedAuditData | null;
  uniqueUserCount: number;
  jsonPrestadorCode: string | null;
}

const DiscountMatrix: React.FC<DiscountMatrixProps> = ({ 
    data, 
    executionDataByMonth, 
    pgpData,
    onAdjustmentsChange, 
    selectedPrestador,
    initialAuditData,
    uniqueUserCount,
    jsonPrestadorCode
}) => {
    const [adjustedQuantities, setAdjustedQuantities] = useState<Record<string, number>>({});
    const [comments, setComments] = useState<Record<string, string>>({});
    const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
    const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
    const [currentCupForComment, setCurrentCupForComment] = useState<string | null>(null);
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (initialAuditData) {
            setAdjustedQuantities(initialAuditData.adjustedQuantities || {});
            setComments(initialAuditData.comments || {});
            setSelectedRows(initialAuditData.selectedRows || {});
        } else {
            const initialQuantities: Record<string, number> = {};
            data.forEach(row => { initialQuantities[row.CUPS] = row.Cantidad_Ejecutada; });
            setAdjustedQuantities(initialQuantities);
        }
    }, [data, initialAuditData]);
    
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
            toast({ title: "No se puede guardar", description: "Faltan datos de ejecución.", variant: "destructive" });
            return;
        }
        setIsSaving(true);
        
        const monthKey = executionDataByMonth.keys().next().value;
        const date = new Date(2024, parseInt(monthKey) - 1, 1);
        const monthName = date.toLocaleString('es-CO', { month: 'long' });

        const auditPackage: SavedAuditData = {
            adjustedQuantities,
            comments,
            selectedRows,
            executionData: serializeExecutionData(executionDataByMonth),
            jsonPrestadorCode,
            uniqueUserCount,
            pgpData: pgpData,
            selectedPrestador: selectedPrestador
        };
        
        try {
            const response = await fetch('/api/save-audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    auditData: auditPackage,
                    prestadorName: selectedPrestador.PRESTADOR,
                    month: monthName
                })
            });

            const result = await response.json();

            if (response.ok) {
                toast({ title: "Guardado en Carpeta", description: `Archivo: ${result.path}` });
            } else {
                throw new Error(result.message || result.error);
            }
        } catch (error: any) {
            toast({ title: "Error al Guardar", description: error.message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleClearAdjustments = () => {
        const initialQuantities: Record<string, number> = {};
        data.forEach(row => { initialQuantities[row.CUPS] = row.Cantidad_Ejecutada; });
        setAdjustedQuantities(initialQuantities);
        setComments({});
        setSelectedRows({});
    };

    const totalEjecutadoBruto = useMemo(() => data.reduce((sum, row) => sum + row.Valor_Ejecutado, 0), [data]);
    const descuentoAplicado = useMemo(() => data.reduce((sum, row) => {
        if (selectedRows[row.CUPS]) {
             const validatedQuantity = adjustedQuantities[row.CUPS] ?? row.Cantidad_Ejecutada;
             const discountValue = row.Valor_Ejecutado - (validatedQuantity * row.Valor_Unitario);
             return sum + (discountValue > 0 ? discountValue : 0);
        }
        return sum;
    }, 0), [data, selectedRows, adjustedQuantities]);
    
    const valorNetoFinal = totalEjecutadoBruto - descuentoAplicado;
    const allSelected = data.length > 0 && data.every(row => selectedRows[row.CUPS]);
    
    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center text-primary"><DollarSign className="h-6 w-6 mr-3" />Matriz de Glosas (Auditoría)</CardTitle>
                        <CardDescription>Ajusta las cantidades y guarda el archivo JSON en la carpeta del servidor.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button onClick={handleSaveState} variant="default" size="sm" className="bg-green-600 hover:bg-green-700" disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Guardar en Carpetas
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild><Button variant="outline" size="sm"><Eraser className="mr-2 h-4 w-4" />Reiniciar</Button></AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>¿Reiniciar ajustes?</AlertDialogTitle><AlertDialogDescription>Se perderán las glosas marcadas actualmente.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleClearAdjustments}>Confirmar</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-right w-full mt-4">
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200"><p className="text-xs text-muted-foreground flex items-center justify-end gap-1"><WalletCards className="h-4 w-4"/> Valor Bruto</p><p className="text-lg font-bold text-blue-600">{formatCurrency(totalEjecutadoBruto)}</p></div>
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200"><p className="text-xs text-muted-foreground flex items-center justify-end gap-1"><TrendingDown className="h-4 w-4"/> Glosa Aplicada</p><p className="text-lg font-bold text-red-500">{formatCurrency(descuentoAplicado)}</p></div>
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200"><p className="text-xs text-muted-foreground flex items-center justify-end gap-1"><CheckCircle className="h-4 w-4"/> Valor Neto</p><p className="text-lg font-bold text-green-600">{formatCurrency(valorNetoFinal)}</p></div>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[400px]">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12 px-2"><Checkbox checked={allSelected} onCheckedChange={(checked) => data.forEach(r => setSelectedRows(prev => ({...prev, [r.CUPS]: !!checked})))} /></TableHead>
                                <TableHead>CUPS</TableHead>
                                <TableHead>Descripción</TableHead>
                                <TableHead className="text-center">Cant. Real</TableHead>
                                <TableHead className="text-center w-32">Cant. Validada</TableHead>
                                <TableHead className="text-right">Valor Bruto</TableHead>
                                <TableHead className="text-right font-bold text-red-500">Glosa</TableHead>
                                <TableHead className="w-12 text-center">Obs.</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.map((row, index) => {
                                const validatedQty = adjustedQuantities[row.CUPS] ?? row.Cantidad_Ejecutada;
                                const discount = Math.max(0, row.Valor_Ejecutado - (validatedQty * row.Valor_Unitario));
                                return (
                                    <TableRow key={index} className={selectedRows[row.CUPS] ? "bg-red-50/50" : ""}>
                                        <TableCell className="px-2"><Checkbox checked={selectedRows[row.CUPS] || false} onCheckedChange={(checked) => setSelectedRows(prev => ({ ...prev, [row.CUPS]: !!checked }))} /></TableCell>
                                        <TableCell className="font-mono text-xs">{row.CUPS}</TableCell>
                                        <TableCell className="text-xs max-w-[200px] truncate" title={row.Descripcion}>{row.Descripcion}</TableCell>
                                        <TableCell className="text-center">{row.Cantidad_Ejecutada}</TableCell>
                                        <TableCell className="text-center"><Input type="text" value={new Intl.NumberFormat('es-CO').format(validatedQty)} onChange={(e) => setAdjustedQuantities(prev => ({ ...prev, [row.CUPS]: parseInt(e.target.value.replace(/\D/g,'')) || 0 }))} className="h-8 text-center" /></TableCell>
                                        <TableCell className="text-right text-xs">{formatCurrency(row.Valor_Ejecutado)}</TableCell>
                                        <TableCell className="text-right font-bold text-red-600 text-xs">{formatCurrency(discount)}</TableCell>
                                        <TableCell className="text-center"><Button variant="ghost" size="icon" onClick={() => { setCurrentCupForComment(row.CUPS); setIsCommentModalOpen(true); }}><MessageSquarePlus className={cn("h-4 w-4", comments[row.CUPS] ? "text-blue-500" : "text-muted-foreground")} /></Button></TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>
            <CommentModal open={isCommentModalOpen} onOpenChange={setIsCommentModalOpen} initialComment={currentCupForComment ? comments[currentCupForComment] || '' : ''} onSave={(c) => currentCupForComment && setComments(prev => ({...prev, [currentCupForComment]: c}))} />
        </Card>
    );
};

const CommentModal = ({ open, onOpenChange, onSave, initialComment }: { open: boolean; onOpenChange: (open: boolean) => void; onSave: (comment: string) => void; initialComment: string; }) => {
  const [comment, setComment] = useState(initialComment);
  useEffect(() => { if (open) setComment(initialComment); }, [open, initialComment]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent><DialogHeader><DialogTitle>Observación de Glosa</DialogTitle></DialogHeader><Textarea value={comment} onChange={(e) => setComment(e.target.value)} className="min-h-[120px]" /><DialogFooter><Button onClick={() => { onSave(comment); onOpenChange(false); }}>Guardar</Button></DialogFooter></DialogContent>
    </Dialog>
  );
};

export default DiscountMatrix;
