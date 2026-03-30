'use server';
/**
 * @fileOverview Flujo de IA Senior para generar la narrativa del Informe de Gestión Anual PGP.
 * Redacción ejecutiva de alto nivel para Dusakawi EPSI siguiendo estrictamente el modelo de 11 secciones.
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
  apiKey: z.string().optional(),
});

const ReportAnalysisOutputSchema = z.object({
  resumenEjecutivo: z.string().describe("Narrativa densa, técnica y corporativa (Sección 1 del modelo)."),
  analisisT1: z.string().describe("Análisis exhaustivo del Trimestre I (Ene-Mar). Mínimo 500 palabras."),
  analisisT2: z.string().describe("Análisis exhaustivo del Trimestre II (Abr-Jun). Mínimo 500 palabras."),
  analisisT3: z.string().describe("Análisis exhaustivo del Trimestre III (Jul-Sep). Mínimo 500 palabras."),
  analisisT4: z.string().describe("Análisis exhaustivo del Trimestre IV (Oct-Dic). Mínimo 500 palabras."),
  hallazgosClave: z.array(z.string()).describe("Sección 10.1: 6 hallazgos financieros y administrativos."),
  accionesMejora: z.array(z.string()).describe("Sección 10.2: 4 acciones correctivas estratégicas."),
  conclusionesFinales: z.string().describe("Sección 11: Cierre institucional sobre eficiencia y sostenibilidad."),
});

export type ReportAnalysisInput = z.infer<typeof ReportAnalysisInputSchema>;
export type ReportAnalysisOutput = z.infer<typeof ReportAnalysisOutputSchema>;

const PROMPT_TEMPLATE = `
Eres el Director Nacional de Gestión del Riesgo en Salud de Dusakawi EPSI. Debes redactar el INFORME DE GESTIÓN ANUAL — VIGENCIA 2025 para el prestador {{{prestador}}} (NIT: {{{nit}}}).

ESTRUCTURA OBLIGATORIA DEL INFORME (PARA 12 PÁGINAS ARIAL 12):

1. RESUMEN EJECUTIVO (Sección 1):
Redacta una narrativa densa. Menciona que la ejecución consolidada de \${{{ejecucionAnual}}} representa el {{{porcentajeCumplimiento}}}% de la meta anual de \${{{metaAnual}}}. Resalta la producción de {{{totalCups}}} actividades como sustento del cierre. Usa terminología como "trazabilidad", "verificabilidad" y "favorabilidad del modelo".

2. ANÁLISIS NARRATIVO POR TRIMESTRE (Secciones 7, 8, 9 y 10):
Genera análisis técnicos profundos de mínimo 800 palabras por cada bloque trimestral (T1, T2, T3, T4).
- Interpreta los datos mensuales:
{{#each meses}}
  * {{month}}: {{cups}} CUPS, Valor ejecutado de \${{value}}.
{{/each}}
- Usa conceptos como "estacionalidad de demanda", "curva de compensación", "mezcla de procedimientos", "morbilidad trazadora" y "presión del gasto unitario".
- Analiza el costo promedio por actividad y cómo los meses pico compensan los valles.

3. HALLAZGOS CLAVE (Sección 10.1): 
Identifica meses pico (como OCTUBRE) y mínimos (como JULIO). Explica la variabilidad mensual consistente con el modelo PGP.

4. ACCIONES DE MEJORA Y CONCLUSIÓN (Secciones 10.2 y 11):
Sugiere tableros de control únicos, actas de conciliación integral que incluyan retenciones y validación cruzada. Finaliza con una recomendación de cierre contractual conciliable.

{{#if conclusionesAdicionales}}
OBSERVACIONES ADICIONALES DEL AUDITOR:
{{{conclusionesAdicionales}}}
{{/if}}

TONO: Altamente institucional, analítico, contundente y con autoridad técnica senior. El informe debe proyectar un detalle equivalente a 12 páginas de texto denso.
`;

export async function generateReportAnalysis(input: ReportAnalysisInput): Promise<ReportAnalysisOutput> {
  try {
    const keyToUse = input.apiKey || process.env.GOOGLE_GENAI_API_KEY || 'AIzaSyB5hgQ6izdIMfHu3psJDgtUFe1LAHjYvls';
    
    const dynamicAi = genkit({
      plugins: [googleAI({ apiKey: keyToUse })],
    });

    const { output } = await dynamicAi.generate({
      model: 'googleai/gemini-2.0-flash',
      prompt: PROMPT_TEMPLATE,
      input: { schema: ReportAnalysisInputSchema, data: input },
      output: { schema: ReportAnalysisOutputSchema },
      config: { temperature: 0.1, maxOutputTokens: 4096 }
    });

    if (!output) throw new Error('El motor de IA no devolvió resultados.');
    return output;
  } catch (error: any) {
    console.error(`Error crítico en redacción senior:`, error);
    throw new Error(`Error en la generación: ${error?.message || 'Fallo de conexión con Gemini'}`);
  }
}
