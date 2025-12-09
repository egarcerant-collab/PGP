
'use server';
/**
 * @fileOverview A flow to generate professional analysis text for a PGP report.
 * - generateReportAnalysis - A function that returns AI-generated text for the report sections.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';
import type { DeviatedCupInfo, UnexpectedCupInfo } from '@/components/pgp-search/PgPsearchForm';

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
  financialAnalysis: z.string().describe("Texto del análisis de ejecución financiera y presupuestal."),
  epidemiologicalAnalysis: z.string().describe("Texto del análisis del comportamiento epidemiológico y de servicios (CUPS)."),
  deviationAnalysis: z.string().describe("Texto del análisis de desviaciones (CUPS sobre-ejecutados e inesperados)."),
});

export type ReportAnalysisInput = z.infer<typeof ReportAnalysisInputSchema>;
export type ReportAnalysisOutput = z.infer<typeof ReportAnalysisOutputSchema>;

export async function generateReportAnalysis(input: ReportAnalysisInput): Promise<ReportAnalysisOutput> {
  return generateReportAnalysisFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateReportAnalysisPrompt',
  input: {schema: ReportAnalysisInputSchema},
  output: {schema: ReportAnalysisOutputSchema},
  prompt: `Eres un analista financiero y médico auditor experto en el sistema de salud colombiano, especializado en contratos de Pago Global Prospectivo (PGP).
  Tu tarea es redactar los textos de análisis para un informe ejecutivo basado en los siguientes KPIs y datos clínicos.
  Usa un lenguaje profesional, claro, y directo, enfocado en la toma de decisiones gerenciales.

  KPIs Financieros y Operativos del Periodo (POST-AUDITORÍA):
  - Presupuesto (Nota Técnica): {{valorNotaTecnica}}
  - Valor Total a Pagar (Post-Auditoría): {{valorNetoFinal}}
  - Descuento Total Aplicado (Auditoría): {{descuentoAplicado}}
  - Diferencia vs Presupuesto: {{diffVsNota}}
  - Porcentaje de Ejecución Final: {{porcentajeEjecucion}}%
  - Total CUPS Ejecutados: {{totalCups}}
  - Costo Unitario Promedio (Post-Auditoría): {{unitAvg}}
  - Cantidad de CUPS Sobre-ejecutados (>111%): {{overExecutedCount}}
  - Cantidad de CUPS Inesperados (No en NT): {{unexpectedCount}}

  Resumen Financiero de Desviaciones:
  - Valor Desviación por Sobre-ejecución: {{totalValueOverExecuted}}
  - Valor Ejecutado por CUPS Inesperados: {{totalValueUnexpected}}
  - Valor no ejecutado por Sub-ejecución: {{totalValueUnderExecuted}}
  - Valor no ejecutado por CUPS Faltantes: {{totalValueMissing}}
  
  {{#if additionalConclusions}}
  Conclusiones Adicionales del Auditor (Considerar para el tono y enfoque del análisis):
  {{{additionalConclusions}}}
  {{/if}}

  {{#if additionalRecommendations}}
  Recomendaciones Adicionales del Auditor (Considerar para el tono y enfoque del análisis):
  {{{additionalRecommendations}}}
  {{/if}}


  Genera los siguientes tres bloques de texto en el formato JSON especificado:

  1.  **financialAnalysis** (entre 1200 y 1500 caracteres): Análisis de Ejecución Financiera y Presupuestal.
      - **PUNTO CRÍTICO:** Tu análisis DEBE centrarse en el **'Valor Total a Pagar (Post-Auditoría)' ({{valorNetoFinal}})**. Explica claramente que este es el resultado final después de la conciliación.
      - Compara este valor final con el presupuesto ({{valorNotaTecnica}}).
      - Explica cómo se llegó a este valor, mencionando el **'Descuento Total Aplicado' ({{descuentoAplicado}})** como resultado de la auditoría de sobre-ejecución e imprevistos.
      - Concluye sobre la liquidación del contrato. ¿El valor final a pagar está dentro de las bandas esperadas? ¿Cuál es la implicación financiera para el prestador y el asegurador?

  2.  **epidemiologicalAnalysis** (entre 1200 y 1500 caracteres): Análisis del Comportamiento Epidemiológico y de Servicios (CUPS).
      - Analiza el volumen total de CUPS y su consistencia mensual.
      - Interpreta el costo unitario promedio (post-auditoría) como un indicador de complejidad.
      - Relaciona la estabilidad de la demanda con el acceso a servicios y la capacidad de la red.
      - Proyecta las necesidades de recursos futuros (financieros, humanos, etc.) basado en la operación.

  3.  **deviationAnalysis** (entre 1500 y 2000 caracteres): Análisis Amplio del Valor de las Desviaciones.
      - **Enfoque Principal: EL VALOR ($) de las desviaciones, no solo la frecuencia.**
      - Cuantifica el impacto financiero total de los CUPS sobre-ejecutados. Utiliza el 'Valor Desviación por Sobre-ejecución' ({{totalValueOverExecuted}}) para explicar cuánto dinero representa el exceso de frecuencia.
      - Analiza el costo total de los CUPS inesperados ('Valor Ejecutado por CUPS Inesperados': {{totalValueUnexpected}}) y explica cómo este gasto no planificado impacta directamente la prima y la rentabilidad del contrato.
      - Explica las posibles causas de la sobre-ejecución (aumento de incidencia, cambios en guías clínicas, ineficiencias) pero siempre conectándolas con su consecuencia monetaria.
      - Evalúa el riesgo financiero que representan estas desviaciones de valor. ¿Son sostenibles? ¿Qué porcentaje del presupuesto consumen?
      - Recomienda acciones concretas (auditoría, análisis de causa raíz, pertinencia médica) como herramientas para controlar el impacto financiero de estas desviaciones. Sé muy específico sobre cómo estas acciones mitigan el riesgo económico.
  `,
});

const generateReportAnalysisFlow = ai.defineFlow(
  {
    name: 'generateReportAnalysisFlow',
    inputSchema: ReportAnalysisInputSchema,
    outputSchema: ReportAnalysisOutputSchema,
  },
  async (input) => {
    try {
        const {output} = await prompt(input);
        if (!output) {
            throw new Error('La IA no pudo generar el análisis del informe.');
        }
        return output;
    } catch (error) {
        console.error("Error en generateReportAnalysisFlow:", error);
        throw new Error('El servicio de IA no pudo generar el análisis para el informe. Por favor, inténtelo de nuevo más tarde.');
    }
  }
);
