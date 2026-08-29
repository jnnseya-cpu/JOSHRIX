/**
 * JOSHRIX 3D Playable Engine — the deterministic 3D game.
 *
 * WHY THIS EXISTS. forge-game called buildPlayableGame(bp) regardless of mode,
 * and that builder only makes a 2D paddle game. So a 3D forge whose AI failed —
 * or whose AI build failed to render on the client — shipped a flat catch game
 * with the creator's title on it. That is the single most damaging thing in the
 * product: a creator asks for a 3D world, waits, and receives a 2D minigame.
 * "It only creates short character games" was this, and it went unfixed for
 * weeks because nothing here could run a forge to see it.
 *
 * So: a real 3D game, built from the blueprint by hand-written code, using the
 * JOSHRIX3D runtime and the 88-model curated library. It needs no AI, no
 * provider key and no network beyond the asset host, which means it can be run
 * and PLAYED in a browser here — the AI path never could be.
 *
 * It is not a bespoke game and does not pretend to be. It is a proper 3D
 * arena game — a themed world, animated characters, a chase, a collect loop,
 * rising waves — that is always genuinely playable. When the AI works, its
 * bespoke build ships instead. This is the floor, and the floor was 2D.
 */
import type { GameBlueprint } from "../shared/contracts";

const esc = (s: string) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
/** JSON embedded in a <script> must not carry a literal </script>, and U+2028/9
 *  are line terminators in JS source even inside a string literal. */
const js = (v: unknown) => JSON.stringify(v)
  .replace(/</g, "\\u003c")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");

/**
 * A world. Every key here is a real file in frontend/assets/models3d/lib —
 * a key that does not exist loads nothing and leaves the arena empty, which is
 * exactly the "two models on a bare disc" failure this replaces. The list is
 * asserted against the directory in tests/t34-engine3d.js.
 */
type World = {
  id: string;
  match: string[];
  hero: string; heroHeight: number;
  enemy: string; enemyHeight: number;
  pickup: string; pickupHeight: number;
  scenery: Array<[string, number, number]>;   // key, height, count
  sky: { top: string; mid: string; haze: string };
  ground: { base: string; speckle: [string, string] };
  accent: string;
  sea?: boolean;
  ambience: string;
  pickupWord: string; enemyWord: string;
};

const WORLDS: World[] = [
  {
    id: "dino", match: ["dino", "dinosaur", "jurassic", "prehistoric", "raptor", "trex", "island"],
    hero: "hero_knight", heroHeight: 1.8, enemy: "dino_raptor", enemyHeight: 1.6,
    pickup: "dino_egg", pickupHeight: 0.5,
    scenery: [["tree_palm", 5.5, 14], ["fern_tree", 3.2, 10], ["rock_1", 1.4, 8], ["volcano", 9, 2]],
    sky: { top: "#2b1206", mid: "#7a3410", haze: "#d98244" },
    ground: { base: "#5c4327", speckle: ["#6d5231", "#47331e"] },
    accent: "#ff9a3c", ambience: "forest", pickupWord: "EGGS", enemyWord: "RAPTOR",
  },
  {
    id: "space", match: ["space", "galaxy", "star", "cosmic", "planet", "orbit", "rocket", "alien", "sci-fi", "cyber", "neon"],
    hero: "guardian", heroHeight: 1.9, enemy: "enemy_bat", enemyHeight: 1.1,
    pickup: "star_collectable", pickupHeight: 0.8,
    scenery: [["asteroid", 2.2, 16], ["satellite", 2.0, 4], ["planet", 6, 3], ["rocket", 4, 2]],
    sky: { top: "#02030c", mid: "#0a0f2e", haze: "#1d2a5c" },
    ground: { base: "#1b1f3a", speckle: ["#2a3055", "#12152b"] },
    accent: "#22D3EE", ambience: "hum", pickupWord: "STARS", enemyWord: "DRONE",
  },
  {
    id: "football", match: ["football", "soccer", "pitch", "stadium", "goal", "striker", "sport"],
    hero: "villager", heroHeight: 1.8, enemy: "enemy_goblin", enemyHeight: 1.5,
    pickup: "football", pickupHeight: 0.45,
    scenery: [["stadium_stands", 7, 8], ["corner_flag", 2, 4], ["goal", 2.6, 2], ["banner", 2.4, 6]],
    sky: { top: "#0a2a4f", mid: "#2f7fb8", haze: "#9fd0e8" },
    ground: { base: "#2f7d3f", speckle: ["#37913f", "#286a34"] },
    accent: "#22c55e", ambience: "city", pickupWord: "BALLS", enemyWord: "DEFENDER",
  },
  {
    id: "castle", match: ["castle", "knight", "kingdom", "medieval", "dragon", "quest", "sword", "fantasy", "dungeon"],
    hero: "hero_knight", heroHeight: 1.8, enemy: "enemy_goblin", enemyHeight: 1.5,
    pickup: "coin", pickupHeight: 0.4,
    scenery: [["castle_wall", 4, 10], ["ruin_pillar", 3.4, 8], ["torch", 1.8, 6], ["fantasy_tower", 8, 3]],
    sky: { top: "#141033", mid: "#3a2a63", haze: "#8a6fa8" },
    ground: { base: "#4a4438", speckle: ["#565042", "#3a352c"] },
    accent: "#c9a227", ambience: "wind", pickupWord: "GOLD", enemyWord: "GOBLIN",
  },
  {
    id: "night", match: ["night", "dark", "horror", "blackout", "midnight", "ghost", "haunted", "storm", "rain"],
    hero: "villager", heroHeight: 1.8, enemy: "enemy_slime", enemyHeight: 1.2,
    pickup: "lantern", pickupHeight: 0.7,
    scenery: [["tree_dead", 5, 16], ["house_small", 4, 6], ["fence", 1.2, 12], ["well", 1.6, 2]],
    sky: { top: "#04060f", mid: "#0b1226", haze: "#243049" },
    ground: { base: "#232a33", speckle: ["#2c343f", "#1a2028"] },
    accent: "#7C3AED", ambience: "night", pickupWord: "LANTERNS", enemyWord: "CREEPER",
  },
  {
    id: "sea", match: ["sea", "ocean", "island", "reef", "pirate", "boat", "beach", "coast", "sail"],
    hero: "guardian", heroHeight: 1.9, enemy: "enemy_slime", enemyHeight: 1.2,
    pickup: "chest_closed", pickupHeight: 0.7,
    scenery: [["tree_palm", 5.5, 12], ["rock_flat", 1.0, 8], ["boat", 3, 3], ["barrel", 1.0, 6]],
    sky: { top: "#062038", mid: "#1f6f8f", haze: "#7fc9d8" },
    ground: { base: "#c8b183", speckle: ["#d6c096", "#a8916a"] },
    accent: "#5ee0d0", sea: true, ambience: "sea", pickupWord: "CHESTS", enemyWord: "LURKER",
  },
  {
    // The default. A forest is the safest world to land in when nothing matched:
    // it reads as a real place, and every model in it is a common one.
    id: "forest", match: [],
    hero: "hero_knight", heroHeight: 1.8, enemy: "enemy_slime", enemyHeight: 1.2,
    pickup: "crystal_0", pickupHeight: 0.8,
    scenery: [["tree_round_0", 5, 14], ["tree_pine_0", 6, 10], ["bush_0", 1.1, 12], ["mushroom_0", 0.9, 8]],
    sky: { top: "#0b2418", mid: "#2f6b45", haze: "#9ccf9f" },
    ground: { base: "#3c6b3a", speckle: ["#487a42", "#2f5730"] },
    accent: "#34d399", ambience: "forest", pickupWord: "CRYSTALS", enemyWord: "SLIME",
  },
];

/** Choose the world the concept is actually describing. */
export function pickWorld(bp: GameBlueprint): World {
  const hay = [
    bp.title, bp.summary, (bp.genre || []).join(" "),
    (bp.characters || []).map((c: any) => `${c?.name ?? ""} ${c?.role ?? ""}`).join(" "),
    (bp.levels || []).map((l: any) => `${l?.name ?? ""} ${l?.objective ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  let best: World | null = null, bestScore = 0;
  for (const w of WORLDS) {
    const score = w.match.reduce((n, k) => n + (hay.includes(k) ? 1 : 0), 0);
    if (score > bestScore) { best = w; bestScore = score; }
  }
  return best ?? WORLDS[WORLDS.length - 1];
}

/** Every model key this builder can emit — asserted to exist on disk by t34. */
export function worldModelKeys(): string[] {
  const out = new Set<string>();
  for (const w of WORLDS) {
    out.add(w.hero); out.add(w.enemy); out.add(w.pickup);
    for (const [k] of w.scenery) out.add(k);
  }
  return [...out];
}

export function buildPlayable3dGame(bp: GameBlueprint): string {
  const w = pickWorld(bp);
  const title = String(bp.title || "Your World").slice(0, 60);
  const summary = String(bp.summary || "").slice(0, 200);
  const lang = bp.language && bp.language !== "auto" ? bp.language : "en";
  const words = title.trim().split(/\s+/);
  const accentWord = words.length > 1 ? words[words.length - 1] : "";

  const cfg = {
    title, accentWord,
    tagline: summary || `Collect the ${w.pickupWord.toLowerCase()}. Stay away from the ${w.enemyWord.toLowerCase()}s.`,
    howTo: "Drag anywhere, or use WASD / arrow keys. Collect the glowing pickups. Do not let them reach you.",
    accent: w.accent, sky: w.sky, ground: w.ground, sea: !!w.sea,
    hero: w.hero, heroH: w.heroHeight, enemy: w.enemy, enemyH: w.enemyHeight,
    pickup: w.pickup, pickupH: w.pickupHeight, scenery: w.scenery,
    ambience: w.ambience, pickupWord: w.pickupWord, enemyWord: w.enemyWord,
  };

  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<style>html,body{height:100%;margin:0;background:${esc(w.sky.haze)};overflow:hidden}</style>
<script src="https://www.joshrix.com/assets/vendor/three.min.js"></script>
<script src="https://www.joshrix.com/assets/vendor/GLTFLoader.js"></script>
<script src="https://www.joshrix.com/assets/vendor/joshrix3d-1.js"></script>
</head>
<body>
<script>
(function () {
var C = ${js(cfg)};

var G = JOSHRIX3D.boot({
  title: C.title, titleAccent: C.accentWord, tagline: C.tagline, howTo: C.howTo,
  arena: 26, playRadius: 18, accent: C.accent, sky: C.sky, ground: C.ground, sea: C.sea
});
var T = G.THREE;

/* The player exists as a primitive BEFORE any model lands, so the game is
   playable from frame one even if every download is slow or fails. */
var player = new T.Group();
var stand = new T.Mesh(new T.CapsuleGeometry(0.34, 0.9, 4, 10),
  new T.MeshStandardMaterial({ color: 0xdfe6ef, roughness: 0.7 }));
stand.position.y = 0.95; stand.castShadow = true; player.add(stand);
player.position.set(0, 0, 5); G.scene.add(player); G.follow(player); G.target.set(0, 0, 5);

var heroActor = null;
G.load("hero", "lib/${w.hero}", { height: ${w.heroHeight}, onLoad: function () {
  var a = G.actor("hero", "walk");
  if (a) { player.remove(stand); player.add(a.obj); heroActor = a; }
} })
 .load("foe", "lib/${w.enemy}", { height: ${w.enemyHeight} })
 .load("pick", "lib/${w.pickup}", { height: ${w.pickupHeight} })
${w.scenery.map(([k, h], i) => ` .load("sc${i}", "lib/${k}", { height: ${h} })`).join("\n")};

G.onReady(function () {
  for (var i = 0; i < C.scenery.length; i++) {
    G.scatter("sc" + i, C.scenery[i][2], { minR: 20, maxR: 34, avoid: player.position, avoidRadius: 6 });
  }
});

var picks = [], foes = [], spawnTimer = 0, wave = 1;

function place(obj, minR, maxR) {
  var a = Math.random() * 6.283, r = minR + Math.random() * (maxR - minR);
  obj.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
}
function addPickup() {
  var o = G.get("pick");
  if (!o) { o = new T.Mesh(new T.OctahedronGeometry(0.42), new T.MeshStandardMaterial({ color: 0xffe58a, emissive: 0x6b5a10 })); }
  place(o, 4, 16); o.position.y = 0.55; G.scene.add(o); picks.push(o);
}
function addFoe() {
  var a = G.actor("foe", "walk"), o = a ? a.obj : null;
  if (!o) { o = new T.Mesh(new T.SphereGeometry(0.55, 12, 10), new T.MeshStandardMaterial({ color: 0xd05050 })); }
  G.tint(o, "#ff6b6b", 0.28);          // reads as a threat without hiding the model
  place(o, 15, 18); G.scene.add(o); foes.push({ obj: o, actor: a, speed: 2.1 + wave * 0.28 });
}

function hud() { G.stat(C.pickupWord, G.score, "left"); G.pips("Lives", G.lives, "\\u2665", "right"); }

G.onReset(function (g) {
  picks.forEach(function (p) { g.scene.remove(p); }); picks.length = 0;
  foes.forEach(function (f) { g.scene.remove(f.obj); }); foes.length = 0;
  player.position.set(0, 0, 5); g.target.set(0, 0, 5);
  g.lives = 3; wave = 1; spawnTimer = 0;
  for (var i = 0; i < 7; i++) addPickup();
  addFoe(); hud();
});

G.onStart(function () { G.ambience(C.ambience); });

G.onUpdate(function (g, dt) {
  /* steer: G.target is driven by pointer drag and WASD alike */
  var d = g.target.clone().sub(player.position); d.y = 0;
  var dist = d.length();
  if (dist > 0.05) {
    d.normalize();
    var step = Math.min(dist, 7.4 * dt);
    player.position.addScaledVector(d, step);
    player.rotation.y = Math.atan2(d.x, d.z);
    if (heroActor && heroActor.play) heroActor.play("walk");
  } else if (heroActor && heroActor.play) { heroActor.play("idle"); }

  /* keep the player inside the arena */
  var pr = Math.hypot(player.position.x, player.position.z);
  if (pr > 18) { player.position.multiplyScalar(18 / pr); }

  /* pickups */
  for (var i = picks.length - 1; i >= 0; i--) {
    var p = picks[i];
    p.rotation.y += dt * 1.6;
    p.position.y = 0.55 + Math.sin(g.elapsed * 2.4 + i) * 0.12;
    /* Horizontal distance only. distanceTo() is 3D, and the pickup bobs up to
       0.67 above a player standing at y=0 — so a third of the collect radius
       was being spent on height the player cannot control. 1.7 across a 36-wide
       arena is a pickup you can run through, not one you have to stand on. */
    var pdx = p.position.x - player.position.x, pdz = p.position.z - player.position.z;
    if (Math.sqrt(pdx * pdx + pdz * pdz) < 1.7) {
      G.scene.remove(p); picks.splice(i, 1);
      g.score += 10; G.sfx("pickup"); G.burst(p.position, C.accent); hud();
      addPickup();
      if (g.score > 0 && g.score % 60 === 0) {
        wave++; addFoe(); G.sfx("powerup"); G.flash(C.accent);
      }
    }
  }

  /* the chase */
  for (var k = 0; k < foes.length; k++) {
    var f = foes[k], fd = player.position.clone().sub(f.obj.position); fd.y = 0;
    var fdist = fd.length();
    if (fdist > 0.001) {
      fd.normalize();
      f.obj.position.addScaledVector(fd, f.speed * dt);
      f.obj.rotation.y = Math.atan2(fd.x, fd.z);
    }
    if (fdist < 1.35) {
      g.lives -= 1; G.sfx("hurt"); G.flash("#ff3b3b"); hud();
      place(f.obj, 15, 18);
      if (g.lives <= 0) {
        G.sfx("lose");
        G.over("Caught", "You gathered " + g.score + " " + C.pickupWord.toLowerCase() + " before the " + C.enemyWord.toLowerCase() + "s closed in.");
        return;
      }
    }
  }

  /* a slow drip of extra pressure so a good run still ends */
  spawnTimer += dt;
  if (spawnTimer > 16) { spawnTimer = 0; if (foes.length < 8) { addFoe(); G.sfx("alarm", { gain: 0.6 }); } }
});
})();
</script>
</body>
</html>`;
}
