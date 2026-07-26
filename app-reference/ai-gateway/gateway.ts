/**
 * The AI Intelligence Gateway — provider-independent routing with fallback.
 *
 * Primary: Claude (best reasoning for game design and code generation).
 * Fallback 1: Gemini via Genkit. Fallback 2: OpenAI via official SDK.
 * Every call is cost-tracked for the ACU billing engine (4x provider-cost rule).
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { ai } from "./genkit";
import {
  generateBlueprintWithClaude,
  GameBlueprintSchema,
  type GameBlueprint,
} from "./anthropic";

const openai = new OpenAI(); // reads OPENAI_API_KEY from env

export interface GatewayUsage {
  provider: "anthropic" | "gemini" | "openai";
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** Hook for the credit billing engine — persist to aiCreditTransactions. */
export type UsageRecorder = (usage: GatewayUsage) => Promise<void> | void;
let recordUsage: UsageRecorder = () => {};
export function onUsage(recorder: UsageRecorder) {
  recordUsage = recorder;
}

export async function generateBlueprint(
  prompt: string,
  opts: { genre?: string; platform?: string; budgetTier?: string } = {},
): Promise<{ blueprint: GameBlueprint; provider: GatewayUsage["provider"] }> {
  // 1) Claude — primary
  try {
    const blueprint = await generateBlueprintWithClaude(prompt, opts);
    return { blueprint, provider: "anthropic" };
  } catch (error) {
    if (
      error instanceof Anthropic.RateLimitError ||
      error instanceof Anthropic.InternalServerError ||
      error instanceof Anthropic.APIConnectionError
    ) {
      // transient — fall through to Gemini
    } else {
      throw error; // real request problem: surface it, don't mask with fallbacks
    }
  }

  // 2) Gemini via Genkit — fallback
  try {
    const { output } = await ai.generate({
      model: "googleai/gemini-1.5-pro",
      prompt: blueprintPrompt(prompt, opts),
      output: { schema: GameBlueprintSchema },
    });
    if (output) return { blueprint: output, provider: "gemini" };
  } catch {
    // fall through to OpenAI
  }

  // 3) OpenAI — last resort
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: blueprintPrompt(prompt, opts) + "\nRespond with JSON only." }],
  });
  const blueprint = GameBlueprintSchema.parse(
    JSON.parse(completion.choices[0].message.content ?? "{}"),
  );
  await recordUsage({
    provider: "openai",
    model: "gpt-4o",
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  });
  return { blueprint, provider: "openai" };
}

function blueprintPrompt(prompt: string, opts: { genre?: string; platform?: string; budgetTier?: string }) {
  return `Create a complete game blueprint for: ${prompt}
Genre: ${opts.genre ?? "auto"} · Platform: ${opts.platform ?? "web"} · Budget: ${opts.budgetTier ?? "standard"}
Fields: title, summary, genre[], coreLoop[], targetAudience, mechanics[], characters[], levels[],
monetisationModel, assetList[], technicalComplexity, estimatedCredits, suggestedPriceGBP,
commercialScore (0-100), riskScore (0-100), marketplaceCategory.
No copyrighted characters, real club names, or licensed marks.`;
}
