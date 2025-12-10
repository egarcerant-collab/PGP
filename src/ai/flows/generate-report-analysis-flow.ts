
'use server';
/**
 * @fileOverview A flow to generate professional analysis text for a PGP report.
 * - generateReportAnalysis - A function that returns AI-generated text for the report sections.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';

const ReportAnalysisInputSchema = z.object({
    sumaMensual: z.number().describe("El valor total ejecutado en el periodo, basado en los vrServicio del JSON."),
    valorNotaTecnica: z.number().describe("El valor presupuestado en la nota técnica para el periodo."),
    diffVsNota: z.number().describe("La diferencia monetaria entre lo ejecutado (JSON) y lo presupuestado."),
    porcentajeEjecucion: z.number().describe("El porcentaje de ejecución (ejecutado (JSON) / presupuestado)."),
    totalCups: z.number().describe("La cantidad total de CUPS ejecutados."),
    unitAvg: z.number().describe("El costo unitario promedio (valor total ejecutado (JSON) / cantidad de CUPS)."),
    overExecutedCount: z.number().describe("La cantidad de CUPS que fueron sobre-ejecutados."),
    unexpectedCount: z.number().describe("La cantidad de CUPS ejecutados que no estaban en la nota técnica."),
    valorNetoFinal: z.number().describe("El valor final a pagar al prestador después de aplicar todos los descuentos y ajustes de la auditoría. Este es el número más importante."),
    descuentoAplicado: z.number().describe("El monto total descontado durante el proceso de auditoría."),
    additionalConclusions: z.string().optional().describe("Conclusiones adicionales escritas por el auditor para ser incluidas o consideradas en el informe."),
    additionalRecommendations: z.string().optional().describe("Recomendaciones adicionales escritas por el auditor para ser incluidas o consideradas en el informe."),
    totalValueOverExecuted: z.number().describe("El valor total de la desviación (exceso) de los CUPS sobre-ejecutados."),
    totalValueUnexpected: z.number().describe("El valor total ejecutado de los CUPS inesperados."),
    totalValueUnderExecuted: z.number().describe("El valor total de la desviación (defecto) de los CUPS sub-ejecutados."),
    totalValueMissing: z.number().describe("El valor total no ejecutado de los CUPS faltantes."),
});

const ReportAnalysisOutputSchema = z.object({
  financialAnalysis: z.string().describe("Texto del análisis de ejecución financiera y presupuestal (1200-1500 caracteres)."),
  epidemiologicalAnalysis: z.string().describe("Texto del análisis del comportamiento epidemiológico y de servicios (CUPS) (1200-1500 caracteres)."),
  deviationAnalysis: z.string().describe("Texto del análisis de desviaciones (CUPS sobre-ejecutados e inesperados) (1500-2000 caracteres)."),
});

export type ReportAnalysisInput = z.infer<typeof ReportAnalysisInputSchema>;
export type ReportAnalysisOutput = z.infer<typeof ReportAnalysisOutputSchema>;

export async function generateReportAnalysis(input: ReportAnalysisInput): Promise<ReportAnalysisOutput> {
  return generateReportAnalysisFlow(input);
}


// Restore the three separate prompts
const financialAnalysisPrompt = ai.definePrompt({
  name: 'financialAnalysisPrompt',
  input: {schema: ReportAnalysisInputSchema},
  output: {schema: z.object({ financialAnalysis: ReportAnalysisOutputSchema.shape.financialAnalysis })},
  prompt: `Eres un analista financiero y médico auditor experto en el sistema de salud colombiano, especializado en contratos de Pago Global Prospectivo (PGP).
Tu tarea es redactar el texto para la sección "Análisis de Ejecución Financiera y Presupuestal" de un informe ejecutivo.
Usa un lenguaje profesional, claro y directo, enfocado en la toma de decisiones gerenciales.

KPIs Financieros del Periodo (POST-AUDITORÍA):
- Presupuesto (Nota Técnica): {{{valorNotaTecnica}}}
- Valor Total a Pagar (Post-Auditoría): {{{valorNetoFinal}}}
- Descuento Total Aplicado (Auditoría): {{{descuentoAplicado}}}
- Diferencia vs Presupuesto: {{{diffVsNota}}}
- Porcentaje de Ejecución Final: {{{porcentajeEjecucion}}}%

{{#if additionalConclusions}}
Conclusiones Adicionales del Auditor: {{{additionalConclusions}}}
{{/if}}

Genera el texto para el **Análisis de Ejecución Financiera y Presupuestal (1200-1500 caracteres):**
- **PUNTO CRÍTICO:** Céntrate en el **'Valor Total a Pagar (Post-Auditoría)' ({{{valorNetoFinal}}})**. Explica que es el resultado final tras la conciliación.
- Compara este valor final con el presupuesto ({{{valorNotaTecnica}}}).
- Explica cómo se llegó a este valor, mencionando el **'Descuento Total Aplicado' ({{{descuentoAplicado}})** como resultado de la auditoría.
- Concluye sobre la liquidación del contrato y su implicación financiera.`
});

const epidemiologicalAnalysisPrompt = ai.definePrompt({
    name: 'epidemiologicalAnalysisPrompt',
    input: { schema: ReportAnalysisInputSchema },
    output: { schema: z.object({ epidemiologicalAnalysis: ReportAnalysisOutputSchema.shape.epidemiologicalAnalysis }) },
    prompt: `Eres un analista médico auditor experto en el sistema de salud colombiano.
Tu tarea es redactar el texto para la sección "Análisis del Comportamiento Epidemiológico y de Servicios (CUPS)".

KPIs Operativos del Periodo:
- Total CUPS Ejecutados: {{{totalCups}}}
- Costo Unitario Promedio (Post-Auditoría): {{{unitAvg}}}
- Cantidad de CUPS Sobre-ejecutados (>111%): {{{overExecutedCount}}}
- Cantidad de CUPS Inesperados (No en NT): {{{unexpectedCount}}}

Genera el texto para el **Análisis del Comportamiento Epidemiológico y de Servicios (CUPS) (1200-1500 caracteres):**
- Analiza el volumen total de CUPS y su consistencia.
- Interpreta el costo unitario promedio como un indicador de complejidad.
- Relaciona la demanda con el acceso a servicios y la capacidad de la red.
- Proyecta las necesidades de recursos futuros.`
});

const deviationAnalysisPrompt = ai.definePrompt({
    name: 'deviationAnalysisPrompt',
    input: { schema: ReportAnalysisInputSchema },
    output: { schema: z.object({ deviationAnalysis: ReportAnalysisOutputSchema.shape.deviationAnalysis }) },
    prompt: `Eres un analista de riesgos y auditor médico experto en contratos PGP.
Tu tarea es redactar el texto para la sección "Análisis Amplio del Valor de las Desviaciones".

Resumen Financiero de Desviaciones:
- Valor Desviación por Sobre-ejecución: {{{totalValueOverExecuted}}}
- Valor Ejecutado por CUPS Inesperados: {{{totalValueUnexpected}}}
- Valor no ejecutado por Sub-ejecución: {{{totalValueUnderExecuted}}}
- Valor no ejecutado por CUPS Faltantes: {{{totalValueMissing}}}

{{#if additionalRecommendations}}
Recomendaciones Adicionales del Auditor: {{{additionalRecommendations}}}
{{/if}}

Genera el texto para el **Análisis Amplio del Valor de las Desviaciones (1500-2000 caracteres):**
- **Enfoque Principal: EL VALOR ($) de las desviaciones.**
- Cuantifica el impacto financiero total de los CUPS sobre-ejecutados ('Valor Desviación por Sobre-ejecución': {{{totalValueOverExecuted}}}).
- Analiza el costo total de los CUPS inesperados ('Valor Ejecutado por CUPS Inesperados': {{{totalValueUnexpected}}}) y su impacto en la prima.
- Explica las posibles causas de la sobre-ejecución (aumento de incidencia, cambios en guías, etc.) conectándolas con su consecuencia monetaria.
- Evalúa el riesgo financiero que representan estas desviaciones y recomienda acciones concretas (auditoría, análisis de causa raíz) para mitigar el riesgo económico.`
});


const generateReportAnalysisFlow = ai.defineFlow(
  {
    name: 'generateReportAnalysisFlow',
    inputSchema: ReportAnalysisInputSchema,
    outputSchema: ReportAnalysisOutputSchema,
  },
  async (input) => {
    try {
        // Execute prompts sequentially for stability
        const { output: financialOutput } = await financialAnalysisPrompt(input);
        if (!financialOutput?.financialAnalysis) {
            throw new Error('La IA no pudo generar el análisis financiero.');
        }

        const { output: epidemiologicalOutput } = await epidemiologicalAnalysisPrompt(input);
        if (!epidemiologicalOutput?.epidemiologicalAnalysis) {
            throw new Error('La IA no pudo generar el análisis epidemiológico.');
        }

        const { output: deviationOutput } = await deviationAnalysisPrompt(input);
        if (!deviationOutput?.deviationAnalysis) {
            throw new Error('La IA no pudo generar el análisis de desviaciones.');
        }
        
        return {
            financialAnalysis: financialOutput.financialAnalysis,
            epidemiologicalAnalysis: epidemiologicalOutput.epidemiologicalAnalysis,
            deviationAnalysis: deviationOutput.deviationAnalysis,
        };

    } catch (error) {
        console.error("Error en generateReportAnalysisFlow:", error);
        throw new Error('El servicio de IA no pudo generar el análisis para el informe. Por favor, inténtelo de nuevo más tarde.');
    }
  }
);
