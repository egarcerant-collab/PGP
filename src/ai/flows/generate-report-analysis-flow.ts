'use server';
/**
 * @fileOverview Flujo de IA Senior para generar la narrativa del Informe de Gestión Anual PGP.
 * Redacción ejecutiva de alto nivel para Dusakawi EPSI siguiendo el modelo de 12 páginas.
 */

import { ai } from '@/ai/genkit';
import { z, genkit } from 'genkit';
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
  apiKey: z.string().optional().describe("Clave API de Google AI."),
});

const ReportAnalysisOutputSchema = z.object({
  resumenEjecutivo: z.string().describe("Narrativa densa, técnica y corporativa sobre la favorabilidad del modelo PGP."),
  analisisT1: z.string().describe("Análisis exhaustivo y detallado del Trimestre I (Ene-Mar). Mínimo 4 párrafos de 10 líneas cada uno."),
  analisisT2: z.string().describe("Análisis exhaustivo y detallado del Trimestre II (Abr-Jun). Mínimo 4 párrafos de 10 líneas cada uno."),
  analisisT3: z.string().describe("Análisis exhaustivo y detallado del Trimestre III (Jul-Sep). Mínimo 4 párrafos de 10 líneas cada uno."),
  analisisT4: z.string().describe("Análisis exhaustivo y detallado del Trimestre IV (Oct-Dic). Mínimo 4 párrafos de 10 líneas cada uno."),
  hallazgosClave: z.array(z.string()).describe("Lista de 6 hallazgos financieros y administrativos de alto impacto."),
  accionesMejora: z.array(z.string()).describe("Lista de 4 acciones correctivas estratégicas para la vigencia futura."),
  conclusionesFinales: z.string().describe("Cierre institucional sobre la eficiencia y sostenibilidad del contrato."),
});

export type ReportAnalysisInput = z.infer<typeof ReportAnalysisInputSchema>;
export type ReportAnalysisOutput = z.infer<typeof ReportAnalysisOutputSchema>;

const PROMPT_TEMPLATE = `
Eres el Director Nacional de Gestión del Riesgo en Salud de Dusakawi EPSI. Debes redactar el INFORME DE GESTIÓN ANUAL — VIGENCIA 2025 para el prestador {{{prestador}}} (NIT: {{{nit}}}).

ESTRUCTURA OBLIGATORIA DEL INFORME (PARA REDACCIÓN DE 12 PÁGINAS):

1. RESUMEN EJECUTIVO: Define la favorabilidad del modelo PGP. Menciona que la ejecución consolidada de $ {{{ejecucionAnual}}} representa el {{{porcentajeCumplimiento}}}% de la meta anual de $ {{{metaAnual}}}. Resalta la producción de {{{totalCups}}} actividades como sustento del cierre.

2. ANÁLISIS POR TRIMESTRE (T1, T2, T3, T4):
Genera análisis técnicos profundos de mínimo 500 palabras por cada bloque trimestral.
- Usa terminología como "estacionalidad de demanda", "curva de compensación", "mezcla de procedimientos" y "morbilidad trazadora".
- Interpreta los datos mensuales:
{{#each meses}}
  * {{month}}: {{cups}} CUPS, Valor ejecutado de $ {{value}}.
{{/each}}

3. HALLAZGOS CLAVE: Identifica los meses pico y mínimos. Explica por qué la variabilidad es consistente con el modelo PGP y cómo se compensa en el acumulado anual.

4. ACCIONES DE MEJORA Y CONCLUSIÓN: Sugiere tableros de control únicos y actas de conciliación integral que incluyan retenciones y saldos netos. Finaliza con una recomendación de cierre contractual conciliable.

{{#if conclusionesAdicionales}}
OBSERVACIONES ADICIONALES DEL AUDITOR:
{{{conclusionesAdicionales}}}
{{/if}}

TONO: Altamente institucional, analítico, contundente y con autoridad técnica. El informe debe proyectar una extensión y detalle equivalente a 12 páginas de texto denso.
`;

export async function generateReportAnalysis(input: ReportAnalysisInput): Promise<ReportAnalysisOutput> {
  try {
    // Si hay una API Key, usamos una instancia local para evitar el error de 'undefined' model
    if (input.apiKey) {
      const dynamicAi = genkit({
        plugins: [googleAI({ apiKey: input.apiKey })],
      });

      const { output } = await dynamicAi.generate({
        model: 'googleai/gemini-1.5-flash',
        prompt: PROMPT_TEMPLATE,
        input: { schema: ReportAnalysisInputSchema, data: input },
        output: { schema: ReportAnalysisOutputSchema },
        config: { temperature: 0.1, maxOutputTokens: 4096 }
      });

      if (!output) throw new Error('El motor de IA no devolvió resultados con la clave proporcionada.');
      return output;
    }

    // Si no hay API Key, usamos el prompt global (fallará si no hay GOOGLE_GENAI_API_KEY en el servidor)
    const seniorReportPrompt = ai.definePrompt({
      name: 'seniorReportPrompt',
      model: 'googleai/gemini-1.5-flash',
      input: { schema: ReportAnalysisInputSchema },
      output: { schema: ReportAnalysisOutputSchema },
      config: { temperature: 0.1, maxOutputTokens: 4096 },
      prompt: PROMPT_TEMPLATE,
    });

    const { output } = await seniorReportPrompt(input);
    if (!output) throw new Error('La IA no pudo procesar la solicitud.');
    return output;
  } catch (error: any) {
    console.error(`Error crítico en redacción senior:`, error);
    const errorMessage = error?.message || 'Error de conexión con el motor de IA.';
    throw new Error(`${errorMessage}. Verifique que su API Key sea válida y tenga cuota disponible.`);
  }
}
