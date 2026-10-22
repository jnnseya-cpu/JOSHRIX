/**
 * The platform's capabilities, as a single source of truth for content.
 *
 * Every entry here is a thing this codebase ACTUALLY does, with the number that
 * proves it — counted from the repository, not from a marketing page. The
 * Content Agent is given the proof alongside the topic so an article can be
 * specific instead of adjectival, and so it never has to invent a statistic to
 * sound confident. Fabricated numbers are the fastest way to lose a technical
 * reader, and this platform's buyers are technical.
 *
 * If a number here stops being true, the article that quotes it becomes a lie,
 * so treat this file as claims to be maintained rather than copy to be written
 * once. `tests/t16-features.js` asserts the countable ones against the repo.
 */

/**
 * The library's size, in ONE place.
 *
 * These numbers were written out longhand in four files — this one, the AI
 * gateway's prompt, the features hub's meta description and a comment in
 * sitemap.ts. When 152 characters landed on 31 Aug, three of the four silently
 * became false, and the one guarded by a test was the only one that said so.
 *
 * `tests/t16-features.js` checks these against the actual contents of
 * `frontend/assets/models3d/packs`, so after any ingest the failing test names
 * the number to change and there is exactly one place to change it.
 */
export const LIBRARY = {
  models: 2601,
  packs: 35,
  /** rigged characters carrying skeletal clips, not merely posed */
  animated: 291,
  sprites: 2553,
} as const;

/**
 * What one finished game costs in metered compute, in pence.
 *
 * This is the single number a creator most wants before signing up, and it was
 * written out longhand in this file's proof text and again in the features
 * hub's meta description — the same two-copy pattern that had already let the
 * model count go stale. The landing page needed it as well, which would have
 * made three, so it becomes a constant here and `tests/t16-features.js` asserts
 * that every surface quoting it agrees.
 *
 * These are measurements from real forge runs, not a target. If metering or
 * model routing changes them, change them HERE and the failing test will name
 * every page that has to follow.
 */
export const BUILD_COST_MINOR = {
  twoD: 32,
  threeD: 49,
} as const;

/** "£0.32" — a pence figure as a buyer reads it. */
export const gbp = (minor: number) =>
  minor % 100 === 0 ? `£${minor / 100}` : `£${(minor / 100).toFixed(2)}`;

/** "2,591" — the form every marketing claim uses. */
export const n = (v: number) => v.toLocaleString("en-GB");

export type Feature = {
  /** URL-safe id; also the blog slug hint and the hub anchor. */
  id: string;
  /** The capability, in the buyer's words rather than the system's. */
  name: string;
  /** Which cluster this belongs to — the hub groups by these. */
  group: "Create" | "Assets" | "Economics" | "Publish & Sell" | "Growth" | "Trust";
  /** What a searcher would actually type. Long-tail beats head terms on a new domain. */
  keywords: string[];
  /** The verifiable specifics an article must be built on. */
  proof: string[];
  /**
   * WHY SOMEONE CHOOSES THIS, as opposed to what it does.
   *
   * `proof` above is the factual base an article may state. It is not a reason
   * to buy, and a blog built only on it reads like documentation: accurate,
   * complete and unpersuasive. These three fields are the selling material, and
   * they live here rather than in the blog agent because every surface that
   * sells — a post, the features hub, an advert, a newsletter — must make the
   * same argument. Two copies of a positioning claim is how a product ends up
   * describing itself differently on two pages.
   *
   * The rules they obey: no earnings or income claim, ever, including by
   * implication; no invented figure; no competitor named. A fee or a rate may be
   * stated as what the platform charges, never as what a creator will make.
   */
  usp: {
    /** The one claim a competitor cannot answer by cutting its price. */
    edge: string;
    /** The doubt already in the reader's head, in the reader's own words. */
    objection: string;
    /** What they do today instead, and what that costs them. */
    insteadOf: string;
  };
  /** Where on the platform this lives, so posts link to the thing they describe. */
  href: string;
};

export const FEATURES: Feature[] = [
  {
    id: "describe-a-game-in-any-language",
    name: "Describe a game in any language",
    group: "Create",
    keywords: ["make a game without coding", "AI game generator any language", "create a game in French Swahili Arabic"],
    proof: [
      "The concept box accepts any language; the Idea Agent detects it and writes every player-facing string in that language.",
      "Title, summary, characters, levels and marketplace category are all localised at blueprint time, not translated afterwards.",
    ],
    usp: {
      edge: "Every player-facing string is authored in the creator's language at blueprint time, not translated afterwards, so names and idiom read as native rather than as machine-translated English.",
      objection: "\"Any language\" normally means an English game with the buttons swapped.",
      insteadOf: "Writing the game in English and paying a localiser later, which redoes the work and still reads translated.",
    },
    href: "/studio",
  },
  {
    id: "3d-games-in-the-browser",
    name: "Real 3D games that run in a browser tab",
    group: "Create",
    keywords: ["browser 3D game maker", "make a 3D game without Unity", "AI 3D game generator"],
    proof: [
      "3D builds run on three.js with a hosted JOSHRIX runtime that owns the canvas, render loop, shadows, fog, sky and camera.",
      "No install, no plugin, no account to play — a finished game is a URL.",
    ],
    usp: {
      edge: "A hosted runtime owns the canvas, render loop, lights, shadows, sky and camera, so a generated game supplies only the concept — the part that is hardest to get right is never regenerated and cannot come out wrong.",
      objection: "AI cannot produce real 3D; it will be a flat toy with a camera.",
      insteadOf: "Learning a desktop game engine for months, then shipping a build nobody can open without a download first.",
    },
    href: "/studio",
  },
  {
    id: "model-library",
    name: `${n(LIBRARY.models)} game-ready 3D models, included`,
    group: "Assets",
    keywords: ["free 3D game assets", "CC0 low poly models", "game art without an artist"],
    proof: [
      `${n(LIBRARY.models)} GLB models across ${LIBRARY.packs} packs, every one load-tested in a real browser before it shipped.`,
      `Includes ${LIBRARY.animated} rigged, textured, animated characters, creatures and animals — humans, monsters, mounts and mechs, with full skeletal clip sets.`,
      "All CC0, so a creator owns the output outright with no attribution burden.",
    ],
    usp: {
      edge: "Every model was load-tested in a real browser before it shipped, and the animated ones carry full skeletal clip sets rather than a single pose — all CC0, so the creator owns the output with no attribution burden.",
      objection: "AI games look empty because there is no art behind them.",
      insteadOf: "Commissioning a 3D artist, or trawling asset stores and finding half the files will not load.",
    },
    href: "/studio",
  },
  {
    id: "sprite-library",
    name: `${n(LIBRARY.sprites)} 2D sprites, included`,
    group: "Assets",
    keywords: ["free 2D game sprites", "CC0 platformer art", "game sprites no artist"],
    proof: [
      `${n(LIBRARY.sprites)} CC0 PNG sprites across six packs, every one decoded in a real browser before shipping.`,
      "A complete side-scroller set: six biomes of ground tiles, three players with 11-frame walk cycles, animated enemies, pickups, hazards and a HUD.",
    ],
    usp: {
      edge: "It is a complete side-scroller set rather than a bag of icons: biomes that tile, players with real walk cycles, enemies that animate, pickups, hazards and a HUD that match each other.",
      objection: "Free sprite packs are never a whole game's worth of art.",
      insteadOf: "Stitching five mismatched packs together and shipping something that looks assembled.",
    },
    href: "/studio",
  },
  {
    id: "metered-pricing",
    name: "Pay for the compute your build used, not a quota",
    group: "Economics",
    keywords: ["AI game maker pricing", "pay per use AI credits", "cheapest AI game generator"],
    proof: [
      `A finished 2D game measures at about ${gbp(BUILD_COST_MINOR.twoD)} of compute; a 3D game about ${gbp(BUILD_COST_MINOR.threeD)}.`,
      "Charges are metered from real token usage, never a flat guess.",
      "The hold is an estimate; whatever the build did not use is refunded the moment it settles.",
    ],
    usp: {
      edge: "Billing is metered from the tokens a build actually used, and the unused part of the hold returns the moment it settles — so the price follows the work rather than a tier.",
      objection: "Credit systems are designed so you overpay for what you did not use.",
      insteadOf: "A monthly quota you either exhaust by the tenth or waste entirely.",
    },
    href: "/pricing",
  },
  {
    id: "failed-builds-refund",
    name: "You pay only for builds you keep",
    group: "Economics",
    keywords: ["AI credits refund", "do AI game generators charge for failures"],
    proof: [
      "You are charged only if you keep the build. Publishing it, or spending an Enhance pass on it, is the only thing that collects payment.",
      "Refine it, discard it or walk away and the entire hold returns — a build you would not play costs you nothing.",
      "No competitor in this category refunds anything.",
    ],
    usp: {
      edge: "Payment collects only when the creator keeps the build; refining, discarding or walking away returns the whole hold. Nothing else in this category refunds anything.",
      objection: "I will burn credits on failures before I get anything playable.",
      insteadOf: "Paying per generation and absorbing the cost of every bad roll yourself.",
    },
    href: "/refunds",
  },
  {
    id: "own-your-ip",
    name: "You own the game outright",
    group: "Trust",
    keywords: ["who owns AI generated games", "game IP ownership AI platform"],
    proof: [
      "The creator holds the IP. The platform takes a commission on sales, never a stake in the work.",
      "Games are not locked to the platform the way a Roblox experience is.",
    ],
    usp: {
      edge: "The creator holds the IP and the platform takes a commission on sales, never a stake in the work, and the game is not locked to the runtime the way a platform-native experience is.",
      objection: "If an AI wrote it, do I actually own it?",
      insteadOf: "Building inside a walled platform that owns the runtime your game can never leave.",
    },
    href: "/ip-registry",
  },
  {
    id: "commission-rates",
    name: "You keep 75–92.5% of every sale",
    group: "Economics",
    keywords: ["game marketplace revenue share", "Roblox developer revenue share alternative"],
    proof: [
      "Commission falls with plan: 25% on Creator down to 7.5% on Enterprise.",
      "Steam takes 30%, Apple takes 30%, and Roblox keeps roughly three quarters after its conversion.",
    ],
    usp: {
      edge: "The platform's cut falls with the plan and starts below what the large storefronts charge at their best rate.",
      objection: "Marketplaces keep most of what a sale is worth.",
      insteadOf: "A flat 30% storefront cut, taken at every tier regardless of what you do.",
    },
    href: "/pricing",
  },
  {
    id: "multi-provider-failover",
    name: "Three AI providers, so one outage cannot stop you",
    group: "Trust",
    keywords: ["AI platform reliability", "what happens when the AI API goes down"],
    proof: [
      "Every build is attempted across three independent providers in turn.",
      "A truncated, unparseable or empty build is rejected server-side and the next provider is asked instead.",
    ],
    usp: {
      edge: "Every build is attempted across three independent providers in turn, and a truncated, unparseable or empty result is rejected server-side before the next one is asked.",
      objection: "These tools stop working the moment one AI vendor has an outage.",
      insteadOf: "A single-vendor tool that returns an error page when its one provider is down.",
    },
    href: "/agent-fleet",
  },
  {
    id: "quality-gates",
    name: "Builds are checked before you ever see them",
    group: "Trust",
    keywords: ["AI generated game quality", "why do AI games break"],
    proof: [
      "Every generated file must parse, must draw a canvas, and must contain an actual game loop with something to reach or avoid.",
      "A build that only sets up a world and forgets the gameplay is thrown away rather than delivered.",
    ],
    usp: {
      edge: "A build must parse, draw a canvas and contain a real game loop with something to reach or avoid before the creator ever sees it; one that sets up a world and forgets the gameplay is thrown away rather than delivered.",
      objection: "AI output is plausible-looking and broken, and I will be the one debugging it.",
      insteadOf: "Being handed the first thing the model produced and finding out yourself what is wrong with it.",
    },
    href: "/how-it-works",
  },
  {
    id: "malware-scanning",
    name: "Every generated game is scanned before it is hosted",
    group: "Trust",
    keywords: ["are AI generated games safe", "prompt injection game platform"],
    proof: [
      "Generated HTML is scanned for outside network calls, password fields, eval-hidden code, embedded pages and crypto miners.",
      "Anything that trips the scan is discarded and another provider is asked, so it is never stored or played.",
    ],
    usp: {
      edge: "Generated code is scanned for outside network calls, password fields, eval-hidden code, embedded pages and miners, and anything that trips the scan is discarded rather than stored — so a hostile build never reaches a player.",
      objection: "Is it safe to host and share code an AI wrote?",
      insteadOf: "Publishing model output unexamined and finding out from a player.",
    },
    href: "/how-it-works",
  },
  {
    id: "human-moderation",
    name: "A person reviews a game before it goes public",
    group: "Trust",
    keywords: ["AI game moderation", "app store compliant AI games"],
    proof: [
      "Publishing is gated on human review, which is what keeps the catalogue store-compliant and age-appropriate.",
      "Private playtesting is unlimited and free before that gate.",
    ],
    usp: {
      edge: "A person reviews every game before it goes public, which is what keeps the catalogue store-compliant and age-appropriate — while private playtesting before that gate is unlimited and free.",
      objection: "An open AI catalogue fills with junk and worse.",
      insteadOf: "An unmoderated feed, or a store review queue you wait weeks in.",
    },
    href: "/how-it-works",
  },
  {
    id: "instant-share-link",
    name: "Every published game is one shareable link",
    group: "Publish & Sell",
    keywords: ["share a browser game link", "html5 game hosting free"],
    proof: [
      "Hosted on publication — no install, no download, no account for the player.",
      "The link is the product, and it works on a phone as well as a desktop.",
    ],
    usp: {
      edge: "The link is the product: hosted on publication, with no install, no download and no account for the player, and it works on a phone as well as a desktop.",
      objection: "Nobody will download an unknown indie game.",
      insteadOf: "A large download and a store page standing between your game and the first second of play.",
    },
    href: "/arcade",
  },
  {
    id: "arcade",
    name: "Your game lands in a public arcade",
    group: "Publish & Sell",
    keywords: ["publish browser game", "indie game distribution platform"],
    proof: [
      "Approved games appear in the JOSHRIX Arcade the moment moderation clears them.",
      "The Arcade installs as an app from the browser.",
    ],
    usp: {
      edge: "An approved game appears in the catalogue the moment moderation clears it, and the Arcade itself installs from the browser as an app.",
      objection: "A new game launches into silence with nowhere to be found.",
      insteadOf: "Publishing to your own empty page and hoping traffic arrives.",
    },
    href: "/arcade",
  },
  {
    id: "marketplace",
    name: "Sell your game, with the price you set",
    group: "Publish & Sell",
    keywords: ["sell indie games online", "sell browser games"],
    proof: [
      "Pricing is server-authoritative, so a listing cannot be bought at a price the seller did not set.",
      "Payment runs through Stripe.",
    ],
    usp: {
      edge: "Pricing is server-authoritative, so a listing cannot be bought at a price the seller did not set.",
      objection: "Can someone tamper with my price or buy it for nothing?",
      insteadOf: "A storefront that trusts the price the buyer's browser sends.",
    },
    href: "/marketplace",
  },
  {
    id: "remix-royalties",
    name: "Remix lineage pays the original creator",
    group: "Publish & Sell",
    keywords: ["game remix royalties", "fork a game and share revenue"],
    proof: [
      "A remixed game keeps its ancestry, and ancestors earn automatically from what their work seeds.",
      "No other platform in this category tracks lineage or pays it.",
    ],
    usp: {
      edge: "A remixed game keeps its ancestry and the original creator is paid automatically from what their work seeds. Nothing else in this category tracks lineage or pays it.",
      objection: "If someone forks my game I get nothing for it.",
      insteadOf: "Open remixing where the person who went first is credited at best.",
    },
    href: "/ip-registry",
  },
  {
    id: "mobile-money-payouts",
    name: "Get paid without a card or a US bank",
    group: "Economics",
    keywords: ["get paid as a game developer in Africa", "mobile money payout creators"],
    proof: [
      "Payout rails include mobile money, not just card and bank transfer.",
      "For many creators outside the US and EU, the alternatives are not merely worse — they are unavailable.",
    ],
    usp: {
      edge: "Payout rails include mobile money, not only card and bank transfer. For many creators outside the US and EU the alternatives are not merely worse — they are unavailable.",
      objection: "Platforms like this never actually pay out to my country.",
      insteadOf: "A platform that requires a US bank account you have no way to open.",
    },
    href: "/wallet",
  },
  {
    id: "growth-engine",
    name: "Ten AI tools to market what you made",
    group: "Growth",
    keywords: ["market an indie game", "AI social media posts for games"],
    proof: [
      "Social posts, adverts, email campaigns, landing copy, hashtags, video scripts, audience and timing guidance.",
      "About £0.05 per generated asset, metered like everything else.",
    ],
    usp: {
      edge: "The tools that market the finished game are metered the same way the build is, so a launch kit costs pennies an asset instead of a freelancer's day rate.",
      objection: "I can make a game but I have no idea how to get it played.",
      insteadOf: "Paying per asset for a freelancer, or posting nothing and wondering why it is quiet.",
    },
    href: "/growth",
  },
  {
    id: "honest-analytics",
    name: "Analytics that refuse to invent numbers",
    group: "Growth",
    keywords: ["game analytics for indie developers", "honest marketing analytics"],
    proof: [
      "Every figure is counted from the platform's own database.",
      "Anything that cannot be known — traffic source, demographics, off-platform shares — is listed as not measured rather than estimated.",
    ],
    usp: {
      edge: "Every figure is counted from the platform's own database, and anything that cannot be known — traffic source, demographics, off-platform shares — is shown as not measured rather than estimated.",
      objection: "Dashboards invent numbers that happen to look encouraging.",
      insteadOf: "An analytics panel that fills its gaps with plausible guesses you then act on.",
    },
    href: "/dashboard",
  },
  {
    id: "install-as-an-app",
    name: "Installs as an app on any phone",
    group: "Publish & Sell",
    keywords: ["progressive web app game", "play games without downloading"],
    proof: [
      "The Studio and the Arcade both install from the browser as a PWA.",
      "No store review, no 30% platform cut, no 100MB download before the first play.",
    ],
    usp: {
      edge: "It installs from the browser, so there is no store review, no store cut and no large download before the first play.",
      objection: "Reaching phones means a platform store, a developer account and a review queue.",
      insteadOf: "Waiting on store review and handing over a cut for the privilege.",
    },
    href: "/arcade",
  },
  {
    id: "enhance-passes",
    name: "Improve a game without paying for it twice",
    group: "Create",
    keywords: ["iterate on AI generated game", "improve AI game output"],
    proof: [
      "An Enhance pass stacks improvements onto an existing build rather than regenerating it from scratch.",
      "Refining the concept re-forges only what changed, at a fraction of the original run.",
    ],
    usp: {
      edge: "An Enhance pass stacks improvements onto the existing build instead of regenerating it, so refining a game costs a fraction of the run that made it.",
      objection: "Iterating will cost me the full price every single time.",
      insteadOf: "Re-rolling the whole generation and paying in full for each attempt.",
    },
    href: "/studio",
  },
];
// REMOVED: "Start free, and the free tier is real". Signup no longer grants
// 2,000 ACUs — public accounts are gated and top up, and free credit exists only
// for accounts an admin designates as testers. The honest version of the claim
// people search for ("do I pay for a bad build?") is `failed-builds-refund`.

/** Blog topics derived from real capabilities, so an article always has
 *  something true and specific to say. */
export function featureTopics(): string[] {
  return FEATURES.map((f) => `${f.name} — what it means for a creator, and how it works`);
}

export function featureById(id: string): Feature | undefined {
  return FEATURES.find((f) => f.id === id);
}

/** Link targets for the SEO auto-linker, so a post about one capability links
 *  to the page that delivers it. A cluster only works if the links exist. */
export function featureLinkTargets(): Array<{ phrase: RegExp; href: string; title: string }> {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const out: Array<{ phrase: RegExp; href: string; title: string }> = [];
  for (const f of FEATURES) {
    for (const k of f.keywords.slice(0, 2)) {
      if (k.length < 12) continue;             // too short to be a safe anchor
      out.push({ phrase: new RegExp("\\b" + esc(k) + "\\b", "i"), href: f.href, title: f.name });
    }
  }
  return out;
}

export const FEATURE_GROUPS = ["Create", "Assets", "Economics", "Publish & Sell", "Growth", "Trust"] as const;
