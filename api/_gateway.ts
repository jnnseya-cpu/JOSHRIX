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

export const BUILD_ID = "2026-07-29.30";
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

/* ---------------- Code Agent: real playable game generation ---------------- */

const GAME_SYSTEM = `You are the JOSHRIX Code Agent. Generate a COMPLETE, self-contained HTML5 mini-game as ONE html file, implementing the creator's concept as faithfully as a 2D canvas web game allows.
HARD REQUIREMENTS:
- ONE file. No external resources of any kind: no CDNs, no images, no fonts, no network calls, no localStorage.
- <canvas>-based. Works with BOTH mouse and touch. Canvas scales responsively (max-width:100%, touch-action:none).
- Structure: title screen (game title + one-line how-to-play + START) -> core gameplay loop with score/progress -> win/lose states with restart.
- Rising difficulty over time or levels. A satisfying 3-8 minute session. requestAnimationFrame; smooth on mobile.
- Premium dark aesthetic: background #050508 family with violet #7C3AED and cyan #22D3EE accents, unless the concept clearly demands another palette (e.g. a bright children's world -> vivid colours are correct).
- Lightweight procedural WebAudio sound effects (no audio files) + a mute button; create the AudioContext only on the first user gesture.
- All player-facing text in the creator's language (use the provided language, else detect from the concept).
- Age-appropriate for the stated audience. No real brands, clubs, celebrities or licensed characters.
RUNTIME SAFETY — the game renders inside a sandboxed, opaque-origin iframe. A single uncaught error paints a BLANK screen, so:
- Something MUST be painted to the canvas within the first frame of load (draw the title screen immediately on script run — never wait for an event, image, or timer before the first paint).
- Every function must be DEFINED BEFORE it is called on the boot path — no ReferenceError / "x is not defined" / calling a function above its declaration in the load order. Declare helpers first, then start the loop.
- Do NOT touch localStorage, sessionStorage, cookies, or any Storage API — the sandbox throws on them. Keep all state in plain JS variables.
- Wrap the whole boot in try/catch and inside requestAnimationFrame callbacks; guard every input handler. Never reference an id/element before it exists in the DOM.
- No optional-chaining/nullish assumptions about objects that may be undefined; initialise arrays/objects before use.
SIZE: keep the entire file under ~450 lines — tight, polished, fast to generate.
OUTPUT: nothing but the file. Start with <!DOCTYPE html>. No markdown fences, no commentary.`;

export const FORGE_GAME_ACU_CHARGE = 300;

export async function generateGameHtml(
  prompt: string,
  opts: { title?: string; summary?: string; language?: string } = {},
): Promise<{ html: string; provider: string }> {
  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",   // Code Agent: fast frontier coder; Idea Agent stays on Opus
      max_tokens: 9000,
      system: GAME_SYSTEM,
      messages: [{
        role: "user",
        content: `Creator's game concept:\n${prompt}\n\nBlueprint title: ${opts.title ?? "(derive from concept)"}\nBlueprint summary: ${opts.summary ?? "(none)"}\nCreation language: ${opts.language && opts.language !== "auto" ? opts.language : "auto-detect from the concept"}`,
      }],
    });
    let text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    const start = text.indexOf("<!DOCTYPE");
    const altStart = start === -1 ? text.indexOf("<html") : start;
    if (altStart === -1) throw new Error("Code Agent returned no HTML document");
    text = text.slice(start === -1 ? altStart : start);
    const end = text.lastIndexOf("</html>");
    if (end !== -1) text = text.slice(0, end + 7);
    return { html: text, provider: "claude" };
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
