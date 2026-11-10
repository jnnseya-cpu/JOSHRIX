/**
 * TREND INTELLIGENCE CONFORMANCE — the spec's own numbers, not my reading of them.
 *
 * Trend_Intelligence_AI_Build_Spec v2.3 is unusual in publishing worked values:
 * §5 gives component inputs and states the results are 86.25 and 83.5, and §21
 * lists numbered scenarios with expected outcomes. That makes conformance
 * measurable rather than claimed, which is the only kind of conformance worth
 * reporting — and it is the part of this spec that can be proven in an
 * environment with no keys, no database and no traffic, because it is
 * deterministic arithmetic over a closed contract.
 *
 * Scenario IDs below are the spec's own (TI-03, TI-04, TI-05, TI-14) so a
 * reader can check this file against the document rather than against me.
 *
 *   node tests/t47-trend-intelligence.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JOSHRIX_ROOT || path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const T = require('./build/shared/trend.js');

/** A brief bound to THIS installation and valid across NOW — the shape the
 *  effective lookup is supposed to accept, so every rejection test below
 *  changes exactly one thing about it. */
const NOW = new Date('2026-11-12T00:00:00Z');
const bound = () => ({
  schema_version: 1, brief_id: 'gb_bound', brief_version: 1,
  tenant_id: T.INSTALL.tenantId, platform_id: T.INSTALL.platformId,
  market: T.INSTALL.market, locale: T.INSTALL.locale, topic_id: 'ai-game-creation',
  opportunity_score: 86.25, confidence: 83.5,
  valid_from: '2026-11-10T00:00:00Z', expires_at: '2026-11-17T00:00:00Z',
  evidence_ids: ['ev_1'],
  audience: 'Creators comparing AI game tools',
  intent: 'decide which platform to build on',
  approved_claim_ids: ['claim_ownership_01'],
  cta_id: 'cta_open_studio',
  allowed_channels: ['seo', 'organic_social'],
  prohibited_claims: ['guaranteed earnings'],
  objective: 'forge starts per eligible session',
  experiment_id: 'exp_1', policy_version: 1,
});

/* Wrapped in an async IIFE because one block RUNS the newsletter's own
   buildIssue, which is async. This file is CommonJS, so a top-level await here
   makes the module format ambiguous and nothing runs at all. */
(async () => {
console.log('\nTI-03 — the spec publishes the expected scores, so reproduce them exactly');
{
  /* §5 example: "80 demand, 95 fit, 85 intent, 90 timing and 80 readiness. Its
     opportunity score is 86.25. Confidence inputs of 90, 80, 70 and 90 yield
     83.5. The output is a reviewable brief." */
  const opp = T.opportunityScore({ demand: 80, fit: 95, intent: 85, timing: 90, readiness: 80 });
  t(`opportunity is exactly 86.25 (${opp.score})`, opp.score === 86.25, String(opp.score));
  t('and it is not vetoed', opp.vetoed === false);

  /* The confidence inputs are source quality 90, corroboration 80, coverage 70,
     freshness 90. Corroboration 80 is the spec's value for TWO independent
     families, so that is what the input must represent. */
  const conf = T.confidenceScore({ sourceQuality: 90, coverage: 70, freshness: 90, independentFamilies: 2 });
  t(`confidence is exactly 83.5 (${conf.score})`, conf.score === 83.5, String(conf.score));
  t('and it is not capped', conf.cappedBySingleFamily === false);

  const d = T.disposition(opp.score, conf.score, { vetoed: opp.vetoed });
  t('the disposition is a reviewable brief', d.disposition === 'brief', JSON.stringify(d));

  /* "Score using full precision and round only for display" (§17). A scorer
     that rounds before the gate decides turns 74.6 into 75 and authorises a
     brief the spec refuses. */
  const edge = T.opportunityScore({ demand: 74, fit: 74, intent: 75, timing: 75, readiness: 75 });
  t(`a near-threshold score keeps its precision (${edge.score})`,
    edge.score === 74.5 && T.disposition(edge.score, 90).disposition !== 'brief',
    'rounding before the gate would authorise a brief the spec refuses');
}

console.log('\nthe weights are the spec\'s, and a change to them is a visible decision');
{
  const o = T.OPPORTUNITY_WEIGHTS, c = T.CONFIDENCE_WEIGHTS;
  t('opportunity weights are 25/25/20/15/15',
    o.demand === 0.25 && o.fit === 0.25 && o.intent === 0.20 && o.timing === 0.15 && o.readiness === 0.15,
    JSON.stringify(o));
  t('confidence weights are 35/25/20/20',
    c.sourceQuality === 0.35 && c.corroboration === 0.25 && c.coverage === 0.20 && c.freshness === 0.20,
    JSON.stringify(c));
  const sum = (w) => Object.values(w).reduce((a, b) => a + b, 0);
  t('each set sums to 1', Math.abs(sum(o) - 1) < 1e-9 && Math.abs(sum(c) - 1) < 1e-9);
}

console.log('\nTHE SINGLE-FAMILY CAP — the rule that decides whether a deployment can act');
{
  /* §5: "cap a single source family at 69". A brief needs 75. So one source
     family can never produce one, and an installation with a single
     instrumented stream is draft-only BY ARITHMETIC. This is the most
     consequential line in the spec and the easiest to lose in a refactor. */
  const perfect = T.confidenceScore({ sourceQuality: 100, coverage: 100, freshness: 100, independentFamilies: 1 });
  t(`one family caps at 69 even with perfect inputs (${perfect.score})`, perfect.score === 69);
  t('and it says that it was capped', perfect.cappedBySingleFamily === true,
    'an operator must see WHY a topic will not progress, not watch a number sit at 69');
  t('so one family can never reach a brief',
    T.disposition(100, perfect.score).disposition !== 'brief',
    'if this ever passes, the spec\'s corroboration requirement has been lost');

  t('two independent families score 80 corroboration', T.corroborationScore(2) === 80);
  t('three or more score 100', T.corroborationScore(3) === 100 && T.corroborationScore(7) === 100);
  t('one scores 0', T.corroborationScore(1) === 0);
  t('and zero scores 0, not negative', T.corroborationScore(0) === 0);
}

console.log('\nTI-04 — syndication is one source family, however many copies arrive');
{
  /* "Three syndications of one story and a stale external feed → One source
     family only. Freshness and corroboration rules prevent automated
     activation." Four documents, one family: corroboration 0, so capped. */
  const syndicated = T.confidenceScore({ sourceQuality: 85, coverage: 90, freshness: 40, independentFamilies: 1 });
  t(`four copies of one story cannot be corroboration (${syndicated.score})`,
    syndicated.score <= T.SINGLE_FAMILY_CONFIDENCE_CAP, String(syndicated.score));
  t('so it cannot reach a brief', T.disposition(90, syndicated.score).disposition !== 'brief');
}

console.log('\nreadiness is a veto, not a low score');
{
  /* §5.4: "Missing readiness blocks activation." Averaged instead of vetoed, a
     topic with no stock and no approved claim still reaches 76 here. */
  const noStock = T.opportunityScore({ demand: 100, fit: 100, intent: 100, timing: 100, readiness: 0 });
  t(`a perfect topic with zero readiness still scores high (${noStock.score})`, noStock.score === 85);
  t('but it is vetoed', noStock.vetoed === true);
  t('and the veto archives it regardless of confidence',
    T.disposition(noStock.score, 100, { vetoed: true }).disposition === 'archive',
    'this is the difference between a scoring system and a safety gate');
}

console.log('\nthe automatic tier needs an explicit opt-in, never a default');
{
  t('above 85/85 without opt-in is a reviewable brief',
    T.disposition(90, 90).disposition === 'brief',
    'defaulting to automatic would be the platform granting itself permission to act');
  t('with opt-in it becomes eligible',
    T.disposition(90, 90, { autoOptIn: true }).disposition === 'auto_eligible');
  t('but opt-in cannot rescue a vetoed topic',
    T.disposition(90, 90, { autoOptIn: true, vetoed: true }).disposition === 'archive');
  t('nor one below the brief gate',
    T.disposition(76, 76, { autoOptIn: true }).disposition === 'brief');
}

console.log('\n§5.3 detection arithmetic');
{
  t('lift is ln((c+1)/(b+1))',
    Math.abs(T.logLift(34, 12) - Math.log(35 / 13)) < 1e-12);
  t('a zero baseline stays finite rather than infinite',
    Number.isFinite(T.logLift(50, 0)),
    'the +1 is what stops one observation reading as an infinite trend');

  /* A flat history has MAD 0; without the 0.2 floor this divides by ~zero and
     reports an enormous z from noise. */
  const flat = T.robustZ(12, [12, 12, 12, 12, 12, 12]);
  t(`a flat history does not explode (${flat.toFixed(3)})`, Number.isFinite(flat) && Math.abs(flat) < 1,
    'the 0.2 floor on the MAD scale is doing this');
  const spike = T.robustZ(34, [9, 11, 12, 13, 10, 14, 12, 11]);
  t(`a real spike clears the gate (z ${spike.toFixed(2)})`, spike >= T.COUNT_GATE.minZ);
  t('the count gate is 20 and z 2 as specified',
    T.COUNT_GATE.minCount === 20 && T.COUNT_GATE.minZ === 2);

  t('the demand mapping is clamp(50 + 10z, 0, 100)',
    T.demandFromZ(0) === 50 && T.demandFromZ(5) === 100 && T.demandFromZ(-99) === 0);

  t('fewer than four comparable periods is insufficient history',
    !T.hasEnoughHistory(3) && T.hasEnoughHistory(4) && T.MIN_COMPARABLE_PERIODS === 4,
    'scoring two data points produces a number, not evidence');
}

console.log('\nthe Growth Brief is a CLOSED object, per Appendix A');
{
  const valid = {
    schema_version: 1, brief_id: 'gb_104', brief_version: 3,
    tenant_id: 'tenant_demo', platform_id: 'fixture_platform_a',
    market: 'CA', locale: 'en-CA', topic_id: 'simpler-team-onboarding',
    opportunity_score: 86.25, confidence: 83.5,
    valid_from: '2026-11-10T10:00:00Z', expires_at: '2026-11-17T10:00:00Z',
    evidence_ids: ['ev_341', 'ev_342'],
    audience: 'Small teams comparing onboarding options',
    intent: 'evaluate how to onboard a small team',
    approved_claim_ids: ['claim_onboarding_01'],
    cta_id: 'cta_view_onboarding_guide',
    allowed_channels: ['seo', 'organic_social'],
    prohibited_claims: ['guaranteed onboarding time', 'unsupported third-party endorsements'],
    objective: 'qualified trial starts per eligible session',
    experiment_id: 'exp_91', policy_version: 5,
  };
  /* This is the spec's §6 payload verbatim — it is the canonical positive
     fixture by its own instruction, so if it fails the contract is wrong. */
  t('the spec\'s own §6 fixture validates',
    T.GrowthBriefSchema.safeParse(valid).success,
    JSON.stringify(T.GrowthBriefSchema.safeParse(valid).error?.issues?.slice(0, 2)));

  t('an extra field is REJECTED, not ignored',
    !T.GrowthBriefSchema.safeParse({ ...valid, spend_cap: 500 }).success,
    'a closed object is the whole point of a versioned contract');
  t('a missing required field is rejected',
    !T.GrowthBriefSchema.safeParse({ ...valid, evidence_ids: undefined }).success);
  t('a brief with no evidence is rejected',
    !T.GrowthBriefSchema.safeParse({ ...valid, evidence_ids: [] }).success,
    'a brief with no evidence is an opinion');
  t('a non-UTC timestamp is rejected',
    !T.GrowthBriefSchema.safeParse({ ...valid, expires_at: '2026-11-17T10:00:00+01:00' }).success,
    'a local offset means expiry differs between processes');
  t('a lowercase market is rejected', !T.GrowthBriefSchema.safeParse({ ...valid, market: 'ca' }).success);
  t('a score above 100 is rejected', !T.GrowthBriefSchema.safeParse({ ...valid, confidence: 101 }).success);
  t('an unknown channel is rejected',
    !T.GrowthBriefSchema.safeParse({ ...valid, allowed_channels: ['telepathy'] }).success);

  console.log('\nTI-05 — an expired brief authorises nothing, cached or not');
  const inWindow = new Date('2026-11-12T00:00:00Z');
  const afterEnd = new Date('2026-11-20T00:00:00Z');
  const parsed = T.GrowthBriefSchema.parse(valid);

  t('inside its window with an allowed channel it is usable',
    T.briefRuntimeFailures(parsed, { now: inWindow, channel: 'seo', market: 'CA', locales: ['en-CA'] }).length === 0);
  t('after expiry it fails, and says so',
    T.briefRuntimeFailures(parsed, { now: afterEnd, channel: 'seo' }).some((r) => /expired/.test(r)),
    'this is the case where a cached brief must fall back to baseline');
  t('before valid_from it fails too',
    T.briefRuntimeFailures(parsed, { now: new Date('2026-11-01T00:00:00Z'), channel: 'seo' })
      .some((r) => /not yet valid/.test(r)));
  t('a channel outside the brief is refused',
    T.briefRuntimeFailures(parsed, { now: inWindow, channel: 'paid' }).some((r) => /allowed channels/.test(r)));
  /* `paid` is the example because it has no adapter and must not gain one by
     accident. `lifecycle` was the example until the newsletter was wired on
     10 Nov — a channel joins ENABLED_BRIEF_CHANNELS when code steers it, which
     is exactly the distinction this assertion guards. */
  t('a channel with no adapter is refused even if the brief allows it',
    T.briefRuntimeFailures(
      T.GrowthBriefSchema.parse({ ...valid, allowed_channels: ['seo', 'paid'] }),
      { now: inWindow, channel: 'paid' },
    ).some((r) => /no adapter/.test(r)),
    'the enum reserves routing values; it does not enable features');
  t('the channels with an adapter are exactly the ones with code behind them',
    T.ENABLED_BRIEF_CHANNELS.length === 3
      && ['seo', 'organic_social', 'lifecycle'].every((c) => T.ENABLED_BRIEF_CHANNELS.includes(c))
      && !T.ENABLED_BRIEF_CHANNELS.includes('paid')
      && !T.ENABLED_BRIEF_CHANNELS.includes('sales_enablement')
      && !T.ENABLED_BRIEF_CHANNELS.includes('owned_placement'),
    T.ENABLED_BRIEF_CHANNELS.join(','));

  console.log('\nTI-14 / §16 — market scoping, including the ZZ rule');
  t('a brief for another market does not match',
    T.briefRuntimeFailures(parsed, { now: inWindow, market: 'FR' }).some((r) => /does not match/.test(r)));
  t('a global ZZ brief does not satisfy a country lookup',
    T.briefRuntimeFailures(T.GrowthBriefSchema.parse({ ...valid, market: 'ZZ' }), { now: inWindow, market: 'CA' })
      .some((r) => /global \(ZZ\)/.test(r)),
    'ZZ never matches a country-targeted lookup by default');
  t('an uninstalled locale is refused',
    T.briefRuntimeFailures(parsed, { now: inWindow, locales: ['fr-FR'] }).some((r) => /locale/.test(r)));
  t('valid_from after expires_at is refused',
    T.briefRuntimeFailures(
      T.GrowthBriefSchema.parse({ ...valid, valid_from: '2026-11-18T10:00:00Z' }), { now: inWindow },
    ).some((r) => /strictly before/.test(r)));
}

console.log('\n§6 — a brief issued for another installation is somebody else\'s instructions');
{
  t('the installation binding is a single constant, not four env vars',
    T.INSTALL.tenantId && T.INSTALL.platformId && /^[A-Z]{2}$/.test(T.INSTALL.market) && T.INSTALLED_LOCALES.includes(T.INSTALL.locale),
    JSON.stringify(T.INSTALL));

  const foreign = T.GrowthBriefSchema.parse({
    ...bound(), tenant_id: 'someone_else', platform_id: 'someone_elses_platform',
  });
  const reasons = T.briefRuntimeFailures(foreign, {
    now: NOW, tenantId: T.INSTALL.tenantId, platformId: T.INSTALL.platformId,
  });
  t('a foreign tenant is refused', reasons.some((r) => /not this installation/.test(r)), reasons.join('; '));
  t('a foreign platform is refused', reasons.filter((r) => /not this installation/.test(r)).length === 2, reasons.join('; '));
}

console.log('\n§13 — WHICH brief applies, decided purely and re-validated at the moment of use');
{
  /* The database narrows; pickEffectiveBrief decides. Every case below is a row
     that SQL would happily return and that must not be allowed to steer an
     agent. */
  const ok1 = { ...bound(), brief_id: 'gb_a', brief_version: 1 };
  const ok2 = { ...bound(), brief_id: 'gb_a', brief_version: 4 };
  const ok3 = { ...bound(), brief_id: 'gb_b', brief_version: 2 };

  const picked = T.pickEffectiveBrief([ok1, ok3, ok2], { now: NOW, channel: 'seo' });
  t('the highest brief_version wins',
    picked.brief && picked.brief.brief_id === 'gb_a' && picked.brief.brief_version === 4,
    JSON.stringify(picked.brief && { id: picked.brief.brief_id, v: picked.brief.brief_version }));
  t('and nothing eligible is reported as rejected', picked.rejected.length === 0, JSON.stringify(picked.rejected));

  /* A tie on version is broken by the later valid_from. */
  const early = { ...bound(), brief_id: 'gb_early', brief_version: 2, valid_from: '2026-11-10T00:00:00Z' };
  const late = { ...bound(), brief_id: 'gb_late', brief_version: 2, valid_from: '2026-11-11T00:00:00Z' };
  t('a tie on version is broken by the later valid_from',
    T.pickEffectiveBrief([early, late], { now: NOW, channel: 'seo' }).brief.brief_id === 'gb_late');

  /* THE CASE THAT MATTERS: jsonb cannot enforce a closed object, so a row
     written by an older or buggier producer is re-validated here. */
  const stale = { ...bound(), brief_id: 'gb_old', spend_cap: 500 };
  const withStale = T.pickEffectiveBrief([stale], { now: NOW, channel: 'seo' });
  t('a stored row that no longer satisfies the contract is refused, not used',
    withStale.brief === null && withStale.rejected.length === 1 && withStale.rejected[0].briefId === 'gb_old',
    JSON.stringify(withStale.rejected));
  t('and the rejection says why', /spend_cap|unrecognized|Unrecognized/.test(JSON.stringify(withStale.rejected[0].reasons)),
    JSON.stringify(withStale.rejected[0].reasons));
  t('a row too broken to identify still produces a rejection rather than a throw',
    T.pickEffectiveBrief([null, 7, 'nonsense', {}], { now: NOW, channel: 'seo' }).rejected.length === 4);

  /* Expiry, channel, market and the installation binding are all enforced at
     the point of use — the lookup's WHERE clause is not the only gate. */
  t('an expired row is refused even though SQL returned it',
    T.pickEffectiveBrief([bound()], { now: new Date('2026-12-25T00:00:00Z'), channel: 'seo' }).brief === null);
  t('a brief that does not allow this channel is refused',
    T.pickEffectiveBrief([{ ...bound(), allowed_channels: ['paid'] }], { now: NOW, channel: 'seo' }).brief === null);
  t('a brief for another installation is refused WITHOUT the caller asking',
    T.pickEffectiveBrief([{ ...bound(), tenant_id: 'someone_else' }], { now: NOW, channel: 'seo' }).brief === null,
    'the binding is applied by pickEffectiveBrief itself, so a caller cannot forget it');
  t('no candidates means no brief and no error',
    T.pickEffectiveBrief([], { now: NOW, channel: 'seo' }).brief === null);
}

console.log('\nthe approval desk: /api/growth-brief');
{
  const src = fs.readFileSync(path.join(ROOT, 'api/growth-brief.ts'), 'utf8');
  t('auth fails closed before any database work',
    src.indexOf('Admin key or cron secret required') < src.indexOf('await ensureBriefSchema(sql)'),
    'a strategy document is not a public document');
  t('bad keys are rate limited', /tooManyBadKeys/.test(src));
  t('§12: no eligible match answers 204 with no body',
    /res\.status\(204\)\.end\(\)/.test(src) && !/status\(204\)\.json/.test(src));
  t('the contract is parsed before anything is stored',
    src.indexOf('GrowthBriefSchema.safeParse') < src.indexOf('await saveGrowthBrief(sql'));
  t('§17: expiry and binding are checked on the WRITE as well as the lookup',
    /briefRuntimeFailures\(brief, \{/.test(src) && /tenantId: INSTALL\.tenantId/.test(src));
  t('a frozen version is never replaced — a conflicting write is a 409',
    /status\(409\)/.test(src) && /already exists with different content/.test(src));
  t('an unbounded payload is refused before parsing', /MAX_BRIEF_BYTES/.test(src));
  t('a channel with no adapter is refused rather than silently accepted',
    /ENABLED_BRIEF_CHANNELS/.test(src) && /has no adapter in this release/.test(src));
  t('it generates nothing and publishes nothing',
    !/anthropic|Anthropic|_gateway/.test(src),
    'this is the approval surface; drafting lives in the agents that already exist');

  const ledger = fs.readFileSync(path.join(ROOT, 'api/_ledger.ts'), 'utf8');
  const table = ledger.slice(ledger.indexOf('growth_briefs'), ledger.indexOf('growth_briefs') + 2500);
  t('a brief version is immutable: the primary key is (brief_id, brief_version)',
    /PRIMARY KEY \(brief_id, brief_version\)/.test(table));
  t('the write is idempotent and conflict-safe, not last-write-wins',
    /ON CONFLICT \(brief_id, brief_version\) DO NOTHING/.test(ledger));
  t('the only UPDATE on the table is the status withdrawal',
    (ledger.match(/UPDATE growth_briefs/g) || []).length === 1
      && /UPDATE growth_briefs SET status = 'archived'/.test(ledger),
    'an approved brief is a frozen record; a revision is a new version');
  t('the lookup filters status and both ends of the window',
    /status = 'approved'/.test(ledger) && /valid_from <= /.test(ledger) && /expires_at > /.test(ledger));
  t('the archive listing is bounded (§12: 50 default, 200 max)',
    /Math\.min\(Math\.max\(limit, 1\), 200\)/.test(ledger));
}

console.log('\n§14.5 — ONE resolver, used by every steered surface');
{
  const brief = fs.readFileSync(path.join(ROOT, 'api/_brief.ts'), 'utf8');
  const blog = fs.readFileSync(path.join(ROOT, 'api/blog-agent.ts'), 'utf8');
  const news = fs.readFileSync(path.join(ROOT, 'api/newsletter.ts'), 'utf8');

  /* Justin: "everything attached must be embedded onto the whole existing
     platform, not a separate one." The first version put resolution inside the
     blog agent, which made the blog the only steered surface and guaranteed the
     second one would be a copy. */
  t('resolution lives in api/_brief.ts', /export async function resolveBrief/.test(brief));
  t('and the agents call in rather than each owning a copy',
    /resolveBrief\(sql, "seo"\)/.test(blog) && /resolveBrief\(sql, "lifecycle"\)/.test(news));
  for (const [name, src] of [['blog-agent', blog], ['newsletter', news]]) {
    t(`${name} contains no resolution logic of its own`,
      !/pickEffectiveBrief|effectiveBriefCandidates/.test(src),
      'the candidate query and the decision belong to one module');
  }
  t('the model-facing directive has one definition',
    /export function briefDirective/.test(brief) && !/function briefDirective/.test(blog));

  /* THE BASELINE RULE. Every non-brief outcome returns null and the surface
     behaves exactly as it did before Trend Intelligence existed. */
  const resolver = brief.slice(brief.indexOf('export async function resolveBrief'), brief.indexOf('export function briefDirective'));
  t('no database falls back to baseline', /if \(!sql\) return \{ brief: null/.test(resolver));
  t('a channel with no adapter falls back to baseline', /ENABLED_BRIEF_CHANNELS\.includes\(channel\)/.test(resolver));
  t('a thrown lookup falls back to baseline rather than propagating',
    /catch \(err: any\)/.test(resolver) && /brief: null/.test(resolver));
  t('every non-brief outcome names itself baseline and says why',
    (resolver.match(/why:/g) || []).length >= 5 && (resolver.match(/baseline/g) || []).length >= 5,
    'no database, no adapter, none approved, none eligible and a failed lookup are five different answers');

  t('the brief is passed as DATA, not written into any system prompt',
    (blog.match(/CONTENT_SYSTEM\s*=/g) || []).length === 1
      && /brief = `\$\{brief\}\\n\\n\$\{briefDirective\(growthBrief\)\}`/.test(blog),
    'the spec forbids permanently rewriting agent prompts, and the honesty rules live in those prompts');
  t('the retry attempts carry the same brief',
    /liveGames, priorPosts, growthBrief,/.test(blog),
    'a rewrite steered differently from the first draft is a different article');
  t('prohibited claims are passed without being claimed as enforced',
    /PROHIBITED CLAIMS ARE PASSED, NOT ENFORCED/.test(brief),
    'substring-matching free text would look like a gate and catch nothing');

  /* WHAT MUST NEVER BE STEERED. A creator paid ACUs for the game they
     described; the platform's marketing objective has no business in it. */
  for (const f of ['api/_gateway.ts', 'api/_forgejobs.ts', 'api/forge-game.ts', 'api/forge-enhance.ts',
                   'api/growth.ts', 'api/comms.ts', 'api/_notify.ts']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    t(`${f} is not steered by a brief`,
      !/_brief|resolveBrief|briefDirective/.test(src),
      'the forge and the growth tools spend a creator\'s ACUs on the creator\'s own work; transactional mail must read the same on every day of every campaign');
  }
}

console.log('\nsteering a surface that calls no model');
{
  const B = require('./build/api/_brief.js');
  const items = [
    { name: 'Payouts', keywords: ['withdraw earnings', 'mobile money payout'] },
    { name: 'Multilingual forge', keywords: ['create a game in french', 'any language game maker'] },
    { name: 'Asset library', keywords: ['free 3d game assets', 'low poly models'] },
  ];
  const b = T.GrowthBriefSchema.parse({ ...bound(),
    audience: 'French speaking creators', intent: 'create a game in french without coding', objective: 'forge starts' });

  const steered = B.steerByBrief(items, b);
  t('the item matching the brief leads', steered[0].name === 'Multilingual forge', steered.map((x) => x.name).join(' > '));
  t('and nothing is dropped', steered.length === items.length);

  /* The baseline case has to be byte-identical, or "no brief in force" would
     quietly change the newsletter anyway. */
  t('with no brief the order is untouched',
    B.steerByBrief(items, null).map((x) => x.name).join() === items.map((x) => x.name).join());
  const noMatch = T.GrowthBriefSchema.parse({ ...bound(), audience: 'zzzz', intent: 'zzzz', objective: 'zzzz' });
  t('with a brief that matches nothing the order is also untouched',
    B.steerByBrief(items, noMatch).map((x) => x.name).join() === items.map((x) => x.name).join(),
    'a stable sort is what keeps the newsletter rotation intact underneath the steering');
  t('it mutates nothing', (() => { const copy = items.map((x) => x.name).join(); B.steerByBrief(items, b); return copy === items.map((x) => x.name).join(); })());

  /* RUN IT, do not read it. buildIssue is the thing that ships, and without a
     DATABASE_URL it still assembles the feature and "start here" sections, so
     the steering is observable for real rather than asserted from source. */
  const N = require('./build/api/newsletter.js');
  const baseIssue = await N.buildIssue('2026-W46');
  const steeredIssue = await N.buildIssue('2026-W46', T.GrowthBriefSchema.parse({ ...bound(),
    audience: 'creators who want to sell what they make',
    intent: 'sell a finished game and get paid',
    objective: 'marketplace listings per active creator' }));
  const lead = (iss) => iss.sections[0].links.map((l) => l.label);
  t('a real issue is assembled either way',
    baseIssue.sections.length >= 2 && steeredIssue.sections.length >= 2 && lead(baseIssue).length === 4);
  t('the brief changes which capabilities lead the issue',
    lead(baseIssue).join() !== lead(steeredIssue).join(),
    `${lead(baseIssue).join(' | ')}  ->  ${lead(steeredIssue).join(' | ')}`);
  t('and the issue copy itself is untouched',
    baseIssue.intro === steeredIssue.intro
      && baseIssue.sections[0].blurb === steeredIssue.sections[0].blurb,
    'a brief reorders real capabilities; it never rewrites a word of the copy');
  t('the headline still names the lead capability, so it stays true to the issue',
    steeredIssue.headline.startsWith(lead(steeredIssue)[0]), steeredIssue.headline);

  const news = fs.readFileSync(path.join(ROOT, 'api/newsletter.ts'), 'utf8');
  t('the newsletter steers the WHOLE feature list, not this week\'s four',
    /steerByBrief\(FEATURES, brief\)\.slice\(0, 4\)/.test(news),
    'reordering four already-picked features cannot surface a relevant fifth');
  t('and falls back to the week rotation with no brief',
    /: featuresForIssue\(issue\)/.test(news));
  t('a dry run attributes nothing', news.indexOf('nothing was attributed') > 0 && news.indexOf('if (sent > 0)') > news.indexOf('nothing was attributed'));
}

console.log('\n§17 — what was produced under which brief, in ONE table');
{
  const ledger = fs.readFileSync(path.join(ROOT, 'api/_ledger.ts'), 'utf8');
  const brief = fs.readFileSync(path.join(ROOT, 'api/_brief.ts'), 'utf8');
  t('attribution has one table for every surface',
    /CREATE TABLE IF NOT EXISTS brief_attribution/.test(ledger));
  t('and the grain is the artefact, not the reader',
    /PRIMARY KEY \(surface, artefact_id\)/.test(ledger)
      && !/session_id|user_id|email/.test(ledger.slice(ledger.indexOf('brief_attribution'), ledger.indexOf('brief_attribution') + 700)),
    'a brief says nothing about any individual; attributing it to one would be wrong and a privacy problem invented for nothing');
  t('a retried cron cannot double-count an artefact',
    /ON CONFLICT \(surface, artefact_id\) DO NOTHING/.test(ledger));
  t('baseline is recorded too, with null brief columns',
    /brief_id text,/.test(ledger) && /brief: GrowthBrief \| null/.test(brief),
    'an experiment with no record of its control is not an experiment');
  t('the per-surface columns are gone, so the fact has one home',
    !/ADD COLUMN IF NOT EXISTS brief_id/.test(ledger));
  t('a failed attribution write never breaks the thing it measures',
    /briefAttributionFailed/.test(brief));
  t('both wired surfaces attribute',
    /surface: "blog"/.test(fs.readFileSync(path.join(ROOT, 'api/blog-agent.ts'), 'utf8'))
      && /surface: "newsletter"/.test(fs.readFileSync(path.join(ROOT, 'api/newsletter.ts'), 'utf8')));
}

console.log('\nIT WORKS INVISIBLY — nothing reaches a user');
{
  /* Justin: "nothing to be visible to users as it needs to work invisible."
     Asserted as a property of the repository, because a promise in a comment is
     not a guarantee. The operator desk at /admin is excluded by design: it is
     key-gated, it is how a brief is approved at all, and an operator is not a
     user. */
  const PUBLIC_PAGES = fs.readdirSync(path.join(ROOT, 'frontend')).filter((f) => f.endsWith('.html') && f !== 'admin.html');
  const leaks = [];
  for (const f of PUBLIC_PAGES) {
    const src = fs.readFileSync(path.join(ROOT, 'frontend', f), 'utf8');
    if (/growth-brief|growthBrief|brief_id|briefVersion|Growth Brief/.test(src)) leaks.push(f);
  }
  t('no public page mentions a brief', leaks.length === 0, leaks.join(', '));

  /* The endpoint must not be discoverable: not in the sitemap, not in llms.txt,
     not in the feed, and not in the feature inventory that drives marketing. */
  for (const f of ['api/sitemap.ts', 'api/llms.ts', 'api/rss.ts', 'api/_seo.ts', 'api/_features.ts', 'api/features-hub.ts']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    t(`${f} does not advertise it`, !/growth-brief|Growth Brief|trend intelligence/i.test(src));
  }

  /* The blog is the steered surface, so it is the one that could leak. */
  const html = fs.readFileSync(path.join(ROOT, 'api/blog-html.ts'), 'utf8');
  t('a rendered post carries no brief marking',
    !/brief/i.test(html),
    'a reader must not be able to tell which campaign a post belongs to');
  const blog = fs.readFileSync(path.join(ROOT, 'api/blog-agent.ts'), 'utf8');
  const publicIndex = blog.slice(blog.indexOf('public post index'), blog.indexOf('generation — cron'));
  t('the public post index returns no brief fields',
    !/brief/i.test(publicIndex),
    'the index is served to /blog with no key');

  /* Every surface that returns brief data must be key-gated. */
  const gated = fs.readFileSync(path.join(ROOT, 'api/growth-brief.ts'), 'utf8');
  t('the only endpoint that serves a brief requires a key',
    /Admin key or cron secret required/.test(gated)
      && gated.indexOf('Admin key or cron secret required') < gated.indexOf('await ensureBriefSchema(sql)'));
  const apiFiles = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.ts'));
  /* The pattern names the GROWTH BRIEF, not the English word. api/growth.ts
     takes a `brief` field that is the CREATOR's brief for a paid growth tool,
     api/forge-game.ts calls the creator's prompt "the whole brief", and
     api/llms.ts calls itself "a brief written for answer engines" — three
     pre-existing, unrelated meanings that a loose /brief/i sweep reports as
     leaks. A test that cries wolf gets switched off. */
  const GROWTH_BRIEF = /Growth Brief|growth-brief|growthBrief|brief_id|briefVersion|brief_attribution|resolveBrief|briefDirective|attributeBrief|from "\.\/_brief"/;
  const unguarded = apiFiles.filter((f) => {
    const src = fs.readFileSync(path.join(ROOT, 'api', f), 'utf8');
    if (!GROWTH_BRIEF.test(src)) return false;
    /* A surface may READ a brief without serving it; what matters is that no
       endpoint hands one to an unauthenticated caller. */
    return !/MODERATION_KEY|CRON_SECRET|x-admin-key|x-moderation-key/.test(src) && !f.startsWith('_');
  });
  t('no unauthenticated endpoint touches a brief', unguarded.length === 0, unguarded.join(', '));
}


console.log('\nthe merge did not create a second backend');
{
  /* Justin asked to MERGE this spec rather than build the separate Python
     service its §12 proposes. The whole point is that no parallel deployable
     system appears, which is the rule this repository enforced all session. */
  const root = fs.readdirSync(ROOT);
  t('no python service directory appeared',
    !root.includes('services') && !root.includes('adapters') && !fs.existsSync(path.join(ROOT, 'pyproject.toml')),
    root.filter((d) => ['services', 'adapters', 'pyproject.toml'].includes(d)).join(', '));
  t('the contract lives in shared/, with the other shared contracts',
    fs.existsSync(path.join(ROOT, 'shared/trend.ts')));
  t('and it is pure — no database or HTTP in the contract layer',
    (() => {
      const src = fs.readFileSync(path.join(ROOT, 'shared/trend.ts'), 'utf8');
      return !/_ledger|getDb|fetch\(|require\("http/.test(src);
    })(),
    'scoring and contracts are the deterministic part; keeping them pure is what makes them testable here');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
