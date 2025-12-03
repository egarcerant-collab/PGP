

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
import { getNumericValue, SavedAuditData } from '../app/JsonAnalyzerPage';
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
    // Add all properties from DeviatedCupInfo to allow passing it to the modal
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
  pgpData: any[]; // PgpRow[]
  onAdjustmentsChange: (adjustments: AdjustedData) => void;
  storageKey: string; // Unique key for localStorage
  onGenerateReport: () => void;
  isGeneratingReport: boolean;
  selectedPrestador: Prestador | null;
  initialAuditData: SavedAuditData | null;
}

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

const serviceTypeIcons: Record<ServiceType, React.ElementType> = {
    "Consulta": Stethoscope,
    "Procedimiento": Microscope,
    "Medicamento": Pill,
    "Otro Servicio": Syringe,
    "Desconocido": DollarSign,
};

const CommentModal = ({ open, onOpenChange, onSave, initialComment }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (comment: string) => void;
  initialComment: string;
}) => {
  const [comment, setComment] = useState(initialComment);

  useEffect(() => {
    if (open) {
      setComment(initialComment);
    }
  }, [open, initialComment]);

  const handleSave = () => {
    onSave(comment);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Añadir Comentario de Glosa</DialogTitle>
          <DialogDescription>
            Justifica el ajuste realizado en la cantidad validada. Este comentario es obligatorio.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Escribe aquí tu justificación..."
          className="min-h-[120px]"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar Comentario</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


const DiscountMatrix: React.FC<DiscountMatrixProps> = ({ 
    data, 
    executionDataByMonth, 
    pgpData, 
    onAdjustmentsChange, 
    storageKey, 
    onGenerateReport, 
    isGeneratingReport,
    selectedPrestador,
    initialAuditData
}) => {
    const [selectedCupForDetail, setSelectedCupForDetail] = useState<DeviatedCupInfo | null>(null);
    const [isCupModalOpen, setIsCupModalOpen] = useState(false);
    const [executionDetails, setExecutionDetails] = useState<any[]>([]);
    
    // States for adjustments
    const [adjustedQuantities, setAdjustedQuantities] = useState<Record<string, number>>({});
    const [comments, setComments] = useState<Record<string, string>>({});
    const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
    
    // Modals
    const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
    const [currentCupForComment, setCurrentCupForComment] = useState<string | null>(null);
    
    // Filters
    const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceType | 'all'>('all');
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);


     // Load initial state from localStorage or initialAuditData
    const initializeStateFromData = useCallback(() => {
        const initialQuantities: Record<string, number> = {};
        data.forEach(row => {
            initialQuantities[row.CUPS] = row.Cantidad_Ejecutada;
        });

        if (initialAuditData) {
            setAdjustedQuantities(initialAuditData.adjustedQuantities || initialQuantities);
            setComments(initialAuditData.comments || {});
            setSelectedRows(initialAuditData.selectedRows || {});
             toast({
                title: "Auditoría Guardada Cargada",
                description: "Se restauró el progreso de la auditoría seleccionada.",
            });
        } else {
             try {
                if (!storageKey) {
                    setAdjustedQuantities(initialQuantities);
                    setComments({});
                    setSelectedRows({});
                    return;
                };
                const savedState = localStorage.getItem(storageKey);
                if (savedState) {
                    const { adjustedQuantities: sq, comments: sc, selectedRows: sr } = JSON.parse(savedState);
                    if(sq) setAdjustedQuantities(sq);
                    if(sc) setComments(sc);
                    if(sr) setSelectedRows(sr);
                } else {
                     setAdjustedQuantities(initialQuantities);
                     setComments({});
                     setSelectedRows({});
                }
            } catch (error) {
                console.error("Error loading state from localStorage", error);
                setAdjustedQuantities(initialQuantities);
                setComments({});
                setSelectedRows({});
            }
        }
    }, [data, storageKey, initialAuditData, toast]);

    useEffect(() => {
        initializeStateFromData();
    }, [initializeStateFromData]); // Depend on initialAuditData to re-run
    
    // This effect now passes data up, but doesn't save to localStorage
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
    
    const handleSaveStateToServer = async () => {
        if (!selectedPrestador || executionDataByMonth.size === 0) {
            toast({
                title: "No se puede guardar",
                description: "Se necesita un prestador y datos de ejecución cargados.",
                variant: "destructive",
            });
            return;
        }
        setIsSaving(true);
        
        const getMonthName = (monthNumber: string) => {
            const date = new Date();
            date.setMonth(parseInt(monthNumber) - 1);
            const monthName = date.toLocaleString('es-CO', { month: 'long' });
            return monthName.charAt(0).toUpperCase() + monthName.slice(1);
        };
        
        // Asumimos un solo mes por simplicidad, se puede mejorar para multimes
        const monthKey = executionDataByMonth.keys().next().value;
        const monthName = getMonthName(monthKey);

        const auditData = {
            adjustedQuantities,
            comments,
            selectedRows
        };
        
        try {
            const response = await fetch('/api/save-audit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    auditData,
                    prestadorName: selectedPrestador.PRESTADOR,
                    month: monthName,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Error en el servidor');
            }
            
            toast({
                title: "Auditoría Guardada Exitosamente",
                description: `El archivo se ha guardado en el servidor para ${selectedPrestador.PRESTADOR}.`,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Error desconocido";
            console.error("Error saving audit state to server:", error);
            toast({
                title: "Error al Guardar",
                description: `No se pudo guardar la auditoría en el servidor: ${errorMessage}`,
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveStateToLocal = () => {
        if (!storageKey) return;
        try {
            const stateToSave = {
                adjustedQuantities,
                comments,
                selectedRows,
            };
            localStorage.setItem(storageKey, JSON.stringify(stateToSave));
            toast({
                title: "Progreso Guardado",
                description: "El progreso de la auditoría se ha guardado en tu navegador.",
            });
        } catch (error) {
            console.error("Error saving state to localStorage", error);
            toast({
                title: "Error al Guardar",
                description: "No se pudo guardar el progreso en el navegador.",
                variant: "destructive",
            });
        }
    };
    
    const handleClearAdjustments = () => {
        if (storageKey) localStorage.removeItem(storageKey);
        // Reset state to initial from props, not to empty
        const initialQuantities: Record<string, number> = {};
        data.forEach(row => {
            initialQuantities[row.CUPS] = row.Cantidad_Ejecutada;
        });
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
        setSelectedCupForDetail(cupInfo as DeviatedCupInfo);
        setIsCupModalOpen(true);
    };


    const handleSelectAll = (checked: boolean) => {
        const newSelections: Record<string, boolean> = {};
        filteredData.forEach(row => {
            newSelections[row.CUPS] = checked;
        });
        setSelectedRows(prev => ({...prev, ...newSelections}));
    };

    const handleSelectRow = (cup: string, checked: boolean) => {
        setSelectedRows(prev => ({ ...prev, [cup]: checked }));
    };
    
    const handleQuantityChange = (cup: string, value: string) => {
        const numericValue = parseInt(value.replace(/[^0-9]+/g,""), 10) || 0;
        const rowData = data.find(r => r.CUPS === cup);
        if (rowData && numericValue > rowData.Cantidad_Ejecutada) {
            // Prevent setting a value higher than executed
            setAdjustedQuantities(prev => ({ ...prev, [cup]: rowData.Cantidad_Ejecutada }));
        } else {
            setAdjustedQuantities(prev => ({ ...prev, [cup]: numericValue }));
        }
    };
    
    const handleSaveComment = (comment: string) => {
      if (currentCupForComment) {
        setComments(prev => ({ ...prev, [currentCupForComment]: comment }));
      }
    };
    
    // KPIs Calculations based on filtered data
    const totalEjecutadoBruto = useMemo(() => {
        return filteredData.reduce((sum, row) => sum + row.Valor_Ejecutado, 0);
    }, [filteredData]);
    
    const totalEjecutadoAjustado = useMemo(() => {
      return filteredData.reduce((sum, row) => {
        const validatedQuantity = adjustedQuantities[row.CUPS] ?? row.Cantidad_Ejecutada;
        return sum + validatedQuantity * row.Valor_Unitario;
      }, 0);
    }, [filteredData, adjustedQuantities]);

    const descuentoAplicado = useMemo(() => {
        const totalDiscount = filteredData.reduce((sum, row) => {
            if (selectedRows[row.CUPS]) {
                 const validatedQuantity = adjustedQuantities[row.CUPS] ?? row.Cantidad_Ejecutada;
                 const recalculatedValorReconocer = validatedQuantity * row.Valor_Unitario;
                 const discountValue = row.Valor_Ejecutado - recalculatedValorReconocer;
                 return sum + (discountValue > 0 ? discountValue : 0);
            }
            return sum;
        }, 0);
        return totalDiscount;
    }, [filteredData, selectedRows, adjustedQuantities]);
    
    const valorNetoFinal = useMemo(() => totalEjecutadoBruto - descuentoAplicado, [totalEjecutadoBruto, descuentoAplicado]);


    const allSelected = useMemo(() => filteredData.length > 0 && filteredData.every(row => selectedRows[row.CUPS]), [filteredData, selectedRows]);
    
    if (!data || data.length === 0) {
        return null;
    }

    const getRowClass = (classification: string) => {
        switch (classification) {
            case "Sobre-ejecutado": return "text-red-600";
            case "Sub-ejecutado": return "text-blue-600";
            case "Inesperado": return "text-purple-600";
            default: return "";
        }
    };
    
    const generateDownloadData = () => {
        const discountedServices: any[] = [];
    
        // 1. Get all CUPS that are selected for discount
        const discountedCups = new Set<string>();
        Object.entries(selectedRows).forEach(([cup, isSelected]) => {
            if (isSelected) {
                const rowData = data.find(r => r.CUPS === cup);
                if (rowData) {
                    const executedQty = rowData.Cantidad_Ejecutada;
                    const validatedQty = adjustedQuantities[cup] ?? executedQty;
                    if (validatedQty < executedQty) {
                        discountedCups.add(cup);
                    }
                }
            }
        });
    
        if (discountedCups.size === 0) {
            toast({
                title: "Sin descuentos para descargar",
                description: "Ajusta la 'Cantidad Validada' a un valor menor que la 'Cantidad Ejecutada' y selecciona las filas para generar el desglose.",
            });
            return [];
        }
    
        // 2. Iterate through all raw services to find the ones matching the discounted CUPS
        executionDataByMonth.forEach((monthData) => {
            monthData.rawJsonData.usuarios?.forEach((user: any) => {
                const userId = `${user.tipoDocumentoIdentificacion}-${user.numDocumentoIdentificacion}`;
    
                const processServicesForDiscount = (services: any[], codeField: string) => {
                    if (!services) return;
    
                    services.forEach((service: any) => {
                        const cupCode = service[codeField];
                        if (discountedCups.has(cupCode)) {
                            const matrixRow = data.find(r => r.CUPS === cupCode);
                            if (!matrixRow) return;
    
                            const executedQty = matrixRow.Cantidad_Ejecutada;
                            const validatedQty = adjustedQuantities[cupCode] ?? executedQty;
                            const discountRatio = (executedQty - validatedQty) / executedQty;
    
                            const originalServiceValue = getNumericValue(service.vrServicio);
                            const discountAmount = originalServiceValue * discountRatio;
                            const recognizedValue = originalServiceValue - discountAmount;
    
                            if (discountAmount > 0) {
                                discountedServices.push({
                                    'ID Usuario': userId,
                                    'CUPS': cupCode,
                                    'Descripción': matrixRow.Descripcion,
                                    'Fecha Atención': service.fechaInicioAtencion ? new Date(service.fechaInicioAtencion).toLocaleDateString() : 'N/A',
                                    'Diagnóstico Principal': service.codDiagnosticoPrincipal,
                                    'Valor Original Servicio': originalServiceValue,
                                    'Valor a Descontar': discountAmount,
                                    'Valor Final Reconocido': recognizedValue,
                                    'Comentario de Glosa': comments[cupCode] || ''
                                });
                            }
                        }
                    });
                };
    
                if (user.servicios) {
                    processServicesForDiscount(user.servicios.consultas, 'codConsulta');
                    processServicesForDiscount(user.servicios.procedimientos, 'codProcedimiento');
                    // Note: Discount logic for 'medicamentos' and 'otros' might need different value calculations,
                    // as they use unit values. This is a simplification for now.
                    processServicesForDiscount(user.servicios.medicamentos, 'codTecnologiaSalud');
                    processServicesForDiscount(user.servicios.otrosServicios, 'codTecnologiaSalud');
                }
            });
        });
    
        return discountedServices;
    };
    
    
    const renderTable = (tableData: DiscountMatrixRow[]) => (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-12 px-2">
                        <Checkbox 
                            checked={allSelected} 
                            onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                            aria-label="Seleccionar todo"
                        />
                    </TableHead>
                    <TableHead className="w-28">CUPS</TableHead>
                    <TableHead>Tipo Servicio</TableHead>
                    <TableHead className="max-w-[150px]">Descripción</TableHead>
                    <TableHead className="text-center">Cant. Esperada</TableHead>
                    <TableHead className="text-center">Cant. Ejecutada</TableHead>
                    <TableHead className="text-center w-32">Cant. Validada</TableHead>
                    <TableHead className="text-right">Valor Ejecutado</TableHead>
                    <TableHead className="text-right">Valor a Reconocer</TableHead>
                    <TableHead className="text-right text-red-500 font-bold w-40">Valor a Descontar</TableHead>
                    <TableHead className="w-24 text-center">Glosa</TableHead>

                </TableRow>
            </TableHeader>
            <TableBody>
                {tableData.map((row, index) => {
                    const validatedQuantity = adjustedQuantities[row.CUPS] ?? row.Cantidad_Ejecutada;
                    const recalculatedValorReconocer = validatedQuantity * row.Valor_Unitario;
                    const discountValue = row.Valor_Ejecutado - recalculatedValorReconocer;
                    const finalDiscount = discountValue > 0 ? discountValue : 0;
                    
                    const commentIsRequired = validatedQuantity !== row.Cantidad_Ejecutada;
                    const comment = comments[row.CUPS] || '';
                    const Icon = serviceTypeIcons[row.Tipo_Servicio] || DollarSign;
                    
                    return (
                        <TableRow key={index} className={getRowClass(row.Clasificacion)}>
                            <TableCell className="px-2">
                               <Checkbox 
                                    checked={selectedRows[row.CUPS] || false}
                                    onCheckedChange={(checked) => handleSelectRow(row.CUPS, Boolean(checked))}
                               />
                            </TableCell>
                            <TableCell>
                                <Button variant="link" className="p-0 h-auto font-mono text-sm" onClick={() => handleCupClick(row)}>
                                    {row.CUPS}
                                </Button>
                            </TableCell>
                            <TableCell className="text-xs">
                                <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4 text-muted-foreground" />
                                    <span>{row.Tipo_Servicio}</span>
                                </div>
                            </TableCell>
                            <TableCell className="text-xs max-w-[150px] truncate" title={row.Descripcion}>{row.Descripcion}</TableCell>
                            <TableCell className="text-center">{row.expectedFrequency.toFixed(0)}</TableCell>
                            <TableCell className="text-center">{row.Cantidad_Ejecutada}</TableCell>
                             <TableCell className="text-center">
                                <Input
                                    type="text"
                                    value={new Intl.NumberFormat('es-CO').format(validatedQuantity)}
                                    onChange={(e) => handleQuantityChange(row.CUPS, e.target.value)}
                                    className="h-8 text-center border-blue-200 focus:border-blue-500 focus:ring-blue-500"
                                />
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(row.Valor_Ejecutado)}</TableCell>
                            <TableCell className="text-right text-green-600">{formatCurrency(recalculatedValorReconocer)}</TableCell>
                            <TableCell className="text-right font-bold text-red-600">
                                 {formatCurrency(finalDiscount)}
                            </TableCell>
                            <TableCell className="text-center">
                                {commentIsRequired && (
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => {
                                        setCurrentCupForComment(row.CUPS);
                                        setIsCommentModalOpen(true);
                                      }}
                                    >
                                        <MessageSquarePlus className={cn("h-5 w-5", comment ? "text-blue-500" : "text-muted-foreground")} />
                                    </Button>
                                )}
                            </TableCell>
                        </TableRow>
                    )
                })}
            </TableBody>
        </Table>
    );
    
    const serviceTypes: ServiceType[] = ["Consulta", "Procedimiento", "Medicamento", "Otro Servicio"];

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center">
                                <DollarSign className="h-6 w-6 mr-3 text-red-500" />
                                Matriz de Descuentos (Análisis de Valor)
                            </CardTitle>
                            <CardDescription>
                               Análisis financiero interactivo para calcular los descuentos por sobre-ejecución e imprevistos.
                            </CardDescription>
                        </div>
                         <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                             <div className="flex items-center gap-2">
                                <Button onClick={handleSaveStateToLocal} variant="outline" size="sm" className="h-8">
                                    <Save className="mr-2 h-4 w-4" />
                                    Guardar Progreso
                                </Button>
                                <Button onClick={handleSaveStateToServer} variant="default" size="sm" className="h-8" disabled={isSaving}>
                                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Guardar Auditoría
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="sm" className="h-8">
                                            <Eraser className="mr-2 h-4 w-4" />
                                            Limpiar
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Esta acción eliminará permanentemente todos los ajustes (cantidades, valores y comentarios) que has realizado en esta matriz. Se perderá el progreso guardado.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleClearAdjustments}>Sí, Limpiar</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>

                                <Button onClick={() => {
                                    const downloadData = generateDownloadData();
                                    if(downloadData.length > 0) {
                                      handleDownloadXls(downloadData, 'desglose_descuentos_aplicados.xls');
                                    }
                                  }} variant="outline" size="sm" className="h-8">
                                    <Download className="mr-2 h-4 w-4" />
                                    Descargar
                                </Button>
                            </div>
                             <Button onClick={onGenerateReport} disabled={isGeneratingReport || !data.length} variant="secondary" size="sm" className="h-8 mt-2 sm:mt-0">
                                {isGeneratingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                                Generar Informe Final
                            </Button>
                        </div>
                    </div>
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-right w-full mt-4">
                        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200">
                            <p className="text-xs text-muted-foreground flex items-center justify-end gap-1"><WalletCards className="h-4 w-4"/> Valor Ejecutado Total</p>
                            <p className="text-lg font-bold text-blue-600">{formatCurrency(totalEjecutadoBruto)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200">
                            <p className="text-xs text-muted-foreground flex items-center justify-end gap-1"><TrendingDown className="h-4 w-4"/> Descuento Aplicado</p>
                            <p className="text-lg font-bold text-red-500">{formatCurrency(descuentoAplicado)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200">
                            <p className="text-xs text-muted-foreground flex items-center justify-end gap-1"><CheckCircle className="h-4 w-4"/> Valor Neto Final</p>
                            <p className="text-lg font-bold text-green-600">{formatCurrency(valorNetoFinal)}</p>
                        </div>
                    </div>
                     <div className="flex flex-wrap items-center gap-2 pt-4">
                        <Filter className="h-4 w-4 text-muted-foreground" />
                        <Button 
                            variant={serviceTypeFilter === 'all' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setServiceTypeFilter('all')}
                        >
                            Todos
                        </Button>
                        {serviceTypes.map(type => (
                             <Button 
                                key={type}
                                variant={serviceTypeFilter === type ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setServiceTypeFilter(type)}
                            >
                                {React.createElement(serviceTypeIcons[type], { className: "mr-2 h-4 w-4"})}
                                {type}s
                            </Button>
                        ))}
                    </div>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-72">
                        {renderTable(filteredData)}
                    </ScrollArea>
                </CardContent>
            </Card>

            <CupDetailsModal
                cup={selectedCupForDetail}
                open={isCupModalOpen}
                onOpenChange={setIsCupModalOpen}
                executionDetails={executionDetails}
            />

            <CommentModal
              open={isCommentModalOpen}
              onOpenChange={setIsCommentModalOpen}
              initialComment={currentCupForComment ? comments[currentCupForComment] || '' : ''}
              onSave={handleSaveComment}
            />
        </>
    );
};

export default DiscountMatrix;

    