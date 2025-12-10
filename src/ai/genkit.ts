import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';
import { next } from '@genkit-ai/next/plugin';

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GOOGLE_GENAI_API_KEY,
    }),
    next(),
  ],
});
