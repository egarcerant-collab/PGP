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
  Syringe,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
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
  userRole?: string;
}

const DiscountMatrix: React.FC<DiscountMatrixProps> = ({
    data,
    executionDataByMonth,
    pgpData,
    onAdjustmentsChange,
    selectedPrestador,
    initialAuditData,
    uniqueUserCount,
    jsonPrestadorCode,
    userRole,
}) => {
    const [adjustedQuantities, setAdjustedQuantities] = useState<Record<string, number>>({});
    const [comments, setComments] = useState<Record<string, string>>({});
    const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
    const [activeFilter, setActiveFilter] = useState<ServiceType>("Todos");
    const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
    const [currentCupForComment, setCurrentCupForComment] = useState<string | null>(null);
    const [detailRow, setDetailRow] = useState<DiscountMatrixRow | null>(null);
    const [cupsExcepciones, setCupsExcepciones] = useState<any[]>([]);
    const { toast } = useToast();

    const fetchExcepciones = () => {
        fetch('/api/cups-excepciones')
            .then(r => r.ok ? r.json() : { excepciones: [] })
            .then(d => setCupsExcepciones(d.excepciones || []))
            .catch(() => {});
    };

    useEffect(() => { fetchExcepciones(); }, []);
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
        
        const monthKey = Array.from(executionDataByMonth.keys())[0] || String(new Date().getMonth() + 1);
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

            if (response.ok) {
                toast({ title: "Guardado Exitoso", description: `Auditoría guardada en la carpeta de ${monthName}.` });
            } else {
                toast({ title: "Aviso de Servidor", description: "No se pudo guardar en el servidor. Verifique permisos.", variant: "destructive" });
            }
        } catch (error: any) {
            toast({ title: "Error de Red", description: "No se pudo conectar con el servidor.", variant: "destructive" });
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

    const getStatusColor = (clasificacion: string) => {
        switch (clasificacion) {
            case "Sobre-ejecutado": return "text-red-600 font-bold";
            case "Sub-ejecutado": return "text-blue-600 font-bold";
            case "Ejecución Normal": return "text-green-600 font-bold";
            case "Inesperado": return "text-purple-600 font-bold";
            case "Faltante": return "text-slate-900 font-bold";
            default: return "text-slate-600";
        }
    };

    const filterOptions: { label: string; value: ServiceType; icon: any }[] = [
        { label: "Todos", value: "Todos", icon: Filter },
        { label: "Consultas", value: "Consulta", icon: Stethoscope },
        { label: "Procedimientos", value: "Procedimiento", icon: Microscope },
        { label: "Medicamentos", value: "Medicamento", icon: Pill },
        { label: "Otros Servicios", value: "Otro Servicio", icon: Syringe },
    ];

    const getServiceIcon = (type: string, colorClass: string) => {
        const iconClass = cn("h-4 w-4", colorClass);
        switch(type) {
            case "Consulta": return <Stethoscope className={iconClass} />;
            case "Procedimiento": return <Microscope className={iconClass} />;
            case "Medicamento": return <Pill className={iconClass} />;
            case "Otro Servicio": return <Syringe className={iconClass} />;
            default: return <FileText className={iconClass} />;
        }
    };

    return (
        <div className="space-y-6">
            <Card className="shadow-lg border-primary/20">
                <CardHeader className="space-y-4">
                    <div className="flex flex-col gap-2">
                        <CardTitle className="flex items-center text-primary text-2xl">
                            <DollarSign className="h-7 w-7 mr-2" />
                            Matriz de Descuentos (Análisis de Valor)
                        </CardTitle>
                        <CardDescription>
                          Análisis financiero interactivo. Las celdas de CUPS, Tipo, Descripción y Cantidades se colorean según el estado de la ejecución (Rojo: Sobre, Verde: Normal, Azul: Sub).
                        </CardDescription>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
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
                    </div>

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

                    <div className="flex flex-wrap gap-2 p-2 bg-slate-50 border rounded-lg">
                        {filterOptions.map((opt) => {
                            const Icon = opt.icon;
                            const active = activeFilter === opt.value;
                            return (
                                <Button 
                                    key={opt.value}
                                    onClick={() => setActiveFilter(opt.value)}
                                    variant={active ? "default" : "outline"} 
                                    size="sm"
                                    className={cn(
                                        "flex items-center gap-2 transition-all",
                                        active && opt.value === "Todos" && "bg-violet-100 text-violet-700 hover:bg-violet-200 border-violet-200"
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
                    <ScrollArea className="h-[600px] rounded-md border">
                        <Table>
                            <TableHeader className="bg-white sticky top-0 z-10 shadow-sm">
                                <TableRow>
                                    <TableHead className="w-12 px-2 text-center">
                                        <Checkbox 
                                            checked={filteredData.length > 0 && filteredData.every(r => selectedRows[r.CUPS])} 
                                            onCheckedChange={(checked) => {
                                                const newSelected = { ...selectedRows };
                                                filteredData.forEach(r => newSelected[r.CUPS] = !!checked);
                                                setSelectedRows(newSelected);
                                            }} 
                                        />
                                    </TableHead>
                                    <TableHead>CUPS</TableHead>
                                    <TableHead>Tipo Servicio</TableHead>
                                    <TableHead>Descripción</TableHead>
                                    <TableHead className="text-center">Cant. Esperada</TableHead>
                                    <TableHead className="text-center">Cant. Ejecutada</TableHead>
                                    <TableHead className="text-center w-32">Cant. Validada</TableHead>
                                    <TableHead className="text-right">Valor Ejecutado</TableHead>
                                    <TableHead className="text-right">Valor a Reconocer</TableHead>
                                    <TableHead className="text-right text-red-600 font-bold">Valor a Descontar</TableHead>
                                    <TableHead className="w-12 text-center">Glosa</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredData.length > 0 ? (
                                    filteredData.map((row, index) => {
                                        const validatedQty = adjustedQuantities[row.CUPS] ?? row.Cantidad_Ejecutada;
                                        const recognitionValue = validatedQty * row.Valor_Unitario;
                                        const discount = Math.max(0, row.Valor_Ejecutado - recognitionValue);
                                        const isDiscounted = discount > 0;
                                        const statusColor = getStatusColor(row.Clasificacion);

                                        return (
                                            <TableRow key={index} className={cn("hover:bg-slate-50 transition-colors", isDiscounted && "bg-red-50/40")}>
                                                <TableCell className="px-2 text-center">
                                                    <Checkbox checked={selectedRows[row.CUPS] || false} onCheckedChange={(checked) => setSelectedRows(prev => ({ ...prev, [row.CUPS]: !!checked }))} />
                                                </TableCell>
                                                <TableCell className={cn("font-mono text-xs cursor-pointer underline underline-offset-2 hover:opacity-70 transition-opacity", statusColor)} onClick={() => setDetailRow(row)}>
                                                    <div className="flex items-center gap-1">
                                                        {row.CUPS}
                                                        {cupsExcepciones.some(e => e.cup === row.CUPS) && (
                                                            <span title="Duplicados autorizados"><ShieldCheck className="h-3 w-3 text-green-500 flex-shrink-0" /></span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className={cn("text-xs", statusColor)}>
                                                    <div className="flex items-center gap-2">
                                                        {getServiceIcon(row.Tipo_Servicio, statusColor)}
                                                        <span>{row.Tipo_Servicio}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className={cn("text-xs max-w-[250px] truncate", statusColor)} title={row.Descripcion}>{row.Descripcion || 'N/A'}</TableCell>
                                                <TableCell className={cn("text-center", statusColor)}>{row.expectedFrequency.toFixed(0)}</TableCell>
                                                <TableCell className={cn("text-center", statusColor)}>{row.Cantidad_Ejecutada}</TableCell>
                                                <TableCell className="text-center">
                                                    <Input 
                                                        type="text" 
                                                        value={new Intl.NumberFormat('es-CO').format(validatedQty)} 
                                                        onChange={(e) => setAdjustedQuantities(prev => ({ ...prev, [row.CUPS]: parseInt(e.target.value.replace(/\D/g,'')) || 0 }))} 
                                                        className="h-8 text-center font-bold bg-white border-slate-200" 
                                                    />
                                                </TableCell>
                                                <TableCell className={cn("text-right text-xs", statusColor)}>{formatCurrency(row.Valor_Ejecutado)}</TableCell>
                                                <TableCell className="text-right text-xs font-medium text-green-600">{formatCurrency(recognitionValue)}</TableCell>
                                                <TableCell className="text-right font-bold text-red-600 text-xs">{formatCurrency(discount)}</TableCell>
                                                <TableCell className="text-center">
                                                    <Button variant="ghost" size="icon" onClick={() => { setCurrentCupForComment(row.CUPS); setIsCommentModalOpen(true); }}>
                                                        <MessageSquarePlus className={cn("h-4 w-4", comments[row.CUPS] ? "text-blue-600 fill-blue-50" : "text-slate-400")} />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={11} className="h-32 text-center text-muted-foreground italic">No hay registros para este filtro.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>

            <CommentModal
                open={isCommentModalOpen}
                onOpenChange={setIsCommentModalOpen}
                initialComment={currentCupForComment ? comments[currentCupForComment] || '' : ''}
                onSave={(c) => currentCupForComment && setComments(prev => ({...prev, [currentCupForComment]: c}))}
            />

            {/* Modal detalle CUPS */}
            {detailRow && (
                <CupDetailModal
                    row={detailRow}
                    executionDataByMonth={executionDataByMonth}
                    onClose={() => setDetailRow(null)}
                    cupsExcepciones={cupsExcepciones}
                    userRole={userRole}
                    onExcepcionChange={fetchExcepciones}
                />
            )}
        </div>
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

interface CupDetailModalProps {
    row: DiscountMatrixRow;
    executionDataByMonth: ExecutionDataByMonth;
    onClose: () => void;
    cupsExcepciones?: any[];
    userRole?: string;
    onExcepcionChange?: () => void;
}

const CupDetailModal: React.FC<CupDetailModalProps> = ({ row, executionDataByMonth, onClose, cupsExcepciones = [], userRole, onExcepcionChange }) => {
    const isAdmin = userRole === 'superadmin' || userRole === 'admin';
    const excepcion = cupsExcepciones.find(e => e.cup === row.CUPS);
    const isAutorizado = !!excepcion;
    const [showAuthForm, setShowAuthForm] = useState(false);
    const [motivoInput, setMotivoInput] = useState('');
    const [authLoading, setAuthLoading] = useState(false);
    const { toast } = useToast();

    const handleAutorizar = async () => {
        if (!motivoInput.trim()) { toast({ title: 'Ingresa el motivo de autorización', variant: 'destructive' }); return; }
        setAuthLoading(true);
        try {
            const res = await fetch('/api/cups-excepciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cup: row.CUPS, descripcion: row.Descripcion || '', motivo: motivoInput }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            toast({ title: `✅ CUPS ${row.CUPS} autorizado`, description: `Duplicados permitidos: ${motivoInput}` });
            onExcepcionChange?.();
            setShowAuthForm(false);
            setMotivoInput('');
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally { setAuthLoading(false); }
    };

    const handleRevocar = async () => {
        setAuthLoading(true);
        try {
            const res = await fetch(`/api/cups-excepciones?cup=${encodeURIComponent(row.CUPS)}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            toast({ title: `🔴 Autorización revocada`, description: `CUPS ${row.CUPS} ya no tiene excepción de duplicados` });
            onExcepcionChange?.();
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally { setAuthLoading(false); }
    };

    // Recolectar registros individuales desde rawJsonData (estructura RIPS: { usuarios: [...] })
    const records: { tipo: string; userId: string; fecha: string; diagnostico: string; valor: number }[] = [];

    executionDataByMonth.forEach((monthData) => {
        const raw = monthData.rawJsonData;
        if (!raw) return;
        const usuarios: any[] = raw.usuarios || [];
        usuarios.forEach((user: any) => {
            const userId = `${user.tipoDocumentoIdentificacion || ''}-${user.numDocumentoIdentificacion || ''}`.replace(/^-|-$/, '');
            const servicios = user.servicios || {};

            // Consultas
            (servicios.consultas || []).forEach((s: any) => {
                if (String(s.codConsulta || '').trim().toUpperCase() !== row.CUPS) return;
                records.push({ tipo: 'Consulta', userId, fecha: s.fechaInicioAtencion || '—', diagnostico: s.codDiagnosticoPrincipal || '—', valor: Number(s.vrServicio || 0) });
            });
            // Procedimientos
            (servicios.procedimientos || []).forEach((s: any) => {
                if (String(s.codProcedimiento || '').trim().toUpperCase() !== row.CUPS) return;
                records.push({ tipo: 'Procedimiento', userId, fecha: s.fechaInicioAtencion || '—', diagnostico: s.codDiagnosticoPrincipal || '—', valor: Number(s.vrServicio || 0) });
            });
            // Medicamentos
            (servicios.medicamentos || []).forEach((s: any) => {
                if (String(s.codTecnologiaSalud || '').trim().toUpperCase() !== row.CUPS) return;
                records.push({ tipo: 'Medicamento', userId, fecha: s.fechaInicioAtencion || s.fechaDispensamiento || '—', diagnostico: s.codDiagnosticoPrincipal || '—', valor: Number(s.vrUnitarioMedicamento || s.vrServicio || 0) });
            });
            // Otros servicios
            (servicios.otrosServicios || []).forEach((s: any) => {
                if (String(s.codTecnologiaSalud || '').trim().toUpperCase() !== row.CUPS) return;
                records.push({ tipo: 'Otro Servicio', userId, fecha: s.fechaInicioAtencion || '—', diagnostico: s.codDiagnosticoPrincipal || '—', valor: Number(s.vrServicio || 0) });
            });
        });
    });

    const handleDownload = () => {
        const csv = Papa.unparse(records.map(r => ({
            'Tipo Servicio': r.tipo,
            'ID Usuario': r.userId,
            'Fecha Atención': r.fecha,
            'Diagnóstico': r.diagnostico,
            'Valor': r.valor,
        })), { delimiter: ';' });
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `detalle_${row.CUPS}.csv`;
        link.click();
    };

    const stat = (label: string, value: string | number, color?: string) => (
        <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className={cn("font-semibold text-sm", color)}>{value}</span>
        </div>
    );

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-base flex items-center gap-2">
                        Ejecuciones Detalladas del CUPS: <span className="font-mono text-primary">{row.CUPS}</span>
                        {isAutorizado
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold"><ShieldCheck className="h-3.5 w-3.5" /> Duplicados Autorizados</span>
                            : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold"><ShieldAlert className="h-3.5 w-3.5" /> Sin Autorización</span>
                        }
                    </DialogTitle>
                    {row.Descripcion && row.Descripcion !== row.CUPS && (
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">{row.Descripcion}</p>
                    )}
                </DialogHeader>

                {/* Autorización de duplicados (solo admins) */}
                {isAutorizado && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-green-700 font-semibold">
                                <ShieldCheck className="h-4 w-4" />
                                Duplicados permitidos para este CUPS
                            </div>
                            {isAdmin && (
                                <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50" onClick={handleRevocar} disabled={authLoading}>
                                    {authLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <><ShieldOff className="h-3 w-3 mr-1" />Revocar</>}
                                </Button>
                            )}
                        </div>
                        <p className="text-green-600"><span className="font-medium">Motivo:</span> {excepcion?.motivo || '—'}</p>
                        <p className="text-green-500">Autorizado por: {excepcion?.autorizadoPor} — {excepcion?.fecha}</p>
                    </div>
                )}

                {!isAutorizado && isAdmin && (
                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-orange-700 font-semibold">
                                <ShieldAlert className="h-4 w-4" />
                                Duplicados no autorizados — se aplica restricción de un solo procedimiento por día
                            </div>
                            {!showAuthForm && (
                                <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50" onClick={() => setShowAuthForm(true)}>
                                    <ShieldCheck className="h-3 w-3 mr-1" />Autorizar
                                </Button>
                            )}
                        </div>
                        {showAuthForm && (
                            <div className="space-y-2 pt-1">
                                <p className="text-orange-600 font-medium">Motivo de autorización de duplicados:</p>
                                <Input
                                    value={motivoInput}
                                    onChange={e => setMotivoInput(e.target.value)}
                                    placeholder="Ej: Procedimiento bilateral ojo izquierdo y ojo derecho"
                                    className="h-8 text-xs"
                                />
                                <div className="flex gap-2">
                                    <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={handleAutorizar} disabled={authLoading}>
                                        {authLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ShieldCheck className="h-3 w-3 mr-1" />}Confirmar Autorización
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setShowAuthForm(false); setMotivoInput(''); }}>Cancelar</Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Estadísticas */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border text-sm">
                    {stat('Valor Unitario (NT):', formatCurrency(row.Valor_Unitario), 'text-violet-700')}
                    {stat('Frecuencia Real:', row.realFrequency, 'text-blue-600')}
                    {stat('Frecuencia Esperada:', row.expectedFrequency)}
                    {stat('Usuarios Únicos:', row.uniqueUsers)}
                    {stat('Atenciones Repetidas:', row.repeatedAttentions)}
                    {stat('Desviación (Cantidad):', Number(row.deviation).toFixed(0), row.deviation > 0 ? 'text-red-600' : 'text-green-600')}
                    {stat('Desviación (Valor):', formatCurrency(row.deviationValue), row.deviationValue > 0 ? 'text-red-600' : 'text-green-600')}
                    {stat('>1 Atención Mismo Día (Usuarios):', row.sameDayDetections, row.sameDayDetections > 0 ? 'text-orange-600' : '')}
                    {stat('Costo Repetición Mismo Día:', formatCurrency(row.sameDayDetectionsCost), row.sameDayDetectionsCost > 0 ? 'text-red-700' : '')}
                </div>

                {/* Tabla de registros individuales */}
                {records.length > 0 ? (
                    <ScrollArea className="flex-1 rounded border mt-1">
                        <Table>
                            <TableHeader className="sticky top-0 bg-white z-10">
                                <TableRow>
                                    <TableHead className="text-xs">Tipo Servicio</TableHead>
                                    <TableHead className="text-xs">ID Usuario</TableHead>
                                    <TableHead className="text-xs">Fecha Atención</TableHead>
                                    <TableHead className="text-xs">Diagnóstico</TableHead>
                                    <TableHead className="text-xs text-right">Valor</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {records.map((r, i) => (
                                    <TableRow key={i} className="text-xs">
                                        <TableCell>{r.tipo}</TableCell>
                                        <TableCell className="font-mono">{r.userId}</TableCell>
                                        <TableCell>{r.fecha}</TableCell>
                                        <TableCell>{r.diagnostico}</TableCell>
                                        <TableCell className="text-right">{r.valor > 0 ? formatCurrency(r.valor) : '$ 0'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                ) : (
                    <p className="text-sm text-muted-foreground text-center py-4 italic">No hay registros individuales disponibles para este CUPS.</p>
                )}

                <DialogFooter className="gap-2">
                    {records.length > 0 && (
                        <Button variant="outline" size="sm" onClick={handleDownload}>
                            <Download className="h-4 w-4 mr-2" /> Descargar Detalle
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default DiscountMatrix;
