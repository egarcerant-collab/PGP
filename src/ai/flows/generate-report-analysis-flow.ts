
'use server';
/**
 * @fileOverview Flujo para generar texto profesional de análisis (financiero, epidemiológico y de desviaciones)
 * en informes PGP, usando IA (Genkit).
 * Autor: Eduardo Garcerant — Dusakawi EPSI
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// =======================
// 🔹 1. Definición de Schemas
// =======================
const ReportAnalysisInputSchema = z.object({
  sumaMensual: z.number().describe("Valor total ejecutado del periodo (vrServicio JSON)."),
  valorNotaTecnica: z.number().describe("Presupuesto establecido en la nota técnica."),
  diffVsNota: z.number().describe("Diferencia entre lo ejecutado y lo presupuestado."),
  porcentajeEjecucion: z.number().describe("Porcentaje de ejecución respecto a la nota técnica."),
  totalCups: z.number().describe("Cantidad total de CUPS ejecutados."),
  unitAvg: z.number().describe("Costo unitario promedio (valor ejecutado / cantidad de CUPS)."),
  overExecutedCount: z.number().describe("CUPS sobre-ejecutados."),
  unexpectedCount: z.number().describe("CUPS no incluidos en la nota técnica."),
  valorNetoFinal: z.number().describe("Valor final a pagar al prestador post auditoría."),
  descuentoAplicado: z.number().describe("Monto total descontado por la auditoría."),
  additionalConclusions: z.string().optional(),
  additionalRecommendations: z.string().optional(),
  totalValueOverExecuted: z.number(),
  totalValueUnexpected: z.number(),
  totalValueUnderExecuted: z.number(),
  totalValueMissing: z.number(),
});

const ReportAnalysisOutputSchema = z.object({
  financialAnalysis: z.string(),
  epidemiologicalAnalysis: z.string(),
  deviationAnalysis: z.string(),
});

export type ReportAnalysisInput = z.infer<typeof ReportAnalysisInputSchema>;
export type ReportAnalysisOutput = z.infer<typeof ReportAnalysisOutputSchema>;

// =======================
// 🔹 2. Prompts Definidos
// =======================

const financialAnalysisPrompt = ai.definePrompt({
  name: 'financialAnalysisPrompt',
  input: { schema: ReportAnalysisInputSchema },
  output: { schema: z.object({ financialAnalysis: ReportAnalysisOutputSchema.shape.financialAnalysis }) },
  prompt: `
Eres un analista financiero y médico auditor experto en el sistema de salud colombiano (PGP).
Redacta el texto para la sección **"Análisis de Ejecución Financiera y Presupuestal"** (1200–1500 caracteres).

**KPIs Financieros (Post Auditoría):**
- Presupuesto (Nota Técnica): {{{valorNotaTecnica}}}
- Valor Total a Pagar (Post Auditoría): {{{valorNetoFinal}}}
- Descuento Total Aplicado: {{{descuentoAplicado}}}
- Diferencia vs Presupuesto: {{{diffVsNota}}}
- Porcentaje de Ejecución Final: {{{porcentajeEjecucion}}}%

{{#if additionalConclusions}}
Conclusiones Adicionales del Auditor: {{{additionalConclusions}}}
{{/if}}

**Instrucciones:**
- Enfatiza que el valor a pagar {{{valorNetoFinal}}} es el resultado final de conciliación.
- Compara con el presupuesto y explica las causas de los ajustes.
- Usa lenguaje ejecutivo, preciso y sin redundancias.
- Concluye con implicaciones financieras del contrato.
`,
});

const epidemiologicalAnalysisPrompt = ai.definePrompt({
  name: 'epidemiologicalAnalysisPrompt',
  input: { schema: ReportAnalysisInputSchema },
  output: { schema: z.object({ epidemiologicalAnalysis: ReportAnalysisOutputSchema.shape.epidemiologicalAnalysis }) },
  prompt: `
Eres un médico auditor especializado en análisis epidemiológico de contratos PGP.
Redacta el texto para la sección **"Análisis del Comportamiento Epidemiológico y de Servicios (CUPS)"** (1200–1500 caracteres).

**Indicadores del Periodo:**
- Total de CUPS Ejecutados: {{{totalCups}}}
- Costo Unitario Promedio: {{{unitAvg}}}
- CUPS Sobre-ejecutados (>111%): {{{overExecutedCount}}}
- CUPS Inesperados (no en NT): {{{unexpectedCount}}}

**Instrucciones:**
- Analiza el volumen y coherencia de la prestación.
- Interpreta el costo unitario promedio como indicador de complejidad.
- Evalúa la relación entre demanda, red de servicios y comportamiento epidemiológico.
- Finaliza con observaciones sobre gestión del riesgo y capacidad instalada.
`,
});

const deviationAnalysisPrompt = ai.definePrompt({
  name: 'deviationAnalysisPrompt',
  input: { schema: ReportAnalysisInputSchema },
  output: { schema: z.object({ deviationAnalysis: ReportAnalysisOutputSchema.shape.deviationAnalysis }) },
  prompt: `
Eres un analista de riesgos y auditor financiero del sistema PGP.
Redacta el texto para la sección **"Análisis del Valor de las Desviaciones"** (1500–2000 caracteres).

**Desviaciones del Periodo:**
- Sobre-ejecución: {{{totalValueOverExecuted}}}
- CUPS Inesperados: {{{totalValueUnexpected}}}
- Sub-ejecución: {{{totalValueUnderExecuted}}}
- Faltantes: {{{totalValueMissing}}}

{{#if additionalRecommendations}}
Recomendaciones Adicionales del Auditor: {{{additionalRecommendations}}}
{{/if}}

**Instrucciones:**
- Cuantifica el impacto económico de cada desviación.
- Explica causas probables (aumento de incidencia, cambios clínicos, etc.).
- Evalúa riesgos financieros y plantea medidas de mitigación (auditorías específicas, ajustes de red, controles).
`,
});

// =======================
// 🔹 3. Flujo Principal
// =======================

export const generateReportAnalysisFlow = ai.defineFlow(
  {
    name: 'generateReportAnalysisFlow',
    inputSchema: ReportAnalysisInputSchema,
    outputSchema: ReportAnalysisOutputSchema,
  },
  async (input) => {
    const validation = ReportAnalysisInputSchema.safeParse(input);
    if (!validation.success) {
      console.error("❌ Datos inválidos para el flujo:", validation.error);
      throw new Error("Entrada inválida para generar el informe PGP.");
    }

    const executionId = Date.now();
    console.log(`🧩 [${executionId}] Iniciando flujo de análisis PGP...`);

    try {
      const { output: fin } = await financialAnalysisPrompt(input);
      const { output: epi } = await epidemiologicalAnalysisPrompt(input);
      const { output: dev } = await deviationAnalysisPrompt(input);

      if (!fin?.financialAnalysis || !epi?.epidemiologicalAnalysis || !dev?.deviationAnalysis) {
        throw new Error("La IA no devolvió todas las secciones esperadas.");
      }

      console.log(`✅ [${executionId}] Flujo completado exitosamente.`);
      return {
        financialAnalysis: fin.financialAnalysis,
        epidemiologicalAnalysis: epi.epidemiologicalAnalysis,
        deviationAnalysis: dev.deviationAnalysis,
      };

    } catch (error) {
      console.error(`🔥 [${executionId}] Error durante el flujo:`, error);
      throw new Error("El servicio de IA no pudo generar el análisis. Intente nuevamente más tarde.");
    }
  }
);

// =======================
// 🔹 4. Función Exportada Simplificada
// =======================

export async function generateReportAnalysis(input: ReportAnalysisInput): Promise<ReportAnalysisOutput> {
  return generateReportAnalysisFlow(input);
}
