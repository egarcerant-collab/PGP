
'use server';
/**
 * @fileOverview A flow to describe a medical procedure code (CUP).
 * - describeCup - A function that returns the description of a CUP code.
 * - CupDescription - The return type for the describeCup function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DescribeCupInputSchema = z.string().describe("El código de procedimiento médico (CUP) a describir.");

const DescribeCupOutputSchema = z.object({
  cup: z.string().describe("El código de procedimiento médico (CUP) que se buscó."),
  description: z.string().describe("La descripción del procedimiento médico o servicio de salud correspondiente al código CUP."),
});

export type CupDescription = z.infer<typeof DescribeCupOutputSchema>;

export async function describeCup(cupCode: string): Promise<CupDescription> {
  return describeCupFlow(cupCode);
}

const prompt = ai.definePrompt({
  name: 'describeCupPrompt',
  model: 'googleai/gemini-2.0-flash',
  input: {schema: DescribeCupInputSchema},
  output: {schema: DescribeCupOutputSchema},
  config: {
    temperature: 0.1,
  },
  prompt: `Eres un experto en la Clasificación Única de Procedimientos en Salud (CUPS) de Colombia.
  Dado el siguiente código CUPS, proporciona una descripción clara y concisa del procedimiento o servicio de salud al que corresponde.

  Código CUPS: {{{input}}}

  Tu respuesta debe ser únicamente la descripción del procedimiento.`,
});

const describeCupFlow = ai.defineFlow(
  {
    name: 'describeCupFlow',
    inputSchema: DescribeCupInputSchema,
    outputSchema: DescribeCupOutputSchema,
  },
  async (cupCode) => {
    try {
        const {output} = await prompt(cupCode);
        if (!output) {
            throw new Error('La IA no pudo generar una descripción para el código CUP.');
        }
        return {
            cup: cupCode,
            description: output.description
        };
    } catch (error) {
        console.error(`Error en el flujo describeCupFlow para el código ${cupCode}:`, error);
        throw new Error("El servicio de IA no está disponible en este momento. Por favor, inténtalo de nuevo más tarde.");
    }
  }
);
