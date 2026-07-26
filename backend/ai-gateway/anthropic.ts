/**
 * Claude provider — the primary intelligence for game blueprints and design.
 *
 * Uses the official Anthropic SDK with structured outputs: the response is
 * validated against the GameBlueprint schema by the API itself, so flows get a
 * typed object back — no brittle JSON parsing, no "resilient null handling".
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Reads ANTHROPIC_API_KEY from the environment — never pass keys in code.
const anthropic = new Anthropic();

export const GameBlueprintSchema = z.object({
  title: z.string(),
  summary: z.string(),
  genre: z.array(z.string()),
  coreLoop: z.array(z.string()).describe("Ordered core gameplay loop steps"),
  targetAudience: z.string(),
  mechanics: z.array(z.string()),
  characters: z.array(z.object({ name: z.string(), role: z.string() })),
  levels: z.array(z.object({ name: z.string(), objective: z.string() })),
  monetisationModel: z.string(),
  assetList: z.array(z.string()),
  technicalComplexity: z.enum(["low", "medium", "high"]),
  estimatedCredits: z.number().int(),
  suggestedPriceGBP: z.number(),
  commercialScore: z.number().int().describe("0-100"),
  riskScore: z.number().int().describe("0-100"),
  marketplaceCategory: z.string(),
});
export type GameBlueprint = z.infer<typeof GameBlueprintSchema>;

const SYSTEM = `You are the Game Idea and Design intelligence of JOSHRIX Studio, an AI game
creation OS. Turn raw user concepts into commercially strong, buildable game blueprints for
web-first 2D games (Phaser.js). Prevent impossible scope. Never include copyrighted
characters, real club names, or licensed marks; flag risk in riskScore instead.`;

export async function generateBlueprintWithClaude(
  prompt: string,
  opts: { genre?: string; platform?: string; budgetTier?: string } = {},
): Promise<GameBlueprint> {
  const response = await anthropic.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(GameBlueprintSchema) },
    messages: [
      {
        role: "user",
        content: `Game idea: ${prompt}\nGenre preference: ${opts.genre ?? "auto"}\nPlatform: ${
          opts.platform ?? "web"
        }\nBudget tier: ${opts.budgetTier ?? "standard"}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Blueprint request declined by safety systems — revise the concept.");
  }
  if (!response.parsed_output) {
    throw new Error("Blueprint parsing failed — retry the generation.");
  }
  return response.parsed_output;
}

/** Freeform design/code assistance from Claude (streamed for long outputs). */
export async function claudeText(prompt: string, system?: string): Promise<string> {
  const stream = anthropic.messages.stream({
    model: "claude-opus-5",
    max_tokens: 64000,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const message = await stream.finalMessage();
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
