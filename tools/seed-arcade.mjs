#!/usr/bin/env node
/**
 * Forge, publish and approve a set of launch titles against a LIVE deployment.
 *
 *   MODERATION_KEY=... node tools/seed-arcade.mjs --wallet w-xxxx
 *   MODERATION_KEY=... node tools/seed-arcade.mjs --wallet w-xxxx --only 3 --dry-run
 *
 * WHY THIS EXISTS. The Featured Worlds section renders "No public worlds yet"
 * because the arcade is empty, and an empty arcade is the strongest argument a
 * visitor has for leaving. Filling it needs ten real forge runs, and a forge run
 * needs provider keys, a Neon database and a funded wallet — none of which exist
 * in a development container. So the work that CAN be done here is the
 * mechanism: this drives the real endpoints, in order, against whichever
 * deployment you point it at, and reports exactly what landed.
 *
 * Nothing here fabricates a game. Every title below is a prompt; the games come
 * out of /api/forge-game, go through /api/games, and are approved through
 * /api/moderation. If a run fails, it says so and moves on rather than leaving a
 * half-published title behind.
 *
 * WHAT THESE GAMES ARE. They are the studio's own launch titles, not community
 * work — forged the same way a creator's game is, by the same fleet, through the
 * same gates. Do not describe them on the site as community games until
 * community games exist. frontend/worlds.html labels a studio build as such.
 *
 * BEFORE YOU RUN IT
 *   1. ANTHROPIC_API_KEY (or another provider key) must be set in Vercel.
 *      Check: curl -s https://www.joshrix.com/api/health | grep '"mode"'
 *      "demo" means no key is live and every build would fall back to the
 *      engine — real, playable, but not what this is for.
 *   2. The wallet needs credit. A 3D forge holds 250 ACUs and settles around
 *      51, so ten runs need ~2,500 ACUs held at peak. Designate the wallet a
 *      tester in /admin ("Make tester") and it refills to TESTER_CEILING_ACU
 *      (20,000). A `purchased` wallet cannot be reclassified — use a fresh one.
 *   3. MODERATION_KEY must be in your environment, matching the deployment's.
 */
import process from "node:process";

const args = process.argv.slice(2);
const argOf = (name, fallback = null) => {
  const i = args.indexOf("--" + name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const BASE = (argOf("base", "https://www.joshrix.com")).replace(/\/$/, "");
const WALLET = argOf("wallet");
const ONLY = Number(argOf("only", "0")) || 0;
const DRY = args.includes("--dry-run");
const KEY = process.env.MODERATION_KEY || "";

/**
 * The launch titles.
 *
 * Chosen against the library rather than against a genre list: the pack
 * inventory is stylised low-poly with strong vehicle, creature and village
 * sets, so these lean on what the 2,591 models actually contain. A concept the
 * library cannot dress produces a build that looks like an empty field, which
 * is the failure mode worth designing around.
 *
 * `mode` picks the build target. `lang` is the language the concept is written
 * in, because "describe a game in any language" is a headline claim and a
 * launch shelf that is entirely English quietly contradicts it.
 */
const TITLES = [
  { mode: "3d", lang: "en", title: "Harbour Watch",
    prompt: "A night-time harbour patrol game. You drive a small boat between moored trawlers, sweeping a searchlight to find crates that fell overboard before the tide carries them out. Fog rolls in as the round goes on. Collect eight crates before dawn; hitting a moored boat costs you time." },
  { mode: "3d", lang: "en", title: "Roof Runner",
    prompt: "A rooftop chase across a low-poly town at sunset. You run and leap between flat rooftops collecting mail satchels, with gaps that widen as you go. Falling drops you to the street and costs a life. Three lives, one long run, a score that rewards nerve over caution." },
  { mode: "3d", lang: "fr", title: "Le Marché de Minuit",
    prompt: "Un jeu de livraison nocturne dans un marché de village. Vous conduisez une charrette entre les étals pour livrer des paniers aux lanternes allumées avant que le marché ne ferme. Les étals bloquent le passage et il faut trouver la bonne route. Huit livraisons, une nuit." },
  { mode: "3d", lang: "sw", title: "Mlinzi wa Mifugo",
    prompt: "Mchezo wa kuwalinda mifugo usiku. Unaendesha pikipiki kuzunguka zizi, ukiwakusanya ng'ombe waliotoroka na kuwarudisha kabla ya alfajiri. Fisi wanajaribu kuwafukuza mifugo. Kusanya kumi, epuka fisi, malizia kabla ya jua kuchomoza." },
  { mode: "3d", lang: "en", title: "Quarry Descent",
    prompt: "A downhill haulage game in a stone quarry. You drive a loaded truck down a winding ramp; the load shifts on hard turns and tips if you take them too fast. Reach the bottom with the load intact, five runs, each steeper than the last." },
  { mode: "3d", lang: "en", title: "The Long Field",
    prompt: "A harvest race against weather. You drive a combine across a wheat field cutting lanes while a storm front advances from one edge of the map. Cut as much as you can before the rain reaches you. The storm moves differently every round." },
  { mode: "2d", lang: "en", title: "Signal Lost",
    prompt: "A side-scrolling repair game. You climb a chain of transmission towers, jumping between gantries to reach broken relays and restore a signal. Wind gusts push you mid-jump. Six relays, three lives, one continuous climb." },
  { mode: "2d", lang: "pt", title: "Corrida das Marés",
    prompt: "Um jogo de plataformas na costa. Você atravessa rochas e poças enquanto a maré sobe atrás de você, recolhendo conchas antes que a água chegue. A maré sobe mais depressa a cada nível. Cinco níveis, sem checkpoints." },
  { mode: "3d", lang: "en", title: "Nightwatch Museum",
    prompt: "A stealth patrol game in a small museum after closing. You walk the galleries with a torch, checking exhibits and closing doors a thief has opened. The thief moves between rooms when you are not looking. Secure every gallery before the shift ends." },
  { mode: "2d", lang: "ar", title: "طريق القافلة",
    prompt: "لعبة تنقل عبر الصحراء. تقود قافلة بين الكثبان الرملية، تجمع الماء من الآبار قبل نفاده وتتجنب العواصف الرملية التي تحجب الرؤية. اعبر خمس مراحل للوصول إلى الواحة." },
];

const say = (...a) => console.log(...a);
const fail = (...a) => console.error(...a);

async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* an HTML error page, not JSON */ }
  return { ok: res.ok, status: res.status, body, text: text.slice(0, 300) };
}

/* ---------- preflight: refuse to start a run that cannot finish ---------- */
if (!WALLET) { fail("--wallet is required. Open the Studio once and copy the wallet id it creates."); process.exit(2); }
if (!KEY && !DRY) { fail("MODERATION_KEY is not set. An unapproved game never reaches the arcade."); process.exit(2); }

say(`base     ${BASE}`);
say(`wallet   ${WALLET}`);
say(`titles   ${ONLY || TITLES.length} of ${TITLES.length}${DRY ? "   (dry run — nothing will be forged)" : ""}\n`);

const health = await api("/api/health");
if (!health.ok || !health.body) { fail(`/api/health did not answer (${health.status}). Wrong --base?`); process.exit(2); }
const live = health.body.mode && !String(health.body.mode).startsWith("demo");
say(`health   mode=${health.body.mode} ledger=${health.body.ledger} moderation=${health.body.moderation}`);
if (!health.body.ledger) { fail("\nDATABASE_URL is not configured on this deployment — nothing can be stored."); process.exit(2); }
if (!live) {
  fail("\nNo provider key is live on this deployment: every build would come from the");
  fail("deterministic engine rather than the fleet. Set ANTHROPIC_API_KEY in Vercel first.");
  if (!DRY) process.exit(2);
}
if (!health.body.moderation && !DRY) { fail("\nMODERATION_KEY is not set on the deployment — approvals would be refused."); process.exit(2); }

const work = ONLY ? TITLES.slice(0, ONLY) : TITLES;
const done = [];
const failed = [];

for (const [i, g] of work.entries()) {
  const tag = `[${i + 1}/${work.length}] ${g.title}`;
  if (DRY) { say(`${tag}  would forge (${g.mode}, ${g.lang})`); continue; }

  say(`${tag}  forging (${g.mode}, ${g.lang})…`);
  const t0 = Date.now();
  const forge = await api("/api/forge-game", {
    method: "POST",
    body: JSON.stringify({
      prompt: g.prompt, title: g.title, language: g.lang, walletId: WALLET,
      mode: g.mode, ticket: `seed-${Date.now()}-${i}`,
    }),
  });
  if (!forge.ok || !forge.body?.html) {
    fail(`${tag}  FORGE FAILED ${forge.status}: ${forge.body?.error || forge.text}`);
    failed.push({ ...g, at: "forge", why: forge.body?.error || forge.text });
    continue;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const provider = forge.body.provider;
  say(`${tag}  built by ${provider} in ${secs}s, ${Math.round(forge.body.html.length / 1024)} KB, ${forge.body.acuOnAccept} ACU on accept`);
  if (provider === "engine") {
    /* Not a failure — the engine build is a real game and is what a creator
       would have received. Worth saying out loud, because a shelf of engine
       builds means the provider chain is not working, not that the concepts
       were bad. */
    say(`${tag}  NOTE: every provider was refused or failed — ${forge.body.bespokeError || "no detail"}`);
  }

  const pub = await api("/api/games", {
    method: "POST",
    body: JSON.stringify({
      title: g.title, summary: g.prompt.slice(0, 200), language: g.lang,
      html: forge.body.html, walletId: WALLET, forgeId: forge.body.forgeId,
    }),
  });
  if (!pub.ok || !pub.body?.id) {
    fail(`${tag}  PUBLISH FAILED ${pub.status}: ${pub.body?.error || pub.text}`);
    failed.push({ ...g, at: "publish", why: pub.body?.error || pub.text });
    continue;
  }

  /* Approve immediately rather than at the end. api/games.ts caps a wallet at
     10 games awaiting review, so a batch that publishes everything first would
     wedge itself on the eleventh — and a half-seeded queue is worse than a
     clean failure. */
  const mod = await api("/api/moderation", {
    method: "POST",
    headers: { "x-admin-key": KEY },
    body: JSON.stringify({ id: pub.body.id, action: "approve", note: "Studio launch title" }),
  });
  if (!mod.ok) {
    fail(`${tag}  APPROVAL FAILED ${mod.status}: ${mod.body?.error || mod.text} — it is published but stuck in review`);
    failed.push({ ...g, at: "moderation", why: mod.body?.error || mod.text, id: pub.body.id });
    continue;
  }

  say(`${tag}  live at ${BASE}${pub.body.playUrl}\n`);
  done.push({ ...g, id: pub.body.id, provider, url: BASE + pub.body.playUrl });
}

/* ---------- confirm against the feed the landing page actually reads ------ */
if (!DRY) {
  const feed = await api("/api/arcade");
  const count = feed.body?.games?.length ?? 0;
  say(`\n${done.length} forged and approved, ${failed.length} failed`);
  say(`/api/arcade now returns ${count} game(s) — this is the feed the landing page reads`);
  if (failed.length) {
    say("\nfailures:");
    for (const f of failed) say(`  ${f.title} — failed at ${f.at}: ${String(f.why).slice(0, 160)}`);
  }
  process.exit(failed.length ? 1 : 0);
}
