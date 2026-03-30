"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, DownloadCloud, Landmark, User, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "../ui/textarea";
import { generateReportAnalysis, type ReportAnalysisInput } from "@/ai/flows/generate-report-analysis-flow";
import { descargarInformeSeniorPDF, generarURLInformeSeniorPDF, type InformeDatosSenior, type MonthlyRow, type QuarterlyRow } from "@/lib/pdf-definitions";

async function loadImageAsBase64(url: string): Promise<string> {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    } catch (e) { return ""; }
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
    toast({ title: "Generando Informe Senior...", description: "Redactando informe anual de 12 páginas (Arial)." });

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

        const analysis = await generateReportAnalysis({
            prestador: data.header.ipsNombre,
            nit: data.header.ipsNit,
            metaAnual,
            ejecucionAnual,
            porcentajeCumplimiento: (ejecucionAnual / metaAnual) * 100,
            totalCups,
            referenciaMensual,
            meses: meses.map(m => ({ month: m.month, cups: m.cups, value: m.value })),
            conclusionesAdicionales: conclusions
        });

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
                resumenEjecutivo: analysis.resumenEjecutivo,
                analisisT1: analysis.analisisT1,
                analisisT2: analysis.analisisT2,
                analisisT3: analysis.analisisT3,
                analisisT4: analysis.analisisT4,
                hallazgosClave: analysis.hallazgosClave,
                accionesMejora: analysis.accionesMejora,
                conclusiones: analysis.conclusionesFinales
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
            Informe de Gestión Anual Senior (12 Páginas)
        </CardTitle>
        <CardDescription>Genera el documento oficial con análisis narrativo trimestral y tablas de control.</CardDescription>
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
