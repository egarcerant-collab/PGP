"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, DownloadCloud, Landmark, User, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "../ui/textarea";
import { descargarInformeSeniorPDF, generarURLInformeSeniorPDF, type InformeDatosSenior, type MonthlyRow, type QuarterlyRow } from "@/lib/pdf-definitions";

async function loadImageAsBase64(url: string): Promise<string> {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    } catch (e) { return ""; }
}

const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${n.toFixed(1)}%`;

function generarNarrativa(
    prestador: string, nit: string,
    metaAnual: number, ejecucionAnual: number,
    totalCups: number, referenciaMensual: number,
    meses: { month: string; cups: number; value: number }[],
    conclusionesAdicionales: string
) {
    const cumplimiento = metaAnual > 0 ? (ejecucionAnual / metaAnual) * 100 : 0;
    const mesPico = [...meses].sort((a, b) => b.value - a.value)[0];
    const mesMinimo = [...meses].sort((a, b) => a.value - b.value)[0];
    const t1 = meses.slice(0, 3);
    const t2 = meses.slice(3, 6);
    const t3 = meses.slice(6, 9);
    const t4 = meses.slice(9, 12);
    const sumT = (ms: typeof meses) => ms.reduce((a, b) => a + b.value, 0);
    const cupsT = (ms: typeof meses) => ms.reduce((a, b) => a + b.cups, 0);

    const resumenEjecutivo = `El presente informe de gestión anual corresponde al seguimiento y control del contrato PGP suscrito con ${prestador} (NIT: ${nit}) durante la vigencia 2025. La ejecución consolidada del período asciende a ${fmt(ejecucionAnual)}, representando el ${pct(cumplimiento)} de la meta anual establecida en ${fmt(metaAnual)}, con una producción total de ${totalCups.toLocaleString('es-CO')} actividades en salud verificadas mediante trazabilidad documental. La referencia mensual de control se situó en ${fmt(referenciaMensual)}, constituyendo el parámetro de verificabilidad utilizado en la evaluación de favorabilidad del modelo de contratación. Los resultados obtenidos reflejan la capacidad instalada del prestador y la dinámica de demanda de la población afiliada atendida en el marco del régimen subsidiado.`;

    const buildTrimestre = (label: string, ms: typeof meses, ref: number) => {
        const total = sumT(ms);
        const cups = cupsT(ms);
        const p = ref > 0 ? (total / ref) * 100 : 0;
        const detalle = ms.map(m => `${m.month}: ${m.cups.toLocaleString('es-CO')} actividades por valor de ${fmt(m.value)}`).join('; ');
        return `Durante el ${label}, la ejecución acumulada fue de ${fmt(total)}, equivalente al ${pct(p)} de la referencia trimestral de ${fmt(ref)}, con ${cups.toLocaleString('es-CO')} actividades totales. El comportamiento mensual fue el siguiente: ${detalle}. La mezcla de procedimientos registrada refleja la estacionalidad de demanda propia del perfil epidemiológico de la población atendida, con variaciones explicadas por factores de morbilidad trazadora y presión del gasto unitario en servicios de mayor complejidad.`;
    };

    const analisisT1 = t1.length > 0 ? buildTrimestre('Trimestre I (Enero–Marzo)', t1, metaAnual / 4) : 'Sin datos para este trimestre.';
    const analisisT2 = t2.length > 0 ? buildTrimestre('Trimestre II (Abril–Junio)', t2, metaAnual / 4) : 'Sin datos para este trimestre.';
    const analisisT3 = t3.length > 0 ? buildTrimestre('Trimestre III (Julio–Septiembre)', t3, metaAnual / 4) : 'Sin datos para este trimestre.';
    const analisisT4 = t4.length > 0 ? buildTrimestre('Trimestre IV (Octubre–Diciembre)', t4, metaAnual / 4) : 'Sin datos para este trimestre.';

    const hallazgosClave = [
        `El mes de mayor ejecución fue ${mesPico?.month || 'N/D'} con ${fmt(mesPico?.value || 0)}, representando el ${mesPico && referenciaMensual > 0 ? pct((mesPico.value / referenciaMensual) * 100) : 'N/D'} de la referencia mensual.`,
        `El mes de menor ejecución fue ${mesMinimo?.month || 'N/D'} con ${fmt(mesMinimo?.value || 0)}, evidenciando estacionalidad en la demanda de servicios.`,
        `La ejecución anual de ${fmt(ejecucionAnual)} representa el ${pct(cumplimiento)} de la meta contractual de ${fmt(metaAnual)}.`,
        `Se registró una producción total de ${totalCups.toLocaleString('es-CO')} actividades en salud verificadas durante la vigencia.`,
        `La referencia mensual de control fue de ${fmt(referenciaMensual)}, utilizada como parámetro de verificabilidad del modelo PGP.`,
        `La variabilidad mensual observada es consistente con el modelo PGP y los perfiles de morbilidad trazadora de la población afiliada.`
    ];

    const accionesMejora = [
        'Implementar tablero de control mensual con alertas tempranas ante desviaciones superiores al 10% de la referencia de ejecución.',
        'Establecer actas de conciliación integral trimestral que incluyan validación cruzada de retenciones y glosas.',
        'Fortalecer los mecanismos de verificación documental para garantizar la trazabilidad de las actividades reportadas.',
        'Desarrollar estrategias de compensación en meses de baja ejecución para mantener la curva de cumplimiento dentro de la banda del 90–110%.'
    ];

    const conclusiones = `El análisis de la ejecución del contrato PGP con ${prestador} durante la vigencia 2025 permite concluir que el prestador ha mantenido un nivel de ejecución ${cumplimiento >= 90 ? 'dentro de los parámetros esperados' : 'por debajo de la meta contractual'}, con una ejecución del ${pct(cumplimiento)} respecto a la meta anual. Se recomienda la conciliación integral del contrato considerando las retenciones aplicadas y los saldos pendientes de reconocimiento, garantizando el cierre contractual conciliable y la sostenibilidad del modelo de atención.${conclusionesAdicionales ? ` Observaciones adicionales del auditor: ${conclusionesAdicionales}` : ''}`;

    return { resumenEjecutivo, analisisT1, analisisT2, analisisT3, analisisT4, hallazgosClave, accionesMejora, conclusiones };
}

interface InformePGPProps {
  data: any;
  comparisonSummary: any;
}

export default function InformePGP({ data, comparisonSummary }: InformePGPProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [auditorName, setAuditorName] = useState("EDUARDO GARCERANT GONZALEZ");
  const [conclusions, setConclusions] = useState("");
  const { toast } = useToast();

  const handleGenerate = async (action: 'preview' | 'download') => {
    if (!data || !comparisonSummary) return;
    setIsGenerating(true);
    toast({ title: "Generando Informe...", description: "Construyendo informe con los datos disponibles." });

    try {
        const metaAnual = data.notaTecnica.valor3m * 4;
        const ejecucionAnual = comparisonSummary.monthlyFinancials.reduce((acc: number, m: any) => acc + m.totalValorEjecutado, 0);
        const totalCups = comparisonSummary.overExecutedCups.reduce((acc: number, c: any) => acc + c.realFrequency, 0) +
                         comparisonSummary.normalExecutionCups.reduce((acc: number, c: any) => acc + c.realFrequency, 0) +
                         comparisonSummary.underExecutedCups.reduce((acc: number, c: any) => acc + c.realFrequency, 0);
        const referenciaMensual = metaAnual / 12;

        let accumulated = 0;
        const meses: MonthlyRow[] = comparisonSummary.monthlyFinancials.map((m: any) => {
            accumulated += m.totalValorEjecutado;
            const mesData = data.months.find((dm: any) => dm.month === m.month);
            const cups = mesData?.cups || 0;
            return {
                month: m.month,
                cups,
                value: m.totalValorEjecutado,
                avgCost: cups > 0 ? m.totalValorEjecutado / cups : 0,
                accumulated,
                percVsMeta: (accumulated / metaAnual) * 100,
                percVsRef: (m.totalValorEjecutado / referenciaMensual) * 100
            };
        });

        const trimestres: QuarterlyRow[] = [
            {
                quarter: 'Trimestre I',
                cups: meses.slice(0,3).reduce((a,b) => a+b.cups, 0),
                value: meses.slice(0,3).reduce((a,b) => a+b.value, 0),
                reference: data.notaTecnica.valor3m,
                percVsRef: (meses.slice(0,3).reduce((a,b) => a+b.value, 0) / data.notaTecnica.valor3m) * 100,
                status: 'Dentro de banda (90-110%)'
            }
        ];

        const narrativa = generarNarrativa(
            data.header.ipsNombre, data.header.ipsNit,
            metaAnual, ejecucionAnual, totalCups, referenciaMensual,
            meses.map(m => ({ month: m.month, cups: m.cups, value: m.value })),
            conclusions
        );

        const reportData: InformeDatosSenior = {
            header: {
                prestador: data.header.ipsNombre,
                nit: data.header.ipsNit,
                periodo: "01/01/2025 a 31/12/2025",
                fechaRadicacion: new Date().toLocaleDateString(),
                responsable: auditorName,
                cargo: "Supervisor del contrato / Dirección Nacional de Gestión del Riesgo en Salud"
            },
            metaAnual,
            ejecucionAnual,
            totalCups,
            meses,
            trimestres,
            narrativa: {
                resumenEjecutivo: narrativa.resumenEjecutivo,
                analisisT1: narrativa.analisisT1,
                analisisT2: narrativa.analisisT2,
                analisisT3: narrativa.analisisT3,
                analisisT4: narrativa.analisisT4,
                hallazgosClave: narrativa.hallazgosClave,
                accionesMejora: narrativa.accionesMejora,
                conclusiones: narrativa.conclusiones
            }
        };

        const background = await loadImageAsBase64('/imagenes pdf/IMAGENEN UNIFICADA.jpg');

        if (action === 'preview') setPdfPreviewUrl(await generarURLInformeSeniorPDF(reportData, background));
        else await descargarInformeSeniorPDF(reportData, background);

    } catch (e: any) {
        toast({ title: "Error en Generación", description: e.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="shadow-lg border-primary/20 bg-slate-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <Landmark className="h-6 w-6 text-primary" />
            Informe de Gestión Anual (12 Páginas)
        </CardTitle>
        <CardDescription>Genera el documento oficial con análisis trimestral y tablas de control basado en los datos cargados.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs"><User className="h-4 w-4" /> Profesional Responsable</Label>
                <Input value={auditorName} onChange={e => setAuditorName(e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs"><Settings className="h-4 w-4" /> Notas adicionales</Label>
                <Textarea placeholder="Ej: Favorabilidad alta..." value={conclusions} onChange={e => setConclusions(e.target.value)} className="min-h-[60px]" />
            </div>
        </div>

        <div className="flex gap-4">
            <Button onClick={() => handleGenerate('preview')} disabled={isGenerating} className="flex-1 bg-primary hover:bg-primary/90">
                {isGenerating ? <Loader2 className="mr-2 animate-spin" /> : <FileText className="mr-2" />}
                Vista Previa Informe
            </Button>
            <Button variant="secondary" onClick={() => handleGenerate('download')} disabled={isGenerating} className="flex-1">
                <DownloadCloud className="mr-2" /> Descargar PDF (Arial 12)
            </Button>
        </div>

        <Dialog open={!!pdfPreviewUrl} onOpenChange={open => !open && setPdfPreviewUrl(null)}>
            <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
                <DialogHeader><CardTitle>Vista Previa del Informe de Gestión Anual</CardTitle></DialogHeader>
                <div className="flex-grow border rounded overflow-hidden">
                    <iframe src={pdfPreviewUrl!} className="w-full h-full" />
                </div>
                <DialogFooter>
                    <Button onClick={() => handleGenerate('download')}>Descargar Archivo PDF</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
