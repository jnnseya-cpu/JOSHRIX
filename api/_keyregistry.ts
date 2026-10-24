/**
 * EVERY KEY THE PLATFORM READS, WHAT IT TURNS ON, AND WHAT BREAKS WITHOUT IT.
 *
 * WHY THIS IS A STATUS BOARD AND NOT A KEY FORM.
 *
 * Justin asked for all the required API keys to be set up in the admin account.
 * The useful half of that is real and is what this delivers: one screen that
 * says what is missing, what each thing powers, and exactly how to set it.
 *
 * The other half — storing the keys themselves behind an admin form — would be a
 * downgrade, and a serious one. In Vercel a secret is encrypted at rest, is
 * injected only into the function runtime, is never served to a browser and
 * never appears in a build artefact. Moving a Stripe secret or a provider key
 * into Postgres would put it somewhere a database leak reaches, somewhere an
 * HTTP endpoint writes, and somewhere one query reads — and it would mean the
 * MODERATION_KEY alone was enough to walk away with every credential the
 * business owns. That is one compromised password away from the worst day this
 * platform could have.
 *
 * So the keys stay in the platform's secret store, and this makes managing them
 * from /admin possible without ever moving them: the endpoint reports SET or
 * MISSING, never a value, plus a short irreversible fingerprint so a rotation
 * can be confirmed to have taken effect.
 *
 * .env.example IS THE CONTRACT. tests/t32 already asserts that every variable
 * the code reads is declared there and every declared variable is read. This
 * registry is the presentation layer over that contract, and tests/t46 asserts
 * it covers exactly the same set — so a new variable cannot appear in the admin
 * panel as an unexplained name, and cannot be added to the code without showing
 * up here.
 */

export type KeyNeed =
  /** The platform does not work without it. */
  | "required"
  /** Works, but a real feature is off or weakened until it is set. */
  | "recommended"
  /** Tuning or a default override. Safe to leave empty for ever. */
  | "optional"
  /** Reads nothing but a boolean on /api/health. Buying one changes no behaviour. */
  | "cosmetic";

export type KeyGroup = "AI providers" | "Money" | "Data" | "Mail" | "Security" | "Tuning";

export type KeySpec = {
  env: string;
  group: KeyGroup;
  need: KeyNeed;
  /** What setting it turns on, in the owner's words. */
  powers: string;
  /** What actually happens while it is missing. Honest, not alarming. */
  without: string;
  /** Members of a one-of set: the set is satisfied if ANY member is set. */
  oneOf?: string;
};

export const KEYS: KeySpec[] = [
  /* ---------------------------------------------------------------- AI ---- */
  {
    env: "ANTHROPIC_API_KEY", group: "AI providers", need: "required", oneOf: "ai",
    powers: "Claude, which writes games, blueprints, blog articles and growth copy.",
    without: "The forge falls back to the deterministic engine build and the blog agent publishes nothing.",
  },
  {
    env: "GEMINI_API_KEY", group: "AI providers", need: "required", oneOf: "ai",
    powers: "Gemini, the measured lead provider for game builds.",
    without: "The provider chain loses the one provider that produced a complete full-size build in the 18 Aug probe.",
  },
  {
    env: "OPENAI_API_KEY", group: "AI providers", need: "required", oneOf: "ai",
    powers: "GPT, the fast third fallback in the build chain.",
    without: "Two providers remain, so an outage at both stops every forge.",
  },
  /* -------------------------------------------------------------- Money --- */
  {
    env: "STRIPE_SECRET_KEY", group: "Money", need: "required",
    powers: "Taking payment: ACU top-ups, subscriptions and marketplace purchases.",
    without: "Checkout cannot be created, so no money can come in at all.",
  },
  {
    env: "STRIPE_WEBHOOK_SECRET", group: "Money", need: "required",
    powers: "Verifying that a payment notification really came from Stripe.",
    without: "A paid top-up grants nothing, because credit is only applied from a VERIFIED webhook. Payment succeeds and the customer gets no ACUs.",
  },
  {
    env: "PAYOUT_SECRET", group: "Money", need: "required",
    powers: "Encrypting payout destinations at rest with AES-256-GCM.",
    without: "Saving a payout destination fails closed by design, so no creator can withdraw.",
  },
  /* --------------------------------------------------------------- Data --- */
  {
    env: "DATABASE_URL", group: "Data", need: "required",
    powers: "Neon Postgres: the ledger, wallets, games, entitlements, jobs and the blog.",
    without: "Every paid endpoint returns 503. Nothing can be bought, forged, published or recorded.",
  },
  {
    env: "FIREBASE_PROJECT_ID", group: "Data", need: "optional",
    powers: "Overriding the Firebase project that owns user identity.",
    without: "Nothing — it is a constant in shared/firebase.ts because it is public by design, and a missing value on the auth path would lock every user out of their wallet. Set it only to migrate projects.",
  },
  /* --------------------------------------------------------------- Mail --- */
  {
    env: "SMTP_HOST", group: "Mail", need: "recommended", oneOf: "mail",
    powers: "The primary mail rail. Hostinger SMTP is what this platform uses.",
    without: "Mail falls through to Resend, and then to a sandbox that records instead of sending.",
  },
  { env: "SMTP_PORT", group: "Mail", need: "optional", powers: "Which SMTP port to use: 465 for implicit SSL, 587 for STARTTLS.", without: "Defaults to 465, which is correct for Hostinger SMTP." },
  { env: "SMTP_USER", group: "Mail", need: "recommended", oneOf: "mail", powers: "The mailbox the platform authenticates as, usually the same address as COMMS_FROM.", without: "The SMTP rail cannot authenticate, so mail falls through to Resend or to the sandbox." },
  { env: "SMTP_PASS", group: "Mail", need: "recommended", oneOf: "mail", powers: "The password for that mailbox. Set it in the secret store only — never in a file in the repository.", without: "The SMTP rail cannot authenticate, so mail falls through to Resend or to the sandbox." },
  {
    env: "RESEND_API_KEY", group: "Mail", need: "optional", oneOf: "mail",
    powers: "The fallback mail rail, used when SMTP is not configured.",
    without: "With no SMTP either, every email is recorded to the database and never delivered.",
  },
  { env: "COMMS_FROM", group: "Mail", need: "recommended", powers: "The From name and address on every outgoing email.", without: "Mail sends from a default that may fail SPF at the receiving end." },
  { env: "CONTACT_INBOX", group: "Mail", need: "recommended", powers: "Where the contact form delivers.", without: "Contact submissions are stored but nobody is notified." },
  /* ----------------------------------------------------------- Security --- */
  {
    env: "MODERATION_KEY", group: "Security", need: "required",
    powers: "The only admin credential: the review queue, wallet administration, payouts, stats and the economy desk.",
    without: "Every admin endpoint fails closed with 503. No game can be approved, so nothing reaches the arcade.",
  },
  {
    env: "CRON_SECRET", group: "Security", need: "required",
    powers: "Authorising the scheduled agents: the forge worker sweep, the blog agent, the security review and the newsletter.",
    without: "Vercel's cron calls are refused, so a forge whose creator closed the tab is never finished and no post is ever published.",
  },
  {
    env: "NEWSLETTER_SECRET", group: "Security", need: "recommended",
    powers: "Signing one-click unsubscribe tokens.",
    without: "Unsubscribe still works, but the token is unsigned, so anyone could unsubscribe another person's address.",
  },
  {
    env: "HUMAN_VERIFY_SECRET", group: "Security", need: "recommended",
    powers: "Signing the proof-of-work challenge that gates wallet creation.",
    without: "The human check cannot be verified, which is the guard against scripted signups minting wallets.",
  },
  { env: "HUMAN_VERIFY_DIFFICULTY", group: "Tuning", need: "optional", powers: "How much work a browser does to prove it is a browser.", without: "Uses the built-in default." },
  {
    env: "TRACK_SALT", group: "Security", need: "recommended",
    powers: "Salting the one-way visitor hash, which is what makes the analytics cookieless.",
    without: "Analytics still work, but the hash is unsalted and therefore weaker against correlation.",
  },
  /* ------------------------------------------------------------- Tuning --- */
  { env: "FORGE_MAX_SECONDS", group: "Tuning", need: "optional", powers: "How long ONE SLICE of a forge may run. Not how long a forge may take.", without: "Defaults to 290s, ten under the worker's platform ceiling." },
  { env: "FORGE_MAX_STALE_ATTEMPTS", group: "Tuning", need: "optional", powers: "How many non-improving attempts end a run.", without: "Defaults to 3. A run that keeps improving is never stopped." },
  { env: "FORGE_DISABLED", group: "Tuning", need: "optional", powers: "The kill switch. Set to 1 during an incident to stop all paid AI.", without: "The forge runs normally." },
  { env: "FORGE_DISABLED_MESSAGE", group: "Tuning", need: "optional", powers: "What a creator sees while the kill switch is on.", without: "A built-in message is shown." },
  { env: "GEMINI_MODEL", group: "Tuning", need: "optional", powers: "Overriding the Gemini model id.", without: "Uses gemini-2.5-flash." },
  { env: "OPENAI_MODEL", group: "Tuning", need: "optional", powers: "Overriding the OpenAI model id.", without: "Uses the built-in default." },
  /* -------------------------- reporting only: buying these changes nothing - */
  {
    env: "IMAGE_GEN_API_KEY", group: "AI providers", need: "cosmetic",
    powers: "Nothing. It flips one boolean on /api/health.",
    without: "Nothing. No code path generates images — do not buy a key for this expecting a feature.",
  },
  {
    env: "MESHY_API_KEY", group: "AI providers", need: "cosmetic",
    powers: "Nothing. It flips one boolean on /api/health.",
    without: "Nothing. Text-to-3D is specified but not implemented.",
  },
  {
    env: "TRIPO_API_KEY", group: "AI providers", need: "cosmetic",
    powers: "Nothing. It flips one boolean on /api/health.",
    without: "Nothing. Text-to-3D is specified but not implemented.",
  },
  {
    env: "ELEVENLABS_API_KEY", group: "AI providers", need: "cosmetic",
    powers: "Nothing. It flips one boolean on /api/health.",
    without: "Nothing. The runtime synthesises its own audio; there is no voice path.",
  },
];

/** A one-of set is satisfied when ANY member is present — three AI providers are
 *  a chain, not three requirements, and mail has two rails. */
export function oneOfSets(): Record<string, string[]> {
  const sets: Record<string, string[]> = {};
  for (const k of KEYS) if (k.oneOf) (sets[k.oneOf] ??= []).push(k.env);
  return sets;
}

export function keyByEnv(env: string): KeySpec | undefined {
  return KEYS.find((k) => k.env === env);
}
