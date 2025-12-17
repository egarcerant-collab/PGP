/**
 * @fileOverview Centralized Genkit AI configuration.
 */
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY,
    }),
  ],
  model: {
    name: 'googleai/gemini-2.5-pro',
    temperature: 0.4,
    maxOutputTokens: 2048,
  },
  logLevel: 'debug',
  enableTracing: true,
});
