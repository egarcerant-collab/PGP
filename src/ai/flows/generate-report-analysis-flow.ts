'use server';
/**
 * @fileOverview Flujo de IA Senior para generar la narrativa del Informe de Gestión Anual PGP.
 * Redacción ejecutiva de alto nivel para Dusakawi EPSI.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

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
  referenciaMensual: z.number(),
  meses: z.array(MonthlyDataSchema),
  conclusionesAdicionales: z.string().optional(),
  apiKey: z.string().optional().describe("Clave API de Google AI opcional."),
});

const ReportAnalysisOutputSchema = z.object({
  resumenEjecutivo: z.string().describe("Narrativa densa, técnica y corporativa sobre la favorabilidad del modelo PGP."),
  analisisT1: z.string().describe("Análisis exhaustivo y detallado del Trimestre I (Ene-Mar). Mínimo 4 párrafos largos."),
  analisisT2: z.string().describe("Análisis exhaustivo y detallado del Trimestre II (Abr-Jun). Mínimo 4 párrafos largos."),
  analisisT3: z.string().describe("Análisis exhaustivo y detallado del Trimestre III (Jul-Sep). Mínimo 4 párrafos largos."),
  analisisT4: z.string().describe("Análisis exhaustivo y detallado del Trimestre IV (Oct-Dic). Mínimo 4 párrafos largos."),
  hallazgosClave: z.array(z.string()).describe("Lista de 6 hallazgos financieros y administrativos de alto impacto."),
  accionesMejora: z.array(z.string()).describe("Lista de 4 acciones correctivas estratégicas para la vigencia futura."),
  conclusionesFinales: z.string().describe("Cierre institucional sobre la eficiencia y sostenibilidad del contrato."),
});

export type ReportAnalysisInput = z.infer<typeof ReportAnalysisInputSchema>;
export type ReportAnalysisOutput = z.infer<typeof ReportAnalysisOutputSchema>;

const seniorReportPrompt = ai.definePrompt({
  name: 'seniorReportPrompt',
  model: 'googleai/gemini-1.5-flash',
  input: { schema: ReportAnalysisInputSchema },
  output: { schema: ReportAnalysisOutputSchema },
  config: {
    temperature: 0.1,
    maxOutputTokens: 4096,
  },
  prompt: `
Eres el Director Nacional de Gestión del Riesgo en Salud de Dusakawi EPSI. Debes redactar el INFORME DE GESTIÓN ANUAL — VIGENCIA 2025 para el prestador {{{prestador}}} (NIT: {{{nit}}}).

DATOS CLAVE DEL CONTRATO:
- Meta Anual Programada: {{{metaAnual}}}
- Ejecución Real Consolidada: {{{ejecucionAnual}}} (Cumplimiento: {{{porcentajeCumplimiento}}}%).
- Referencia Mensual de Gestión (Meta/12): {{{referenciaMensual}}}
- Producción Física: {{{totalCups}}} actividades/CUPS atendidas.

INSTRUCCIONES DE REDACCIÓN (ESTILO EJECUTIVO SENIOR):
1. TONO: Altamente institucional, analítico, contundente y con autoridad técnica. Evita redundancias simples; busca profundidad en la interpretación del dato.
2. ESTRUCTURA: El informe debe proyectar una extensión de 12 páginas. Por ello, genera párrafos extensos y detallados para cada trimestre.
3. RESUMEN EJECUTIVO: Define la favorabilidad del modelo PGP. Menciona que no hay señales de sobreejecución y que la variabilidad es consistente con la estacionalidad de la demanda en Riohacha.
4. ANÁLISIS POR TRIMESTRE: Para cada mes del trimestre, menciona el volumen de actividades, el valor ejecutado y el costo promedio. Interpreta estos datos como una gestión eficiente del riesgo.
5. HALLAZGOS CLAVE: Identifica mes pico en valor y mes pico en volumen. Resalta la capacidad de compensación del modelo.
6. ACCIONES DE MEJORA: Propón un tablero mensual único de indicadores y actas de conciliación integral que incluyan retenciones y saldos netos.

DATOS MENSUALES PARA NARRATIVA:
{{#each meses}}
- {{month}}: {{cups}} CUPS, Valor \${{value}}.
{{/each}}

{{#if conclusionesAdicionales}}
OBSERVACIONES ADICIONALES DEL AUDITOR:
{{{conclusionesAdicionales}}}
{{/if}}

Genera textos profesionales que utilicen terminología como "estacionalidad de demanda", "mezcla de procedimientos", "trazabilidad verificable" y "sostenibilidad contractural".
`,
});

export async function generateReportAnalysis(input: ReportAnalysisInput): Promise<ReportAnalysisOutput> {
  try {
    // Si se proporciona una clave API, la usamos para el modelo dinámicamente
    const model = input.apiKey 
      ? googleAI.model('gemini-1.5-flash', { apiKey: input.apiKey })
      : 'googleai/gemini-1.5-flash';

    const { output } = await seniorReportPrompt(input, { model });
    if (!output) throw new Error('La IA no pudo procesar la solicitud.');
    return output;
  } catch (error: any) {
    console.error(`Error crítico en redacción senior:`, error);
    throw new Error('Error al conectar con el motor de IA. Por favor verifique la clave API.');
  }
}
