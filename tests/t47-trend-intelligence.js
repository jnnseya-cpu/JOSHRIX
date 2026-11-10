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
  t('a channel with no adapter is refused even if the brief allows it',
    T.briefRuntimeFailures(
      T.GrowthBriefSchema.parse({ ...valid, allowed_channels: ['seo', 'lifecycle'] }),
      { now: inWindow, channel: 'lifecycle' },
    ).some((r) => /no adapter/.test(r)),
    'the enum reserves routing values; it does not enable features');

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
