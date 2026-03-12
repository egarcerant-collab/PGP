'use server';
/**
 * @fileOverview Flujo de IA Senior para generar la narrativa del Informe de Gestión Anual PGP.
 * Redacción ejecutiva para Dusakawi EPSI - Territorio La Guajira.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const MonthlyDataSchema = z.object({
  month: z.string(),
  cups: z.number(),
  value: z.number(),
});

const ReportAnalysisInputSchema = z.object({
  prestador: z.string(),
  nit: z.string(),
  metaAnual: z.number(),
  ejecucionAnual: z.number(),
  porcentajeCumplimiento: z.number(),
  totalCups: z.number(),
  meses: z.array(MonthlyDataSchema),
  conclusionesAdicionales: z.string().optional(),
});

const ReportAnalysisOutputSchema = z.object({
  resumenEjecutivo: z.string(),
  analisisT1: z.string(),
  analisisT2: z.string(),
  analisisT3: z.string(),
  analisisT4: z.string(),
  hallazgosClave: z.array(z.string()),
  accionesMejora: z.array(z.string()),
  conclusionesFinales: z.string(),
});

export type ReportAnalysisInput = z.infer<typeof ReportAnalysisInputSchema>;
export type ReportAnalysisOutput = z.infer<typeof ReportAnalysisOutputSchema>;

const seniorReportPrompt = ai.definePrompt({
  name: 'seniorReportPrompt',
  input: { schema: ReportAnalysisInputSchema },
  output: { schema: ReportAnalysisOutputSchema },
  prompt: `
Eres el Director Nacional de Gestión del Riesgo en Salud de Dusakawi EPSI. Debes redactar el Informe de Gestión Anual 2025 para el prestador {{{prestador}}} (NIT: {{{nit}}}).

DATOS CLAVE DEL EJERCICIO:
- Meta Anual PGP: {{{metaAnual}}}
- Ejecución Real Consolidada: {{{ejecucionAnual}}} ({{{porcentajeCumplimiento}}}%)
- Producción Total: {{{totalCups}}} actividades/CUPS atendidas.

INSTRUCCIONES DE REDACCIÓN (ESTILO EJECUTIVO SENIOR):
1. Usa un lenguaje técnico, contundente y con autoridad institucional.
2. Genera análisis narrativos profundos para cada trimestre del año.
3. El Resumen Ejecutivo debe ser denso, mencionando la favorabilidad y eficiencia del modelo PGP.
4. Los Hallazgos Clave deben ser puntos directos sobre impacto administrativo y financiero.
5. Las Acciones de Mejora deben ser correctivas y orientadas al control del gasto.
{{#if conclusionesAdicionales}}
6. Integra obligatoriamente estas observaciones técnicas del auditor: {{{conclusionesAdicionales}}}
{{/if}}

Divide la respuesta exactamente en los campos JSON solicitados. Usa el tono de un auditor senior de EPS.
`,
});

export async function generateReportAnalysis(input: ReportAnalysisInput): Promise<ReportAnalysisOutput> {
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    throw new Error("La clave de API de IA no está configurada. Por favor, añádela en los secretos del proyecto.");
  }

  try {
    const cleanInput = {
        ...input,
        porcentajeCumplimiento: Math.round(input.porcentajeCumplimiento * 100) / 100,
        metaAnual: Math.round(input.metaAnual),
        ejecucionAnual: Math.round(input.ejecucionAnual)
    };

    const { output } = await seniorReportPrompt(cleanInput);
    if (!output) throw new Error('La IA no pudo procesar la solicitud.');
    return output;
  } catch (error: any) {
    console.error(`Error crítico en redacción senior:`, error);
    throw new Error(error.message || 'Error desconocido en el servicio de IA.');
  }
}
