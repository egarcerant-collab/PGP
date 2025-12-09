"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import html2canvas from "html2canvas";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, TrendingUp, Info, Activity, Stamp, Loader2, DownloadCloud, X, BarChart2, Edit } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { descargarInformePDF, type InformeDatos, generarURLInformePDF } from "@/lib/pdf-definitions";
import type { DeviatedCupInfo, UnexpectedCupInfo, AdjustedData, ReportData as ReportDataType } from "@/components/pgp-search/PgPsearchForm";
import { generateReportAnalysis, type ReportAnalysisInput, ReportAnalysisOutput } from "@/ai/flows/generate-report-analysis-flow";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";

// ======= Tipos =======
export interface MonthExecution {
  month: string;
  cups: number; // cantidad (no dinero)
  valueCOP: number; // valor ejecutado COP
}

export interface ReportHeader {
  empresa: string;
  nit: string;
  ipsNombre: string;
  ipsNit: string;
  municipio: string;
  contrato: string;
  vigencia: string;
  ciudad?: string;
  fecha?: string; // DD/MM/AAAA
  logoEpsiUrl?: string; // opcional: URL o dataURI
  logoIpsUrl?: string; // opcional: URL o dataURI
  responsable1?: { nombre: string; cargo: string };
  responsable2?: { nombre: string; cargo: string };
  responsable3?: { nombre: string; cargo: string };
}

export interface ReportData extends ReportDataType {}



const EditableTextsModal = ({
    open,
    onOpenChange,
    onSave,
    initialConclusions,
    initialRecommendations,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (conclusions: string, recommendations: string) => void;
    initialConclusions: string;
    initialRecommendations: string;
}) => {
    const [conclusions, setConclusions] = useState(initialConclusions);
    const [recommendations, setRecommendations] = useState(initialRecommendations);

    useEffect(() => {
        if(open) {
            setConclusions(initialConclusions);
            setRecommendations(initialRecommendations);
        }
    }, [open, initialConclusions, initialRecommendations]);

    const handleSave = () => {
        onSave(conclusions, recommendations);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Editar Conclusiones y Recomendaciones</DialogTitle>
                    <DialogDescription>
                        Añade o modifica el análisis final que aparecerá en el informe PDF.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="conclusions-text">Conclusiones Adicionales</Label>
                        <Textarea
                            id="conclusions-text"
                            value={conclusions}
                            onChange={(e) => setConclusions(e.target.value)}
                            placeholder="Escribe tus conclusiones finales aquí..."
                            className="min-h-[150px]"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="recommendations-text">Recomendaciones Adicionales</Label>
                        <Textarea
                            id="recommendations-text"
                            value={recommendations}
                            onChange={(e) => setRecommendations(e.target.value)}
                            placeholder="Escribe tus recomendaciones finales aquí..."
                            className="min-h-[150px]"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave}>Guardar Textos</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


// ======= Utilidades =======
const formatCOP = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

async function loadImageAsBase64(url: string): Promise<string> {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Network response was not ok for ${url}`);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.warn(`Could not load image from ${url}:`, error);
        return ""; // Devuelve una cadena vacía si hay un error
    }
}

// ======= Componente (fusionado y reforzado) =======
export default function InformePGP({ data }: { data?: ReportData | null }) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const { toast } = useToast();
  const [conclusions, setConclusions] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const financialChartRef = useRef<HTMLDivElement>(null);
  const cupsChartRef = useRef<HTMLDivElement>(null);
  
  // Derivados y KPIs
  const sumaMensual = useMemo(() => data?.months.reduce((acc, m) => acc + m.valueCOP, 0) ?? 0, [data?.months]);
  const totalCups = useMemo(() => data?.months.reduce((a, m) => a + m.cups, 0) ?? 0, [data?.months]);
  
  const descuentoAplicadoTotal = useMemo(() => data?.notaTecnica?.descuentoAplicado ?? 0, [data?.notaTecnica]);
  
  const valorNetoFinalAuditoria = useMemo(() => data?.notaTecnica?.totalPagar ?? 0, [data]);

  const diffVsNota = useMemo(() => valorNetoFinalAuditoria - (data?.notaTecnica?.valor3m || 0), [data?.notaTecnica?.valor3m, valorNetoFinalAuditoria]);
  
  const unitAvg = useMemo(() => {
    if (!data || !data.months || data.months.length === 0 || totalCups === 0) return 0;
    const mean = valorNetoFinalAuditoria / totalCups;
    return Number.isFinite(mean) ? mean : 0;
  }, [data?.months, valorNetoFinalAuditoria, totalCups]);

  const valorNotaTecnica = useMemo(() => data?.notaTecnica?.valor3m || 0, [data]);

  const porcentajeEjecucion = useMemo(() => (valorNotaTecnica > 0 ? (valorNetoFinalAuditoria / valorNotaTecnica) * 100 : 0), [valorNetoFinalAuditoria, valorNotaTecnica]);


    const reportTitle = useMemo(() => {
    if (!data || !data.months || data.months.length === 0) {
      return "INFORME PGP";
    }

    const numMonths = data.months.length;
    const monthNames = data.months.map(m => m.month.substring(0, 3)).join('–');

    switch (numMonths) {
      case 1:
        return `INFORME PGP – MENSUAL (${monthNames})`;
      case 2:
        return `INFORME PGP – BIMESTRAL (${monthNames})`;
      case 3:
        return `INFORME PGP – TRIMESTRAL (${monthNames})`;
      default:
        return `INFORME PGP – PERIODO (${monthNames})`;
    }
  }, [data]);


  // Series para gráficas
  const pieData = useMemo(() => data?.months.map((m) => ({ name: m.month, value: m.valueCOP, fill: `hsl(var(--chart-${data.months.indexOf(m) + 1}))` })) ?? [], [data?.months]);
  const cupsData = useMemo(() => data?.months.map((m) => ({ Mes: m.month, CUPS: m.cups })) ?? [], [data?.months]);
  
  const financialData = useMemo(() => {
    if (!data || !data.months.length) return [];
    const budgetPerMonth = (data.notaTecnica?.valor3m || 0) / data.months.length;
    return data.months.map(m => ({
        Mes: m.month,
        'Valor Ejecutado': m.valueCOP,
        'Valor Presupuestado': budgetPerMonth
    }))
  }, [data]);



  const getInformeData = (reportData: ReportData, charts: { [key: string]: string }, analysisTexts: ReportAnalysisOutput, auditorConclusions: string, auditorRecommendations: string): InformeDatos => {
    
    const periodoAnalizado = reportTitle.split('–')[1]?.trim() || 'Periodo Analizado';

    // **CRITICAL CHANGE**: Use pre-calculated KPIs instead of recalculating.
    const kpisUnsorted = [
      { label: 'Valor Ejecutado (Bruto)', value: formatCOP(sumaMensual) },
      { label: 'Descuento Aplicado (Auditoría)', value: formatCOP(descuentoAplicadoTotal), color: 'red' },
      { label: 'Valor Final a Pagar (Post-Auditoría)', value: formatCOP(valorNetoFinalAuditoria), bold: true },
      { label: 'Diferencia vs. Presupuesto', value: formatCOP(diffVsNota) },
      { label: 'Porcentaje de Ejecución Final', value: `${porcentajeEjecucion.toFixed(2)}%` },
      { label: 'Total CUPS Ejecutados', value: totalCups.toLocaleString('es-CO') },
      { label: 'Costo Unitario Promedio (Post-Auditoría)', value: formatCOP(unitAvg) },
    ];

     const kpis = [
        ...kpisUnsorted,
        { label: 'Nota Técnica (Presupuesto)', value: formatCOP(valorNotaTecnica) }
     ];


    const topOverExecuted = (reportData.overExecutedCups ?? [])
        .sort((a,b) => b.deviation - a.deviation)
        .slice(0, 5);

    const topUnexpected = (reportData.unexpectedCups ?? [])
        .sort((a, b) => b.realFrequency - a.realFrequency)
        .slice(0, 5);
    
    const adjustmentsForPdf = Object.entries(reportData.adjustedData?.comments || {})
      .map(([cup, comment]) => {
        const deviatedCup = reportData.overExecutedCups?.find(c => c.cup === cup);
        if (!deviatedCup || !comment) return null;

        const validatedQty = reportData.adjustedData?.adjustedQuantities[cup] ?? deviatedCup.realFrequency;
        
        return {
          cup: cup,
          description: deviatedCup.description || 'N/A',
          originalQty: deviatedCup.realFrequency,
          validatedQty: validatedQty,
          adjustmentValue: reportData.adjustedData?.adjustedValues[cup] || 0,
          comment: comment,
        };
      })
      .filter(Boolean) as InformeDatos['ajustesGlosas'];


    return {
        titulo: `INFORME PGP: ${reportData.header.ipsNombre}`,
        subtitulo: `Auditoría para: ${reportData.header.empresa}`,
        referencia: `Contrato: ${reportData.header.contrato} | Vigencia: ${reportData.header.vigencia} | Período Analizado: ${periodoAnalizado}`,
        objetivos: [
            'Evaluar la eficiencia en la ejecución de los recursos asignados bajo el modelo de Pago Global Prospectivo (PGP), contrastando el gasto real con la proyección actuarial de la nota técnica, para garantizar la sostenibilidad financiera y la disciplina presupuestal del acuerdo.',
            'Analizar el comportamiento epidemiológico y el perfil de morbilidad de la población adscrita a través del volumen, tipo y frecuencia de los servicios (CUPS) prestados, con el fin de identificar tendencias, necesidades de salud emergentes y posibles desviaciones respecto al perfil de riesgo inicial.',
            'Verificar el cumplimiento de las metas contractuales y la alineación con las bandas de riesgo técnico (90% - 110%), proveyendo un fundamento cuantitativo y cualitativo para la toma de decisiones gerenciales, ajustes operativos y la validación de los actos administrativos de pago y liquidación trimestral.',
            'Proporcionar un análisis integral que sirva como insumo estratégico para la planeación de futuros periodos contractuales, permitiendo ajustar la nota técnica y las intervenciones de salud a las realidades observadas en la ejecución del servicio.',
        ],
        kpis,
        analisis: [
            { 
              title: 'Análisis de Ejecución Financiera y Presupuestal', 
              chartImage: charts.financial,
              text: analysisTexts.financialAnalysis,
            },
            { 
              title: 'Análisis del Comportamiento Epidemiológico y de Servicios (CUPS)', 
              chartImage: charts.cups,
              text: analysisTexts.epidemiologicalAnalysis,
            },
            {
              title: 'Análisis de Desviaciones: CUPS Sobre-ejecutados e Inesperados',
              text: analysisTexts.deviationAnalysis,
            },
        ],
        topOverExecuted,
        topUnexpected,
        ajustesGlosas: adjustmentsForPdf,
        auditorConclusions: auditorConclusions,
        auditorRecommendations: auditorRecommendations,
        ciudad: reportData.header.ciudad ?? '',
        fecha: reportData.header.fecha ?? '',
        firmas: [
            reportData.header.responsable1 ?? { nombre: '________________', cargo: '________________' },
            reportData.header.responsable2 ?? { nombre: '________________', cargo: '________________' },
            reportData.header.responsable3 ?? { nombre: '________________', cargo: '________________' },
        ]
    };
  }

  // Exportación a PDF con pdfmake
  const handleGeneratePdf = async (action: 'preview' | 'download') => {
    if (!data || !comparisonSummary) return;
    setIsGeneratingPdf(true);
    if(action === 'preview') setPdfPreviewUrl(null);

    toast({ title: 'Generando informe...', description: 'La IA está redactando el análisis. Esto puede tardar un momento.' });

    try {
        const totalValueOverExecuted = comparisonSummary.overExecutedCups.reduce((sum, cup) => sum + cup.deviationValue, 0);
        const totalValueUnexpected = comparisonSummary.unexpectedCups.reduce((sum, cup) => sum + cup.totalValue, 0);
        const totalValueUnderExecuted = comparisonSummary.underExecutedCups.reduce((sum, cup) => sum + cup.deviationValue, 0);
        const totalValueMissing = comparisonSummary.missingCups.reduce((sum, cup) => sum + cup.deviationValue, 0);


        const analysisInput: ReportAnalysisInput = {
            sumaMensual,
            valorNotaTecnica,
            diffVsNota,
            porcentajeEjecucion,
            totalCups,
            unitAvg,
            overExecutedCount: data.overExecutedCups?.length ?? 0,
            unexpectedCount: data.unexpectedCups?.length ?? 0,
            valorNetoFinal: valorNetoFinalAuditoria,
            descuentoAplicado: descuentoAplicadoTotal,
            additionalConclusions: conclusions,
            additionalRecommendations: recommendations,
            totalValueOverExecuted,
            totalValueUnexpected,
            totalValueUnderExecuted,
            totalValueMissing,
        };

        const analysisTexts = await generateReportAnalysis(analysisInput);

        toast({ title: 'Análisis completo.', description: 'Generando gráficos y PDF.' });

        const backgroundImage = await loadImageAsBase64('/imagenes pdf/IMAGENEN UNIFICADA.jpg');

        const getChartImage = async (ref: React.RefObject<HTMLDivElement>) => {
            if (ref.current) {
                const canvas = await html2canvas(ref.current, { backgroundColor: '#FFFFFF', scale: 2 });
                return canvas.toDataURL('image/png');
            }
            return '';
        };
        
        const chartImages = {
            financial: await getChartImage(financialChartRef),
            cups: await getChartImage(cupsChartRef),
        };

        const informeData = getInformeData(data, chartImages, analysisTexts, conclusions, recommendations);
        
        if(action === 'preview') {
            const url = await generarURLInformePDF(informeData, backgroundImage);
            setPdfPreviewUrl(url);
        } else if (action === 'download') {
            await descargarInformePDF(informeData, backgroundImage);
            setPdfPreviewUrl(null); // Cierra el modal si estaba abierto
        }

    } catch (error: any) {
        console.error("Error generating PDF:", error);
        toast({ title: 'Error al generar el informe', description: error.message, variant: 'destructive' });
    } finally {
        setIsGeneratingPdf(false);
    }
  };

  if (!data || !pieData.length) {
    return null;
  }
  
  const financialChartConfig = {
      'Valor Ejecutado': {
          label: "Valor Ejecutado",
          color: "hsl(var(--chart-2))",
      },
      'Valor Presupuestado': {
          label: "Valor Presupuestado",
          color: "hsl(var(--chart-1))",
      }
  } satisfies React.ComponentProps<typeof ChartContainer>["config"];

  const cupsChartConfig = {
      CUPS: {
          label: "CUPS",
          color: "hsl(var(--accent))",
      },
  } satisfies React.ComponentProps<typeof ChartContainer>["config"];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Generación de Informe Ejecutivo PDF</CardTitle>
           <CardDescription>
                Genera un informe PDF completo con análisis de IA y tus conclusiones personalizadas.
            </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
             <Button variant="outline" onClick={() => setIsEditModalOpen(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Editar Conclusiones y Recomendaciones
            </Button>
            <Button id="generate-pdf-report-button" variant="default" onClick={() => handleGeneratePdf('preview')} disabled={isGeneratingPdf}>
                {isGeneratingPdf ? <Loader2 className="h-4 w-4 mr-1 animate-spin"/> : <DownloadCloud className="h-4 w-4 mr-1"/>}
                Generar Informe PDF
            </Button>
        </CardContent>
      </Card>
      
      <Card>
            <CardHeader>
                <CardTitle>Resumen Gráfico del Periodo</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-8">
                <div className="space-y-2">
                    <h3 className="text-center font-semibold text-sm">Ejecución Financiera Mensual</h3>
                     <ChartContainer config={financialChartConfig} className="min-h-[250px] w-full">
                        <ResponsiveContainer width="100%" height={250}>
                           <BarChart data={financialData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="Mes" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => {
                                      const num = value as number;
                                      if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
                                      if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
                                      return num.toString();
                                }} />
                                <ChartTooltip
                                    cursor={false}
                                    content={<ChartTooltipContent indicator="dot" formatter={(value) => formatCOP(value as number)} />}
                                />
                                <Bar dataKey="Valor Presupuestado" fill="var(--color-Valor Presupuestado)" radius={4} />
                                <Bar dataKey="Valor Ejecutado" fill="var(--color-Valor Ejecutado)" radius={4} />
                                <ChartLegend content={<ChartLegendContent />} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </div>
                 <div className="space-y-2">
                    <h3 className="text-center font-semibold text-sm">Volumen de CUPS Mensual</h3>
                    <ChartContainer config={cupsChartConfig} className="min-h-[250px] w-full">
                        <ResponsiveContainer width="100%" height={250}>
                             <BarChart data={cupsData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="Mes" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => value.toLocaleString('es-CO')} />
                                <ChartTooltip
                                    cursor={{ fill: 'hsl(var(--muted))' }}
                                    formatter={(value) => `${(value as number).toLocaleString('es-CO')} CUPS`}
                                    content={<ChartTooltipContent />}
                                />
                                <Bar dataKey="CUPS" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </div>
            </CardContent>
        </Card>

       <Dialog open={!!pdfPreviewUrl} onOpenChange={(isOpen) => !isOpen && setPdfPreviewUrl(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Vista Previa del Informe</DialogTitle>
          </DialogHeader>
          <div className="flex-grow border rounded-md overflow-hidden">
            {pdfPreviewUrl && (
              <iframe src={pdfPreviewUrl} className="w-full h-full" title="Vista previa del PDF" />
            )}
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setPdfPreviewUrl(null)}>Cerrar</Button>
            <Button onClick={() => handleGeneratePdf('download')} disabled={isGeneratingPdf}>
              {isGeneratingPdf ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <DownloadCloud className="h-4 w-4 mr-1" />}
              Descargar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <EditableTextsModal
            open={isEditModalOpen}
            onOpenChange={setIsEditModalOpen}
            initialConclusions={conclusions}
            initialRecommendations={recommendations}
            onSave={(newConclusions, newRecommendations) => {
                setConclusions(newConclusions);
                setRecommendations(newRecommendations);
            }}
        />
      
      {/* Hidden container for rendering charts for PDF */}
      <div className="absolute -left-[9999px] top-0 w-[600px] space-y-8 bg-white p-4">
          <section ref={financialChartRef}>
             <h3 className="text-center font-semibold text-sm mb-2">Ejecución Financiera Mensual</h3>
            <div className="h-60">
              <ChartContainer config={financialChartConfig} className="min-h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={financialData}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="Mes"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                        tickFormatter={(value) => formatCOP(value as number)}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent indicator="dot" />}
                      />
                      <Bar
                        dataKey="Valor Presupuestado"
                        fill="#3b82f6"
                        radius={4}
                      />
                      <Bar
                        dataKey="Valor Ejecutado"
                        fill="#16a34a"
                        radius={4}
                      />
                      <ChartLegend content={<ChartLegendContent />} />
                    </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </section>
           <section ref={cupsChartRef}>
            <h3 className="text-center font-semibold text-sm mb-2">Volumen de CUPS Mensual</h3>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cupsData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="Mes" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => `${(value as number).toLocaleString('es-CO')} CUPS`} />
                  <Bar dataKey="CUPS" fill="#8884d8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
      </div>

    </div>
  );
}
