/**
 * @fileOverview Centralized Genkit AI configuration.
 */
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

const apiKey = process.env.GOOGLE_GENAI_API_KEY;

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: apiKey,
    }),
  ],
  model: {
    name: 'googleai/gemini-1.5-flash-latest',
    temperature: 0.3,
    maxOutputTokens: 4096, 
  },
  logLevel: 'debug',
  enableTracing: true,
});

if (!apiKey) {
  console.warn("ADVERTENCIA: GOOGLE_GENAI_API_KEY no está configurada. Las funciones de redacción de informes no funcionarán hasta que se añada una clave válida.");
}
