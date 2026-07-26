/**
 * Genkit initialisation — GOOGLE MODELS ONLY.
 *
 * Keep `genkit`, `@genkit-ai/googleai`, and `@genkit-ai/vertexai` at the SAME 1.x
 * version. Do not add community plugins (genkitx-openai etc.) here — they target
 * the old 0.x plugin API and throw `plugin is not a function` under Genkit 1.x.
 * Claude and OpenAI are called via their official SDKs in gateway.ts.
 */
import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/googleai";
import { vertexAI } from "@genkit-ai/vertexai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set — add it to .env.local (never hardcode keys in source).");
}

export const ai = genkit({
  plugins: [
    googleAI({ apiKey: process.env.GEMINI_API_KEY }),
    vertexAI({
      projectId: process.env.VERTEX_PROJECT_ID,
      location: process.env.VERTEX_LOCATION ?? "us-central1",
    }),
  ],
  model: "googleai/gemini-1.5-pro",
});
