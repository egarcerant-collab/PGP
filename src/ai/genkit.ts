/**
 * @fileOverview Centralized Genkit AI configuration.
 */
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GOOGLE_GENAI_API_KEY,
    }),
  ],
  model: {
    name: 'googleai/gemini-1.5-flash-latest',
    temperature: 0.4,
    maxOutputTokens: 4096, // Aumentado para permitir redacciones de informes extensos
  },
  logLevel: 'debug',
  enableTracing: true,
});
