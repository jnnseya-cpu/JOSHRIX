/**
 * JOSHRIX AI Gateway — deployed serverless edition.
 * Claude (claude-opus-5) is the primary brain; when no key is configured the
 * gateway serves a deterministic demo blueprint so the platform demos end-to-end
 * on a fresh deploy. Full multi-provider fallback chain: backend/ai-gateway/.
 */
import Anthropic from "@anthropic-ai/sdk";
import { Script } from "node:vm";
import { GameBlueprintSchema, type GameBlueprint, ACU } from "../shared/contracts";
import { wrapUntrusted, scanGeneratedHtml, describeVerdict } from "./_security";

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

/**
 * What is actually deployed. Derived from the commit Vercel built, because a
 * hand-maintained string goes stale silently: this read "2026-08-12.77" on
 * 18 Aug, six days and several fixes later, so it could not answer the one
 * question it exists for — is the running code the code I just pushed?
 * Falls back to a literal for local runs, where there is no commit to read.
 */
export const BUILD_ID =
  (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "local-dev";

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

/**
 * Pull the first COMPLETE top-level JSON object out of a model reply.
 *
 * Every JSON path here used to do `text.indexOf("{")` to `text.lastIndexOf("}")`.
 * That is wrong in the exact case that matters: when a reply is TRUNCATED
 * mid-array, lastIndexOf lands on the closing brace of some nested object, so
 * the slice ends inside an array that was never closed. JSON.parse then reports
 * "Expected ',' or ']' after array element at position N" — which reads like a
 * malformed model reply and is really a truncated one, cut in the wrong place by
 * us. That is the error the Studio showed at position 6220.
 *
 * This scans with a depth counter and skips over string literals and their
 * escapes, so a brace inside "a }" cannot end the object early. It returns null
 * rather than a broken slice when no complete object exists, so the caller can
 * fall through to the next provider instead of parsing rubbish.
 */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);   // first balanced object
    }
  }
  return null;                                            // truncated — never guess
}

export async function generateBlueprint(
  prompt: string,
  opts: { type?: string; platform?: string; scope?: string; language?: string } = {},
): Promise<{ blueprint: GameBlueprint; provider: string; usage?: TokenUsage }> {
  const user = `Game description: ${prompt}\nGame type: ${!opts.type || opts.type === "auto" ? "infer the best-fit genre from the description" : opts.type}\nTarget platform: ${opts.platform ?? "all"}\nScope package: ${opts.scope ?? "commercial starter"}\nCreation language: ${opts.language && opts.language !== "auto" ? opts.language : "auto-detect from the description"}`;

  // 8000, not 4000. A blueprint that truncates is a dead forge: the creator
  // cannot proceed at all, and the failure surfaces as an unreadable JSON
  // position error. Headroom is far cheaper than a blocked creator.
  const MAX = 8000;

  const parse = (text: string, who: string) => {
    const json = extractJsonObject(text);
    if (!json) throw new Error(`${who} returned no complete JSON object (reply likely truncated)`);
    return GameBlueprintSchema.parse(JSON.parse(json));
  };

  // The game chain has had three providers for weeks; the blueprint had ONE, so
  // a single Anthropic hiccup or one over-long reply blocked the whole platform
  // before a forge could even start. Same principle, same order of preference.
  const errors: string[] = [];

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const anthropic = new Anthropic();
      const msg = await anthropic.messages.create({
        model: "claude-opus-5", max_tokens: MAX, system: SYSTEM,
        messages: [{ role: "user", content: user }],
      });
      const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      return {
        blueprint: parse(text, "Idea Agent"), provider: "claude",
        usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
      };
    } catch (e: any) { errors.push("claude: " + String(e?.message ?? e)); }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const r = await geminiText(SYSTEM, user, MAX);
      return { blueprint: parse(r.text, "Idea Agent (gemini)"), provider: "gemini", usage: r.usage };
    } catch (e: any) { errors.push("gemini: " + String(e?.message ?? e)); }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const r = await openaiText(SYSTEM, user, Math.min(MAX, 12000));
      return { blueprint: parse(r.text, "Idea Agent (openai)"), provider: "openai", usage: r.usage };
    } catch (e: any) { errors.push("openai: " + String(e?.message ?? e)); }
  }

  // Only when a key exists and EVERY provider failed. With no keys at all we
  // fall through to the deterministic blueprint below, as before.
  if (errors.length) throw new Error("Blueprint generation failed — " + errors.join(" | "));

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
- The START control MUST be a plain <button type="button"> or <div> with BOTH click and touchstart listeners attached AFTER the element exists — never a form submit, never an inline onclick calling a function scoped inside an IIFE. Starting the game must be the single most reliable interaction in the file.
- No optional-chaining/nullish assumptions about objects that may be undefined; initialise arrays/objects before use.
OUTPUT: nothing but the file. Start with <!DOCTYPE html>. No markdown fences, no commentary.`;

const GAME_SYSTEM = `You are the JOSHRIX Code Agent. Generate a COMPLETE, self-contained HTML5 game as ONE html file, implementing the creator's concept as faithfully as a 2D canvas web game allows. This is a COMMERCIAL product a creator will sell — it must feel like a polished paid arcade game, never a prototype.
HARD REQUIREMENTS:
- ONE file. No CDNs, no fonts, no network calls, no localStorage. The ONLY external resources allowed are sprites from the JOSHRIX sprite library listed below — nothing else, from anywhere.
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
ART — OPTIONAL, AND ONLY AFTER THE GAME ABOVE IS COMPLETE. Everything above is what makes it a game; the list below is what makes it look good. If you have to choose, choose the game. A finished game drawn in plain shapes beats a beautiful empty field, and an empty field is the single most common way a build fails.
JOSHRIX SPRITE LIBRARY — 2,553 hosted CC0 PNG sprites, every one verified to decode. Real art beats drawn shapes: a game built from these reads as a product, a game of drawn circles reads as a prototype.
Base URL: https://www.joshrix.com/assets/sprites/<pack>/<name>.png  — e.g. .../kenney-platformer/grass_mid.png
SPRITES ARE A BONUS LAYER, NEVER LOAD-BEARING — this is the rule that keeps a build alive:
- Draw the FIRST FRAME before any image has loaded. Never await images, never gate the title screen on them, never build the game inside an onload handler.
- Every sprite needs a procedural fallback: keep your drawn version, and only swap in the image once it has actually loaded. img.onerror must leave the game fully playable.
- Load with img.crossOrigin = "anonymous" (the asset host sends CORS headers) so the canvas stays untainted.
- Pattern: const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => img.ready = true; img.src = URL;  then at draw time: if (img.ready) ctx.drawImage(img, x, y, w, h); else drawItMyself(x, y, w, h);
- The manifest at https://www.joshrix.com/assets/sprites/manifest.json carries every sprite's real pixel size, but you cannot fetch it while generating — the names below are exact and verified, so use these and do not invent others.
- kenney-platformer (335) a COMPLETE side-scrolling platformer set. Ground tiles come in six biomes — grass dirt sand snow stone castle — each with the same suffixes: _mid _left _right _center _half _half_left _half_mid _half_right _hill_left _hill_right _ledge_left _ledge_right _cliff_left _cliff_right (e.g. grass_mid, dirt_half_mid, snow_cliff_left, castle_mid, sand_left, stone_right) · PLAYERS p1_stand p1_front p1_jump p1_duck p1_hurt p1_walk p1_walk01 p1_walk02 p1_walk03 p1_walk04 p1_walk05 p1_walk06 p1_walk07 p1_walk08 p1_walk09 p1_walk10 p1_walk11 · ENEMIES slime_walk1 slime_walk2 slime_dead fly_fly1 fly_fly2 fly_dead fish_swim1 fish_swim2 fish_dead snail_walk1 snail_walk2 snail_shell poker_mad poker_sad blocker_mad blocker_sad · PICKUPS coin_gold coin_silver coin_bronze gem_blue gem_green gem_red gem_yellow star key_blue key_green key_red key_yellow mushroom_red mushroom_brown box_coin box_item box_empty box_explosive · HAZARDS spikes fireball bomb bomb_flash liquid_lava liquid_lava_top liquid_water liquid_water_top weight weight_chained · WORLD cloud1 cloud2 cloud3 bush cactus plant plant_purple rock hill_small hill_large torch toch_lit ladder_mid ladder_top rope_vertical rope_horizontal springboard_up springboard_down bridge sign sign_left sign_right sign_exit door_open_top door_open_mid door_closed_top flag_red flag_green flag_blue window fence brick_wall bg bg_castle · HUD hud_0 hud_1 hud_2 hud_3 hud_4 hud_5 hud_6 hud_7 hud_8 hud_9 hud_x hud_coins hud_heart_full hud_heart_half hud_heart_empty hud_gem_blue hud_gem_red hud_key_blue hud_p1 hud_p2
That whole player set repeats under the prefixes p2_ and p3_, giving three playable characters.
- kenney-topdown (581) top-down survival and shooters: survivor1_stand survivor1_hold survivor1_gun survivor1_machine survivor1_silencer survivor1_reload · weapon_gun weapon_machine weapon_silencer
Those same six poses exist under eight more prefixes: hitman1_ soldier1_ robot1_ zoimbie1_ man_blue_ man_brown_ man_old_ woman_green_ — nine figures in all. Kenney misspells zombie as zoimbie1_; type it exactly that way or it 404s. The pack also holds 520 ground tiles named tile_01 to tile_136 with no descriptive names, so use those where any floor tile will do rather than to lay out a specific room.
- kenney-dungeon (168) top-down RPG figures with animation cycles: male_0_idle0 male_0_run0 male_0_run1 male_0_run9 male_0_pickup0 male_0_pickup9 male_3_run4 male_7_idle0
The prefixes run male_0_ through male_7_. Filenames are prefix + action + a SINGLE-digit frame — male_0_run4, never male_0_run04. Each prefix carries one idle frame, ten running frames and ten pickup frames.
- kenney-puzzle (795) match-3, breakout and board puzzles: ball_blue_01 … ball_blue_10 (also ball_black_ ball_grey_ ball_yellow_), coin_01 … coin_32 as a spin cycle, back_tile_01 … back_tile_18 backgrounds, plus paddle, pipe and particle pieces.
- kenney-icons (186) crisp WHITE UI icons for HUD and menus, best on a dark ground: arrow_up arrow_down arrow_left arrow_right audio_on audio_off music_on music_off checkmark cross exit pause stop next previous rewind fast_forward return open save power menu_grid menu_list · star trophy medal1 medal2 coin diamond key flag target figurine gear wrench warning question information exclamation locked unlocked · gamepad joystick dpad dpad_up dpad_down dpad_left dpad_right button_a button_b button_x button_y button_start button_select mouse mouse_left mouse_right pointer cursor · singleplayer multiplayer leaderboards_simple user_robot share1 shopping_cart trashcan zoom_in zoom_out plus minus
- kenney-rpg-urban (488) NUMBERED: modern-city RPG tiles, tile_0000 through tile_0487, with no descriptive names. Good for scattering urban detail; use kenney-platformer when you need a specific named piece.
SIZE: 650-900 lines. Ship a COMPLETE file — finishing the game matters more than length; depth comes from Enhance passes. Never pad; never truncate.
${RUNTIME_SAFETY}`;

const GAME_SYSTEM_3D = `You are the JOSHRIX Code Agent. Generate a COMPLETE HTML5 **3D** game as ONE html file using three.js, implementing the creator's concept faithfully in real 3D. This is an ULTRA-PREMIUM COMMERCIAL product — it must look like a cinematic, high-production 3D game. Never a tech demo, never floating primitives on a flat plane.
BUILD ON THE JOSHRIX 3D RUNTIME. This is not optional scaffolding — it is how a 3D game is written here.
Include these three tags, in this order, and nothing else:
<script src="https://www.joshrix.com/assets/vendor/three.min.js"><\/script>
<script src="https://www.joshrix.com/assets/vendor/GLTFLoader.js"><\/script>
<script src="https://www.joshrix.com/assets/vendor/joshrix3d-1.js"><\/script>
The runtime already owns, and guarantees, every part that has historically shipped broken: the canvas is created and on screen before your first line runs; the loop renders from frame one and survives a throwing frame; shadows, fog, a procedural sky dome whose horizon matches the fog exactly, a textured ground, a three-light rig; the title and game-over screens; the HUD; drag and WASD input; a twenty-sound procedural sound library and seven looping ambience beds, opened on the first gesture, with a mute button; a particle pool; portrait and landscape camera framing; and a reduced render budget on phones. You do NOT write any of that, and you must not try.
var G = JOSHRIX3D.boot({ title, titleAccent, tagline, howTo, arena, playRadius, accent, sky:{top,mid,haze}, ground:{base,speckle} });
sky.haze is the horizon and the fog, so it is the colour that fills most of the frame — pick THAT one for the mood, and use sky.mid/sky.top for the band above it. Add sea:true ONLY for an island, coast or ocean concept: it lays a wide water disc that becomes the horizon and hides the sky, which is wrong for a forest, a desert, a city or space.
What G gives you: G.scene G.camera G.renderer G.THREE · G.state G.score G.lives G.wave G.elapsed · G.keys G.target (a Vector3 the pointer and WASD both steer) · G.arena G.playRadius
- G.load(key, "lib/guardian", { height: 1.9, onLoad: fn }) — queue a model, chainable, NEVER blocks. Pass height for anything upright, size for wide flat things like a nest or a platform (sizing a flat disc by height scales it enormously), or scale for a raw multiplier.
- G.onReady(fn) — fires once every queued model has resolved, loaded or failed.
- G.get(key) — a fresh instance at the right scale, or null if that model failed. Skinned characters are rebound so each copy animates on its own.
- G.actor(key, "walk") — an instance with its own mixer; .play("run") to switch clip. The runtime updates every mixer for you.
- G.tint(obj, "#ff3b3b") · G.tint(obj, "#ff3b3b", 0.35) to blend part-way — RECOLOUR A MODEL ONLY THIS WAY. get() and actor() return the glTF scene ROOT, which is a Group, and a Group has NO .material. Writing obj.material.color.set(...) throws "Cannot read properties of undefined (reading 'color')" and kills the build on frame one — it is the single most common way a 3D build dies here. G.tint also clones the material first, so tinting one enemy red does not turn the entire squad red.
- G.scatter(key, count, { minR, maxR, avoid, avoidRadius }) — ring the arena with scenery. The default band sits OUTSIDE playRadius so nothing tall can stand between the camera and the player.
- G.burst(pos, colour) · G.flash("#ff3b3b")
- G.sfx(name, { gain, pitch }) — THE SOUND LIBRARY. Name the event, never synthesise it: click step pickup coin powerup jump land thud hit hurt shoot laser explode spark whoosh splash door alarm win lose. gain scales loudness and pitch scales pitch, so G.sfx("hit") and G.sfx("hit", { pitch: 0.7, gain: 1.4 }) are a light hit and a heavy one without a second name. Reach for this for EVERY event the player causes or suffers — a game whose only sounds are the runtime's own start and game-over cues reads as unfinished.
- G.ambience("night") — the looping bed under everything: wind rain sea forest night city hum. Set it once inside G.onStart, pass nothing to stop it. One bed at a time; a second replaces the first. This is what makes a world feel like a place rather than a screen, and it costs one line.
- G.beep(freq, dur, type, gain) — the raw oscillator, still here for a pitch you specifically need (a rising alarm, a tuned puzzle chime). Prefer G.sfx: it is a designed sound, not a tone.
- G.say("The gate is waking.", { rate, pitch, interrupt:true }) — the game SPEAKS, out loud, in the creator's language. Use it when the concept has anyone who would talk: a narrator, a guide, a boss who taunts, a tutorial, a coach, a story beat. Beeps cannot carry a sentence. Keep lines short, write them in the creator's language, and do not narrate every pickup — a line the player hears on every collect stops being heard. An arcade concept with no speaking character should stay on beeps.
- G.stat("Score", n, "left") · G.pips("Lives", n, "♥", "right") — the HUD.
- G.follow(obj) — lagged chase camera on that object during play, cinematic orbit on the menus.
- G.onReset(fn) · G.onStart(fn) · G.onUpdate(function (g, dt) { ... }) — onUpdate runs ONLY while playing.
- G.over("Nest Lost", "You scored 240 …") — end the run.
YOUR JOB is the concept and only the concept: choose the models, build the world's fixed pieces, spawn and move the actors, decide what scores and what kills, and write the copy. Aim for 200-320 lines of game. If you find yourself writing a renderer, a sky, a loader, an overlay or a game loop, stop — the runtime already did it, and your version is what breaks.
EVERY model is optional. G.get returns null when a download failed; always have a primitive stand-in ready so the game stays playable. Build the player and any critical object from THREE primitives FIRST and swap the model in inside onLoad — that is why a build survives when the asset host is slow.
UNDERLYING ENGINE: three.js r147 UMD — the global THREE, plus THREE.GLTFLoader, plus the JOSHRIX3D runtime above. NO ES modules, NO import statements, NO CDNs, NO other addons (OrbitControls and EffectComposer are NOT available; the runtime's camera replaces them). Those three script tags are the ONLY external resources allowed, alongside models from the library below.
WORKED EXAMPLE — a complete, finished game on the runtime. Yours will differ in concept; this is the SHAPE of done. Note how short it is: the runtime is doing the engine work, so every line here is about the game.
var G = JOSHRIX3D.boot({ title: "Reef Runner", titleAccent: "Runner", tagline: "Outswim the tide.",
  howTo: "Drag or use WASD. Collect pearls, dodge the eels.", arena: 22, playRadius: 16, accent: "#5ee0d0",
  sky: { top: "#08283f", mid: "#1f6f8f", haze: "#7fc9d8" }, ground: { base: "#2e6b6b", speckle: ["#37807d","#255c5c"] } });
var T = G.THREE, player = new T.Group(), pearls = [], eels = [];
var body = new T.Mesh(new T.CapsuleGeometry(0.35, 0.9, 4, 10), new T.MeshStandardMaterial({ color: 0x8fd6c7 }));
body.position.y = 1; body.castShadow = true; player.add(body);      // visible BEFORE any model lands
player.position.set(0, 0, 6); G.scene.add(player); G.follow(player); G.target.set(0, 0, 6);
G.load("hero", "lib/guardian", { height: 1.9, onLoad: function () {
  player.remove(body); var a = G.actor("hero", "walk"); if (a) player.add(a.obj); } })
 .load("eel", "lib/enemy_slime", { height: 1.2 })
 .load("pearl", "lib/crystal_0", { height: 0.9 })
 .load("weed", "lib/bush_0", { height: 0.8 });
G.onReady(function () { G.scatter("weed", 14, { minR: 4, maxR: 20 }); });
function spawnPearl() { var o = G.get("pearl") || new T.Mesh(new T.OctahedronGeometry(0.4), new T.MeshStandardMaterial({ color: 0xfff0a0 }));
  var a = Math.random() * 6.28, r = 4 + Math.random() * 10; o.position.set(Math.cos(a) * r, 0.6, Math.sin(a) * r); G.scene.add(o); pearls.push(o); }
function spawnEel() { var e = G.actor("eel"), o = e ? e.obj : new T.Mesh(new T.SphereGeometry(0.6), new T.MeshStandardMaterial({ color: 0x9b4dca }));
  var a = Math.random() * 6.28; o.position.set(Math.cos(a) * 18, 0, Math.sin(a) * 18); G.scene.add(o); eels.push(o); }
G.onReset(function (g) { pearls.forEach(function (p) { g.scene.remove(p); }); pearls.length = 0;
  eels.forEach(function (e) { g.scene.remove(e); }); eels.length = 0;
  player.position.set(0, 0, 6); g.target.set(0, 0, 6); g.lives = 3;
  for (var i = 0; i < 6; i++) spawnPearl(); spawnEel(); hud(); });
function hud() { G.stat("Score", G.score, "left"); G.pips("Air", G.lives, "O", "right"); }
var t = 0;
G.onUpdate(function (g, dt) {
  var sp = 10 * dt;                                            // keyboard steers the same target the pointer does
  if (g.keys.a || g.keys.arrowleft) g.target.x -= sp;   if (g.keys.d || g.keys.arrowright) g.target.x += sp;
  if (g.keys.w || g.keys.arrowup) g.target.z -= sp;     if (g.keys.s || g.keys.arrowdown) g.target.z += sp;
  if (g.target.length() > g.playRadius) g.target.setLength(g.playRadius);
  player.position.lerp(g.target, 0.15);
  for (var i = pearls.length - 1; i >= 0; i--) { pearls[i].rotation.y += dt * 2;
    if (pearls[i].position.distanceTo(player.position) < 1.6) {
      g.burst(pearls[i].position, 0xfff0a0); g.scene.remove(pearls[i]); pearls.splice(i, 1);
      g.score += 10; hud(); g.sfx("coin"); spawnPearl(); } }
  for (var k = eels.length - 1; k >= 0; k--) { var e = eels[k];
    var d = new T.Vector3().subVectors(player.position, e.position); d.y = 0; d.normalize();
    e.position.addScaledVector(d, 3.2 * dt); e.rotation.y = Math.atan2(d.x, d.z);
    if (e.position.distanceTo(player.position) < 1.3) {
      g.scene.remove(e); eels.splice(k, 1); g.lives--; hud(); g.flash("#ff3b3b"); g.sfx("hurt");
      if (g.lives <= 0) g.over("Caught", "You gathered " + g.score + " pearls."); } }
  t += dt; if (t > Math.max(1.4, 4 - g.elapsed / 20)) { t = 0; spawnEel(); }
});
hud();
That is a finished game: a player you steer, something to collect, something that hunts you, a HUD, escalation, and an ending. If your file does not have all six, it is not finished — no amount of scenery substitutes for any of them.
USAGE RULES:
0. **CANVAS FIRST — historically the #1 cause of dead builds.** JOSHRIX3D.boot() puts the canvas on screen and starts the loop before it returns, so call it FIRST, at the top of your script, before anything else. Never await a model, never build the world inside a loader callback, never gate the title screen on a download.
1. Use G.load(key, path, opts) — never construct your own GLTFLoader. It is non-blocking and already sets castShadow/receiveShadow on every mesh.
2. Use G.get(key) for a copy and G.actor(key, clip) for an animated one. Never call .clone() yourself: a skinned character cloned raw leaves every copy bound to one skeleton, so they all animate as a single puppet.
3. G.get returns null when a model failed. Build the player and any critical object from THREE primitives first, then swap the model in inside onLoad.
4. Size every model with height (upright things) or size (wide flat things). Never leave a model at raw scale and never guess a multiplier — the libraries are authored at different scales and mixing them raw is what makes a character tower over the houses.
5. Terrain, water beyond the shore, particles and anything not in the library stay procedural — the runtime already provides the ground, the sky and the particle pool.
VISUAL FIDELITY BAR (all of these — this is what the creator is paying premium for).
HARD REQUIREMENTS — the gateway REJECTS a 3D file missing any of these three, so they are not suggestions:
(1) renderer.shadowMap.enabled = true with a shadow-casting directional light, (2) scene.fog = new THREE.Fog(...) or FogExp2 matched to the sky, (3) models from the JOSHRIX library below and/or procedural THREE.CanvasTexture materials — never bare untextured primitives.
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
- Sound: call G.sfx("<name>") on every event the player causes or suffers, and set one G.ambience(...) bed in G.onStart. Do NOT write an AudioContext, an oscillator or a noise buffer — the runtime owns all of it, including the mute button and opening audio on the first gesture. A build that hand-rolls a synth is rebuilding the engine, which is the failure mode here.
- All player-facing text in the creator's language. Age-appropriate. No real brands or licensed characters.
- If typeof THREE === "undefined" after the script tag, write a visible message into the page and stop cleanly (no throw loop).
PERFORMANCE: target 60fps on mobile — InstancedMesh over many meshes, cap shadow casters, reuse geometries/materials, no per-frame allocations in the loop.
SIZE: 260-420 lines of GAME. The runtime is the engine, so a finished 3D game on it is short — the worked example above is a complete one, and the reference build shipping on this platform is 227 lines. Padding toward a bigger number by rebuilding the renderer, the sky or the loader is the failure mode, not the goal. Ship a COMPLETE file; depth grows through Enhance passes. Never truncate.
${RUNTIME_SAFETY}

MODEL LIBRARY — reference list, below. It is a parts catalogue, not a brief. Pick the handful your concept needs and move on; a build that lists beautiful models and forgets the gameplay above has failed.
JOSHRIX MODEL LIBRARY — 2,435 hosted low-poly GLB models across four libraries, every one verified to load.
SCALE — READ THIS BEFORE PLACING ANYTHING. The three libraries are NOT built at the same scale, and mixing them raw is the most common way a 3D build looks broken:
· LIBRARY 1 (lib/) is metric — a character is ~2 units tall, so 1 unit ≈ 1 metre.
· LIBRARY 3 (Kenney packs/) is grid-based — 1 unit is one grid cell. A wall is 1.0 tall, a car 1.1, a big tree ~1.3, a tower section 1.0.
· LIBRARY 4 (Quaternius packs/) is authored large: a person is ~3 units tall in most packs, ~1.9 in quaternius-modular-men/women and quaternius-fantasy-outfits. Each entry below states its own height — read it and scale to your world rather than assuming.
So a LIBRARY 1 character dropped into a Kenney town stands twice the height of the houses. If you combine them, scale the Kenney models by 2 (or the LIBRARY 1 character by 0.5) — and prefer building a whole game from ONE library so the proportions agree by default.
Size your arena to your characters, not the other way round: a world 20–25 units across reads as a place when characters are ~2 units; the same characters on a 90-unit field read as specks. USE THESE for props, structures, enemies and characters instead of bare primitives whenever they fit the concept; a world built from these reads as a product, a world of raw spheres and boxes reads as a prototype.
LIBRARY 1 — JOSHRIX house models. Base URL: https://www.joshrix.com/assets/models3d/lib/  (append the filename, e.g. .../lib/tree_round_0.glb)
- TREES/PLANTS: tree_round_0 tree_round_1 tree_round_2 tree_pine_0 tree_pine_1 tree_palm tree_dead bush_0 bush_1 flower_0 flower_1 grass_tuft cactus log stump
- TERRAIN PROPS: rock_0 rock_1 rock_2 rock_flat mushroom_0 mushroom_1
- FANTASY: crystal_0 crystal_1 crystal_2 (emissive collectables) ruin_pillar ruin_pillar_broken ruin_arch fantasy_tower castle_wall castle_gate banner well lantern
- VILLAGE/TOWN: house_small house_large hut shop windmill (anim "spin") fence bridge signpost door
- PROPS/PICKUPS: chest_closed chest_open barrel crate torch campfire potion coin key star_collectable
- CHARACTERS (all ~1.7 tall, AnimationClips "idle" + "walk"): guardian hero_knight mage villager enemy_goblin
- CREATURES: enemy_slime (anim "bounce") enemy_bat (anim "fly") animal_deer (anim "walk")
- VEHICLES/SPACE (stylised): car boat cart rocket asteroid planet satellite
- FOOTBALL/SPORT: football goal stadium_stands pitch_tile corner_flag trophy scoreboard
- DINOSAURS (anim "idle" + "walk"): dino_trex dino_raptor dino_stego dino_bronto dino_trike · dino_egg dino_nest volcano fern_tree
- TERRAIN/DECOR: ground_tile stone_platform water_pool cloud_puff
LIBRARY 2 — DETAILED VEHICLES at https://www.joshrix.com/assets/models3d/vehicles/ (higher-detail models; use for racing, transport, war, sea, rail, flight and space concepts):
- CARS: basiccar copcar racecar car simplecar cop cop_suv suv sportscar sportscar2
- TRANSPORT: bus schoolbus taxi truck ambulance bicycle squareframebicycle
- STREET PROPS: trafficcone trafficlight trafficsign1 trafficsign2 trafficsign3
- RAIL: locomotive_front locomotive_wagon locomotive_coaltender locomotive_passengerwagon cargotrain_front cargotrain_wagon cargotrain_container highspeed_wagon railwaytrack_straight railwaytrack_curve (build a track from repeated straight/curve pieces)
- SEA: boat boatwsail sail_ship viking_boat cruiseship
- AIR: smallplane private_plane commercial_airplane military_airplane militaryairplane2
- SPACE: planet1 planet2 planet3 smallplanet1 moon smallmoon asteroid1 asteroid2 asteroid3 bigasteroid biggerasteroid
- MILITARY: tank
LIBRARY 3 — KENNEY CC0 KITS, 2,119 models in 22 themed kits. Base URL: https://www.joshrix.com/assets/models3d/packs/<kit>/<name>.glb — e.g. .../packs/kenney-nature-kit/tree_oak.glb
These are modular kits: pieces are designed to tile and stack on a grid, so build roads, rivers, walls, towers and levels by REPEATING and rotating tiles rather than modelling one big object. The names below are exact and verified — use these; do not invent other filenames from these kits.
- kenney-nature-kit (329) forests, terrain, farms: tree_oak tree_oak_dark tree_oak_fall tree_default tree_detailed tree_pine_default_a tree_pine_tall_a tree_pine_round_a tree_palm tree_palm_tall tree_palm_bend tree_thin tree_fat tree_cone tree_small · plant_bush plant_bush_large grass grass_large flower_red_a flower_purple_a flower_yellow_a mushroom_red mushroom_red_tall mushroom_tan hanging_moss lily_large · rock_large_a rock_tall_a rock_small_a stone_large_a stone_tall_a cliff_rock cliff_stone cliff_block_rock cliff_top_rock cliff_steps_rock cliff_waterfall_rock cliff_cave_rock · ground_grass ground_path_straight ground_path_bend ground_path_cross ground_river_straight ground_river_bend ground_river_cross platform_grass platform_stone path_stone path_wood · log log_large stump_round stump_old cactus_short cactus_tall campfire_logs campfire_stones tent_small_open tent_detailed_open canoe bridge_wood bridge_stone fence_simple fence_planks fence_gate sign · crop_carrot crop_pumpkin crops_corn_stage_c crops_wheat_stage_b crops_dirt_row statue_obelisk statue_head pot_large
- kenney-fantasy-town-kit (153) medieval village, modular walls/roofs: wall wall_door wall_window_glass wall_window_shutters wall_arch wall_corner wall_half wall_broken wall_wood wall_wood_door wall_wood_window_glass wall_wood_corner · roof roof_gable roof_corner roof_point roof_window roof_high roof_high_gable roof_flat chimney · stairs_stone stairs_wood pillar_stone pillar_wood planks poles overhang · fountain_round fountain_square fountain_center hedge hedge_gate fence fence_gate lantern banner_red banner_green · stall stall_red stall_green stall_bench cart cart_high wheel windmill watermill · road road_bend road_corner road_slope rock_large rock_small tree tree_high tree_crooked
- kenney-tower-defense-kit (146) grid levels, towers, enemies: tile tile_straight tile_corner_round tile_crossing tile_split tile_end tile_spawn tile_hill tile_slope tile_river_straight tile_river_bridge tile_tree tile_rock tile_crystal tile_dirt (every one also as snow_tile_*) · tower_round_base tower_round_bottom_a tower_round_middle_a tower_round_top_a tower_round_roof_a tower_round_crystals tower_round_sample_a tower_square_bottom_a tower_square_middle_a tower_square_top_a tower_square_sample_a (stack base+bottom+middle+top+roof to build a tower) · weapon_cannon weapon_ballista weapon_catapult weapon_blaster · enemy_ufo_red enemy_ufo_green enemy_ufo_purple enemy_ufo_yellow (each with a _weapon variant) · detail_tree detail_rocks detail_crystal detail_dirt wood_structure
- kenney-platformerkit (74) 3D platformer blocks: block block_large block_half block_slope block_slope_half block_corner_large block_end block_level block_moving block_hexagon block_cliff block_dirt (every one also as block_snow_*) · platform bridge bridge_ramp ladder ladder_long door button lever · coin_gold coin_silver coin_bronze jewel key heart flag · spikes spikes_large saw crate crate_strong barrel arrow sign rocks tree tree_snow mushrooms flowers hedge fence
- kenney-hexagonkit (63) hex strategy maps: grass grass_hill grass_forest dirt sand sand_rocks stone stone_hill stone_mountain water water_island water_rocks · building_house building_castle building_tower building_market building_mill building_farm building_mine building_dock building_village building_wall building_cabin building_sheep · path_straight path_corner path_crossing path_end river_straight river_corner river_crossing · unit_house unit_tower unit_tree unit_boat unit_mill
- kenney-graveyardkit (76) horror, gothic, Halloween: gravestone_cross gravestone_round gravestone_flat gravestone_broken gravestone_bevel gravestone_decorative grave grave_border coffin coffin_old crypt altar_stone altar_wood cross cross_wood · iron_fence iron_fence_curve iron_fence_border_gate stone_wall stone_wall_curve brick_wall fence fence_gate · lantern_candle lantern_glass lightpost_single fire_basket pillar_obelisk pillar_large column_large bench · ghost skeleton pumpkin pumpkin_carved pumpkin_tall_carved shovel digger pine pine_crooked rocks debris
- kenney-carkit (28) stylised cars: sedan sedan_sports hatchback_sports suv suv_luxury van truck truck_flat delivery delivery_flat police ambulance firetruck garbage_truck taxi race race_future tractor tractor_shovel · wheels sold separately: wheel_default wheel_racing wheel_dark wheel_truck
- kenney-racingkit (112) race tracks and circuits: road_straight-style pieces are road_corner_large road_corner_small road_corner_larger road_bump ramp rail rail_double pylon barrier_red barrier_white barrier_wall fence_straight fence_curved · race_car_red race_car_green race_car_orange race_car_white · grand_stand grand_stand_covered grand_stand_round pits_garage pits_office overhead overhead_lights billboard light_post_large flag_checkers flag_red flag_green banner_tower_red
- kenney-minigolf-kit (57) putting courses: start straight corner end hole_open hole_round hole_square ramp_a ramp_b ramp_sharp hill_round hill_square bump bump_walls tunnel_wide tunnel_narrow split split_t narrow_block obstacle_block obstacle_diamond obstacle_triangle windmill castle crest gap · ball_red ball_blue ball_green club_red club_blue club_green flag_red flag_blue flag_green
- kenney-furniturekit (140) interiors: bed_single bed_double bed_bunk chair chair_desk chair_cushion desk desk_corner bench bookcase_open bookcase_closed cabinet_television coat_rack ceiling_fan doorway floor_full floor_half · kitchen_fridge kitchen_stove kitchen_sink kitchen_cabinet kitchen_microwave kitchen_coffee_machine kitchen_blender kitchen_bar hood_modern · bathtub bathroom_sink bathroom_mirror bathroom_cabinet dryer · computer_screen computer_keyboard computer_mouse books cardboard_box_open bear
- kenney-food-kit (200) food and kitchen props: apple banana carrot corn broccoli cabbage avocado cherries coconut beet celery_stick · bread croissant cookie cake cake_birthday cupcake donut chocolate candy_bar · burger burger_cheese bacon cheese corn_dog chinese dim_sum · bowl bowl_soup cup cup_tea cup_saucer bottle_ketchup bottle_oil can carton barrel bag · cooking_knife cooking_fork cooking_spoon cooking_spatula cutting_board chopstick cocktail
- kenney-holidaypack (47) winter and festive: snowman snowman_fancy snow_fort snow_patch sled present present_round candy_cane wreath festivus_pole lights_multi lights_red lights_green lightpost bench · tree_decorated tree_pine tree_pine_snow tree_pine_snowed rock_formation_large rock_formation_small · cabin_wall cabin_window cabin_door cabin_roof cabin_roof_chimney cabin_corner cabin_floor · train_locomotive train_tender train_wagon track_straight track_corner
- kenney-castle-kit (57) medieval castles and sieges — note these names have NO underscores: wall wallhalf walldoor wallnarrow wallcorner wallcornerhalf wallpillar wallstud wallnarrowgate wallnarrowstairs wallnarrowwood walltonarrow gate metalgate door bridge stairsstone stairsstoneslant · towerbase towersquarebase towersquaremid towersquaremidwindows towersquaremidopen towersquaretop towersquareroof towersquaretoproof towertop towertopcorner towertoproof towerbalcony towersquare (stack base→mid→top→roof) · siegecatapult siegeballista siegeram siegetower siegetrebuchet sword shieldred shieldblue flagblue flagwhite flagbannerlong flagbannershort
- kenney-space-kit (60) sci-fi bases and ships — NO underscores: spacecraft1 spacecraft2 spacecraft3 spacecraft4 spacecraft5 spacecraft6 spacecraftstand · buildingcorner buildingcorridor buildingcorridoropen station stationlarge console consolescreen consolecorner portal robot stairs stairslong · groundtile groundtilerough crater craterlarge meteorfull meteorhalf rocks rockstall rocksore rockssmallore · pipestraight pipecorner piperamp pipesplit pipestand pipeopening metalfence metalstructure metalstructurecross satellitedish satellitedishlarge satellitedishantenna barrel barrellarge itemweapon lasersabel alienbones
- kenney-pirate-kit (30) pirates and islands: pirate_captain pirate_crew pirate_officer (three CHARACTERS) · ship_dark ship_light ship_wreck boat_large boat_small paddle · cannon cannonlarge cannonmobile cannonball chest bottle bottlelarge sword sword_scimitar shovel tower hole plant · palm_long palm_short palm_detailed_long palm_detailed_short formation_rock formation_stone formationlarge_rock formationlarge_stone
- kenney-road-kit (302) NUMBERED: road and junction tiles, roadtile_001 through roadtile_302, with no descriptive names. Load a handful, look at nothing — you cannot tell which is which from the name, so use them only where any road piece will do (scattering, background streets). For a track you can reason about, use kenney-racingkit or kenney-tower-defense-kit tiles instead.
- kenney-modular-buildings (101) NUMBERED: building sections, modularbuildings_001 through modularbuildings_101. Same caveat: numbered, not descriptive. Good for a skyline built by stacking random sections; use kenney-fantasy-town-kit when you need a named wall/roof/door.
- kenney-watercraft (29) NUMBERED: boats and ships, watercraftpack_001 through watercraftpack_029. Numbered; any one is a watercraft.
- kenney-medieval-town (67) modular stone-and-timber town, every name ends _01: grey_wall_01 grey_short_wall_01 grey_small_wall_01 grey_broken_wall_01 grey_corner_01 grey_arch_01 grey_triangle_01 grey_pole_01 grey_door_square_01 grey_door_round_01 grey_window_square_01 grey_window_round_01 grey_window_narrow_01 iron_door_01 castle_wall_01 · wood_wall_01 wood_small_wall_01 wood_corner_01 wood_arch_01 wood_door_01 wood_window_square_01 wood_railing_01 wood_pole_01 wood_wall_cross_01 · roof_straight_red_01 roof_corner_red_01 roof_point_red_01 roof_slant_red_01 (also _green_01 for all four) · plate_road_01 plate_pavement_01 plate_sidewalk_01 plate_wood_01 plate_corner_01 plate_curve_01 stairs_stone_01 stairs_wood_01 lightpost_01 banner_01 shield_red_01 shield_green_01 tree_01
- kenney-weapon-pack (38) weapons and ammo — realistic firearms, so check it suits the concept and the audience before reaching for it: pistol pistolsilencer shotgun shotgunshort sniper snipercamo machinegun uzi uzilong uzisilencer uzigold rocketlauncher rocketlaunchermodern flamethrower knife_sharp knife_smooth grenade grenadeflash grenadesmoke grenade_vintage · ammo_pistol ammo_shotgun ammo_sniper ammo_machinegun ammo_rocket ammo_uzi
- kenney-blocky-characters (2) basiccharacter advancedcharacter — humanoid CHARACTERS, but untextured plain grey (their colour lived in a texture that does not survive conversion). Useful only if you tint the materials yourself: obj.traverse(n => { if (n.isMesh) n.material = new THREE.MeshStandardMaterial({ color: 0x3b82f6 }); }).
- kenney-characters (8) RIGGED TEXTURED ANIMATED HUMANS, all 1.85 units tall, each with skeletal clips "idle" 1.07s, "run" 0.67s and "jump" 0.50s: survivor_male_b survivor_female_a zombie_a zombie_c criminal_male_a cyborg_female_a skater_male_a skater_female_a
These eight are blocky-stylised. For anything that wants a readable face or real acting, reach for LIBRARY 4 below instead.
LIBRARY 4 — QUATERNIUS CC0 CHARACTERS AND CREATURES, 152 rigged models in 9 packs, 150 of them carrying full skeletal animation. Base URL: https://www.joshrix.com/assets/models3d/packs/<pack>/<name>.glb — e.g. .../packs/quaternius-characters/ninja_female.glb
This is the cast library. If a concept has people, enemies, animals or monsters in it, build the cast from here first — grouped primitives are a last resort, not a starting point.
Clip names are EXACT and case-sensitive, and are NOT the lib/ vocabulary: it is "Idle", "Walk", "Run", "Death" — not "idle"/"walk". Ask for a clip that does not exist and the character stands frozen. Every pack's list below is the complete set for that pack.
- quaternius-characters (52) 3 units tall and the main human cast, modern historical and fantasy in one consistent art style, ending with four wearable props and two animals: base_character casual_male casual_female casual2_male casual2_female casual3_male casual3_female casual_bald suit_male suit_female worker_male worker_female chef_male chef_female doctor_male_young doctor_male_old doctor_female_young doctor_female_old old_classy_male old_classy_female kimono_male kimono_female cowboy_male cowboy_female soldier_male soldier_female blue_soldier_male blue_soldier_female knight_male knight_golden_male knight_golden_female viking_male viking_female ninja_male ninja_female ninja_sand ninja_sand_female pirate_male pirate_female goblin_male goblin_female zombie_male zombie_female elf witch wizard chef_hat cowboy_hair ninja_male_hair viking_helmet cow pug
  clips: Idle Walk Run Jump Punch SwordSlash Shoot_OneHanded PickUp Roll SitDown StandUp Walk_Carry Run_Carry RecieveHit Death Defeat Victory
- quaternius-modular-men (11) 1.9 units and metric-scale, with the richest combat clip set in the library: adventurer beach casual_2 casual_hoodie farmer king punk spacesuit suit swat worker
- quaternius-modular-women (10) 1.9 units, same rig and same clips as the men: adventurer casual formal medieval punk sci_fi soldier suit witch worker
  clips (both packs): Idle Idle_Neutral Idle_Gun Idle_Gun_Pointing Idle_Gun_Shoot Idle_Sword Walk Run Run_Back Run_Left Run_Right Run_Shoot Gun_Shoot Sword_Slash Punch_Left Punch_Right Kick_Left Kick_Right Roll Interact Wave HitRecieve HitRecieve_2 Death
- quaternius-rpg-characters (6) 3 units, a full party with weapon-specific attacks: cleric monk ranger rogue warrior wizard
  clips: Idle Idle_Weapon Idle_Attacking Attacking_Idle Walk Run Run_Weapon Run_Holding Sword_Attack Sword_Attack2 Dagger_Attack Dagger_Attack2 Staff_Attack Bow_Draw Bow_Shoot Spell1 Spell2 Attack Attack2 Punch PickUp Roll RecieveHit RecieveHit_2 RecieveHit_Attacking Death
- quaternius-monsters (40) 1.4 to 4.4 units and the enemy roster, where several ship a base and a stronger evolved form giving you a difficulty curve for free: alien alpaking alpaking_evolved armabee armabee_evolved birb blue_demon bunny cactoro cat chicken demon dino dog dragon dragon_evolved fish frog ghost ghost_skull glub glub_evolved goleling goleling_evolved green_blob green_spiky_blob hywirl monkroose mushnub mushnub_evolved mushroom_king ninja orc orc_skull pigeon pink_blob squidle tribal wizard yeti
  clips: Idle Walk Run Jump Jump_Idle Jump_Land Duck Dance Wave Yes No Bite_Front Headbutt Punch Weapon Flying_Idle Fast_Flying HitReact HitRecieve Death
- quaternius-cute-monsters (21) 1.4 to 2.9 units, softer and rounder, the same idea for a younger audience: alien alien_tall bat bee cactus chicken crab cthulhu cyclops deer demon ghost green_demon mushroom panda penguin pig skull tree yellow_dragon yeti
  clips: Idle Walk Jump Dance Yes No Bite_Front Bite_InPlace Flying HitRecieve Death
- quaternius-animals (12) 2.7 to 5.4 units, four-legged and properly animated, for mounts wildlife and farm: alpaca bull cow deer donkey fox horse horse_white husky shiba_inu stag wolf
  clips: Idle Idle_2 Idle_Headlow Walk Gallop Gallop_Jump Jump_toIdle Eating Attack Attack_Kick Attack_Headbutt Idle_HitReact1 Idle_HitReact2 Death
- quaternius-mechs (4) 5.3 to 6.5 units and piloted walkers, so size the world around them: george leela mike stan
  clips: Idle Walk Walk_Tall Walk_Holding Run Run_Tall Run_Holding Jump Punch Kick SwordSlash Shoot Pickup Dance Hello Yes No HitRecieve_1 HitRecieve_2 Death
- quaternius-fantasy-outfits (4) 1.8 units and the highest-detail humans here, but STATIC with no animation clips at all: female_peasant female_ranger male_peasant male_ranger
- quaternius-base-characters (2) 1.8 units, also STATIC with no animation clips: superhero_female_full_body superhero_male_full_body
Those last two packs are rigged but carry no clips, so use them for a fixed pose, a shopkeeper, a statue or a menu screen, and never for anything that has to walk.
EVERY LIBRARY 4 MODEL IS A SKINNED MESH. .clone() does NOT carry the skeleton — every copy will animate identically to the first. Load the file once per character you need on screen, or clone through THREE.SkeletonUtils if it is available.`;

const ENHANCE_SYSTEM = `You are the JOSHRIX Polish Agent. You receive a COMPLETE working HTML game file (2D canvas or three.js 3D). Return an UPGRADED version of the SAME game as ONE html file: identical core gameplay and controls, dramatically higher production value.
RAISE (as applicable): lighting & shadows, procedural-texture material quality, world density (more composed/instanced detail), particle richness, animation polish (easing, squash-stretch, idle motion), sky/atmosphere, HUD styling, sound design depth, camera cinematics, difficulty curve fairness, and any creator notes provided.
PRESERVE: the game's title, language, mechanics, win/lose flow, mobile+desktop controls, and any joshrix.com script tags (three.min.js, GLTFLoader.js) and joshrix.com model URLs if present (the only allowed external resources; for 2D files external resources stay forbidden).
Fix any bugs you notice. Never remove features. Output must be the COMPLETE file — never a diff, never truncated.
${RUNTIME_SAFETY}`;

/* HOLDS. Reserved before a run and settled DOWN to metered 4x actual cost, with
 * the unused part credited back in the same request. A hold is therefore not a
 * price — nobody is ever charged it — it only decides who is allowed to START.
 *
 * Measured 18 Aug 2026 from /api/forge-selftest, a real full-size 3D build:
 *   gemini  9,520 output tokens ->  51 ACU settled
 *   openai  1,809 output tokens ->  40 ACU settled (the metered floor)
 * The theoretical worst case is the 18,000-token cap, about 96 ACU.
 *
 * The 3D hold was 1,200 — TWENTY-THREE TIMES the real cost. A creator holding
 * 1,068 ACU, enough for roughly twenty 3D games, was refused with "Not enough
 * ACUs" and shown the demo game instead. That is the whole bug: the reservation,
 * not the price, was blocking paying work.
 *
 * 250 leaves ~2.6x headroom over the theoretical maximum and ~5x over anything
 * observed, while still admitting anyone who can genuinely afford several runs.
 * Raise it only if a real settlement is ever seen above it — and record the
 * settlement here when you do. */
export const FORGE_GAME_ACU_CHARGE = 150;       // HOLD (2D) — settles to ~32-40
export const FORGE_GAME_3D_ACU_CHARGE = 250;    // HOLD (3D) — settles to ~51
export const FORGE_MIN_CHARGE = 40;             // metered floor when the Code Agent ran
/** A 3D build smaller than this is a stub, however well-formed. Dino Island,
 *  the leanest complete game on the runtime, is 10,975 bytes. */
export const MIN_3D_BYTES = 9_500;
export const ENGINE_BUILD_CHARGE = 60;          // flat platform charge when only the engine built
export const ENHANCE_HOLD = 500;                // HOLD per enhance pass — settled to metered 4x actual
export const GROWTH_HOLD = 60;                  // HOLD per growth tool — settled to metered 4x actual
export const GROWTH_MIN_CHARGE = 4;             // metered floor per growth run

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

/** Claude generation — the primary Code Agent, shared by forge, enhance, and the
 *  full-size diagnostic probe so all three exercise the exact same call. */
export async function claudeGenerate(system: string, user: string, maxTokens: number): Promise<{ html: string; usage?: TokenUsage }> {
  const anthropic = new Anthropic();
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-5",   // Code Agent: fast frontier coder; Idea Agent stays on Opus
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const msg = await finishWithinDeadline(stream);
  const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  return {
    html: extractHtml(text),
    usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
  };
}

/** Polish Agent: take a working build and raise its production value. Each pass is
 *  metered at 4x — creators stack passes without limit to push fidelity ever higher. */
export async function enhanceGameHtml(
  html: string,
  opts: { notes?: string; language?: string } = {},
): Promise<{ html: string; provider: string; usage?: TokenUsage }> {
  const userMsg = `Creator's enhancement notes: ${opts.notes?.slice(0, 2000) || "(none — apply your full fidelity bar)"}\nLanguage of player-facing text: ${opts.language && opts.language !== "auto" ? opts.language : "keep the file's current language"}\n\nCurrent game file:\n${html}`;
  const errors: string[] = [];
  // Same multi-provider chain as the forge — a polish pass must not depend on one
  // vendor. A polish pass returns the WHOLE improved file, so output budgets sit
  // above forge budgets (a truncated reply is treated as a failure, never shipped);
  // Gemini leads because the full-size probe shows it completing fast and whole,
  // and gpt-4o stays under its 16384 output cap.
  if (process.env.OPENAI_API_KEY) {
    try {
      const o = await openaiGenerate(ENHANCE_SYSTEM, userMsg, 15000);
      return { html: o.html, provider: "openai", usage: o.usage };
    } catch (e: any) { errors.push("openai: " + String(e?.message ?? e)); }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const c = await claudeGenerate(ENHANCE_SYSTEM, userMsg, 20000);
      return { html: c.html, provider: "claude", usage: c.usage };
    } catch (e: any) { errors.push("claude: " + String(e?.message ?? e)); }
  }
  if (process.env.GEMINI_API_KEY) {
    try {
      const g = await geminiGenerate(ENHANCE_SYSTEM, userMsg, 20000);
      return { html: g.html, provider: "gemini", usage: g.usage };
    } catch (e: any) { errors.push("gemini: " + String(e?.message ?? e)); }
  }
  throw new Error(errors.length ? errors.join(" | ") : "no AI provider configured");
}

/** Does this build actually render a game? 2D games carry a literal <canvas>
 *  tag; 3D games create their canvas from JavaScript (three.js WebGLRenderer),
 *  so demanding the tag alone silently rejects every valid 3D build. */
export function looksPlayable(html: string): boolean {
  return html.includes("<canvas") || html.includes("WebGLRenderer") ||
         html.includes("three.min.js") || usesEngine(html);
}

/** A build on the hosted JOSHRIX3D runtime. The runtime owns the canvas, the
 *  shadow map, the fog and the sky, so none of those strings appear in the
 *  game's own source — checking for them literally would reject exactly the
 *  builds most likely to work. */
export function usesEngine(html: string): boolean {
  return /joshrix3d-\d+\.js/.test(html) && /JOSHRIX3D\s*\.\s*boot\s*\(/.test(html);
}

/** The 3D fidelity floor, enforced: a premium 3D build without shadows, fog,
 *  and procedural textures is a tech demo, not a product. A build missing any
 *  of these is treated like a provider failure so the next provider gets its
 *  shot at the full bar (the modest build is kept only as a last resort). */
const FLOOR_3D: Array<[string, RegExp]> = [
  ["shadows", /shadowMap\s*\.\s*enabled\s*=\s*true/],
  ["fog", /new\s+THREE\.(Fog|FogExp2)\s*\(/],
  // a premium world is dressed with real models OR real procedural materials —
  // one or the other, never bare untextured primitives on a flat plane
  ["models or procedural textures", /models3d\/(lib|vehicles|packs)\/|CanvasTexture/],
];
/** The floor for a build on the JOSHRIX3D runtime.
 *
 *  The runtime supplies shadows, fog, sky, ground, a camera and a title screen,
 *  so those strings never appear in a game's own source and the FLOOR_3D regexes
 *  cannot see them. Exempting engine builds from the floor entirely — which is
 *  what this did at first — meant a build that called boot() and then did
 *  NOTHING passed every gate and shipped: the runtime dutifully rendered its
 *  empty default world, forever, and the player got a green field and a button.
 *
 *  So an engine build has to prove it actually put a game inside the runtime.
 *  These are the minimum signs of one, and none of them can be satisfied by
 *  boilerplate. */
const FLOOR_ENGINE: Array<[string, RegExp]> = [
  ["a per-frame update — nothing can happen without one", /\.\s*onUpdate\s*\(/],
  // WAS: /\.(load|get|actor|scatter)\(/ — which `G.get("thing")` satisfies even
  // when "thing" was never loaded. get() then returns null, the game falls back
  // to its own boxes and spheres, and the build ships as coloured primitives on
  // a plane while passing every gate. That is precisely what "it looks blocky"
  // means, and it is not a judgement about art style: the runtime exists to put
  // the 2,300-model library on screen, and GAME_SYSTEM_3D forbids "floating
  // primitives on a flat plane" outright. So require a real library path.
  ["at least one model from the library — bare primitives are why builds look blocky",
   /\.\s*load\s*\(\s*(['"])[^'"]*\1\s*,\s*(['"])(lib|packs|vehicles)\//],
  ["something for the player to reach or avoid", /\.\s*(burst|over|stat|pips|follow)\s*\(/],
  // The runtime plays its own start and game-over cues, so a build that never
  // makes a sound of its own still is not silent — which is exactly why this
  // needs asserting. Nothing the PLAYER does would be audible: no pickup, no
  // hit, no landing. Since G.sfx() is one call per event and the prompt names
  // all twenty, a build that skips it skipped the instruction.
  ["a sound of its own — the player must hear what they did", /\.\s*(sfx|ambience|beep)\s*\(/],
];

/** How many DISTINCT library models a build actually pulls in. Logged with every
 *  forge, because "which provider and how many bytes" could not answer the one
 *  question that mattered — did it use the library at all. */
/**
 * A concept longer than this is a DESIGN DOCUMENT, not a game brief.
 *
 * A creator pasted a 16,743-character, 33-section AAA console pitch —
 * districts, factions, co-op, competitive modes, audio design, expansions,
 * marketing positioning, trailer copy. All of it went into the BUILD prompt
 * verbatim, next to "write one self-contained HTML file with a canvas". The
 * model produced a complete file with no canvas at all and the run fell
 * through to the engine fallback.
 *
 * The blueprint stage exists precisely to distil a brief into title, summary,
 * levels and mechanics, and it still sees the WHOLE document — breadth helps
 * there. What the build stage needs is the playable core, plus an explicit
 * instruction not to try to represent a four-year production in 900 lines.
 * 6,000 characters is roughly the first six sections of a document like that:
 * the selling idea, the world, and what the player actually does.
 */
export const MAX_CONCEPT_CHARS = 6_000;

export function conceptForBuild(prompt: string): string {
  if (prompt.length <= MAX_CONCEPT_CHARS) return prompt;
  const head = prompt.slice(0, MAX_CONCEPT_CHARS);
  return `${head}

[The creator's brief continues for ${prompt.length - MAX_CONCEPT_CHARS} more characters and describes a full multi-platform production: additional systems, cinematics, audio direction, online modes, expansions and marketing. DO NOT attempt to represent all of it, and do not produce a design document, a menu of features, or a website about the game. Build the PLAYABLE CORE LOOP of what is described above as ONE browser game — the world, the player, what they do minute to minute, what opposes them, and how a session ends. One vertical slice that plays beats a summary of everything that does not.]`;
}

/** How many DISTINCT library models a build actually pulls in. */
export function countLibraryModels(html: string): number {
  const seen = new Set<string>();
  const re = /['"]((?:lib|vehicles|packs)\/[A-Za-z0-9_\-/]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) seen.add(m[1]);
  return seen.size;
}

export function missing3dFloor(html: string): string[] {
  if (usesEngine(html)) return FLOOR_ENGINE.filter(([, re]) => !re.test(html)).map(([n]) => n);
  return FLOOR_3D.filter(([, re]) => !re.test(html)).map(([n]) => n);
}

/** The 2D floor.
 *
 *  Until now EVERY quality gate lived inside `if (is3d)`. A 2D build faced the
 *  security scan and then `looksPlayable()`, which is satisfied by the string
 *  "<canvas" appearing anywhere — so a 2,000-byte stub shipped to a paying
 *  creator with nothing in its way. 3D got a floor after openai's 8,411-byte
 *  stub was caught; the 2D lane has no runtime to lean on and is MORE exposed,
 *  not less.
 *
 *  These are not stylistic preferences. Every one is something GAME_SYSTEM
 *  states as a hard requirement, chosen because its absence means the build is
 *  not a game rather than a plain-looking one, and because none can be
 *  satisfied by boilerplate. */
const FLOOR_2D: Array<[string, RegExp]> = [
  ["a render loop — nothing moves without one", /requestAnimationFrame\s*\(/],
  ["a 2D drawing context", /getContext\s*\(\s*['"]2d['"]/],
  // "Works with BOTH mouse and touch" is a hard requirement, and a phone is the
  // likeliest device for a shared game link. A build with no touch path at all
  // is unplayable for most of the people who will ever open it.
  ["touch input — most players will be on a phone", /touchstart|pointerdown/],
  // "Procedural WebAudio sound design ... + a mute button". A silent build is
  // the single most common sign the model stopped early.
  ["sound", /AudioContext|webkitAudioContext/],
];

export function missing2dFloor(html: string): string[] {
  return FLOOR_2D.filter(([, re]) => !re.test(html)).map(([n]) => n);
}

/** The 2D substance floor, calibrated on the only two real measurements of the
 *  2D prompt this platform owns — the /api/forge-selftest run of 18 Aug, which
 *  probes GAME_SYSTEM at live 2D budgets:
 *
 *      gemini   35,973 bytes   ok
 *      openai    8,411 bytes   ok      <- structurally fine, a third of a game
 *      claude    truncated     fail
 *
 *  GAME_SYSTEM asks for 650-900 lines. 8,411 bytes is around 250. 12,000 sits
 *  far enough above the thin build to reject it and far enough below a complete
 *  one (gemini measured three times this) that a genuinely concise game still
 *  ships. Demoted rather than discarded, exactly as in 3D: if every provider
 *  comes in short, the best of them is still better than nothing. */
export const MIN_2D_BYTES = 12_000;

/** Every inline script in a shipping build must PARSE. A syntax error is a
 *  guaranteed-dead game — and with three providers on the gateway, broken code
 *  must burn through to the NEXT provider, not reach a creator's screen.
 *  vm.Script compiles without executing: safe, fast, and it names the error. */
function assertScriptsParse(html: string): void {
  const tags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [, attrs, code] of tags) {
    if (/\bsrc\s*=/i.test(attrs)) continue;                 // external file (e.g. three.js) — nothing inline to parse
    if (/type\s*=\s*["']?module/i.test(attrs)) continue;    // module syntax needs a module parser — leave to the runtime watchdog
    if (!code.trim()) continue;
    try { new Script(code); } catch (e: any) {
      throw new Error("generated code fails to parse: " + String(e?.message ?? e).slice(0, 160));
    }
  }
}

/** Pull a complete HTML document out of a model reply (or throw). */
function extractHtml(text: string): string {
  const start = text.indexOf("<!DOCTYPE");
  const altStart = start === -1 ? text.indexOf("<html") : start;
  if (altStart === -1) throw new Error("model returned no HTML document");
  let out = text.slice(start === -1 ? altStart : start);
  const end = out.lastIndexOf("</html>");
  // No closing tag = the reply was cut off mid-file; shipping it means broken JS
  // and a dead START button. Treat truncation as a provider failure so the chain
  // falls through to the next provider (or the engine) instead.
  if (end === -1) throw new Error("model reply truncated (no closing </html>)");
  out = out.slice(0, end + 7);
  assertScriptsParse(out);
  return out;
}

const PROVIDER_TIMEOUT_MS = 200_000;

/** Gemini REST fallback (activates when GEMINI_API_KEY is set in Vercel). */
export async function geminiGenerate(system: string, user: string, maxTokens: number): Promise<{ html: string; usage?: TokenUsage }> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.9,
        // Gemini 2.5 Flash spends output budget on internal "thinking" by default —
        // fine for a 16-token probe, fatal for a 12k-token game file (the reply gets
        // cut off mid-file). Flash allows disabling it; Pro does not (min budget 128).
        ...(model.includes("flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}: ${String(j?.error?.message ?? "").slice(0, 200)}`);
  const text = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("");
  if (!text) throw new Error(`Gemini empty reply (finishReason: ${j?.candidates?.[0]?.finishReason ?? "none"})`);
  const u = j.usageMetadata;
  return {
    html: extractHtml(text),
    usage: u ? { inputTokens: Number(u.promptTokenCount || 0), outputTokens: Number(u.candidatesTokenCount || 0) } : undefined,
  };
}

/** OpenAI REST fallback (activates when OPENAI_API_KEY is set in Vercel). */
export async function openaiGenerate(system: string, user: string, maxTokens: number): Promise<{ html: string; usage?: TokenUsage }> {
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
  const j: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`OpenAI HTTP ${r.status}: ${String(j?.error?.message ?? "").slice(0, 200)}`);
  const text = j?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error(`OpenAI empty reply (finish_reason: ${j?.choices?.[0]?.finish_reason ?? "none"})`);
  const u = j.usage;
  return {
    html: extractHtml(text),
    usage: u ? { inputTokens: Number(u.prompt_tokens || 0), outputTokens: Number(u.completion_tokens || 0) } : undefined,
  };
}

/**
 * Full-size diagnostic: make EVERY configured provider write a complete real game
 * at live forge size, in parallel, and report exactly what came back. The tiny
 * "say OK" self-test can't see the failures that only appear at real generation
 * size — token-budget truncation, deadline aborts, output limits. This can.
 */
export async function fullSizeProbe(): Promise<Record<string, any>> {
  const userMsg = `Creator's game concept:\nA vibrant arcade game: catch falling stars in a basket before they hit the ground. 3 lives, speed rises each level, combo scoring.\n\nBlueprint title: Star Catcher (diagnostic probe)\nBlueprint summary: full-size provider diagnostic — write the complete game as normal\nCreation language: English`;
  const run = async (fn: () => Promise<{ html: string; usage?: TokenUsage }>) => {
    const t0 = Date.now();
    try {
      const r = await fn();
      return {
        ok: true, ms: Date.now() - t0, bytes: r.html.length,
        hasCanvas: r.html.includes("<canvas"),
        outputTokens: r.usage?.outputTokens ?? null,
      };
    } catch (e: any) {
      return { ok: false, ms: Date.now() - t0, error: String(e?.message ?? e).slice(0, 400) };
    }
  };
  // Budgets mirror the live 2D forge chain exactly — a probe that tests different
  // numbers than production answers a different question.
  const [claude, gemini, openai] = await Promise.all([
    process.env.ANTHROPIC_API_KEY ? run(() => claudeGenerate(GAME_SYSTEM, userMsg, 16000)) : Promise.resolve({ ok: false, error: "no ANTHROPIC_API_KEY" }),
    process.env.GEMINI_API_KEY ? run(() => geminiGenerate(GAME_SYSTEM, userMsg, 12000)) : Promise.resolve({ ok: false, error: "no GEMINI_API_KEY" }),
    process.env.OPENAI_API_KEY ? run(() => openaiGenerate(GAME_SYSTEM, userMsg, 12000)) : Promise.resolve({ ok: false, error: "no OPENAI_API_KEY" }),
  ]);
  return { claude, gemini, openai };
}

export async function generateGameHtml(
  prompt: string,
  opts: { title?: string; summary?: string; language?: string; mode?: string } = {},
): Promise<{ html: string; provider: string; usage?: TokenUsage; attempts?: string[] }> {
  const is3d = opts.mode === "3d";
  const system = is3d ? GAME_SYSTEM_3D : GAME_SYSTEM;
  // The concept is arbitrary text from the public internet. Fence it so the
  // model reads it as DATA, and never as instructions addressed to itself.
  const userMsg = `${wrapUntrusted(conceptForBuild(prompt))}\n\nBlueprint title: ${opts.title ?? "(derive from concept)"}\nBlueprint summary: ${opts.summary ?? "(none)"}\nCreation language: ${opts.language && opts.language !== "auto" ? opts.language : "auto-detect from the concept"}`;

  // Per-provider output budgets, sized from the full-size diagnostic probe:
  // Claude writes past 12k tokens and truncates (= broken game), so it gets the
  // headroom it demonstrably needs; Gemini finishes a complete game in ~9k;
  // gpt-4o's hard output cap is 16384 so it must stay under that.
  const claudeMax = is3d ? 18000 : 16000;
  const geminiMax = is3d ? 15000 : 12000;
  const openaiMax = is3d ? 15000 : 12000;

  // MULTI-PROVIDER CHAIN — no single vendor may block a creator's game; whichever
  // answers first with a COMPLETE file ships as the bespoke build.
  // 2D leads with Gemini: the probe shows it finishing a complete full-size game
  // in ~35s, so creators get their bespoke build fast. 3D (the premium lane)
  // leads with Claude, the strongest coder, now with real output headroom.
  type Cand = { name: string; enabled: boolean; run: () => Promise<{ html: string; usage?: TokenUsage }> };
  const claude: Cand = { name: "claude", enabled: !!process.env.ANTHROPIC_API_KEY, run: () => claudeGenerate(system, userMsg, claudeMax) };
  const gemini: Cand = { name: "gemini", enabled: !!process.env.GEMINI_API_KEY, run: () => geminiGenerate(system, userMsg, geminiMax) };
  const openai: Cand = { name: "openai", enabled: !!process.env.OPENAI_API_KEY, run: () => openaiGenerate(system, userMsg, openaiMax) };
  // Order comes from the live forge log and the full-size probe, never from
  // assumptions about model quality. Measured by /api/forge-selftest, 18 Aug 2026,
  // one full-size 3D generation per provider:
  //
  //   gemini  — 39.2s, 35,973 bytes, 9,520 output tokens, canvas present  OK
  //   openai  — 24.6s,  8,411 bytes, 1,809 output tokens, canvas present  OK
  //   claude  — 159.1s, truncated ("no closing </html>")                  FAIL
  //
  // openai "succeeds" but writes 8,411 bytes. The two hand-built reference games
  // on this runtime are 10,975 (Dino Island) and 15,862 (WonderVerse), so its
  // build is smaller than the leanest complete game the platform has — a stub
  // that boots the engine, passes every structural gate, and gives the player
  // almost nothing. That is what shipped from every recorded forge, and it is
  // what "the forge produces empty games" actually was.
  //
  // So 3D leads with GEMINI: the only provider producing a complete full-size
  // build. openai follows as a fast fallback, claude last because it still
  // overruns 18k output tokens on a prompt Gemini answers in 9.5k.
  //
  // (An earlier commit today put claude first, reasoning that the JOSHRIX3D
  // runtime had made games short enough to stop the truncation. The probe above
  // disproved that within the hour. Evidence, then order — not the reverse.)
  /* ONE ORDER FOR BOTH LANES, and the evidence for it is 2D evidence.
   *
   * /api/forge-selftest probes GAME_SYSTEM — the 2D prompt, at 2D budgets. Its
   * 18 Aug run measured gemini 35,973 bytes ok, openai 8,411 ok, claude
   * truncated at 159s. That result was used to put gemini first in 3D; the lane
   * it actually measured, 2D, was left leading with openai — the provider that
   * returned a third of a game. Same measurement, same conclusion, both lanes.
   *
   * claude stays last on measured truncation, not preference. */
  const chain = [gemini, openai, claude];
  const errors: string[] = [];
  // Whole-chain time budget: the serverless function dies hard at 300s, and a
  // reply must still be built, settled, and persisted after generation. Skip
  // remaining providers rather than start one that can't finish in time.
  const chainStart = Date.now();
  const CHAIN_BUDGET_MS = 230_000;
  let subFloor: { html: string; provider: string; usage?: TokenUsage } | null = null;
  for (const c of chain) {
    if (!c.enabled) continue;
    if (Date.now() - chainStart > CHAIN_BUDGET_MS) { errors.push(c.name + ": skipped — forge time budget exhausted"); continue; }
    try {
      const r = await c.run();

      // SECURITY GATE — applies to every build, 2D and 3D. This file gets hosted
      // on joshrix.com and played by other people, so a build that phones home,
      // asks for a password, hides itself behind eval, or embeds another site
      // must never be stored. Treated exactly like a provider failure: burn to
      // the next provider rather than shipping it, and never keep it as the
      // last-resort sub-floor build either.
      const sec = scanGeneratedHtml(r.html);
      if (!sec.safe) {
        errors.push(c.name + ": rejected by the security scan — " + describeVerdict(sec));
        continue;
      }

      if (is3d) {
        // A 3D build that never appends its canvas renders a blank screen no
        // matter how good the code is. Require the append so the chain can try
        // the next provider instead of shipping a guaranteed-blank game.
        if (!usesEngine(r.html) &&
            !/appendChild\s*\(\s*[\w.]*(renderer|\w+)\s*\.\s*domElement\s*\)|appendChild\s*\(\s*canvas\s*\)/.test(r.html)) {
          errors.push(c.name + ": never appends renderer.domElement — the page would stay blank");
          if (!subFloor) subFloor = { html: r.html, provider: c.name, usage: r.usage };
          continue;
        }
        // SUBSTANCE FLOOR. Every structural gate below is satisfiable by a stub:
        // openai's probe build appended a canvas, booted the runtime and called
        // the required methods in 8,411 bytes — and was still nothing to play.
        // Calibrated against the leanest complete game on this runtime, Dino
        // Island at 10,975 bytes; 9,500 keeps a genuinely concise build while
        // rejecting one that is a third the size of a real game.
        // Demoted, not discarded: it becomes the sub-floor fallback, so if every
        // provider comes in short the best of them still ships.
        if (r.html.length < MIN_3D_BYTES) {
          errors.push(c.name + `: only ${r.html.length} bytes — below the ${MIN_3D_BYTES}-byte substance floor for a 3D game`);
          if (!subFloor) subFloor = { html: r.html, provider: c.name, usage: r.usage };
          continue;
        }
        const miss3 = missing3dFloor(r.html);
        if (miss3.length) {
          errors.push(c.name + ": below the 3D fidelity floor (missing: " + miss3.join(", ") + ")");
          // The backstop is for a build that IS a game but looks cheap. A build
          // on the runtime that failed this floor is not a game at all — it boots
          // the runtime and leaves its empty default world on screen. Keeping
          // that as the fallback is how a player ends up staring at a green field
          // with a button, which is worse than the deterministic engine build we
          // would otherwise ship. So it is discarded outright.
          if (!subFloor && !usesEngine(r.html)) subFloor = { html: r.html, provider: c.name, usage: r.usage };
          continue;
        }
      } else {
        // THE 2D LANE. It had no gate at all beyond the security scan, which is
        // how a stub reached a paying creator. Same two-stage shape as 3D:
        // substance first, then the requirements the prompt actually states.
        if (r.html.length < MIN_2D_BYTES) {
          errors.push(c.name + `: only ${r.html.length} bytes — below the ${MIN_2D_BYTES}-byte substance floor for a 2D game`);
          if (!subFloor) subFloor = { html: r.html, provider: c.name, usage: r.usage };
          continue;
        }
        const miss2 = missing2dFloor(r.html);
        if (miss2.length) {
          errors.push(c.name + ": below the 2D floor (missing: " + miss2.join(", ") + ")");
          if (!subFloor) subFloor = { html: r.html, provider: c.name, usage: r.usage };
          continue;
        }
      }
      return { html: r.html, provider: c.name, usage: r.usage, attempts: errors.slice() };
    } catch (e: any) { errors.push(c.name + ": " + String(e?.message ?? e)); }
  }
  // every provider missed the floor — a modest REAL 3D game still beats no game
  if (subFloor) return { ...subFloor, attempts: errors.slice() };
  if (process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) {
    throw new Error(errors.length ? errors.join(" | ") : "all configured AI providers failed this run");
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


/* ---------------- AI Growth Engine: marketing copy for creators ------------- */

const GROWTH_BRIEFS: Record<string, string> = {
  social_posts: `Write 5 ready-to-post social messages promoting this game: two for X/Twitter (<=260 chars each, 2-3 hashtags), two for Instagram/Facebook (2-4 short lines, one emoji maximum per line), one for LinkedIn (professional, 400-600 chars, the creator-economy angle). Return JSON: {"posts":[{"platform":"x|instagram|facebook|linkedin","text":"...","hashtags":["..."]}]}`,
  game_advert: `Write paid-advert copy for this game across three formats. Return JSON: {"ads":[{"format":"search|social|display","headline":"<=40 chars","body":"<=120 chars","cta":"<=20 chars"}],"angles":["the 3 strongest selling angles, one line each"]}`,
  email_campaign: `Write a 3-email launch sequence: announcement, social-proof follow-up, last-call. Return JSON: {"emails":[{"send":"day 0|day 3|day 7","subject":"<=55 chars","preheader":"<=90 chars","body":"plain text with line breaks, 120-200 words, one clear call to action"}]}`,
  landing_page: `Write a one-page landing page for this game. Return JSON: {"hero":{"headline":"<=60 chars","subhead":"<=140 chars","cta":"<=24 chars"},"sections":[{"heading":"...","body":"40-70 words"}],"faq":[{"q":"...","a":"..."}],"metaTitle":"<=60 chars","metaDescription":"<=155 chars"}`,
  hashtags: `Produce hashtag sets for this game. Return JSON: {"sets":[{"platform":"x|instagram|tiktok","broad":["5 high-reach tags"],"niche":["5 lower-competition tags"],"branded":["2-3 tags unique to this game"]}],"avoid":["tags that look spammy or are banned-adjacent"]}`,
  video_script: `Write two short-video scripts (TikTok/Reels/Shorts) for this game. Return JSON: {"scripts":[{"length":"15s|30s","hook":"the first 2 seconds, spoken","beats":[{"t":"0-3s","visual":"what is on screen","voice":"what is said"}],"cta":"closing line","caption":"posting caption"}]}`,
  performance: `Analyse the creator's REAL numbers below and recommend what to do next. Use ONLY the figures given — never invent a metric, percentage, benchmark or comparison. If the numbers are too small to support a conclusion, say so. Return JSON: {"headline":"one honest sentence","reading":["3-5 observations, each citing a real figure"],"actions":[{"do":"specific action","why":"tied to their data","effort":"low|medium|high"}]}`,
  audience: `From the creator's REAL games and play counts below, describe who is actually playing and where to find more of them. Never invent demographics you cannot infer — say what is unknown. Return JSON: {"likelyAudience":"who, in one paragraph, hedged honestly","signals":["what in their data supports this"],"unknowns":["what cannot be known from platform data alone"],"channels":[{"channel":"...","why":"...","firstStep":"..."}]}`,
  posting_time: `Recommend posting times using the creator's REAL play totals below plus well-established platform norms — and label clearly which is which. Never present a general norm as if it were measured from their audience. Return JSON: {"basis":"what their own data does and does not show","recommendations":[{"platform":"...","window":"e.g. Tue-Thu 18:00-21:00 local","source":"your data|general norm","confidence":"low|medium|high"}],"howToImprove":["how to gather real timing data"]}`,
};

const GROWTH_SYSTEM = `You are the JOSHRIX Growth Agent, a senior performance marketer writing for an individual game creator on joshrix.com (an AI game-creation platform where creators describe a game, the platform builds it, and it gets a public share link).
RULES THAT OVERRIDE EVERYTHING:
- NEVER invent statistics, engagement rates, benchmarks, revenue figures or audience demographics. If a number was not given to you, do not state one.
- Never promise reach, sales, virality or ranking outcomes.
- Never write anything a platform would flag as engagement bait ("comment YES", follow-for-follow, fake urgency, fake scarcity).
- No competitor names, no real brand names, no borrowed celebrity likeness.
- Use the creator's real game title and URL when given; never invent a URL.
- Write in the requested language; default to English.
Respond with ONLY the JSON object described, no markdown fences, no commentary.`;

/** Growth Engine generation — same provider chain and failure discipline as the forge. */
export async function generateGrowthCopy(
  tool: string,
  opts: { brief?: string; audience?: string; tone?: string; language?: string; facts?: Record<string, any> },
): Promise<{ result: any; provider: string; usage?: TokenUsage }> {
  const brief = GROWTH_BRIEFS[tool];
  if (!brief) throw new Error("unknown growth tool");

  const f = opts.facts ?? {};
  const context = [
    `TASK: ${brief}`,
    "",
    "CREATOR'S REAL CONTEXT (the only figures you may cite):",
    `- game title: ${f.gameTitle ?? "(not published yet)"}`,
    `- game summary: ${f.gameSummary ?? "(none)"}`,
    `- game URL: ${f.gameUrl ?? "(none yet — do not invent one)"}`,
    `- published games: ${f.publishedGames ?? 0}`,
    `- total plays across all their games: ${f.totalPlays ?? 0}`,
    `- most-played game: ${f.bestGame ? `"${f.bestGame.title}" with ${f.bestGame.plays} plays` : "(none)"}`,
    "",
    `Creator's brief: ${opts.brief || "(none given — work from the game details above)"}`,
    `Target audience: ${opts.audience || "(not specified — infer conservatively)"}`,
    `Tone: ${opts.tone || "confident, concrete, no hype"}`,
    `Language: ${opts.language && opts.language !== "auto" ? opts.language : "English"}`,
  ].join("\n");

  const parse = (text: string) => {
    const json = extractJsonObject(text);   // same truncation trap as the blueprint had
    if (!json) throw new Error("Growth Agent returned no complete JSON object");
    return JSON.parse(json);
  };

  const errors: string[] = [];
  if (process.env.OPENAI_API_KEY) {
    try {
      const r = await openaiText(GROWTH_SYSTEM, context, 3000);
      return { result: parse(r.text), provider: "openai", usage: r.usage };
    } catch (e: any) { errors.push("openai: " + String(e?.message ?? e)); }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const anthropic = new Anthropic();
      const msg = await anthropic.messages.create({ model: "claude-sonnet-5", max_tokens: 3000, system: GROWTH_SYSTEM, messages: [{ role: "user", content: context }] });
      const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      return { result: parse(text), provider: "claude", usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens } };
    } catch (e: any) { errors.push("claude: " + String(e?.message ?? e)); }
  }
  if (process.env.GEMINI_API_KEY) {
    try {
      const r = await geminiText(GROWTH_SYSTEM, context, 3000);
      return { result: parse(r.text), provider: "gemini", usage: r.usage };
    } catch (e: any) { errors.push("gemini: " + String(e?.message ?? e)); }
  }
  throw new Error(errors.length ? errors.join(" | ") : "no AI provider configured");
}

/** Plain-text generation (the game helpers demand HTML; growth copy is JSON). */
async function openaiText(system: string, user: string, maxTokens: number): Promise<{ text: string; usage?: TokenUsage }> {
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_completion_tokens: maxTokens }),
    signal: AbortSignal.timeout(90_000),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`OpenAI HTTP ${r.status}: ${String(j?.error?.message ?? "").slice(0, 160)}`);
  const text = j?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("OpenAI empty reply");
  const u = j.usage;
  return { text, usage: u ? { inputTokens: Number(u.prompt_tokens || 0), outputTokens: Number(u.completion_tokens || 0) } : undefined };
}

async function geminiText(system: string, user: string, maxTokens: number): Promise<{ text: string; usage?: TokenUsage }> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.8, ...(model.includes("flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}: ${String(j?.error?.message ?? "").slice(0, 160)}`);
  const text = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("");
  if (!text) throw new Error("Gemini empty reply");
  const u = j.usageMetadata;
  return { text, usage: u ? { inputTokens: Number(u.promptTokenCount || 0), outputTokens: Number(u.candidatesTokenCount || 0) } : undefined };
}
