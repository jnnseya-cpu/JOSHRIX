/**
 * JOSHRIX Studio — shared contracts.
 * Single source of truth for types used by both frontend and backend
 * (see docs/DATA-MODEL.md and docs/APP-BUILD-SPEC.md).
 */
import { z } from "zod";

export const Roles = [
  "guest",
  "creator",
  "buyer",
  "studio_owner",
  "studio_member",
  "admin",
  "super_admin",
] as const;
export type Role = (typeof Roles)[number];

export const AccountTypes = [
  "creator",
  "studio",
  "business",
  "enterprise",
  "education",
  "buyer",
] as const;
export type AccountType = (typeof AccountTypes)[number];

export const GameStatuses = [
  "draft", "generating", "testing", "ready",
  "published", "listed", "sold", "suspended", "archived",
] as const;
export type GameStatus = (typeof GameStatuses)[number];

export const ListingTypes = [
  "full_game", "template", "asset_pack", "mechanic", "service", "white_label_game",
] as const;
export type ListingType = (typeof ListingTypes)[number];

export const LicenceTypes = [
  "personal", "commercial", "extended_commercial", "exclusive", "white_label",
] as const;
export type LicenceType = (typeof LicenceTypes)[number];

export const GameBlueprintSchema = z.object({
  title: z.string(),
  summary: z.string(),
  genre: z.array(z.string()),
  coreLoop: z.array(z.string()),
  targetAudience: z.string(),
  mechanics: z.array(z.string()),
  characters: z.array(z.object({ name: z.string(), role: z.string() })),
  levels: z.array(z.object({ name: z.string(), objective: z.string() })),
  monetisationModel: z.string(),
  assetList: z.array(z.string()),
  technicalComplexity: z.enum(["low", "medium", "high"]),
  estimatedCredits: z.number().int(),
  suggestedPriceGBP: z.number(),
  commercialScore: z.number().int(),
  riskScore: z.number().int(),
  marketplaceCategory: z.string(),
});
export type GameBlueprint = z.infer<typeof GameBlueprintSchema>;

/** ACU economy constants — see docs/MONETISATION.md */
export const ACU = {
  perGBP: 100,                 // 100 ACUs = £1 retail
  providerMarkupFloor: 4,      // retail charge >= 4x attributable provider cost
  subscriptionAcuShare: 0.2,   // exactly 20% of subscription value becomes ACUs
} as const;
