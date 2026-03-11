
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  DollarSign, 
  WalletCards, 
  TrendingDown, 
  CheckCircle, 
  MessageSquarePlus, 
  Eraser, 
  Save, 
  Loader2, 
  Download, 
  FileText, 
  Filter, 
  Stethoscope, 
  Microscope, 
  Pill, 
  Syringe 
} from "lucide-react";
import { Button } from '@/components/ui/button';
import { formatCurrency } from './PgPsearchForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ExecutionDataByMonth } from '@/app/page';
import { Textarea } from '../ui/textarea';
import { serializeExecutionData, type SavedAuditData } from '../app/JsonAnalyzerPage';
import { useToast } from '@/hooks/use-toast';
import Papa from 'papaparse';

export type ServiceType = "Consulta" | "Procedimiento" | "Medicamento" | "Otro Servicio" | "Todos";

export interface DiscountMatrixRow {
    CUPS: string;
    Descripcion?: string;
    Cantidad_Ejecutada: number;
    Valor_Unitario: number;
    Valor_Ejecutado: number;
    Valor_a_Reconocer: number;
    Valor_a_Descontar: number;
    Clasificacion: string;
    Tipo_Servicio: "Consulta" | "Procedimiento" | "Medicamento" | "Otro Servicio" | "Desconocido";
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
  selectedPrestador: any;
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
    const [activeFilter, setActiveFilter] = useState<ServiceType>("Todos");
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
    
    const filteredData = useMemo(() => {
        if (activeFilter === "Todos") return data;
        return data.filter(row => row.Tipo_Servicio === activeFilter);
    }, [data, activeFilter]);

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
                toast({ title: "Guardado Exitoso", description: `Archivo: ${result.path}` });
            } else {
                throw new Error(result.message || result.error);
            }
        } catch (error: any) {
            toast({ title: "Error al Guardar", description: error.message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDownloadMatriz = () => {
        const csvRows = filteredData.map(row => ({
            CUPS: row.CUPS,
            Descripcion: row.Descripcion,
            Tipo: row.Tipo_Servicio,
            Cant_Real: row.Cantidad_Ejecutada,
            Cant_Validada: adjustedQuantities[row.CUPS] ?? row.Cantidad_Ejecutada,
            Valor_Bruto: row.Valor_Ejecutado,
            Glosa: Math.max(0, row.Valor_Ejecutado - ((adjustedQuantities[row.CUPS] ?? row.Cantidad_Ejecutada) * row.Valor_Unitario)),
            Observacion: comments[row.CUPS] || ""
        }));
        const csv = Papa.unparse(csvRows, { delimiter: ";" });
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.setAttribute("href", URL.createObjectURL(blob));
        link.setAttribute("download", `matriz_descuentos_${activeFilter}.xls`);
        link.click();
    };

    const totals = useMemo(() => {
        const ejecutado = filteredData.reduce((sum, row) => sum + row.Valor_Ejecutado, 0);
        const glosa = filteredData.reduce((sum, row) => {
            const validatedQuantity = adjustedQuantities[row.CUPS] ?? row.Cantidad_Ejecutada;
            const discountValue = row.Valor_Ejecutado - (validatedQuantity * row.Valor_Unitario);
            return sum + (discountValue > 0 ? discountValue : 0);
        }, 0);
        return { ejecutado, glosa, neto: ejecutado - glosa };
    }, [filteredData, adjustedQuantities]);

    const handleClearAdjustments = () => {
        const initialQuantities: Record<string, number> = {};
        data.forEach(row => { initialQuantities[row.CUPS] = row.Cantidad_Ejecutada; });
        setAdjustedQuantities(initialQuantities);
        setComments({});
        setSelectedRows({});
    };

    const filterOptions: { label: string; value: ServiceType; icon: any }[] = [
        { label: "Todos", value: "Todos", icon: Filter },
        { label: "Consultas", value: "Consulta", icon: Stethoscope },
        { label: "Procedimientos", value: "Procedimiento", icon: Microscope },
        { label: "Medicamentos", value: "Medicamento", icon: Pill },
        { label: "Otro Servicios", value: "Otro Servicio", icon: Syringe },
    ];

    return (
        <Card className="shadow-lg border-primary/20">
            <CardHeader className="space-y-4">
                <div className="flex flex-col gap-2">
                    <CardTitle className="flex items-center text-primary text-2xl">
                        <DollarSign className="h-7 w-7 mr-2" />
                        Matriz de Descuentos (Análisis de Valor)
                    </CardTitle>
                    <CardDescription>Análisis financiero interactivo para calcular los descuentos por sobre-ejecución e imprevistos.</CardDescription>
                </div>

                {/* Botones de Acción Superiores */}
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" className="bg-white"><Save className="mr-2 h-4 w-4" /> Guardar Progreso</Button>
                    <Button onClick={handleSaveState} variant="default" size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Guardar Auditoría
                    </Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="default" size="sm" className="bg-emerald-900 hover:bg-emerald-950 text-white"><Eraser className="mr-2 h-4 w-4" /> Limpiar</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>¿Reiniciar ajustes?</AlertDialogTitle><AlertDialogDescription>Se perderán las glosas marcadas actualmente.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleClearAdjustments}>Confirmar</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <Button onClick={handleDownloadMatriz} variant="default" size="sm" className="bg-green-500 hover:bg-green-600 text-white"><Download className="mr-2 h-4 w-4" /> Descargar</Button>
                    <Button variant="outline" size="sm" className="bg-slate-50"><FileText className="mr-2 h-4 w-4" /> Generar Informe Final</Button>
                </div>

                {/* Tarjetas de Resumen Filtradas */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200 flex flex-col items-center justify-center text-center">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><WalletCards className="h-3 w-3" /> Valor Ejecutado Total (Filtrado)</p>
                        <p className="text-2xl font-bold text-blue-700">{formatCurrency(totals.ejecutado)}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-red-50/50 border border-red-200 flex flex-col items-center justify-center text-center">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><TrendingDown className="h-3 w-3" /> Descuento Aplicado (Total)</p>
                        <p className="text-2xl font-bold text-red-500">{formatCurrency(totals.glosa)}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-green-50/50 border border-green-200 flex flex-col items-center justify-center text-center">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><CheckCircle className="h-3 w-3" /> Valor Neto Final (Total)</p>
                        <p className="text-2xl font-bold text-green-700">{formatCurrency(totals.neto)}</p>
                    </div>
                </div>

                {/* Barra de Filtros */}
                <div className="flex flex-wrap gap-1 p-1 bg-green-500 rounded-md">
                    {filterOptions.map((opt) => {
                        const Icon = opt.icon;
                        const active = activeFilter === opt.value;
                        return (
                            <Button 
                                key={opt.value}
                                onClick={() => setActiveFilter(opt.value)}
                                variant="ghost" 
                                size="sm"
                                className={cn(
                                    "flex items-center gap-2 text-white hover:bg-white/20 hover:text-white h-9 px-4 rounded-md transition-all",
                                    active && "bg-green-600 shadow-inner font-bold border-b-2 border-white/50"
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {opt.label}
                            </Button>
                        )
                    })}
                </div>
            </CardHeader>

            <CardContent>
                <ScrollArea className="h-[500px] rounded-md border">
                    <Table>
                        <TableHeader className="bg-slate-50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="w-12 px-2 text-center">
                                    <Checkbox 
                                        checked={filteredData.length > 0 && filteredData.every(r => selectedRows[r.CUPS])} 
                                        onCheckedChange={(checked) => filteredData.forEach(r => setSelectedRows(prev => ({...prev, [r.CUPS]: !!checked})))} 
                                    />
                                </TableHead>
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
                            {filteredData.length > 0 ? (
                                filteredData.map((row, index) => {
                                    const validatedQty = adjustedQuantities[row.CUPS] ?? row.Cantidad_Ejecutada;
                                    const discount = Math.max(0, row.Valor_Ejecutado - (validatedQty * row.Valor_Unitario));
                                    return (
                                        <TableRow key={index} className={cn("hover:bg-slate-50", selectedRows[row.CUPS] && "bg-red-50/40")}>
                                            <TableCell className="px-2 text-center">
                                                <Checkbox checked={selectedRows[row.CUPS] || false} onCheckedChange={(checked) => setSelectedRows(prev => ({ ...prev, [row.CUPS]: !!checked }))} />
                                            </TableCell>
                                            <TableCell className="font-mono text-xs font-semibold">{row.CUPS}</TableCell>
                                            <TableCell className="text-xs max-w-[250px] truncate" title={row.Descripcion}>{row.Descripcion}</TableCell>
                                            <TableCell className="text-center font-medium">{row.Cantidad_Ejecutada}</TableCell>
                                            <TableCell className="text-center">
                                                <Input 
                                                    type="text" 
                                                    value={new Intl.NumberFormat('es-CO').format(validatedQty)} 
                                                    onChange={(e) => setAdjustedQuantities(prev => ({ ...prev, [row.CUPS]: parseInt(e.target.value.replace(/\D/g,'')) || 0 }))} 
                                                    className="h-8 text-center font-bold bg-white" 
                                                />
                                            </TableCell>
                                            <TableCell className="text-right text-xs font-medium">{formatCurrency(row.Valor_Ejecutado)}</TableCell>
                                            <TableCell className="text-right font-bold text-red-600 text-xs">{formatCurrency(discount)}</TableCell>
                                            <TableCell className="text-center">
                                                <Button variant="ghost" size="icon" onClick={() => { setCurrentCupForComment(row.CUPS); setIsCommentModalOpen(true); }}>
                                                    <MessageSquarePlus className={cn("h-4 w-4", comments[row.CUPS] ? "text-blue-600 fill-blue-50" : "text-muted-foreground")} />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground italic">No hay registros para este filtro.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>

            <CommentModal 
                open={isCommentModalOpen} 
                onOpenChange={setIsCommentModalOpen} 
                initialComment={currentCupForComment ? comments[currentCupForComment] || '' : ''} 
                onSave={(c) => currentCupForComment && setComments(prev => ({...prev, [currentCupForComment]: c}))} 
            />
        </Card>
    );
};

const CommentModal = ({ open, onOpenChange, onSave, initialComment }: { open: boolean; onOpenChange: (open: boolean) => void; onSave: (comment: string) => void; initialComment: string; }) => {
  const [comment, setComment] = useState(initialComment);
  useEffect(() => { if (open) setComment(initialComment); }, [open, initialComment]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Observación de Glosa</DialogTitle></DialogHeader>
        <Textarea 
            value={comment} 
            onChange={(e) => setComment(e.target.value)} 
            className="min-h-[150px] focus:ring-primary" 
            placeholder="Escriba el motivo técnico del ajuste o glosa aplicada..."
        />
        <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => { onSave(comment); onOpenChange(false); }}>Guardar Comentario</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DiscountMatrix;
