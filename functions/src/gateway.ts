/**
 * JOSHRIX AI Gateway — deployed serverless edition.
 * Claude (claude-opus-5) is the primary brain; when no key is configured the
 * gateway serves a deterministic demo blueprint so the platform demos end-to-end
 * on a fresh deploy. Full multi-provider fallback chain: backend/ai-gateway/.
 */
import Anthropic from "@anthropic-ai/sdk";
import { GameBlueprintSchema, type GameBlueprint, ACU } from "./shared/contracts";

const SYSTEM = `You are the JOSHRIX Idea Agent. From the creator's game description, produce a commercial game blueprint.
The creator may write in ANY language. Detect their language (or honour an explicitly requested one) and write ALL
player-facing text — title, summary, characters, levels, marketplaceCategory — in that language. Games are created
in the creator's language first and localised later.
Respond with ONLY a JSON object (no markdown, no prose) with exactly these keys:
language (BCP-47 code of the language used), title (string), summary (string), genre (string[]), coreLoop (string[] of 4-6 short steps),
targetAudience (string), mechanics (string[]), characters ({name,role}[]), levels ({name,objective}[]),
monetisationModel (string), assetList (string[]), technicalComplexity ("low"|"medium"|"high"),
estimatedCredits (integer, 600-5000), suggestedPriceGBP (number), commercialScore (integer 0-100),
riskScore (integer 0-100), marketplaceCategory (string).
Rules: no real club/brand/celebrity names (rights screening), no paid random rewards for minors,
design a stand-out hook free clones would not ship.`;

export const BLUEPRINT_ACU_CHARGE = 8;

export async function generateBlueprint(
  prompt: string,
  opts: { type?: string; platform?: string; scope?: string; language?: string } = {},
): Promise<{ blueprint: GameBlueprint; provider: string }> {
  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Game description: ${prompt}\nGame type: ${opts.type ?? "any"}\nTarget platform: ${opts.platform ?? "all"}\nScope package: ${opts.scope ?? "commercial starter"}\nCreation language: ${opts.language && opts.language !== "auto" ? opts.language : "auto-detect from the description"}`,
        },
      ],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Idea Agent returned no JSON blueprint");
    const blueprint = GameBlueprintSchema.parse(JSON.parse(text.slice(start, end + 1)));
    return { blueprint, provider: "claude" };
  }
  return { blueprint: demoBlueprint(prompt, opts.language), provider: "demo" };
}

/** Deterministic blueprint used until AI provider keys are configured. */
export function demoBlueprint(prompt: string, language?: string): GameBlueprint {
  const p = prompt.toLowerCase();
  const football = p.includes("penalty") || p.includes("football") || p.includes("soccer");
  const words = prompt.split(/\s+/).filter((w) => w.length > 4);
  const stem = (words[0] || "Neon").replace(/[^\p{L}]/gu, "") || "Neon";
  const title = football ? "Penalty King" : stem.charAt(0).toUpperCase() + stem.slice(1) + " Quest";
  return GameBlueprintSchema.parse({
    language: language && language !== "auto" ? language : "en",
    title,
    summary: football
      ? "Five shots, one keeper, weekly leagues in packed African stadiums. Unlock boots, buy stadiums, trade player cards."
      : `An arcade world built from your prompt: "${prompt.slice(0, 120)}" — with rising difficulty and a collectable economy.`,
    genre: football ? ["Sports", "Arcade"] : ["Arcade", "Casual"],
    coreLoop: ["Aim", "Shoot", "Resolve", "Reward", "Progress"],
    targetAudience: "Casual gamers 13+ · mobile-first markets",
    mechanics: ["drag-to-aim shooting", "rising difficulty levels", "keeper AI", "coin rewards", "cosmetic unlocks"],
    characters: [
      { name: "The Striker", role: "player avatar" },
      { name: "The Wall", role: "keeper — dives faster every level" },
    ],
    levels: [
      { name: "League Night", objective: "Score 3 of 5 to level up" },
      { name: "Prowling Keeper", objective: "Beat a keeper who moves on his line" },
    ],
    monetisationModel: "Freemium · cosmetic boots & stadiums · tournament entry · no paid random rewards",
    assetList: ["stadium environment", "keeper rig", "ball + boots set", "crowd audio bed", "commentary voice pack"],
    technicalComplexity: "medium",
    estimatedCredits: 1840,
    suggestedPriceGBP: 4.99,
    commercialScore: 86,
    riskScore: 12,
    marketplaceCategory: football ? "Sports / Arcade" : "Arcade / Casual",
  });
}

export function providerStatus() {
  return {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    imageGen: !!process.env.IMAGE_GEN_API_KEY,
    text3d: !!process.env.MESHY_API_KEY || !!process.env.TRIPO_API_KEY,
    voice: !!process.env.ELEVENLABS_API_KEY,
    acu: ACU,
  };
}
