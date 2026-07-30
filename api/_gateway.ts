/**
 * JOSHRIX AI Gateway — deployed serverless edition.
 * Claude (claude-opus-5) is the primary brain; when no key is configured the
 * gateway serves a deterministic demo blueprint so the platform demos end-to-end
 * on a fresh deploy. Full multi-provider fallback chain: backend/ai-gateway/.
 */
import Anthropic from "@anthropic-ai/sdk";
import { GameBlueprintSchema, type GameBlueprint, ACU } from "../shared/contracts";

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

export const BUILD_ID = "2026-07-29.41";

/* ---------------- metered 4x billing (MONETISATION: charge = 4x provider cost) ----
   The business model: every AI charge is ACU.providerMarkupFloor (4x) the attributable
   provider cost for THAT run, metered from actual token usage — never a flat guess.
   Rates are the provider's standard published per-MTok prices. */
const USD_PER_MTOK: Record<string, { in: number; out: number }> = {
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-opus-5": { in: 5, out: 25 },
  "gemini": { in: 0.3, out: 2.5 },   // approx published flash-tier rates
  "openai": { in: 2.5, out: 10 },    // approx published 4o-tier rates
};
const GBP_PER_USD = 0.79;
export type TokenUsage = { inputTokens: number; outputTokens: number };
export function acuChargeForUsage(model: string, usage: TokenUsage): number {
  const r = USD_PER_MTOK[model] ?? USD_PER_MTOK["claude-sonnet-5"];
  const usd = (usage.inputTokens / 1e6) * r.in + (usage.outputTokens / 1e6) * r.out;
  const gbp = usd * GBP_PER_USD * ACU.providerMarkupFloor;
  return Math.ceil(gbp * ACU.perGBP);
}

export const BLUEPRINT_ACU_CHARGE = 40;      // HOLD (estimate) — settled to metered 4x actual
export const BLUEPRINT_MIN_CHARGE = 6;       // metered floor per blueprint run

export async function generateBlueprint(
  prompt: string,
  opts: { type?: string; platform?: string; scope?: string; language?: string } = {},
): Promise<{ blueprint: GameBlueprint; provider: string; usage?: TokenUsage }> {
  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Game description: ${prompt}\nGame type: ${!opts.type || opts.type === "auto" ? "infer the best-fit genre from the description" : opts.type}\nTarget platform: ${opts.platform ?? "all"}\nScope package: ${opts.scope ?? "commercial starter"}\nCreation language: ${opts.language && opts.language !== "auto" ? opts.language : "auto-detect from the description"}`,
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
    return {
      blueprint, provider: "claude",
      usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
    };
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

/* ---------------- Code Agent: real playable game generation ---------------- */

const RUNTIME_SAFETY = `RUNTIME SAFETY — the game renders inside a sandboxed, opaque-origin iframe. A single uncaught error paints a BLANK screen, so:
- Something MUST be painted within the first frame of load (draw/render the title screen immediately on script run — never wait for an event, image, or timer before the first paint).
- Every function must be DEFINED BEFORE it is called on the boot path — no ReferenceError / "x is not defined" / calling a function above its declaration in the load order. Declare helpers first, then start the loop.
- Do NOT touch localStorage, sessionStorage, cookies, or any Storage API — the sandbox throws on them. Keep all state in plain JS variables.
- Wrap the whole boot in try/catch and inside requestAnimationFrame callbacks; guard every input handler. Never reference an id/element before it exists in the DOM.
- No optional-chaining/nullish assumptions about objects that may be undefined; initialise arrays/objects before use.
OUTPUT: nothing but the file. Start with <!DOCTYPE html>. No markdown fences, no commentary.`;

const GAME_SYSTEM = `You are the JOSHRIX Code Agent. Generate a COMPLETE, self-contained HTML5 game as ONE html file, implementing the creator's concept as faithfully as a 2D canvas web game allows. This is a COMMERCIAL product a creator will sell — it must feel like a polished paid arcade game, never a prototype.
HARD REQUIREMENTS:
- ONE file. No external resources of any kind: no CDNs, no images, no fonts, no network calls, no localStorage.
- <canvas>-based. Works with BOTH mouse and touch. Canvas scales responsively (max-width:100%, touch-action:none).
- Structure: animated title screen (game title + one-line how-to-play + START) -> core gameplay loop with score/progress -> win/lose states with restart. A pause button during play.
- Rising difficulty over time or levels. A satisfying 3-8 minute session. requestAnimationFrame; smooth on mobile.
POLISH BAR (all of these, not some):
- Particle effects on every important event (collect, hit, death, level-up).
- Eased motion (no linear teleports): smooth lerps, springy UI, screen shake on impacts.
- Multi-layer parallax background that evokes the concept's WORLD (its places, not abstract stars — a forest concept gets trees and fireflies, a city concept gets skyline layers).
- Distinct visual identity per entity: the player, each enemy/hazard type and each collectable must be DRAWN as recognisable shapes of the concept (a keeper is a figure with arms, a crystal is a faceted gem, a shadow sprite has eyes) — never plain circles for everything.
- Juice: score pops, combo counters, flash on damage, glow effects (shadowBlur), animated HUD.
- Premium palette fitting the concept (JOSHRIX default: #050508 ground, violet #7C3AED, cyan #22D3EE) unless the concept demands another (bright children's world -> vivid colours).
- Procedural WebAudio sound design (no files): distinct SFX per event + a simple ambient loop + a mute button; create the AudioContext only on the first user gesture.
- All player-facing text in the creator's language (use the provided language, else detect from the concept).
- Age-appropriate for the stated audience. No real brands, clubs, celebrities or licensed characters.
SIZE: 650-900 lines. Ship a COMPLETE file — finishing the game matters more than length; depth comes from Enhance passes. Never pad; never truncate.
${RUNTIME_SAFETY}`;

const GAME_SYSTEM_3D = `You are the JOSHRIX Code Agent. Generate a COMPLETE HTML5 **3D** game as ONE html file using three.js, implementing the creator's concept faithfully in real 3D. This is an ULTRA-PREMIUM COMMERCIAL product — it must look like a cinematic, high-production 3D game. Never a tech demo, never floating primitives on a flat plane.
THREE.JS SETUP (the ONLY allowed external resource — include this exact tag first in <head>):
<script src="https://www.joshrix.com/assets/vendor/three.min.js"><\/script>
This is three.js r147 UMD: the global THREE. NO ES modules, NO import statements, NO addons (OrbitControls/EffectComposer/GLTFLoader are NOT available — write your own camera logic; build all assets procedurally).
VISUAL FIDELITY BAR (all of these — this is what the creator is paying premium for):
- Full lighting rig: THREE.HemisphereLight (sky/ground colours) + directional key light WITH SHADOWS (renderer.shadowMap.enabled=true, type=THREE.PCFSoftShadowMap; castShadow/receiveShadow on meshes; tune shadow.camera bounds + mapSize 2048) + coloured accent point lights. THREE.Fog or FogExp2 matched to the sky for atmospheric depth.
- A real SKY: large inverted sphere or scene.background gradient via procedural CanvasTexture — sun/moon disc, stars or clouds as fits the concept. Never a flat colour void.
- PROCEDURAL TEXTURES: use CanvasTexture (draw noise, stripes, grain, windows, bark, rock mottling onto an offscreen canvas) on MeshStandardMaterial with tuned roughness/metalness — surfaces must look like material, not plastic. Emissive maps for glow (crystals, windows at night, lava).
- A COMPOSED WORLD with density: build recognisable structures from grouped primitives (THREE.Group) — trees with layered canopies, buildings with window textures, rocks from distorted geometry (displace vertices with noise), terrain from a displaced PlaneGeometry. Scatter background detail with THREE.InstancedMesh (hundreds of grass tufts/trees/rubble instances) so the world feels FULL to the horizon.
- MOTION EVERYWHERE: idle bobbing, foliage sway, water shimmer (animated vertex displacement), rotating/pulsing collectables, particle systems (THREE.Points with additive blending) for magic/dust/rain/sparks, squash-and-stretch or tilt on the player.
- CINEMATIC CAMERA: slow orbit or dolly on the title screen; smooth lagged follow with lookAt during play; subtle screen shake on impacts; a brief victory orbit on win.
- Colour grading feel: choose a cohesive palette, use fog + light colours together, add a subtle CSS vignette overlay div for depth.
GAME REQUIREMENTS:
- Player-controlled entity with smooth eased movement; collisions via distance checks. Works with BOTH touch (drag) and mouse + arrow/WASD keys. window resize handler; renderer.setPixelRatio(Math.min(devicePixelRatio,2)); antialias:true.
- HUD as styled DOM overlay divs (position:fixed) over the WebGL canvas: score, lives/health, level name — styled to match the game's identity. Animated title overlay with START -> gameplay -> win/lose overlay with restart. A pause button.
- Rising difficulty across the blueprint's levels. 3-8 minute session. Distinct enemy behaviours (patrol, chase, ambush — not one clone).
- Procedural WebAudio sound design: distinct SFX per event + ambient bed + mute button; AudioContext only on first user gesture.
- All player-facing text in the creator's language. Age-appropriate. No real brands or licensed characters.
- If typeof THREE === "undefined" after the script tag, write a visible message into the page and stop cleanly (no throw loop).
PERFORMANCE: target 60fps on mobile — InstancedMesh over many meshes, cap shadow casters, reuse geometries/materials, no per-frame allocations in the loop.
SIZE: 800-1100 lines. Ship a COMPLETE file — a finished world at this size beats a truncated epic; density grows through Enhance passes. Never truncate.
${RUNTIME_SAFETY}`;

const ENHANCE_SYSTEM = `You are the JOSHRIX Polish Agent. You receive a COMPLETE working HTML game file (2D canvas or three.js 3D). Return an UPGRADED version of the SAME game as ONE html file: identical core gameplay and controls, dramatically higher production value.
RAISE (as applicable): lighting & shadows, procedural-texture material quality, world density (more composed/instanced detail), particle richness, animation polish (easing, squash-stretch, idle motion), sky/atmosphere, HUD styling, sound design depth, camera cinematics, difficulty curve fairness, and any creator notes provided.
PRESERVE: the game's title, language, mechanics, win/lose flow, mobile+desktop controls, and the three.js script tag if present (it is the only allowed external resource; for 2D files external resources stay forbidden).
Fix any bugs you notice. Never remove features. Output must be the COMPLETE file — never a diff, never truncated.
${RUNTIME_SAFETY}`;

export const FORGE_GAME_ACU_CHARGE = 300;       // HOLD (2D estimate) — settled to metered 4x actual
export const FORGE_GAME_3D_ACU_CHARGE = 1200;   // HOLD (3D estimate) — settled to metered 4x actual
export const FORGE_MIN_CHARGE = 40;             // metered floor when the Code Agent ran
export const ENGINE_BUILD_CHARGE = 60;          // flat platform charge when only the engine built
export const ENHANCE_HOLD = 500;                // HOLD per enhance pass — settled to metered 4x actual

/** The serverless function dies hard at 300s — a generation that runs past it
 *  drops the connection and the creator sees "Code Agent unreachable" with no
 *  response at all. Abort the model stream at 240s instead: the caller catches
 *  the error, ships the guaranteed engine build, and settles the small flat
 *  charge — a playable answer ALWAYS comes back inside the platform ceiling. */
const GENERATION_DEADLINE_MS = 240_000;
async function finishWithinDeadline(stream: ReturnType<Anthropic["messages"]["stream"]>): Promise<Anthropic.Message> {
  const killer = setTimeout(() => { try { stream.abort(); } catch { /* already done */ } }, GENERATION_DEADLINE_MS);
  try {
    return await stream.finalMessage();
  } finally {
    clearTimeout(killer);
  }
}

/** Polish Agent: take a working build and raise its production value. Each pass is
 *  metered at 4x — creators stack passes without limit to push fidelity ever higher. */
export async function enhanceGameHtml(
  html: string,
  opts: { notes?: string; language?: string } = {},
): Promise<{ html: string; provider: string; usage?: TokenUsage }> {
  if (!process.env.ANTHROPIC_API_KEY) return { html, provider: "demo" };
  const anthropic = new Anthropic();
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-5",
    max_tokens: 15000,
    system: ENHANCE_SYSTEM,
    messages: [{
      role: "user",
      content: `Creator's enhancement notes: ${opts.notes?.slice(0, 2000) || "(none — apply your full fidelity bar)"}\nLanguage of player-facing text: ${opts.language && opts.language !== "auto" ? opts.language : "keep the file's current language"}\n\nCurrent game file:\n${html}`,
    }],
  });
  const msg = await finishWithinDeadline(stream);
  let text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  const start = text.indexOf("<!DOCTYPE");
  const altStart = start === -1 ? text.indexOf("<html") : start;
  if (altStart === -1) throw new Error("Polish Agent returned no HTML document");
  text = text.slice(start === -1 ? altStart : start);
  const end = text.lastIndexOf("</html>");
  if (end !== -1) text = text.slice(0, end + 7);
  return {
    html: text, provider: "claude",
    usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
  };
}

/** Pull a complete HTML document out of a model reply (or throw). */
function extractHtml(text: string): string {
  const start = text.indexOf("<!DOCTYPE");
  const altStart = start === -1 ? text.indexOf("<html") : start;
  if (altStart === -1) throw new Error("model returned no HTML document");
  let out = text.slice(start === -1 ? altStart : start);
  const end = out.lastIndexOf("</html>");
  if (end !== -1) out = out.slice(0, end + 7);
  return out;
}

const PROVIDER_TIMEOUT_MS = 200_000;

/** Gemini REST fallback (activates when GEMINI_API_KEY is set in Vercel). */
async function geminiGenerate(system: string, user: string, maxTokens: number): Promise<{ html: string; usage?: TokenUsage }> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.9 },
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
  const j: any = await r.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("");
  const u = j.usageMetadata;
  return {
    html: extractHtml(text),
    usage: u ? { inputTokens: Number(u.promptTokenCount || 0), outputTokens: Number(u.candidatesTokenCount || 0) } : undefined,
  };
}

/** OpenAI REST fallback (activates when OPENAI_API_KEY is set in Vercel). */
async function openaiGenerate(system: string, user: string, maxTokens: number): Promise<{ html: string; usage?: TokenUsage }> {
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_completion_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`OpenAI HTTP ${r.status}`);
  const j: any = await r.json();
  const text = j.choices?.[0]?.message?.content || "";
  const u = j.usage;
  return {
    html: extractHtml(text),
    usage: u ? { inputTokens: Number(u.prompt_tokens || 0), outputTokens: Number(u.completion_tokens || 0) } : undefined,
  };
}

export async function generateGameHtml(
  prompt: string,
  opts: { title?: string; summary?: string; language?: string; mode?: string } = {},
): Promise<{ html: string; provider: string; usage?: TokenUsage }> {
  const system = opts.mode === "3d" ? GAME_SYSTEM_3D : GAME_SYSTEM;
  const maxTokens = opts.mode === "3d" ? 15000 : 12000;
  const userMsg = `Creator's game concept:\n${prompt}\n\nBlueprint title: ${opts.title ?? "(derive from concept)"}\nBlueprint summary: ${opts.summary ?? "(none)"}\nCreation language: ${opts.language && opts.language !== "auto" ? opts.language : "auto-detect from the concept"}`;

  // MULTI-PROVIDER CHAIN — no single vendor may block a creator's game.
  // Claude first (best code quality), then Gemini, then OpenAI; whichever
  // answers first with a complete file ships as the bespoke build.
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const anthropic = new Anthropic();
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-5",   // Code Agent: fast frontier coder; Idea Agent stays on Opus
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userMsg }],
      });
      const msg = await finishWithinDeadline(stream);
      const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      return {
        html: extractHtml(text), provider: "claude",
        usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
      };
    } catch { /* fall through to the next provider */ }
  }
  if (process.env.GEMINI_API_KEY) {
    try {
      const g = await geminiGenerate(system, userMsg, maxTokens);
      return { html: g.html, provider: "gemini", usage: g.usage };
    } catch { /* fall through */ }
  }
  if (process.env.OPENAI_API_KEY) {
    try {
      const o = await openaiGenerate(system, userMsg, maxTokens);
      return { html: o.html, provider: "openai", usage: o.usage };
    } catch { /* fall through */ }
  }
  if (process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) {
    throw new Error("all configured AI providers failed this run");
  }
  // demo fallback (no AI key): a tiny real playable game so the flow stays testable offline
  const title = (opts.title || "Your Game").replace(/[<>&]/g, "");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:#050508;color:#F4F4FA;font-family:system-ui;display:flex;flex-direction:column;align-items:center}
h3{color:#22D3EE;margin:12px 0 4px}p{color:#9CA3B8;margin:0 0 8px;font-size:13px}canvas{max-width:100%;touch-action:none;border:1px solid #333;border-radius:8px}</style>
</head><body><h3>${title}</h3><p>Demo build (offline) — tap the orbs before they fade!</p><canvas id="c" width="560" height="380"></canvas>
<script>const cv=document.getElementById('c'),cx=cv.getContext('2d');let orbs=[],score=0,miss=0,t=0,speed=1400;
function spawn(){orbs.push({x:40+Math.random()*480,y:40+Math.random()*300,r:26,born:Date.now()})}
setInterval(()=>{spawn();speed=Math.max(600,speed-15)},1400);
function draw(){cx.fillStyle='#050508';cx.fillRect(0,0,560,380);t++;
orbs=orbs.filter(o=>{const age=(Date.now()-o.born)/speed;if(age>1){miss++;return false}
cx.beginPath();cx.arc(o.x,o.y,o.r*(1-age*0.5),0,7);cx.fillStyle=age<0.5?'#7C3AED':'#E879F9';cx.fill();return true});
cx.fillStyle='#22D3EE';cx.font='bold 16px system-ui';cx.fillText('SCORE '+score,12,24);cx.fillStyle='#FB7185';cx.fillText('MISSED '+miss,120,24);
requestAnimationFrame(draw)}
function tap(e){const r=cv.getBoundingClientRect(),p=e.touches?e.touches[0]:e;const x=(p.clientX-r.left)*(560/r.width),y=(p.clientY-r.top)*(380/r.height);
orbs=orbs.filter(o=>{if(Math.hypot(o.x-x,o.y-y)<o.r+8){score++;return false}return true});e.preventDefault()}
cv.addEventListener('mousedown',tap);cv.addEventListener('touchstart',tap,{passive:false});draw();</script></body></html>`;
  return { html, provider: "demo" };
}
