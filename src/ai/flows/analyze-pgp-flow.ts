
'use server';
/**
 * @fileOverview A PGP data analysis AI agent.
 *
 * - analyzePgpData - A function that handles the PGP data analysis process.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const PgpRowSchemaForAI = z.object({
  SUBCATEGORIA: z.string().optional(),
  AMBITO: z.string().optional(),
  'ID RESOLUCION 3100': z.string().optional(),
  'DESCRIPCION ID RESOLUCION': z.string().optional(),
  'CUP/CUM': z.string().optional().describe("El código del servicio o procedimiento."),
  'DESCRIPCION CUPS': z.string().optional().describe("La descripción del servicio o procedimiento."),
  'FRECUENCIA AÑO SERVICIO': z.number().optional(),
  'FRECUENCIA USO': z.number().optional(),
  'FRECUENCIA EVENTOS MES': z.number().optional().describe("La frecuencia con la que se espera que ocurra el evento en un mes."),
  'FRECUENCIA EVENTO DIA': z.number().optional(),
  'COSTO EVENTO MES': z.number().optional(),
  'COSTO EVENTO DIA': z.number().optional(),
  'FRECUENCIA MINIMA MES': z.number().optional().describe("La frecuencia mínima esperada para el evento en un mes."),
  'FRECUENCIA MAXIMA MES': z.number().optional().describe("La frecuencia máxima esperada para el evento en un mes."),
  'VALOR UNITARIO': z.number().optional(),
  'VALOR MINIMO MES': z.number().optional().describe("El costo mínimo aceptable para el evento en un mes."),
  'VALOR MAXIMO MES': z.number().optional().describe("El costo máximo aceptable para el evento en un mes."),
  'COSTO EVENTO MES (VALOR MES)': z.number().optional().describe('El costo total estimado del evento para un mes.'),
  OBSERVACIONES: z.string().optional(),
});
type PgpRowForAI = z.infer<typeof PgpRowSchemaForAI>;

const AnalyzePgpDataInputSchema = z.object({
  jsonData: z.string().describe("Una cadena de texto en formato JSON que representa una muestra de los datos de la nota técnica."),
});

const AnalyzePgpDataOutputSchema = z.object({
    keyObservations: z.array(z.string()).describe("Una lista de 3 a 5 observaciones clave y concisas sobre los datos."),
    potentialRisks: z.array(z.string()).describe("Una lista de 2 a 3 riesgos potenciales identificados en los datos."),
    strategicRecommendations: z.array(z.string()).describe("Una lista de 2 a 3 recomendaciones estratégicas basadas en el análisis.")
});

export async function analyzePgpData(input: PgpRowForAI[]): Promise<z.infer<typeof AnalyzePgpDataOutputSchema>> {
  try {
    const dataAsString = JSON.stringify(input, null, 2);
    return await analyzePgpDataFlow({ jsonData: dataAsString });
  } catch (error) {
    console.error("Error executing analyzePgpData:", error);
    throw new Error("No se pudo completar el análisis de los datos.");
  }
}

const prompt = ai.definePrompt({
  name: 'pgpAnalysisPrompt',
  model: 'googleai/gemini-2.0-flash',
  input: {schema: AnalyzePgpDataInputSchema},
  output: {schema: AnalyzePgpDataOutputSchema},
  config: {
    temperature: 0.1,
  },
  prompt: `Eres un analista financiero experto en contratos de salud PGP en Colombia.
  Analiza los siguientes datos de una nota técnica para un contrato de Pago Global Prospectivo.
  Tu objetivo es producir un análisis estratégico, conciso y de alto nivel para la gerencia.

  Datos de la Nota Técnica (JSON):
  {{{jsonData}}}

  Genera la siguiente información en el formato JSON especificado:
  1.  **Observaciones Clave:** Identifica 3-5 tendencias críticas. Enfócate en los servicios de mayor costo, frecuencias inusuales, y grandes variaciones entre valores mínimos/máximos.
  2.  **Riesgos Potenciales:** Detecta 2-3 riesgos financieros clave, como desviaciones presupuestarias o servicios con alta variabilidad que amenacen la estabilidad del contrato.
  3.  **Recomendaciones Estratégicas:** Propón 2-3 acciones concretas y de alto impacto. Sugiere áreas para optimización, gestión de riesgos o negociación contractual.

  Sé directo, profesional y utiliza un lenguaje ejecutivo.`,
});

const analyzePgpDataFlow = ai.defineFlow(
  {
    name: 'analyzePgpDataFlow',
    inputSchema: AnalyzePgpDataInputSchema,
    outputSchema: AnalyzePgpDataOutputSchema,
  },
  async (input) => {
    try {
      const {output} = await prompt(input);
      if (!output) {
        throw new Error('El análisis de IA no pudo generar un resultado.');
      }
      return output;
    } catch (error) {
       console.error("Error en el flujo analyzePgpDataFlow:", error);
       throw new Error('El análisis de IA no pudo generar un resultado. Por favor, inténtelo de nuevo más tarde.');
    }
  }
);
