# AI Intelligence Gateway — Reference Implementation

Drop-in fix for the Firebase Studio prototype's `Runtime TypeError: plugin is not a function`, and the correct architecture for the multi-provider AI Gateway (Claude primary → Gemini fallback → OpenAI fallback).

## Why the error happens

`genkit@1.x` changed the plugin API. Community plugins like `genkitx-openai` (and Anthropic-via-Genkit wrappers) target the old 0.x API — when Genkit 1.x initialises them, they are not valid plugin factories and you get `plugin is not a function` at `genkit({ plugins: [...] })`. Re-pinning versions never fixes it.

## The fix (three rules)

1. **Genkit is for Google models only.** Keep `genkit` + `@genkit-ai/googleai` + `@genkit-ai/vertexai` at the *same* 1.x version. Remove `genkitx-openai` and any Anthropic Genkit plugin from `package.json` entirely.
2. **Claude and OpenAI go through their official SDKs** (`@anthropic-ai/sdk`, `openai`) inside `gateway.ts` — your own provider-independent router, which the platform spec requires anyway (routing, cost tracking, fallback).
3. **No keys in source code, ever.** `src/ai/genkit.ts` currently hardcodes a Gemini key as a fallback literal — delete it. All keys come from environment variables (`.env.local` in Next.js, Secret Manager in production).

## Apply in Firebase Studio

```bash
npm remove genkitx-openai
npm install genkit@^1.14 @genkit-ai/googleai@^1.14 @genkit-ai/vertexai@^1.14 @anthropic-ai/sdk openai zod
rm -rf node_modules package-lock.json && npm install
```

Then replace `src/ai/genkit.ts` with the `genkit.ts` here, add `anthropic.ts` and `gateway.ts` to `src/ai/`, and point your flows (e.g. `generate-game-blueprint.ts`) at `gateway.generateBlueprint(...)`.

## Files

| File | Purpose |
|---|---|
| `genkit.ts` | Fixed Genkit init — Google plugins only, env-var keys, no hardcoded fallbacks |
| `anthropic.ts` | Claude provider — the primary game-design brain, with schema-validated blueprint output |
| `gateway.ts` | The AI Gateway: routing, fallback chain, per-call cost tracking hook |

Environment variables (see repo-root `.env.example`): `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `VERTEX_PROJECT_ID`, `VERTEX_LOCATION`, `GOOGLE_APPLICATION_CREDENTIALS` (path to a JSON file — never the JSON inline).
